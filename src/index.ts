import type { RawAudio } from "@huggingface/transformers";
import { loadJapaneseG2P, type JapaneseG2PConfig } from "./g2p/japanese.js";
import { loadKokoro, speakEnglish, speakJapanese, type LoadOptions } from "./kokoro/synthesize.js";
import { DEFAULT_VOICE_ID, resolveLang, type Lang } from "./voices.js";

export { DEFAULT_VOICE_ID, resolveLang };
export type { Lang, JapaneseG2PConfig, LoadOptions };

// The Open JTalk dictionary + default HTS voice are vendored into dist/ at
// build time (see scripts/fetch-openjtalk-dic-assets.mjs) and served
// relative to this module, so KokoroJP.load() works with zero config and no
// runtime dependency on any third-party host. dicUrl is a *directory*
// openjtalkjs's browser runtime fetches 8 individual files from
// (`${dicUrl}/sys.dic`, `${dicUrl}/matrix.bin`, ...), not an archive.
// See THIRD_PARTY_NOTICES.md for the dictionary/voice licenses.
export const DEFAULT_DIC_URL = new URL("./openjtalk-dic", import.meta.url).href;
export const DEFAULT_VOICE_URL = new URL("./openjtalk-voice.htsvoice", import.meta.url).href;

export type KokoroJPOptions = LoadOptions & {
  japanese?: Partial<JapaneseG2PConfig>;
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
    private readonly japaneseConfig: JapaneseG2PConfig,
  ) {}

  static async load(options: KokoroJPOptions = {}): Promise<KokoroJP> {
    const tts = await loadKokoro(options);
    return new KokoroJP(tts, {
      dicUrl: options.japanese?.dicUrl ?? DEFAULT_DIC_URL,
      voiceUrl: options.japanese?.voiceUrl ?? DEFAULT_VOICE_URL,
    });
  }

  // Lazy: the Open JTalk dictionary is ~100MB, so English-only callers
  // shouldn't pay to fetch it. Loaded once, on first Japanese speak() call.
  private loadJapaneseG2POnce(): Promise<void> {
    if (!this.japaneseG2PPromise) {
      this.japaneseG2PPromise = loadJapaneseG2P(this.japaneseConfig);
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
      await this.loadJapaneseG2POnce();
      return speakJapanese(this.tts, text, voiceId, speed);
    }
    if (lang === "en") {
      return speakEnglish(this.tts, text, voiceId, speed);
    }
    throw new Error(`unsupported voiceId: ${voiceId}. Expected an English (af_*/am_*/bf_*/bm_*) or Japanese (jf_*/jm_*) Kokoro-82M voice id.`);
  }
}
