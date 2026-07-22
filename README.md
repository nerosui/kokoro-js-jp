# kokoro-js-jp

ブラウザ上で動く英語・日本語対応のText-to-Speechライブラリ。音声合成には
[kokoro-js](https://github.com/hexgrad/kokoro)(npm: `kokoro-js`)/transformers.js(ONNX)経由の
[Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M)を使用し、日本語の
grapheme-to-phoneme(読み仮名→音素変換)には[openjtalkjs](https://github.com/keanu-thakalath/openjtalkjs)の
ブラウザ/WASMビルドをvendor(同梱)して使用する。完全にクライアントサイドのみで動作し、サーバーや
コンテナは不要。

本パッケージの構成(ビルド方式・パッケージ体裁・ライセンス)はkokoro-js本体
([hexgrad/kokoro](https://github.com/hexgrad/kokoro)の`kokoro.js/`)に準拠させている。
主な違いは、kokoro-jsがNode/ブラウザ両対応(CJS+ESM+Web版の3出力)なのに対し、本パッケージは
Worker + WASMのgrapheme-to-phonemeに依存する都合上ブラウザ専用(ESM単一出力)である点。

## 現在のステータス

初期スキャフォールド段階。ビルド/型チェック/テストはローカルで通っているが、実際のブラウザ上での
エンドツーエンド動作(Worker + WASM + ONNXモデルのダウンロード)はまだ検証していない。

## 使い方

```ts
import { KokoroJP } from "kokoro-js-jp";

const tts = await KokoroJP.load({
  dtype: "q8", // kokoro-jsのモデル量子化設定
  japanese: {
    dicUrl: "...", // Open JTalk辞書tarballのURL
    voiceUrl: "...", // .htsvoiceファイルのURL(バッファサイズ計算にのみ使用、音声合成自体には未使用)
  },
});

const englishAudio = await tts.speak("Hello, world.", "Joanna");
const japaneseAudio = await tts.speak("こんにちは", "Takumi");
```

ボイスID(`src/voices.ts`参照)は、このライブラリの元々の利用元(OLMS Client)が
既に使っているAmazon PollyのvoiceIdと名前を合わせてある。そのため既存UIの
ボイス選択部分を変更せずに使える。

## スクリプト

- `npm run build` — `rollup -c`(TypeScript直接バンドル、ESM単一出力+d.ts、kokoro-jsと同じ
  nodeResolve+terser構成)でビルドした後、`scripts/copy-vendor.mjs`がvendorしているopenjtalkjsの
  worker/WASMアセットを、バンドル後のコードが期待する相対パスで`dist/`にコピーする。
- `npm run format` — `prettier --write .`(kokoro-jsと同じ`--print-width 1000`)。
- `npm test` — `vitest run`(g2p・ボイステーブルの純粋関数テストのみ。ブラウザ/WASMは絡まない)。
- `npm run typecheck` — `tsc --noEmit`。

## ライセンス

Apache-2.0(kokoro-js本体、および本パッケージがportしている misaki の HEPBURN テーブルに合わせている)。
サードパーティのライセンス・クレジット表記は`THIRD_PARTY_NOTICES.md`を参照。

## 既知の未解決事項

- 実際のWorker + WASM + Kokoro ONNXパイプラインを通すブラウザ/e2eテストがまだ無い。
- `src/index.ts`内の`dicUrl`/`voiceUrl`のデフォルト値は upstream の GitHub リリース資産を
  直接指している。本番投入前に、vendor化するかCORS/可用性の前提をドキュメント化するか
  検討すること。
- kokoro-jsはjsdelivr/unpkg向けに全依存を1本にバンドルした「web版」も配布しているが、
  本パッケージはWorker+WASMが絡むため未検証・未実装(CDN `<script>`直読みでの動作は保証しない)。
