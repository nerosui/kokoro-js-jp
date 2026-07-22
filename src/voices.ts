export type Lang = "en" | "ja";

export type VoiceEntry = {
  lang: Lang;
  /** Underlying Kokoro-82M voice id, e.g. "af_heart" / "jf_alpha" */
  kokoroVoice: string;
};

/**
 * English + Japanese voice ids, named to match the Amazon Polly voiceIds
 * historically used by this library's original consumer (OLMS Client) so
 * that existing UI voice pickers don't need to change.
 */
export const VOICES: Record<string, VoiceEntry> = {
  // English (US)
  Ivy: { lang: "en", kokoroVoice: "af_nicole" },
  Joanna: { lang: "en", kokoroVoice: "af_heart" },
  Kendra: { lang: "en", kokoroVoice: "af_kore" },
  Kimberly: { lang: "en", kokoroVoice: "af_sarah" },
  Salli: { lang: "en", kokoroVoice: "af_bella" },
  Joey: { lang: "en", kokoroVoice: "am_michael" },
  Justin: { lang: "en", kokoroVoice: "am_puck" },
  Matthew: { lang: "en", kokoroVoice: "am_adam" },

  // Japanese
  Mizuki: { lang: "ja", kokoroVoice: "jf_alpha" },
  Takumi: { lang: "ja", kokoroVoice: "jm_kumo" },
};

export const DEFAULT_VOICE_ID = "Takumi";

export function resolveVoice(voiceId: string): VoiceEntry | undefined {
  return VOICES[voiceId];
}
