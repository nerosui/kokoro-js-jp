// Bridges openjtalkjs (vendored browser/WASM build, see src/vendor/openjtalk/)
// to Kokoro-compatible phonemes via the HEPBURN table ported in hepburn.ts.
//
// Design note: we use `runFrontendAsync` (word-segmented, matches
// pyopenjtalk.run_frontend / MeCab-style tokenization) rather than the
// single-string `g2pAsync`, so that we can insert spaces between words the
// way misaki's cutlet.py does (`Token.space`), and so punctuation tokens
// can be mapped independently of kana words.

import type { NJDNode } from "../vendor/openjtalk/browser.js";
import { hiraganaWordToPhonemes, PUNCT } from "./hepburn.js";
import { configureWorker, runFrontendAsync } from "./worker-client.js";

export type JapaneseG2PConfig = {
  /**
   * Public URL of the directory created by `kokoro-js-jp-copy-assets`.
   * The package deliberately requires this explicit URL because application
   * bundlers do not copy npm package data files into their public output.
   */
  assetsUrl: string;
  /**
   * Optional overrides for advanced hosting layouts. `dicUrl` must serve the
   * 8 loose dictionary files; `workerUrl` must point at browser/worker.js
   * next to the copied WASM assets.
   */
  dicUrl?: string;
  voiceUrl?: string;
  workerUrl?: string;
};

type ResolvedJapaneseG2PConfig = Required<JapaneseG2PConfig>;

function resolveConfig(config: JapaneseG2PConfig): ResolvedJapaneseG2PConfig {
  if (!config.assetsUrl.trim()) throw new Error("japanese.assetsUrl must be a non-empty public URL");
  // Keep the origin root usable: joining an empty normalized base with
  // `/openjtalk-dic` correctly produces an origin-relative URL.
  const assetsUrl = config.assetsUrl === "/" ? "" : config.assetsUrl.replace(/\/+$/, "");
  return {
    assetsUrl,
    dicUrl: config.dicUrl ?? `${assetsUrl}/openjtalk-dic`,
    voiceUrl: config.voiceUrl ?? `${assetsUrl}/openjtalk-voice.htsvoice`,
    workerUrl: config.workerUrl ?? `${assetsUrl}/browser/worker.js`,
  };
}

// The lazy worker client owns a single Worker + single WASM instance for the
// whole page — `configureWorker()` is
// process-global, not per-caller, no matter how many KokoroJP instances call
// loadJapaneseG2P(). `activeConfig` holds whichever config is either
// in-flight or already configured, so a second call with a *different*
// dicUrl/voiceUrl fails loudly (whether it arrives before or after the first
// call finishes) instead of silently joining/keeping the first config. We
// memoize the in-flight promise so concurrent calls with the *same* config
// share one configure() instead of racing two.
let activeConfig: ResolvedJapaneseG2PConfig | null = null;
let configuredWith: ResolvedJapaneseG2PConfig | null = null;
let configuringPromise: Promise<void> | null = null;

function sameConfig(a: ResolvedJapaneseG2PConfig, b: ResolvedJapaneseG2PConfig): boolean {
  return a.dicUrl === b.dicUrl && a.voiceUrl === b.voiceUrl && a.workerUrl === b.workerUrl;
}

// The 8 files openjtalkjs's worker-side configure() fetches from `dicUrl`
// (see JapaneseG2PConfig doc above).
const DIC_FILES = ["sys.dic", "matrix.bin", "char.bin", "unk.dic", "left-id.def", "right-id.def", "pos-id.def", "rewrite.def"];

// Our worker client mirrors openjtalkjs's 20s timeout per request, including
// configure(), which internally re-fetches all 8 dictionary files + the
// voice file itself. On a slow connection, ~100MB of dictionary can easily
// exceed 20s. A dedicated Worker shares the page's HTTP cache for
// same-origin requests, so warming that cache here first (no timeout) means
// the worker's own fetches resolve from cache almost instantly, keeping
// configure() itself well inside the 20s budget. Crucially, we must consume
// each response body (not just await the fetch() promise, which resolves as
// soon as headers arrive) so this function doesn't return — and let
// configure() proceed — before the ~100MB download has actually finished
// landing in the HTTP cache. We drain the body a chunk at a time via the
// stream reader instead of `res.arrayBuffer()`, so we never hold the whole
// ~100MB (x9 files in parallel) in JS heap at once — we only need the bytes
// to reach the HTTP cache, not to look at them ourselves.
async function drainResponseBody(res: Response): Promise<void> {
  const reader = res.body?.getReader();
  if (!reader) {
    // Environments without a streamable Response.body (rare; some older
    // runtimes) fall back to buffering the whole response.
    await res.arrayBuffer();
    return;
  }
  for (;;) {
    const { done } = await reader.read();
    if (done) break;
  }
}

async function warmDictionaryCache(config: ResolvedJapaneseG2PConfig): Promise<void> {
  const urls = [...DIC_FILES.map((f) => `${config.dicUrl}/${f}`), config.voiceUrl];
  await Promise.all(
    urls.map(async (url) => {
      const res = await fetch(url, { cache: "force-cache" });
      if (!res.ok) throw new Error(`failed to prefetch ${url}: HTTP ${res.status}`);
      await drainResponseBody(res);
    }),
  );
}

export async function loadJapaneseG2P(config: JapaneseG2PConfig): Promise<void> {
  const resolved = resolveConfig(config);
  if (activeConfig && !sameConfig(activeConfig, resolved)) {
    throw new Error(`Japanese g2p is already being configured or was already configured with different asset URLs (dicUrl=${activeConfig.dicUrl}, voiceUrl=${activeConfig.voiceUrl}, workerUrl=${activeConfig.workerUrl}). ` + `openjtalkjs's browser runtime is a single global engine per page, so all callers must use the same japanese config.`);
  }
  if (configuredWith) return;
  if (!configuringPromise) {
    activeConfig = resolved;
    // Once we've actually sent a configure() message to the vendored
    // openjtalkjs worker, we can't cancel
    // it or know its true outcome if our client-side call times out (its
    // hardcoded 20s REQUEST_TIMEOUT_MS only rejects *our* pending promise;
    // the worker keeps running the request to completion in the
    // background). So we only allow retrying loadJapaneseG2P() after a
    // failure that happened *before* configure() was ever sent (e.g. our
    // own prefetch failing on a 404/network error) — once configure() has
    // been dispatched, this module stays permanently locked to `config`
    // even on failure/timeout, so we can never send a conflicting second
    // configure() while the first might still be running on the worker.
    let configureSent = false;
    configuringPromise = warmDictionaryCache(resolved)
      .then(() => {
        configureSent = true;
        return configureWorker(resolved.workerUrl, { dicUrl: resolved.dicUrl, voiceUrl: resolved.voiceUrl });
      })
      .then(
        () => {
          configuredWith = resolved;
        },
        (err) => {
          if (!configureSent) {
            configuringPromise = null;
            activeConfig = null;
          }
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
  const nodes: NJDNode[] = await runFrontendAsync(configuredWith.workerUrl, text);
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
