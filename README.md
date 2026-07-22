# kokoro-js-jp

Browser-based English + Japanese text-to-speech: [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M)
synthesis via [kokoro-js](https://github.com/hexgrad/kokoro-js)/transformers.js (ONNX), with Japanese
grapheme-to-phoneme via a vendored browser/WASM build of openjtalkjs. Runs entirely client-side —
no server or container required.

## Status

Early scaffold. Build/typecheck/tests pass locally; the library has not yet been exercised end-to-end
in an actual browser (Worker + WASM + ONNX model download). See `THIRD_PARTY_NOTICES.md` for an
**unresolved licensing TODO** on the vendored openjtalkjs build — do not publish until that's settled.

## Usage

```ts
import { KokoroJP } from 'kokoro-js-jp'

const tts = await KokoroJP.load({
  dtype: 'q8', // kokoro-js model quantization
  japanese: {
    dicUrl: '...', // Open JTalk dictionary tarball URL
    voiceUrl: '...', // .htsvoice file URL (buffer sizing only, not used for synthesis)
  },
})

const englishAudio = await tts.speak('Hello, world.', 'Joanna')
const japaneseAudio = await tts.speak('こんにちは', 'Takumi')
```

Voice ids (see `src/voices.ts`) are named to match the Amazon Polly voiceIds this library's original
consumer (OLMS Client) already uses, so existing UI voice pickers don't need to change.

## Scripts

- `npm run build` — `tsup` (ESM+CJS+d.ts) then `scripts/copy-vendor.mjs` copies the vendored
  openjtalkjs worker/WASM assets into `dist/` at the relative paths the bundled code expects.
- `npm test` — `vitest run` (pure-function g2p/voice-table tests; no browser/WASM involved).
- `npm run typecheck` — `tsc --noEmit`.

## Known open items

- openjtalkjs license/attribution (see `THIRD_PARTY_NOTICES.md`).
- No browser/e2e test yet exercising the actual Worker + WASM + Kokoro ONNX pipeline.
- `dicUrl`/`voiceUrl` defaults in `src/index.ts` point at upstream GitHub release assets; consider
  vendoring or documenting CORS/availability expectations before relying on them in production.
