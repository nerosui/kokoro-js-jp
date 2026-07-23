import type { RawAudio } from "@huggingface/transformers";
import { loadJapaneseG2P, type JapaneseG2PConfig } from "./g2p/japanese.js";
import { loadKokoro, speakEnglish, speakJapanese, type LoadOptions } from "./kokoro/synthesize.js";
import { DEFAULT_VOICE_ID, JA_VOICE_IDS, resolveLang, type Lang } from "./voices.js";

export { DEFAULT_VOICE_ID, resolveLang };
export type { Lang, JapaneseG2PConfig, LoadOptions };

export type KokoroJPOptions = LoadOptions & {
  japanese?: JapaneseG2PConfig;
};

/**
 * English + Japanese text-to-speech, running entirely client-side
 * (Kokoro-82M via kokoro-js/transformers.js + Open JTalk via openjtalkjs),
 * no server or container required.
 */
export class KokoroJP {
  private japaneseG2PPromise: Promise<void> | null = null;

  private constructor(
    private readonly tts: Awaited<ReturnType<typeof loadKokoro>>,
    private readonly japaneseConfig: JapaneseG2PConfig | null,
  ) {}

  static async load(options: KokoroJPOptions = {}): Promise<KokoroJP> {
    const tts = await loadKokoro(options);
    return new KokoroJP(tts, options.japanese ?? null);
  }

  // Lazy: the Open JTalk dictionary is ~100MB, so English-only callers
  // shouldn't pay to fetch it. Loaded once, on first Japanese speak() call.
  // If loadJapaneseG2P() rejects, we drop this instance's cached promise so
  // the next speak() call re-invokes it — but that only actually retries the
  // underlying work if the failure happened before configure() was sent to
  // the vendor worker (e.g. a prefetch network error); loadJapaneseG2P()
  // itself stays permanently locked and replays the same rejection once
  // configure() has actually been dispatched (see g2p/japanese.ts).
  private loadJapaneseG2POnce(): Promise<void> {
    if (!this.japaneseConfig) {
      return Promise.reject(new Error("Japanese synthesis requires KokoroJP.load({ japanese: { assetsUrl } }). Use the versioned jsDelivr dist URL documented in README, or run kokoro-js-jp-copy-assets for self-hosting."));
    }
    if (!this.japaneseG2PPromise) {
      this.japaneseG2PPromise = loadJapaneseG2P(this.japaneseConfig).catch((err) => {
        this.japaneseG2PPromise = null;
        throw err;
      });
    }
    return this.japaneseG2PPromise;
  }

  /**
   * Synthesize speech for `text` using the given Kokoro-82M voiceId (e.g.
   * "af_heart", "jf_alpha" — see `resolveLang`). Language (en/ja) is
   * inferred from the voiceId's prefix.
   */
  async speak(text: string, voiceId: string = DEFAULT_VOICE_ID, speed = 1): Promise<RawAudio> {
    const lang = resolveLang(voiceId);
    if (lang === "ja") {
      if (!(JA_VOICE_IDS as readonly string[]).includes(voiceId)) {
        throw new Error(`unknown Japanese voiceId: ${voiceId}. Expected one of: ${JA_VOICE_IDS.join(", ")}.`);
      }
      await this.loadJapaneseG2POnce();
      return speakJapanese(this.tts, text, voiceId, speed);
    }
    if (lang === "en") {
      return speakEnglish(this.tts, text, voiceId, speed);
    }
    throw new Error(`unsupported voiceId: ${voiceId}. Expected an English (af_*/am_*/bf_*/bm_*) or Japanese (jf_*/jm_*) Kokoro-82M voice id.`);
  }
}
