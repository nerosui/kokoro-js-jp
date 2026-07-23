import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import packageJson from "../package.json";

// src/g2p/japanese.ts talks to the lazy worker client only through
// `configureWorker()`/`runFrontendAsync()`. Mocking that module lets us
// exercise the module-global config-tracking/race-guard logic in
// loadJapaneseG2P() without a real browser Worker + WASM engine.
const configureMock = vi.fn();
vi.mock("../src/g2p/worker-client.js", () => ({
  configureWorker: (...args: unknown[]) => configureMock(...args),
  runFrontendAsync: vi.fn(),
}));

const CONFIG_A = { assetsUrl: "https://a.example/assets" };
const CONFIG_B = { assetsUrl: "https://b.example/assets" };

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function okResponse() {
  return { ok: true, status: 200, body: null, arrayBuffer: async () => new ArrayBuffer(0) } as unknown as Response;
}

// Exercises the ReadableStreamDefaultReader path in drainResponseBody()
// (the arrayBuffer() fallback above only covers environments without a
// streamable Response.body).
function streamingOkResponse(chunkCount = 3) {
  let remaining = chunkCount;
  const reader = {
    read: vi.fn(async () => {
      if (remaining <= 0) return { done: true, value: undefined };
      remaining -= 1;
      return { done: false, value: new Uint8Array([1, 2, 3]) };
    }),
  };
  return { ok: true, status: 200, body: { getReader: () => reader } } as unknown as Response;
}

describe("loadJapaneseG2P", () => {
  beforeEach(() => {
    vi.resetModules();
    configureMock.mockReset();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => okResponse()),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("configures once and resolves for concurrent calls with the same config", async () => {
    configureMock.mockResolvedValue(undefined);
    const { loadJapaneseG2P } = await import("../src/g2p/japanese.js");

    await Promise.all([loadJapaneseG2P(CONFIG_A), loadJapaneseG2P(CONFIG_A)]);

    expect(configureMock).toHaveBeenCalledTimes(1);
  });

  it("defaults to the version-matched jsDelivr assets directory", async () => {
    configureMock.mockResolvedValue(undefined);
    const { DEFAULT_JAPANESE_ASSETS_URL, loadJapaneseG2P } = await import("../src/g2p/japanese.js");

    expect(DEFAULT_JAPANESE_ASSETS_URL).toBe(`https://cdn.jsdelivr.net/npm/kokoro-js-jp@${packageJson.version}/dist`);
    await loadJapaneseG2P();

    expect(configureMock).toHaveBeenCalledWith(`${DEFAULT_JAPANESE_ASSETS_URL}/browser/worker.js`, {
      dicArchiveUrl: `${DEFAULT_JAPANESE_ASSETS_URL}/open_jtalk_dic_utf_8-1.11.tar.gz`,
      dicUrl: undefined,
      voiceUrl: `${DEFAULT_JAPANESE_ASSETS_URL}/openjtalk-voice.htsvoice`,
    });
  });

  it("resolves an origin-root assetsUrl without producing double slashes", async () => {
    configureMock.mockResolvedValue(undefined);
    const { loadJapaneseG2P } = await import("../src/g2p/japanese.js");

    await loadJapaneseG2P({ assetsUrl: "/" });

    expect(configureMock).toHaveBeenCalledWith("/browser/worker.js", {
      dicArchiveUrl: "/open_jtalk_dic_utf_8-1.11.tar.gz",
      dicUrl: undefined,
      voiceUrl: "/openjtalk-voice.htsvoice",
    });
  });

  it("retains the loose dictionary override for advanced self-hosting", async () => {
    configureMock.mockResolvedValue(undefined);
    const { loadJapaneseG2P } = await import("../src/g2p/japanese.js");

    await loadJapaneseG2P({ assetsUrl: "https://cdn.example/assets", dicUrl: "https://files.example/dic" });

    expect(configureMock).toHaveBeenCalledWith("https://cdn.example/assets/browser/worker.js", {
      dicArchiveUrl: undefined,
      dicUrl: "https://files.example/dic",
      voiceUrl: "https://cdn.example/assets/openjtalk-voice.htsvoice",
    });
  });

  it("rejects ambiguous archive and loose dictionary overrides", async () => {
    const { loadJapaneseG2P } = await import("../src/g2p/japanese.js");

    await expect(loadJapaneseG2P({ assetsUrl: "/assets", dicArchiveUrl: "/dic.tar.gz", dicUrl: "/dic" })).rejects.toThrow(/must not specify both/);
  });

  it("rejects a call with a different config while the first is still in flight", async () => {
    const gate = deferred<void>();
    configureMock.mockReturnValue(gate.promise);
    const { loadJapaneseG2P } = await import("../src/g2p/japanese.js");

    const first = loadJapaneseG2P(CONFIG_A);
    await expect(loadJapaneseG2P(CONFIG_B)).rejects.toThrow(/different asset URLs/);

    gate.resolve();
    await first;
    expect(configureMock).toHaveBeenCalledTimes(1);
  });

  it("rejects a call with a different config after the first has already configured", async () => {
    configureMock.mockResolvedValue(undefined);
    const { loadJapaneseG2P } = await import("../src/g2p/japanese.js");

    await loadJapaneseG2P(CONFIG_A);
    await expect(loadJapaneseG2P(CONFIG_B)).rejects.toThrow(/different asset URLs/);
  });

  it("allows a retry with the same config after a prefetch failure (before configure() was ever sent)", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("network error"))
      .mockImplementation(async () => okResponse());
    vi.stubGlobal("fetch", fetchMock);
    configureMock.mockResolvedValue(undefined);
    const { loadJapaneseG2P } = await import("../src/g2p/japanese.js");

    await expect(loadJapaneseG2P(CONFIG_A)).rejects.toThrow("network error");
    await expect(loadJapaneseG2P(CONFIG_A)).resolves.toBeUndefined();
    expect(configureMock).toHaveBeenCalledTimes(1);
    expect(configureMock).toHaveBeenCalledWith("https://a.example/assets/browser/worker.js", {
      dicArchiveUrl: "https://a.example/assets/open_jtalk_dic_utf_8-1.11.tar.gz",
      dicUrl: undefined,
      voiceUrl: "https://a.example/assets/openjtalk-voice.htsvoice",
    });
  });

  it("does not retry (and never sends a second configure()) once configure() itself has been dispatched and failed", async () => {
    // openjtalkjs's worker-side timeout only rejects our pending promise —
    // it can't cancel whatever the worker is still doing. A subsequent call
    // must not risk sending a second, conflicting configure() while the
    // first might still be running there, so the module stays permanently
    // locked (and replays the same rejection) instead of retrying.
    configureMock.mockRejectedValue(new Error("worker request timed out"));
    const { loadJapaneseG2P } = await import("../src/g2p/japanese.js");

    await expect(loadJapaneseG2P(CONFIG_A)).rejects.toThrow("worker request timed out");
    await expect(loadJapaneseG2P(CONFIG_A)).rejects.toThrow("worker request timed out");
    expect(configureMock).toHaveBeenCalledTimes(1);
  });

  it("drains a streaming response body fully before configure() runs", async () => {
    const responses = new Map<string, ReturnType<typeof streamingOkResponse>>();
    const fetchMock = vi.fn(async (url: string) => {
      const res = streamingOkResponse();
      responses.set(url, res);
      return res;
    });
    vi.stubGlobal("fetch", fetchMock);
    configureMock.mockResolvedValue(undefined);
    const { loadJapaneseG2P } = await import("../src/g2p/japanese.js");

    await loadJapaneseG2P(CONFIG_A);

    expect(responses.size).toBe(2); // dictionary archive + voice file
    for (const res of responses.values()) {
      const reader = res.body?.getReader() as unknown as { read: ReturnType<typeof vi.fn> };
      expect(reader.read).toHaveBeenCalled();
    }
  });

  it("throws from japaneseTextToPhonemes if loadJapaneseG2P was never called", async () => {
    const { japaneseTextToPhonemes } = await import("../src/g2p/japanese.js");
    await expect(japaneseTextToPhonemes("こんにちは")).rejects.toThrow(/loadJapaneseG2P\(\) must be called/);
  });
});

describe("browser-only initialization", () => {
  it("can import the public entry in Node without constructing a Worker", async () => {
    vi.stubGlobal(
      "Worker",
      class {
        constructor() {
          throw new Error("Worker must remain lazy");
        }
      },
    );
    await expect(import("../src/index.js")).resolves.toBeDefined();
    vi.unstubAllGlobals();
  });
});
