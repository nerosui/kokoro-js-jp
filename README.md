# kokoro-js-jp

ブラウザ上で動く英語・日本語対応のText-to-Speechライブラリ。

- **音声合成**: [kokoro-js](https://github.com/hexgrad/kokoro)(npm: `kokoro-js`)/ transformers.js(ONNX)経由の[Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M)
- **日本語G2P**(読み仮名→音素変換): [openjtalkjs](https://github.com/keanu-thakalath/openjtalkjs)のブラウザ/WASMビルド
- **完全クライアントサイド**: 推論サーバーやコンテナは不要。Open JTalk辞書(約100MB)+デフォルトHTSボイス(`mei_normal.htsvoice`)はnpmパッケージに同梱し、アプリのpublicディレクトリへコピーして配信するため外部ホストも不要。Kokoro ONNXモデルのみ初回実行時にHugging Face Hubから取得する

本パッケージの構成(ビルド方式・パッケージ体裁・ライセンス)はkokoro-js本体([hexgrad/kokoro](https://github.com/hexgrad/kokoro)の`kokoro.js/`)に準拠している。主な違いは、kokoro-jsがNode/ブラウザ両対応(CJS+ESM+Web版の3出力)なのに対し、本パッケージはWorker + WASMのgrapheme-to-phonemeに依存する都合上**ブラウザ専用**(ESM単一出力)である点。

## 目次

- [デモ](#デモ)
- [現在のステータス](#現在のステータス)
- [インストール](#インストール)
- [使い方](#使い方)
  - [辞書/ボイスの配置を個別指定する(オプション)](#辞書ボイスの配置を個別指定するオプション)
- [スクリプト](#スクリプト)
- [テスト](#テスト)
- [既知の制限](#既知の制限)
- [ライセンス](#ライセンス)
- [パッケージサイズについて](#パッケージサイズについて)

## デモ

[GitHub Pagesで公開しているデモページ](https://nerosui.github.io/kokoro-js-jp/)で、インストール不要・ブラウザだけで英語・日本語の音声合成を試せる(`demo/`、`.github/workflows/deploy-pages.yml`で自動デプロイ)。

- 初回アクセス時: Kokoro-82Mモデル(数十MB〜、Hugging Face Hubから取得)のダウンロードが発生
- 日本語を初めて使う際: Open JTalk辞書(約100MB)の追加ダウンロードが発生
- 入力したテキストは一切外部送信されず、音声合成はすべて端末内(ブラウザのWorker + WASM)で完結する

## 現在のステータス

ビルド/型チェック/単体テストに加え、実ブラウザ(Playwright)でのe2eテストも通っている(`test/e2e/`、英語・日本語の実合成 + 辞書/ボイス到達性の回帰テスト。詳細は[テスト](#テスト)節参照)。

CIでは以下を実行している(`.github/workflows/ci.yml`):

- 型チェック・単体テスト・ビルド・npm tarball検査
- 公開entryをconsumerとして再バンドルした実ブラウザe2e

## インストール

```bash
npm install kokoro-js-jp
# 日本語G2P用アセットをアプリの公開ディレクトリへコピー
npx kokoro-js-jp-copy-assets public/kokoro-js-jp
```

> [!NOTE]
> 依存先の`@huggingface/transformers`(kokoro-js経由)は、このパッケージが実際には一切使わないNode向けネイティブ依存(`onnxruntime-node`、`sharp`)も通常の`dependencies`として持っているため、`npm install`時にこれらのビルド/ダウンロードが走る。ブラウザ専用パッケージとしては不要なコストだが、上流(`@huggingface/transformers`)側の依存構成であり、本パッケージ側では制御できない。

対応Node.jsは20以上(ビルド・テスト実行用。ブラウザ本体での動作には無関係)。

## 使い方

```ts
import { KokoroJP } from "kokoro-js-jp";

const tts = await KokoroJP.load({
  dtype: "q8", // kokoro-jsのモデル量子化設定(省略可)
  // 上のcopy-assetsコマンドの出力を配信する公開URL。
  japanese: { assetsUrl: "/kokoro-js-jp" },
});

const englishAudio = await tts.speak("Hello, world.", "af_heart");
// 日本語音声を初めてspeak()した時点でOpen JTalk辞書(約100MB)を遅延フェッチする(英語のみの
// 利用であればこのダウンロードは発生しない)。
const japaneseAudio = await tts.speak("こんにちは", "jf_alpha");
```

- `assetsUrl`は、ビルドツールがnpm依存内の約100MBのデータファイルを自動では公開出力へコピーしないため明示的に指定する。Vite/webpack/Next.js等でパッケージ本体が再バンドルされても、このURL契約は変わらない。
- 英語だけを使う場合は`japanese`を省略でき、Open JTalk Workerも生成されない。
- このパッケージはブラウザ専用である。SSRフレームワークではClient Componentまたはブラウザ側のコードからimportすること。モジュールのimport自体はWorkerを生成しないため、SSRビルド時の解析は可能。

`voiceId`はkokoro-js本体と同じ、素のKokoro-82M voice idをそのまま使う(別名レイヤーは持たない)。1文字目が言語、2文字目が性別を表す:

| 接頭辞 | 言語 | 性別 | 対応g2p |
| --- | --- | --- | --- |
| `af_` | 英語(米) | 女性 | ✅ espeak-ng(kokoro-js本体) |
| `am_` | 英語(米) | 男性 | ✅ espeak-ng(kokoro-js本体) |
| `bf_` | 英語(英) | 女性 | ✅ espeak-ng(kokoro-js本体) |
| `bm_` | 英語(英) | 男性 | ✅ espeak-ng(kokoro-js本体) |
| `jf_` | 日本語 | 女性 | ✅ Open JTalk(本パッケージ独自) |
| `jm_` | 日本語 | 男性 | ✅ Open JTalk(本パッケージ独自) |
| `e`/`f`/`h`/`i`/`p`/`z` 系 | 西語/仏語/ヒンディー語/伊語/ポルトガル語/中国語 | — | ❌ 対応g2pなし |

Kokoro-82Mモデル自体は非対応言語のvoiceも同梱しているが、対応するg2pが無いため`resolveLang()`は`undefined`を返し、`speak()`は例外を投げる。

### 辞書/ボイスの配置を個別指定する(オプション)

通常は`assetsUrl`だけでよい。別々のCDNで配信する場合や`mei_normal.htsvoice`以外のHTSボイスを使う場合は、各URLを上書きできる:

```ts
const tts = await KokoroJP.load({
  japanese: {
    assetsUrl: "https://example.com/kokoro-js-jp",
    // *ディレクトリ*URL。openjtalkjsのブラウザランタイムが
    // `${dicUrl}/sys.dic`・`${dicUrl}/matrix.bin`等8ファイルを個別にfetchする
    // (tarball等のアーカイブURLは不可)。8ファイルの一覧はsrc/g2p/japanese.tsの
    // JapaneseG2PConfigコメント、またはTHIRD_PARTY_NOTICES.mdを参照。
    dicUrl: "https://example.com/openjtalk-dic",
    // 単一の.htsvoiceファイルURL。
    voiceUrl: "https://example.com/my-voice.htsvoice",
    // copy-assetsが出力するbrowser/worker.js。隣にWASMアセットが必要。
    workerUrl: "https://example.com/kokoro-js-jp/browser/worker.js",
  },
});
```

> [!NOTE]
> `dicUrl`は個別ファイル8本を配信できる場所であれば何でもよい(自前のCDN、静的ホスティング等)。アーカイブ配信のみのホスト(GitHub Releasesの直リンク等)はそのままでは使えない点に注意([パッケージサイズについて](#パッケージサイズについて)参照)。

## スクリプト

| コマンド | 説明 |
| --- | --- |
| `npm run build` | `rollup -c`(TypeScript直接バンドル、ESM単一出力+d.ts、kokoro-jsと同じnodeResolve+terser構成)でビルドした後、`scripts/copy-vendor.mjs`がvendorしているopenjtalkjsのworker/WASMアセットを、`scripts/fetch-openjtalk-dic-assets.mjs`がOpen JTalk辞書(約100MB)+公式辞書tar.gz+デフォルトHTSボイスを、それぞれバンドル後のコードが期待する相対パスで`dist/`にコピーする(辞書はローカルの`.cache/`に取得キャッシュを持つため、2回目以降のビルドでは再ダウンロードしない) |
| `npx kokoro-js-jp-copy-assets <public-directory>` | 公開済みnpmパッケージから、辞書・HTS voice・Worker・WASMをconsumerアプリのpublicディレクトリへコピーする |
| `npm run format` | `prettier --write .`(kokoro-jsと同じ`--print-width 1000`) |
| `npm test` | `vitest run`(g2p・ボイステーブルの純粋関数テストのみ。ブラウザ/WASMは絡まない) |
| `npm run test:e2e` | `playwright test`(実ブラウザでWorker + WASM + ONNXパイプラインを実行するe2eテスト。要`npm run build`済み・`npx playwright install chromium`済み。詳細は[テスト](#テスト)節参照) |
| `npm run typecheck` | `tsc --noEmit` |

## テスト

`npm test`(vitest)はg2p/ボイス判定などの純粋関数のみを対象とし、Worker/WASM/ONNXは一切絡まない。実際のブラウザでの動作は`npm run test:e2e`(Playwright)で検証する:

```bash
npm run build          # test/e2eはdist/を対象にする(src/を直接は見ない)。変更後は必ず再ビルド
npx playwright install chromium   # 初回のみ
npm run test:e2e
```

初回実行はKokoro-82M ONNXモデル(`dtype: "q4"`、最小量子化)をHugging Face Hubからダウンロードするため数分かかることがある。

詳細な手順・デバッグ方法・既知の落とし穴(ビルド後の`dist/index.js`が`kokoro-js`をbare importする関係で、素のブラウザ実行にはimport mapが必要、等)は[`AGENTS.md`](AGENTS.md)を参照(メンテナ・エージェント向けの開発者向けドキュメントで、Claude Code連携(`.claude/`配下のサブエージェント・スキル)もそちらに記載している)。

## 既知の制限

- **Kokoro-82M ONNXモデルのrevision未固定**: `onnx-community/Kokoro-82M-v1.0-ONNX`はrevisionを固定せずHugging Face Hubから取得している。kokoro-js本体の`KokoroTTS.from_pretrained()`がrevision指定をサポートしていないため、本パッケージ側で固定することもできない。上流でモデルの中身が更新された場合、取得結果が変わりうる。モデル自体のライセンス・利用規約は[huggingface.co/hexgrad/Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M)を参照(本リポジトリには転載していない)。
- **`npm audit`の既知アラート**: `npm audit --omit=dev`は、`@huggingface/transformers`がNode向けに依存する`sharp`について[GHSA-f88m-g3jw-g9cj](https://github.com/advisories/GHSA-f88m-g3jw-g9cj)(high、現時点で上流の修正版なし)を報告する。本パッケージのブラウザTTS経路では`sharp`をimport・実行しないが、npm installされる依存であるため監査結果には現れる。上流で修正版が利用可能になり次第更新する。

## ライセンス

Apache-2.0(kokoro-js本体、および本パッケージがportしている misaki の HEPBURN テーブルに合わせている)。サードパーティのライセンス・クレジット表記は[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)を参照。

## パッケージサイズについて

Open JTalk辞書(主に`sys.dic`が約100MB)を`dist/`に同梱しているため、npmパッケージ自体が約130MBになる。展開済み辞書に加え、ブラウザ/CDN向けの公式辞書アーカイブ`dist/open_jtalk_dic_utf_8-1.11.tar.gz`(約24MB)も収録する。公開後はバージョンを固定した次のjsDelivr URLからCORS付きで取得できる:

```text
https://cdn.jsdelivr.net/npm/kokoro-js-jp@0.1.0/dist/open_jtalk_dic_utf_8-1.11.tar.gz
```

現行の`KokoroJP.load()`は引き続き展開済み辞書ディレクトリを使用し、このtar.gzを直接は読まない。アーカイブはCDN配信およびブラウザ向けストリーミング展開ローダーで利用できる配布物として収録している。

kokoro-js本体(ONNXモデルは同梱せず実行時にHugging Face Hubから取得)とは対照的だが、本パッケージのdicUrlは*ディレクトリ*(個別ファイルを`${dicUrl}/sys.dic`のように1本ずつfetchする形)を要求するため、この用途にHugging Face Hubのようなキャッシュ付き実行時取得はそのまま使えない。

付属の`kokoro-js-jp-copy-assets`でアプリの公開ディレクトリへ配置する。日本語辞書のロード自体は`speak()`で日本語voiceIdを初めて使った時点まで遅延するため、英語のみの利用ではダウンロードもメモリ確保も発生しない。
