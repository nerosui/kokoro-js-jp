import type { RawAudio } from "@huggingface/transformers";
import { loadJapaneseG2P, type JapaneseG2PConfig } from "./g2p/japanese.js";
import { loadKokoro, speakEnglish, speakJapanese, type LoadOptions } from "./kokoro/synthesize.js";
import { DEFAULT_VOICE_ID, JA_VOICE_IDS, resolveLang, type Lang } from "./voices.js";

export { DEFAULT_VOICE_ID, resolveLang };
export type { Lang, JapaneseG2PConfig, LoadOptions };

// The Open JTalk dictionary + default HTS voice are vendored into dist/ at
// build time (see scripts/fetch-openjtalk-dic-assets.mjs) and served
// relative to this module, so KokoroJP.load() works with zero config and no
// runtime dependency on any third-party host. dicUrl is a *directory*
// openjtalkjs's browser runtime fetches 8 individual files from
// (`${dicUrl}/sys.dic`, `${dicUrl}/matrix.bin`, ...), not an archive.
// See THIRD_PARTY_NOTICES.md for the dictionary/voice licenses.
//
// Deliberately NOT written as `new URL("./openjtalk-dic", import.meta.url)`.
// That exact two-argument constructor shape is special-cased by bundlers
// (webpack, Turbopack, ...) as a static asset reference, traced and resolved
// at *build time* — confirmed empirically against Next.js 16/Turbopack, and
// confirmed it's *not* just literal-pattern matching: routing import.meta.url
// through a variable first still got traced (Turbopack's data-flow analysis
// follows simple const assignment). It only actually fails for dicUrl
// specifically because "openjtalk-dic" is a directory (8 loose files fetched
// individually at runtime, see JapaneseG2PConfig) with no single matching
// file to resolve to — voiceUrl's target is a real file and traces/resolves
// fine either way. Both are written the same way below regardless, so this
// stays bundler-agnostic without depending on that asymmetry: plain string
// slicing instead of the URL constructor's two-arg form sidesteps bundlers'
// asset-tracing heuristics entirely, since none of them attempt full
// data-flow analysis of arbitrary string operations (that would defeat the
// point of *static* analysis).
const moduleDir = import.meta.url.slice(0, import.meta.url.lastIndexOf("/"));
export const DEFAULT_DIC_URL = `${moduleDir}/openjtalk-dic`;
export const DEFAULT_VOICE_URL = `${moduleDir}/openjtalk-voice.htsvoice`;

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
