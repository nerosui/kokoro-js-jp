// ADAPTED from https://github.com/hexgrad/misaki/blob/main/misaki/cutlet.py
// which is itself ADAPTED from https://github.com/polm/cutlet/blob/main/cutlet/cutlet.py
// misaki/cutlet.py: Apache License 2.0 (Copyright hexgrad)
// polm/cutlet:      MIT License (Copyright (c) 2020 Paul O'Leary McCann)
// See THIRD_PARTY_NOTICES.md for full license texts.
//
// This module ports the HEPBURN kana->IPA table and the single-mora mapping
// algorithm (_get_single_mapping in the original) from Python to TypeScript.
// It operates on a HIRAGANA string (word segmentation and reading lookup are
// delegated to openjtalkjs upstream, see g2p/index.ts).

/** hiragana (single char) / digraph -> Kokoro-compatible IPA-ish phoneme */
export const HEPBURN: Record<string, string> = {
  あ: 'a', い: 'i', う: 'ɯ', え: 'e', お: 'o',
  ぁ: 'a', ぃ: 'i', ぅ: 'ɯ', ぇ: 'e', ぉ: 'o',
  か: 'ka', き: 'kʲi', く: 'kɯ', け: 'ke', こ: 'ko',
  が: 'ɡa', ぎ: 'ɡʲi', ぐ: 'ɡɯ', げ: 'ɡe', ご: 'ɡo',
  さ: 'sa', し: 'ɕi', す: 'sɨ', せ: 'se', そ: 'so',
  ざ: 'ʣa', じ: 'ʥi', ず: 'zɨ', ぜ: 'ʣe', ぞ: 'ʣo',
  た: 'ta', ち: 'ʨi', つ: 'ʦɨ', て: 'te', と: 'to',
  だ: 'da', ぢ: 'ʥi', づ: 'zɨ', で: 'de', ど: 'do',
  な: 'na', に: 'ɲi', ぬ: 'nɯ', ね: 'ne', の: 'no',
  は: 'ha', ひ: 'çi', ふ: 'ɸɯ', へ: 'he', ほ: 'ho',
  ば: 'ba', び: 'bʲi', ぶ: 'bɯ', べ: 'be', ぼ: 'bo',
  ぱ: 'pa', ぴ: 'pʲi', ぷ: 'pɯ', ぺ: 'pe', ぽ: 'po',
  ま: 'ma', み: 'mʲi', む: 'mɯ', め: 'me', も: 'mo',
  ゃ: 'ja', や: 'ja', ゅ: 'jɯ', ゆ: 'jɯ', ょ: 'jo', よ: 'jo',
  ら: 'ɾa', り: 'ɾʲi', る: 'ɾɯ', れ: 'ɾe', ろ: 'ɾo',
  ゎ: 'βa', わ: 'βa', ゐ: 'i', ゑ: 'e', を: 'o',
  ゔ: 'vɯ', ゕ: 'ka', ゖ: 'ke',
  // katakana-only (ヷヸヹヺ, no hiragana codepoint) kept for direct katakana fallback
  ヷ: 'va', ヸ: 'vʲi', ヹ: 've', ヺ: 'vo',

  // digraphs (small-kana combinations)
  いぇ: 'je',
  うぃ: 'βi', うぇ: 'βe', うぉ: 'βo',
  きぇ: 'kʲe', きゃ: 'kʲa', きゅ: 'kʲɨ', きょ: 'kʲo',
  ぎゃ: 'ɡʲa', ぎゅ: 'ɡʲɨ', ぎょ: 'ɡʲo',
  くぁ: 'kᵝa', くぃ: 'kᵝi', くぇ: 'kᵝe', くぉ: 'kᵝo',
  ぐぁ: 'ɡᵝa', ぐぃ: 'ɡᵝi', ぐぇ: 'ɡᵝe', ぐぉ: 'ɡᵝo',
  しぇ: 'ɕe', しゃ: 'ɕa', しゅ: 'ɕɨ', しょ: 'ɕo',
  じぇ: 'ʥe', じゃ: 'ʥa', じゅ: 'ʥɨ', じょ: 'ʥo',
  ちぇ: 'ʨe', ちゃ: 'ʨa', ちゅ: 'ʨɨ', ちょ: 'ʨo',
  ぢゃ: 'ʥa', ぢゅ: 'ʥɨ', ぢょ: 'ʥo',
  つぁ: 'ʦa', つぃ: 'ʦʲi', つぇ: 'ʦe', つぉ: 'ʦo',
  てぃ: 'tʲi', てゅ: 'tʲɨ',
  でぃ: 'dʲi', でゅ: 'dʲɨ',
  とぅ: 'tɯ', どぅ: 'dɯ',
  にぇ: 'ɲe', にゃ: 'ɲa', にゅ: 'ɲɨ', にょ: 'ɲo',
  ひぇ: 'çe', ひゃ: 'ça', ひゅ: 'çɨ', ひょ: 'ço',
  びゃ: 'bʲa', びゅ: 'bʲɨ', びょ: 'bʲo',
  ぴゃ: 'pʲa', ぴゅ: 'pʲɨ', ぴょ: 'pʲo',
  ふぁ: 'ɸa', ふぃ: 'ɸʲi', ふぇ: 'ɸe', ふぉ: 'ɸo', ふゅ: 'ɸʲɨ', ふょ: 'ɸʲo',
  みゃ: 'mʲa', みゅ: 'mʲɨ', みょ: 'mʲo',
  りゃ: 'ɾʲa', りゅ: 'ɾʲɨ', りょ: 'ɾʲo',
  ゔぁ: 'va', ゔぃ: 'vʲi', ゔぇ: 've', ゔぉ: 'vo', ゔゅ: 'bʲɨ', ゔょ: 'bʲo',
}

/** small kana that combine with a preceding consonant kana to form a digraph */
const SUTEGANA = new Set(['ゃ', 'ゅ', 'ょ', 'ぁ', 'ぃ', 'ぅ', 'ぇ', 'ぉ'])

/** punctuation passthrough, mirrors HEPBURN's symbol entries in cutlet.py */
export const PUNCT: Record<string, string> = {
  '。': '.', '、': ',', '？': '?', '！': '!',
  '「': '“', '」': '”', '『': '“', '』': '”',
  '：': ':', '；': ';', '（': '(', '）': ')',
  '《': '(', '》': ')', '【': '[', '】': ']',
  '・': ' ', '，': ',', '～': '—', '〜': '—', '—': '—',
  '«': '“', '»': '”',
}

/**
 * Determine the phoneme for `ん` given the following kana, mirroring
 * cutlet.py's context rule (m before m/p/b, ŋ before k/g, ɲ before ɲ/ʨ/ʥ,
 * n before n/t/d/r/z, ɴ otherwise).
 */
function nasalN(nextPhoneme: string | undefined): string {
  if (!nextPhoneme) return 'ɴ'
  const head = nextPhoneme[0]!
  if ('mpb'.includes(head)) return 'm'
  if ('kɡ'.includes(head)) return 'ŋ'
  if (nextPhoneme.startsWith('ɲ') || nextPhoneme.startsWith('ʨ') || nextPhoneme.startsWith('ʥ')) return 'ɲ'
  if ('ntdɾz'.includes(head)) return 'n'
  return 'ɴ'
}

/**
 * Convert a single word's HIRAGANA reading to Kokoro-style phonemes.
 * Mirrors cutlet.py's `_romaji_word` + `_get_single_mapping` for the
 * "ordinary kana word" case (char_type == 6 in the original).
 */
export function hiraganaWordToPhonemes(hira: string): string {
  let out = ''
  const chars = Array.from(hira)
  for (let i = 0; i < chars.length; i++) {
    const kk = chars[i]!
    const pk = i > 0 ? chars[i - 1]! : undefined
    const nk = i < chars.length - 1 ? chars[i + 1]! : undefined

    // digraph consumed by the previous iteration
    if (pk && HEPBURN[pk + kk] !== undefined) continue
    // this char + next forms a digraph -> defer to next iteration
    if (nk && HEPBURN[kk + nk] !== undefined) {
      out += HEPBURN[kk + nk]
      i++ // consume nk too
      continue
    }
    if (nk && SUTEGANA.has(nk)) {
      if (kk === 'っ') continue // sokuon can't combine, ignore (matches upstream)
      const base = HEPBURN[kk]
      const small = HEPBURN[nk]
      if (base && small) {
        out += base.slice(0, -1) + small
        i++
        continue
      }
    }
    if (SUTEGANA.has(kk)) continue // orphan small kana, already consumed or invalid
    if (kk === 'ー') {
      out += 'ː'
      continue
    }
    if (kk === 'っ') {
      out += 'ʔ'
      continue
    }
    if (kk === 'ん') {
      // look ahead to the phoneme of the *next mora* (not just next char,
      // since the next char could itself start a digraph)
      let nextPhoneme: string | undefined
      if (nk) {
        const nnk = i + 2 < chars.length ? chars[i + 2]! : undefined
        nextPhoneme = (nnk && HEPBURN[nk + nnk]) || HEPBURN[nk]
      }
      out += nasalN(nextPhoneme)
      continue
    }
    out += HEPBURN[kk] ?? PUNCT[kk] ?? ''
  }
  return out
}
