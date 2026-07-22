import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// src/g2p/japanese.ts talks to the vendored openjtalkjs worker wrapper only
// through `configure()`/`runFrontendAsync()`. Mocking that module lets us
// exercise the module-global config-tracking/race-guard logic in
// loadJapaneseG2P() without a real browser Worker + WASM engine.
const configureMock = vi.fn();
vi.mock("../src/vendor/openjtalk/browser.js", () => ({
  configure: (...args: unknown[]) => configureMock(...args),
  runFrontendAsync: vi.fn(),
}));

const CONFIG_A = { dicUrl: "https://a.example/dic", voiceUrl: "https://a.example/voice.htsvoice" };
const CONFIG_B = { dicUrl: "https://b.example/dic", voiceUrl: "https://b.example/voice.htsvoice" };

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
  return { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(0) } as Response;
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

  it("rejects a call with a different config while the first is still in flight", async () => {
    const gate = deferred<void>();
    configureMock.mockReturnValue(gate.promise);
    const { loadJapaneseG2P } = await import("../src/g2p/japanese.js");

    const first = loadJapaneseG2P(CONFIG_A);
    await expect(loadJapaneseG2P(CONFIG_B)).rejects.toThrow(/different dicUrl\/voiceUrl/);

    gate.resolve();
    await first;
    expect(configureMock).toHaveBeenCalledTimes(1);
  });

  it("rejects a call with a different config after the first has already configured", async () => {
    configureMock.mockResolvedValue(undefined);
    const { loadJapaneseG2P } = await import("../src/g2p/japanese.js");

    await loadJapaneseG2P(CONFIG_A);
    await expect(loadJapaneseG2P(CONFIG_B)).rejects.toThrow(/different dicUrl\/voiceUrl/);
  });

  it("allows a retry with the same config after a failed configure", async () => {
    configureMock.mockRejectedValueOnce(new Error("worker unavailable"));
    configureMock.mockResolvedValueOnce(undefined);
    const { loadJapaneseG2P } = await import("../src/g2p/japanese.js");

    await expect(loadJapaneseG2P(CONFIG_A)).rejects.toThrow("worker unavailable");
    await expect(loadJapaneseG2P(CONFIG_A)).resolves.toBeUndefined();
    expect(configureMock).toHaveBeenCalledTimes(2);
  });

  it("throws from japaneseTextToPhonemes if loadJapaneseG2P was never called", async () => {
    const { japaneseTextToPhonemes } = await import("../src/g2p/japanese.js");
    await expect(japaneseTextToPhonemes("こんにちは")).rejects.toThrow(/loadJapaneseG2P\(\) must be called/);
  });
});
