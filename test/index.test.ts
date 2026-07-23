import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadJapaneseG2P: vi.fn(),
  loadKokoro: vi.fn(),
  speakEnglish: vi.fn(),
  speakJapanese: vi.fn(),
}));

vi.mock("../src/g2p/japanese.js", () => ({
  DEFAULT_JAPANESE_ASSETS_URL: "https://cdn.jsdelivr.net/npm/kokoro-js-jp@0.1.1/dist",
  loadJapaneseG2P: mocks.loadJapaneseG2P,
}));

vi.mock("../src/kokoro/synthesize.js", () => ({
  loadKokoro: mocks.loadKokoro,
  speakEnglish: mocks.speakEnglish,
  speakJapanese: mocks.speakJapanese,
}));

import { KokoroJP } from "../src/index.js";

describe("KokoroJP default Japanese assets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadKokoro.mockResolvedValue({});
    mocks.loadJapaneseG2P.mockResolvedValue(undefined);
    mocks.speakEnglish.mockResolvedValue({ audio: new Float32Array(), sampling_rate: 24_000 });
    mocks.speakJapanese.mockResolvedValue({ audio: new Float32Array(), sampling_rate: 24_000 });
  });

  it("enables lazy Japanese synthesis when japanese is omitted", async () => {
    const tts = await KokoroJP.load();

    expect(mocks.loadJapaneseG2P).not.toHaveBeenCalled();
    await tts.speak("こんにちは", "jf_alpha");

    expect(mocks.loadJapaneseG2P).toHaveBeenCalledWith({});
    expect(mocks.speakJapanese).toHaveBeenCalledWith({}, "こんにちは", "jf_alpha", 1);
  });

  it("does not initialize Japanese assets for English synthesis", async () => {
    const tts = await KokoroJP.load();
    await tts.speak("Hello", "af_heart");

    expect(mocks.loadJapaneseG2P).not.toHaveBeenCalled();
    expect(mocks.speakEnglish).toHaveBeenCalledWith({}, "Hello", "af_heart", 1);
  });

  it("supports explicitly disabling Japanese synthesis", async () => {
    const tts = await KokoroJP.load({ japanese: false });

    await expect(tts.speak("こんにちは", "jf_alpha")).rejects.toThrow(/Japanese synthesis is disabled/);
    expect(mocks.loadJapaneseG2P).not.toHaveBeenCalled();
  });
});
