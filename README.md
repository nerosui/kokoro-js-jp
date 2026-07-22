# kokoro-js-jp

ブラウザ上で動く英語・日本語対応のText-to-Speechライブラリ。音声合成には
[kokoro-js](https://github.com/hexgrad/kokoro)(npm: `kokoro-js`)/transformers.js(ONNX)経由の
[Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M)を使用し、日本語の
grapheme-to-phoneme(読み仮名→音素変換)には[openjtalkjs](https://github.com/keanu-thakalath/openjtalkjs)の
ブラウザ/WASMビルドを使用する。openjtalkjsの実行に必要なOpen JTalk辞書(約100MB)とデフォルトの
HTSボイス(`mei_normal.htsvoice`)はビルド時に取得して`dist/`に同梱されるため、外部ホストへの
実行時アクセスは不要。完全にクライアントサイドのみで動作し、サーバーやコンテナは不要。

本パッケージの構成(ビルド方式・パッケージ体裁・ライセンス)はkokoro-js本体
([hexgrad/kokoro](https://github.com/hexgrad/kokoro)の`kokoro.js/`)に準拠させている。
主な違いは、kokoro-jsがNode/ブラウザ両対応(CJS+ESM+Web版の3出力)なのに対し、本パッケージは
Worker + WASMのgrapheme-to-phonemeに依存する都合上ブラウザ専用(ESM単一出力)である点。

## デモ

[GitHub Pagesで公開しているデモページ](https://nerosui.github.io/kokoro-js-jp/)で、
インストール不要・ブラウザだけで英語・日本語の音声合成を試せる(`demo/`、
`.github/workflows/deploy-pages.yml`で自動デプロイ)。初回アクセス時はKokoro-82Mモデル
(数十MB〜、Hugging Face Hubから取得)のダウンロードが発生し、日本語を初めて使う際は
Open JTalk辞書(約100MB)の追加ダウンロードも発生する。入力したテキストは一切外部送信されず、
音声合成はすべて端末内(ブラウザのWorker + WASM)で完結する。

## 現在のステータス

ビルド/型チェック/単体テストに加え、実ブラウザ(Playwright)でのe2eテストも通っている
(`test/e2e/`、英語・日本語の実合成 + 辞書/ボイス到達性の回帰テスト。詳細は「テスト」節参照)。
CIでは型チェック・単体テスト・ビルドを実行している(`.github/workflows/ci.yml`)。ブラウザe2eは
現時点ではローカル実行のみで、CIには組み込まれていない(既知の制約)。

## インストール

```bash
npm install kokoro-js-jp
```

依存先の`@huggingface/transformers`(kokoro-js経由)は、このパッケージが実際には一切使わない
Node向けネイティブ依存(`onnxruntime-node`、`sharp`)も通常の`dependencies`として持っているため、
`npm install`時にこれらのビルド/ダウンロードが走る。ブラウザ専用パッケージとしては不要なコストだが、
上流(`@huggingface/transformers`)側の依存構成であり、本パッケージ側では制御できない。

対応Node.jsは20以上(ビルド・テスト実行用。ブラウザ本体での動作には無関係)。

## 使い方

```ts
import { KokoroJP } from "kokoro-js-jp";

// dicUrl/voiceUrlは省略可(パッケージに同梱されているOpen JTalk辞書+デフォルトボイスを使う)。
const tts = await KokoroJP.load({
  dtype: "q8", // kokoro-jsのモデル量子化設定(省略可)
});

const englishAudio = await tts.speak("Hello, world.", "af_heart");
// 日本語音声を初めてspeak()した時点でOpen JTalk辞書(約100MB)を遅延フェッチする(英語のみの
// 利用であればこのダウンロードは発生しない)。
const japaneseAudio = await tts.speak("こんにちは", "jf_alpha");
```

### 辞書/ボイスを差し替える(オプション)

デフォルトの辞書・ボイスで十分なら`japanese`オプションは不要。自前でホストした辞書や、
`mei_normal.htsvoice`以外のHTSボイスを使いたい場合だけ、`japanese: { dicUrl, voiceUrl }`で
上書きする:

```ts
const tts = await KokoroJP.load({
  japanese: {
    // *ディレクトリ*URL。openjtalkjsのブラウザランタイムが
    // `${dicUrl}/sys.dic`・`${dicUrl}/matrix.bin`等8ファイルを個別にfetchする
    // (tarball等のアーカイブURLは不可)。8ファイルの一覧はsrc/g2p/japanese.tsの
    // JapaneseG2PConfigコメント、またはTHIRD_PARTY_NOTICES.mdを参照。
    dicUrl: "https://example.com/openjtalk-dic",
    // 単一の.htsvoiceファイルURL。
    voiceUrl: "https://example.com/my-voice.htsvoice",
  },
});
```

`dicUrl`は個別ファイル8本を配信できる場所であれば何でもよい(自前のCDN、静的ホスティング等)。
アーカイブ配信のみのホスト(GitHub Releasesの直リンク等)はそのままでは使えない点に注意
(「[パッケージサイズについて](#パッケージサイズについて)」参照)。

voiceIdはkokoro-js本体と同じ、素のKokoro-82M voice id(例: `af_heart`, `jf_alpha`)をそのまま使う。
別名レイヤーは持たない。1文字目が言語、2文字目が性別を表す(`af_` = 米語・女性、`jm_` = 日本語・男性、等)。
このパッケージが実際にend-to-endで対応しているのは英語(`af_`/`am_`/`bf_`/`bm_`、kokoro-js本体の
espeak-ngフォニマイザーが処理)と日本語(`jf_`/`jm_`、このパッケージ独自のOpen JTalk g2pが処理)の
2言語のみ。Kokoro-82Mモデル自体は他言語(`e`西語/`f`仏語/`h`ヒンディー語/`i`伊語/`p`ポルトガル語/`z`中国語)
のvoiceも同梱しているが、対応するg2pが無いため`resolveLang()`は`undefined`を返し`speak()`は例外を投げる。

## スクリプト

- `npm run build` — `rollup -c`(TypeScript直接バンドル、ESM単一出力+d.ts、kokoro-jsと同じ
  nodeResolve+terser構成)でビルドした後、`scripts/copy-vendor.mjs`がvendorしているopenjtalkjsの
  worker/WASMアセットを、`scripts/fetch-openjtalk-dic-assets.mjs`がOpen JTalk辞書(約100MB)+
  デフォルトHTSボイスを、それぞれバンドル後のコードが期待する相対パスで`dist/`にコピーする
  (辞書はローカルの`.cache/`に取得キャッシュを持つため、2回目以降のビルドでは再ダウンロードしない)。
- `npm run format` — `prettier --write .`(kokoro-jsと同じ`--print-width 1000`)。
- `npm test` — `vitest run`(g2p・ボイステーブルの純粋関数テストのみ。ブラウザ/WASMは絡まない)。
- `npm run test:e2e` — `playwright test`(実ブラウザでWorker + WASM + ONNXパイプラインを実行する
  e2eテスト。要`npm run build`済み・`npx playwright install chromium`済み。詳細は「テスト」節参照)。
- `npm run typecheck` — `tsc --noEmit`。

## テスト

`npm test`(vitest)はg2p/ボイス判定などの純粋関数のみを対象とし、Worker/WASM/ONNXは一切絡まない。
実際のブラウザでの動作は`npm run test:e2e`(Playwright)で検証する:

```bash
npm run build          # test/e2eはdist/を対象にする(src/を直接は見ない)。変更後は必ず再ビルド
npx playwright install chromium   # 初回のみ
npm run test:e2e
```

初回実行はKokoro-82M ONNXモデル(`dtype: "q4"`、最小量子化)をHugging Face Hubからダウンロードする
ため数分かかることがある。詳細な手順・デバッグ方法・既知の落とし穴(ビルド後の`dist/index.js`が
`kokoro-js`をbare importする関係で、素のブラウザ実行にはimport mapが必要、等)は
[`AGENTS.md`](AGENTS.md)を参照(AGENTS.mdはメンテナ・エージェント向けの開発者向けドキュメントで、
Claude Code連携(`.claude/`配下のサブエージェント・スキル)もそちらに記載している)。

## 既知の制限

- Kokoro-82M ONNXモデル(`onnx-community/Kokoro-82M-v1.0-ONNX`)はrevisionを固定せずHugging Face
  Hubから取得している。kokoro-js本体の`KokoroTTS.from_pretrained()`がrevision指定をサポートして
  いないため、本パッケージ側で固定することもできない。上流でモデルの中身が更新された場合、
  取得結果が変わりうる。モデル自体のライセンス・利用規約は
  [huggingface.co/hexgrad/Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M)を参照(本リポジトリ
  には転載していない)。
- 依存関係の脆弱性監査(`npm audit`等)は定期実行していない。

## ライセンス

Apache-2.0(kokoro-js本体、および本パッケージがportしている misaki の HEPBURN テーブルに合わせている)。
サードパーティのライセンス・クレジット表記は`THIRD_PARTY_NOTICES.md`を参照。

## パッケージサイズについて

Open JTalk辞書(主に`sys.dic`が約100MB)を`dist/`に同梱しているため、npmパッケージ自体が
約100MBになる。kokoro-js本体(ONNXモデルは同梱せず実行時にHugging Face Hubから取得)とは
対照的だが、本パッケージのdicUrlは*ディレクトリ*(個別ファイルを`${dicUrl}/sys.dic`のように
1本ずつfetchする形)を要求するため、この用途にHugging Face Hubのようなキャッシュ付き実行時
取得はそのまま使えない(要検討)。日本語辞書のロード自体は`speak()`で日本語voiceIdを初めて
使った時点まで遅延するため、英語のみの利用ではダウンロードもメモリ確保も発生しない。
