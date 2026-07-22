import { describe, expect, it } from 'vitest'
import { hiraganaWordToPhonemes } from '../src/g2p/hepburn.js'

describe('hiraganaWordToPhonemes', () => {
  it('maps plain kana word-by-word', () => {
    expect(hiraganaWordToPhonemes('こんにちは')).toBe('koɲɲiʨiha')
  })

  it('maps a direct digraph entry (きゃ)', () => {
    expect(hiraganaWordToPhonemes('きゃく')).toBe('kʲakɯ')
  })

  it('maps sokuon (っ) to a glottal stop', () => {
    expect(hiraganaWordToPhonemes('がっこう')).toBe('ɡaʔkoɯ')
  })

  it('maps ー to a length mark', () => {
    expect(hiraganaWordToPhonemes('こーひー')).toBe('koːçiː')
  })

  it.each([
    ['さんぽ', 'sampo'], // ん before p -> m
    ['げんき', 'ɡeŋkʲi'], // ん before k -> ŋ
    ['ほん', 'hoɴ'], // ん word-final -> ɴ (no following mora)
  ])('nasalizes ん contextually: %s -> %s', (hira, expected) => {
    expect(hiraganaWordToPhonemes(hira)).toBe(expected)
  })

  it('falls back to PUNCT for punctuation characters', () => {
    expect(hiraganaWordToPhonemes('。')).toBe('.')
  })

  it('returns an empty string for unmapped characters', () => {
    expect(hiraganaWordToPhonemes('X')).toBe('')
  })
})
