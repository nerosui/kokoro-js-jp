import type { RawAudio } from '@huggingface/transformers'
import { loadJapaneseG2P, type JapaneseG2PConfig } from './g2p/japanese.js'
import { loadKokoro, speakEnglish, speakJapanese, type LoadOptions } from './kokoro/synthesize.js'
import { DEFAULT_VOICE_ID, resolveVoice, VOICES, type VoiceEntry } from './voices.js'

export { VOICES, DEFAULT_VOICE_ID, resolveVoice }
export type { VoiceEntry, JapaneseG2PConfig, LoadOptions }

// Official upstream asset locations. Fetched at runtime (not bundled), same
// pattern kokoro-js itself uses for the ONNX model (Hugging Face Hub, cached
// via the browser Cache Storage API). See THIRD_PARTY_NOTICES.md.
export const DEFAULT_DIC_URL =
  'https://github.com/r9y9/open_jtalk/releases/download/v1.11.1/open_jtalk_dic_utf_8-1.11.tar.gz'
export const DEFAULT_VOICE_URL =
  'https://raw.githubusercontent.com/r9y9/pyopenjtalk/master/pyopenjtalk/htsvoice/mei_normal.htsvoice'

export type KokoroJPOptions = LoadOptions & {
  japanese?: Partial<JapaneseG2PConfig>
}

/**
 * English + Japanese text-to-speech, running entirely client-side
 * (Kokoro-82M via kokoro-js/transformers.js + Open JTalk via openjtalkjs),
 * no server or container required.
 */
export class KokoroJP {
  private constructor(private readonly tts: Awaited<ReturnType<typeof loadKokoro>>) {}

  static async load(options: KokoroJPOptions = {}): Promise<KokoroJP> {
    const [tts] = await Promise.all([
      loadKokoro(options),
      loadJapaneseG2P({
        dicUrl: options.japanese?.dicUrl ?? DEFAULT_DIC_URL,
        voiceUrl: options.japanese?.voiceUrl ?? DEFAULT_VOICE_URL,
      }),
    ])
    return new KokoroJP(tts)
  }

  /**
   * Synthesize speech for `text` using the given voiceId (see `VOICES`).
   * Language (en/ja) is inferred from the voiceId.
   */
  async speak(text: string, voiceId: string = DEFAULT_VOICE_ID, speed = 1): Promise<RawAudio> {
    const voice = resolveVoice(voiceId)
    if (!voice) {
      throw new Error(`unsupported voiceId: ${voiceId}. Should be one of: ${Object.keys(VOICES).join(', ')}`)
    }
    if (voice.lang === 'ja') {
      return speakJapanese(this.tts, text, voice.kokoroVoice, speed)
    }
    return speakEnglish(this.tts, text, voice.kokoroVoice, speed)
  }
}
