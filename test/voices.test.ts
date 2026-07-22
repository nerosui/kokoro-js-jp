import { describe, expect, it } from 'vitest'
import { DEFAULT_VOICE_ID, resolveVoice, VOICES } from '../src/voices.js'

describe('voices', () => {
  it('resolves a known voiceId', () => {
    expect(resolveVoice('Takumi')).toEqual({ lang: 'ja', kokoroVoice: 'jm_kumo' })
  })

  it('returns undefined for an unknown voiceId', () => {
    expect(resolveVoice('NotAVoice')).toBeUndefined()
  })

  it('has a default voiceId present in the table', () => {
    expect(VOICES[DEFAULT_VOICE_ID]).toBeDefined()
  })

  it('only uses en/ja langs', () => {
    for (const voice of Object.values(VOICES)) {
      expect(['en', 'ja']).toContain(voice.lang)
    }
  })
})
