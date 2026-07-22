# kokoro-js-jp

ブラウザ上で動く英語・日本語対応のText-to-Speechライブラリ。音声合成には
[kokoro-js](https://github.com/hexgrad/kokoro-js)/transformers.js(ONNX)経由の
[Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M)を使用し、日本語の
grapheme-to-phoneme(読み仮名→音素変換)にはopenjtalkjsのブラウザ/WASMビルドを
vendor(同梱)して使用する。完全にクライアントサイドのみで動作し、サーバーや
コンテナは不要。

## 現在のステータス

初期スキャフォールド段階。ビルド/型チェック/テストはローカルで通っているが、
実際のブラウザ上でのエンドツーエンド動作(Worker + WASM + ONNXモデルのダウンロード)
はまだ検証していない。`THIRD_PARTY_NOTICES.md`にvendorしているopenjtalkjsの
**ライセンス表記が未解決のTODO**として残っているので、それが解決するまで公開しないこと。

## 使い方

```ts
import { KokoroJP } from 'kokoro-js-jp'

const tts = await KokoroJP.load({
  dtype: 'q8', // kokoro-jsのモデル量子化設定
  japanese: {
    dicUrl: '...', // Open JTalk辞書tarballのURL
    voiceUrl: '...', // .htsvoiceファイルのURL(バッファサイズ計算にのみ使用、音声合成自体には未使用)
  },
})

const englishAudio = await tts.speak('Hello, world.', 'Joanna')
const japaneseAudio = await tts.speak('こんにちは', 'Takumi')
```

ボイスID(`src/voices.ts`参照)は、このライブラリの元々の利用元(OLMS Client)が
既に使っているAmazon PollyのvoiceIdと名前を合わせてある。そのため既存UIの
ボイス選択部分を変更せずに使える。

## スクリプト

- `npm run build` — `tsup`(ESM+CJS+d.ts)でビルドした後、`scripts/copy-vendor.mjs`が
  vendorしているopenjtalkjsのworker/WASMアセットを、バンドル後のコードが期待する
  相対パスで`dist/`にコピーする。
- `npm test` — `vitest run`(g2p・ボイステーブルの純粋関数テストのみ。ブラウザ/WASMは絡まない)。
- `npm run typecheck` — `tsc --noEmit`。

## 既知の未解決事項

- openjtalkjsのライセンス・クレジット表記(`THIRD_PARTY_NOTICES.md`参照)。
- 実際のWorker + WASM + Kokoro ONNXパイプラインを通すブラウザ/e2eテストがまだ無い。
- `src/index.ts`内の`dicUrl`/`voiceUrl`のデフォルト値は upstream の GitHub リリース資産を
  直接指している。本番投入前に、vendor化するかCORS/可用性の前提をドキュメント化するか
  検討すること。
