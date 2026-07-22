// Bridges openjtalkjs (vendored browser/WASM build, see src/vendor/openjtalk/)
// to Kokoro-compatible phonemes via the HEPBURN table ported in hepburn.ts.
//
// Design note: we use `runFrontendAsync` (word-segmented, matches
// pyopenjtalk.run_frontend / MeCab-style tokenization) rather than the
// single-string `g2pAsync`, so that we can insert spaces between words the
// way misaki's cutlet.py does (`Token.space`), and so punctuation tokens
// can be mapped independently of kana words.

import { configure, runFrontendAsync, type NJDNode } from '../vendor/openjtalk/browser.js'
import { hiraganaWordToPhonemes, PUNCT } from './hepburn.js'

export type JapaneseG2PConfig = {
  /** URL to the Open JTalk dictionary directory (must contain sys.dic, matrix.bin, etc.) */
  dicUrl: string
  /** URL to an .htsvoice file. Only used by openjtalkjs internally to size buffers; we don't use its synthesize(). */
  voiceUrl: string
}

let configured = false

export async function loadJapaneseG2P(config: JapaneseG2PConfig): Promise<void> {
  if (configured) return
  await configure(config)
  configured = true
}

function kataToHira(s: string): string {
  return Array.from(s)
    .map((ch) => {
      const code = ch.codePointAt(0)!
      // U+30A1-U+30F6 (katakana) -> U+3041-U+3096 (hiragana) is a fixed -96 offset
      if (code >= 0x30a1 && code <= 0x30f6) return String.fromCodePoint(code - 96)
      return ch
    })
    .join('')
}

function isKanaPron(pron: string): boolean {
  return Array.from(pron).some((ch) => {
    const code = ch.codePointAt(0)!
    return (code >= 0x30a1 && code <= 0x30fa) || code === 0x30fc // katakana incl. ー
  })
}

/**
 * Convert Japanese text to Kokoro-compatible IPA-ish phonemes.
 * Must call `loadJapaneseG2P` first.
 */
export async function japaneseTextToPhonemes(text: string): Promise<string> {
  if (!configured) {
    throw new Error('loadJapaneseG2P() must be called before japaneseTextToPhonemes()')
  }
  const nodes: NJDNode[] = await runFrontendAsync(text)
  const parts: string[] = []
  for (const node of nodes) {
    const pron = node.pron || node.read || ''
    if (pron && isKanaPron(pron)) {
      const hira = kataToHira(pron)
      const phonemes = hiraganaWordToPhonemes(hira)
      if (phonemes) parts.push(phonemes)
      continue
    }
    if (node.string) {
      const mapped = Array.from(node.string)
        .map((c) => PUNCT[c] ?? '')
        .join('')
      if (mapped) parts.push(mapped)
    }
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim()
}
