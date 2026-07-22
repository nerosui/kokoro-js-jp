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

const englishAudio = await tts.speak("Hello, world.", "af_heart");
const japaneseAudio = await tts.speak("こんにちは", "jf_alpha");
```

voiceIdはkokoro-js本体と同じ、素のKokoro-82M voice id(例: `af_heart`, `jf_alpha`)をそのまま使う。
別名レイヤーは持たない。1文字目が言語、2文字目が性別を表す(`af_` = 米語・女性、`jm_` = 日本語・男性、等)。
このパッケージが実際にend-to-endで対応しているのは英語(`af_`/`am_`/`bf_`/`bm_`、kokoro-js本体の
espeak-ngフォニマイザーが処理)と日本語(`jf_`/`jm_`、このパッケージ独自のOpen JTalk g2pが処理)の
2言語のみ。Kokoro-82Mモデル自体は他言語(`e`西語/`f`仏語/`h`ヒンディー語/`i`伊語/`p`ポルトガル語/`z`中国語)
のvoiceも同梱しているが、対応するg2pが無いため`resolveLang()`は`undefined`を返し`speak()`は例外を投げる。

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
