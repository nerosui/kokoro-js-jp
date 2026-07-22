// Bridges openjtalkjs (vendored browser/WASM build, see src/vendor/openjtalk/)
// to Kokoro-compatible phonemes via the HEPBURN table ported in hepburn.ts.
//
// Design note: we use `runFrontendAsync` (word-segmented, matches
// pyopenjtalk.run_frontend / MeCab-style tokenization) rather than the
// single-string `g2pAsync`, so that we can insert spaces between words the
// way misaki's cutlet.py does (`Token.space`), and so punctuation tokens
// can be mapped independently of kana words.

import { configure, runFrontendAsync, type NJDNode } from "../vendor/openjtalk/browser.js";
import { hiraganaWordToPhonemes, PUNCT } from "./hepburn.js";

export type JapaneseG2PConfig = {
  /**
   * URL to a *directory* serving the 8 individual Open JTalk dictionary
   * files (sys.dic, matrix.bin, char.bin, unk.dic, left-id.def, right-id.def,
   * pos-id.def, rewrite.def) — openjtalkjs's browser runtime fetches each
   * one separately as `${dicUrl}/<file>`. Not an archive URL.
   */
  dicUrl: string;
  /**
   * URL to a single .htsvoice file. This package never calls openjtalkjs's
   * `synthesize()` (only `runFrontendAsync()` for g2p), but openjtalkjs's
   * native `configure()` still hard-requires a loadable voice — it calls
   * `HTS_Engine_load()` unconditionally and fails configure() entirely if
   * that fails — so a valid voiceUrl is required even though the voice
   * model itself is otherwise unused here.
   */
  voiceUrl: string;
};

// The underlying openjtalkjs worker (src/vendor/openjtalk/browser.js) owns a
// single Worker + single WASM instance for the whole page — `configure()` is
// process-global, not per-caller, no matter how many KokoroJP instances call
// loadJapaneseG2P(). We track the config it was configured with so a second
// call with a *different* dicUrl/voiceUrl fails loudly instead of silently
// keeping the first config, and we memoize the in-flight promise so
// concurrent first calls share one configure() instead of racing two.
let configuredWith: JapaneseG2PConfig | null = null;
let configuringPromise: Promise<void> | null = null;

// The 8 files openjtalkjs's worker-side configure() fetches from `dicUrl`
// (see JapaneseG2PConfig doc above).
const DIC_FILES = ["sys.dic", "matrix.bin", "char.bin", "unk.dic", "left-id.def", "right-id.def", "pos-id.def", "rewrite.def"];

// src/vendor/openjtalk/browser.js (a byte-for-byte verified copy of
// @keanu-thakalath/openjtalkjs, see THIRD_PARTY_NOTICES.md — deliberately
// not patched) hardcodes a 20s timeout per worker request, including
// configure(), which internally re-fetches all 8 dictionary files + the
// voice file itself. On a slow connection, ~100MB of dictionary can easily
// exceed 20s. A dedicated Worker shares the page's HTTP cache for
// same-origin requests, so warming that cache here first (no timeout) means
// the worker's own fetches resolve from cache almost instantly, keeping
// configure() itself well inside the 20s budget.
async function warmDictionaryCache(config: JapaneseG2PConfig): Promise<void> {
  const urls = [...DIC_FILES.map((f) => `${config.dicUrl}/${f}`), config.voiceUrl];
  const responses = await Promise.all(urls.map((url) => fetch(url, { cache: "force-cache" })));
  for (const [i, res] of responses.entries()) {
    if (!res.ok) throw new Error(`failed to prefetch ${urls[i]}: HTTP ${res.status}`);
  }
}

export async function loadJapaneseG2P(config: JapaneseG2PConfig): Promise<void> {
  if (configuredWith) {
    if (configuredWith.dicUrl !== config.dicUrl || configuredWith.voiceUrl !== config.voiceUrl) {
      throw new Error(`Japanese g2p is already configured with a different dicUrl/voiceUrl (dicUrl=${configuredWith.dicUrl}, voiceUrl=${configuredWith.voiceUrl}). ` + `openjtalkjs's browser runtime is a single global engine per page, so all callers must use the same japanese config.`);
    }
    return;
  }
  if (!configuringPromise) {
    configuringPromise = warmDictionaryCache(config)
      .then(() => configure(config))
      .then(
        () => {
          configuredWith = config;
        },
        (err) => {
          configuringPromise = null;
          throw err;
        },
      );
  }
  return configuringPromise;
}

function kataToHira(s: string): string {
  return Array.from(s)
    .map((ch) => {
      const code = ch.codePointAt(0)!;
      // U+30A1-U+30F6 (katakana) -> U+3041-U+3096 (hiragana) is a fixed -96 offset
      if (code >= 0x30a1 && code <= 0x30f6) return String.fromCodePoint(code - 96);
      return ch;
    })
    .join("");
}

function isKanaPron(pron: string): boolean {
  return Array.from(pron).some((ch) => {
    const code = ch.codePointAt(0)!;
    return (code >= 0x30a1 && code <= 0x30fa) || code === 0x30fc; // katakana incl. ー
  });
}

/**
 * Convert Japanese text to Kokoro-compatible IPA-ish phonemes.
 * Must call `loadJapaneseG2P` first.
 */
export async function japaneseTextToPhonemes(text: string): Promise<string> {
  if (!configuredWith) {
    throw new Error("loadJapaneseG2P() must be called before japaneseTextToPhonemes()");
  }
  const nodes: NJDNode[] = await runFrontendAsync(text);
  const parts: string[] = [];
  for (const node of nodes) {
    const pron = node.pron || node.read || "";
    if (pron && isKanaPron(pron)) {
      const hira = kataToHira(pron);
      const phonemes = hiraganaWordToPhonemes(hira);
      if (phonemes) parts.push(phonemes);
      continue;
    }
    if (node.string) {
      const mapped = Array.from(node.string)
        .map((c) => PUNCT[c] ?? "")
        .join("");
      if (mapped) parts.push(mapped);
    }
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}
