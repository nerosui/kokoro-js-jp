// Voice ids are plain Kokoro-82M voice ids (e.g. "af_heart", "jf_alpha") — the
// same ids kokoro-js itself uses as `VOICES` table keys — not a separate
// naming layer. The first letter encodes language, the second gender (see
// hexgrad/kokoro's `LANG_CODES` / the voice list in kokoro-js's `voices/`
// directory): a/b = English (US/UK), j = Japanese, plus e/f/h/i/p/z for
// Spanish/French/Hindi/Italian/Portuguese/Mandarin (not supported by this
// package — see below).
export type Lang = "en" | "ja";

const EN_PREFIXES = ["af_", "am_", "bf_", "bm_"];
const JA_PREFIXES = ["jf_", "jm_"];

/**
 * The Kokoro-82M model ships 54 voices across 9 languages (see kokoro-js's
 * `voices/` directory), but only two are wired up end-to-end here:
 *  - English (`af_*`/`am_*`/`bf_*`/`bm_*`): synthesized by kokoro-js itself,
 *    via its bundled espeak-ng phonemizer.
 *  - Japanese (`jf_*`/`jm_*`): synthesized via this package's own Open
 *    JTalk-based g2p (kokoro-js's phonemizer doesn't cover Japanese).
 * Other language prefixes (e/f/h/i/p/z) are valid Kokoro-82M voice ids but
 * unsupported here, since neither kokoro-js's phonemizer nor this package's
 * g2p covers them; `resolveLang` returns `undefined` for those so callers
 * can fail loudly instead of mis-phonemizing text as English.
 */
export function resolveLang(voiceId: string): Lang | undefined {
  if (EN_PREFIXES.some((prefix) => voiceId.startsWith(prefix))) return "en";
  if (JA_PREFIXES.some((prefix) => voiceId.startsWith(prefix))) return "ja";
  return undefined;
}

// Matches kokoro-js's own default (`generate()`/`generate_from_ids()` both
// default `voice` to "af_heart").
export const DEFAULT_VOICE_ID = "af_heart";
