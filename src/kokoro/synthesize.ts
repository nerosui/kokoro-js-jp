// Thin wrapper around kokoro-js's public API.
//
// English uses kokoro-js's standard `generate()` (its own bundled espeak-ng
// WASM phonemizer covers en-us/en-gb).
//
// Japanese bypasses kokoro-js's `generate()` (which only validates/phonemizes
// for the English voices it ships metadata for) and instead tokenizes our own
// IPA-ish phonemes (see g2p/japanese.ts) and calls the lower-level
// `generate_from_ids`. This works because kokoro-js's npm package actually
// ships all 54 voice `.bin` files (including jf_*/jm_* Japanese voices), not
// just the English ones listed in its `VOICES` table; only the convenience
// `generate()`/`stream()` entry points restrict voice selection to `VOICES`.

import { KokoroTTS } from "kokoro-js";
import type { RawAudio } from "@huggingface/transformers";
import { japaneseTextToPhonemes } from "../g2p/japanese.js";

export type KokoroDevice = "wasm" | "webgpu" | "cpu";
export type KokoroDtype = "fp32" | "fp16" | "q8" | "q4" | "q4f16";

export type LoadOptions = {
  modelId?: string;
  dtype?: KokoroDtype;
  device?: KokoroDevice;
};

const DEFAULT_MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";

export async function loadKokoro(options: LoadOptions = {}): Promise<KokoroTTS> {
  return KokoroTTS.from_pretrained(options.modelId ?? DEFAULT_MODEL_ID, {
    dtype: options.dtype ?? "q8",
    device: options.device ?? null,
  });
}

export async function speakEnglish(tts: KokoroTTS, text: string, voice: string, speed = 1): Promise<RawAudio> {
  // English voice ids are validated against kokoro-js's own VOICES table by generate() itself.
  return tts.generate(text, { voice: voice as Parameters<KokoroTTS["generate"]>[1] extends { voice?: infer V } ? V : never, speed });
}

/**
 * Synthesize Japanese text. Requires `loadJapaneseG2P()` (see g2p/japanese.ts)
 * to have been called first. `voice` is a Japanese Kokoro voice id not
 * present in kokoro-js's public VOICES table (e.g. "jf_alpha", "jm_kumo"),
 * so it is intentionally typed as `string` rather than `keyof VOICES`.
 */
export async function speakJapanese(tts: KokoroTTS, text: string, voice: string, speed = 1): Promise<RawAudio> {
  const phonemes = await japaneseTextToPhonemes(text);
  if (!phonemes) {
    throw new Error(`japaneseTextToPhonemes produced no output for: ${text}`);
  }
  const { input_ids } = tts.tokenizer(phonemes, { truncation: true });
  return tts.generate_from_ids(input_ids, { voice: voice as Parameters<KokoroTTS["generate_from_ids"]>[1] extends { voice?: infer V } ? V : never, speed });
}
