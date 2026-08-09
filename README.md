# kokoro-js-jp

ブラウザ上で動く英語・日本語対応のText-to-Speechライブラリ。

- **音声合成**: [kokoro-js](https://github.com/hexgrad/kokoro)(npm: `kokoro-js`)/ transformers.js(ONNX)経由の[Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M)
- **日本語G2P**(読み仮名→音素変換): [openjtalkjs](https://github.com/keanu-thakalath/openjtalkjs)のブラウザ/WASMビルド
- **完全クライアントサイド**: 推論サーバーやコンテナは不要。Open JTalk公式辞書tar.gz(約24MB)、Worker/WASM、デフォルトHTSボイスはjsDelivrから取得し、ブラウザ内で展開する。Kokoro ONNXモデルは初回実行時にHugging Face Hubから取得する

本パッケージの構成(ビルド方式・パッケージ体裁・ライセンス)はkokoro-js本体([hexgrad/kokoro](https://github.com/hexgrad/kokoro)の`kokoro.js/`)に準拠している。主な違いは、kokoro-jsがNode/ブラウザ両対応(CJS+ESM+Web版の3出力)なのに対し、本パッケージはWorker + WASMのgrapheme-to-phonemeに依存する都合上**ブラウザ専用**である点。出力はkokoro-jsと同じくバンドラ向けとCDN向けの2つのESMを持つ:

| 出力                    | package.jsonのフィールド | 用途                                                                                                   |
| ----------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------ |
| `dist/index.js`         | `exports`                | npm/バンドラ向け。`kokoro-js`はexternalのまま(consumer側のnode_modulesから解決される)                  |
| `dist/kokoro-jp.web.js` | `jsdelivr` / `unpkg`     | CDN向け。`kokoro-js`を内包した自己完結ビルドで、素の`<script type="module">`からimport mapなしで使える |

## 目次

- [デモ](#デモ)
- [現在のステータス](#現在のステータス)
- [インストール](#インストール)
  - [CDNから直接使う(ビルド不要)](#cdnから直接使うビルド不要)
  - [npmからインストールする](#npmからインストールする)
- [使い方](#使い方)
  - [アセットを自己ホスト・個別指定する(オプション)](#アセットを自己ホスト個別指定するオプション)
- [スクリプト](#スクリプト)
- [テスト](#テスト)
- [既知の制限](#既知の制限)
- [ライセンス](#ライセンス)
- [パッケージサイズについて](#パッケージサイズについて)

## デモ

[GitHub Pagesで公開しているデモページ](https://nerosui.github.io/kokoro-js-jp/)で、インストール不要・ブラウザだけで英語・日本語の音声合成を試せる(`demo/`、`.github/workflows/deploy-pages.yml`で自動デプロイ)。

デモ自体もCDN駆動で、バンドラもimport mapも使わない静的3ファイル(`index.html`/`style.css`/`main.js`)である。npmへ公開済みの`dist/kokoro-jp.web.js`をjsDelivrからimportし、辞書・Worker・WASM・voiceも同じバージョンの`dist/`から取得する。したがってデモが動いていることは、READMEに書かれたCDN配信レイアウトがそのまま動いていることの確認になる(裏返しに、デモは**公開済みバージョン**を追随するため、`main`への変更はnpm公開後に反映される)。

- 初回アクセス時: Kokoro-82Mモデル(数十MB〜、Hugging Face Hubから取得)のダウンロードが発生
- 日本語を初めて使う際: Open JTalk公式辞書tar.gz(約24MB)をダウンロードし、ブラウザ内で約107MBへ展開
- 入力したテキストは一切外部送信されず、音声合成はすべて端末内(ブラウザのWorker + WASM)で完結する

## 現在のステータス

ビルド/型チェック/単体テストに加え、実ブラウザ(Playwright)でのe2eテストも通っている(`test/e2e/`、英語・日本語の実合成 + 辞書/ボイス到達性の回帰テスト。詳細は[テスト](#テスト)節参照)。

CIでは以下を実行している(`.github/workflows/ci.yml`):

- 型チェック・単体テスト・ビルド・npm tarball検査
- 公開entryをconsumerとして再バンドルした実ブラウザe2e

## インストール

### CDNから直接使う(ビルド不要)

`npm install`もバンドラも不要。`<script type="module">`からjsDelivrのCDNエントリを直接importできる:

```html
<script type="module">
  import { KokoroJP } from "https://cdn.jsdelivr.net/npm/kokoro-js-jp@0.2.0/dist/kokoro-jp.web.js";

  const tts = await KokoroJP.load();
  const audio = await tts.speak("こんにちは", "jf_alpha");
  new Audio(URL.createObjectURL(audio.toBlob())).play();
</script>
```

- CDNエントリ(`dist/kokoro-jp.web.js`、`package.json`の`jsdelivr`/`unpkg`)は`kokoro-js`を内包した自己完結ビルド(約2.1MB)である。素のブラウザで**import mapは不要**。
- 辞書・Worker・WASM・voiceも同じバージョンの`dist/`から自動的に取得されるため、追加の設定は要らない。
- unpkgでも同様に`https://unpkg.com/kokoro-js-jp@0.2.0`で解決される。
- バージョンは固定すること。`@latest`は不変ではなく、jsDelivrのキャッシュ挙動も変わる。
- この構成の実物が[デモページ](https://nerosui.github.io/kokoro-js-jp/)である(`demo/`はバンドラもimport mapも使わない静的3ファイル)。

### npmからインストールする

バンドラを使う場合は、`kokoro-js`をexternalのまま残した`dist/index.js`(`package.json`の`exports`)が解決される:

```bash
npm install kokoro-js-jp
```

> [!NOTE]
> 依存先の`@huggingface/transformers`(kokoro-js経由)は、このパッケージが実際には一切使わないNode向けネイティブ依存(`onnxruntime-node`、`sharp`)も通常の`dependencies`として持っているため、`npm install`時にこれらのビルド/ダウンロードが走る。ブラウザ専用パッケージとしては不要なコストだが、上流(`@huggingface/transformers`)側の依存構成であり、本パッケージ側では制御できない。

対応Node.jsは20以上(ビルド・テスト実行用。ブラウザ本体での動作には無関係)。

## 使い方

```ts
import { KokoroJP } from "kokoro-js-jp";

const tts = await KokoroJP.load();

const englishAudio = await tts.speak("Hello, world.", "af_heart");
// 日本語音声を初めてspeak()した時点で約24MBの辞書tar.gzを遅延フェッチし、
// Worker内で約100MBの辞書へストリーミング展開する。
const japaneseAudio = await tts.speak("こんにちは", "jf_alpha");
```

- `japanese`を省略すると、このパッケージと同じバージョンへ固定されたjsDelivrの`dist/`を自動的に使用する。`0.2.0`では`https://cdn.jsdelivr.net/npm/kokoro-js-jp@0.2.0/dist`となる。
- jsDelivrのWorkerは同一オリジンのBlob Workerから読み込む。厳格なCSPを使う場合は`worker-src blob:`と`script-src https://cdn.jsdelivr.net`、辞書・WASM・voice用に`connect-src https://cdn.jsdelivr.net`を許可するか、下記の自己ホスト方式を使う。
- 辞書・Worker・WASM・voiceは日本語voiceIdを初めて使うまで取得されないため、英語のみの利用では追加ダウンロードやOpen JTalk Workerの生成は発生しない。日本語を明示的に無効化する場合は`japanese: false`を指定できる。
- このパッケージはブラウザ専用である。SSRフレームワークではClient Componentまたはブラウザ側のコードからimportすること。モジュールのimport自体はWorkerを生成しないため、SSRビルド時の解析は可能。

`voiceId`はkokoro-js本体と同じ、素のKokoro-82M voice idをそのまま使う(別名レイヤーは持たない)。1文字目が言語、2文字目が性別を表す:

| 接頭辞                     | 言語                                            | 性別 | 対応g2p                         |
| -------------------------- | ----------------------------------------------- | ---- | ------------------------------- |
| `af_`                      | 英語(米)                                        | 女性 | ✅ espeak-ng(kokoro-js本体)     |
| `am_`                      | 英語(米)                                        | 男性 | ✅ espeak-ng(kokoro-js本体)     |
| `bf_`                      | 英語(英)                                        | 女性 | ✅ espeak-ng(kokoro-js本体)     |
| `bm_`                      | 英語(英)                                        | 男性 | ✅ espeak-ng(kokoro-js本体)     |
| `jf_`                      | 日本語                                          | 女性 | ✅ Open JTalk(本パッケージ独自) |
| `jm_`                      | 日本語                                          | 男性 | ✅ Open JTalk(本パッケージ独自) |
| `e`/`f`/`h`/`i`/`p`/`z` 系 | 西語/仏語/ヒンディー語/伊語/ポルトガル語/中国語 | —    | ❌ 対応g2pなし                  |

Kokoro-82Mモデル自体は非対応言語のvoiceも同梱しているが、対応するg2pが無いため`resolveLang()`は`undefined`を返し、`speak()`は例外を投げる。

### アセットを自己ホスト・個別指定する(オプション)

外部CDNを使わない場合は、npmパッケージ内の約25MBのブラウザアセットをpublicディレクトリへコピーする:

```bash
npx kokoro-js-jp-copy-assets public/kokoro-js-jp
```

```ts
const tts = await KokoroJP.load({
  japanese: { assetsUrl: "/kokoro-js-jp" },
});
```

別々のCDNで配信する場合や`mei_normal.htsvoice`以外のHTSボイスを使う場合は、各URLを上書きできる:

```ts
const tts = await KokoroJP.load({
  japanese: {
    assetsUrl: "https://example.com/kokoro-js-jp",
    dicArchiveUrl: "https://cdn.example.com/open_jtalk_dic_utf_8-1.11.tar.gz",
    // 単一の.htsvoiceファイルURL。
    voiceUrl: "https://example.com/my-voice.htsvoice",
    // browser/worker.js。隣にWASMラッパーとWASM本体が必要。
    workerUrl: "https://example.com/kokoro-js-jp/browser/worker.js",
  },
});
```

> [!NOTE]
> 従来の展開済み辞書を配信する場合に限り、`dicArchiveUrl`の代わりに、必要な8ファイルを置いたディレクトリURLを`dicUrl`へ指定できる。両方を同時には指定できない。

## スクリプト

| コマンド                                          | 説明                                                                                                                                                                                                                       |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run build`                                   | npm向け(`dist/index.js`)とCDN向け(`dist/kokoro-jp.web.js`)の2つをバンドルした後、Worker/WASM、SHA-256検証済みのOpen JTalk公式辞書tar.gz(約24MB)、デフォルトHTSボイスを`dist/`へ配置する。展開済み辞書はnpmへ重複収録しない |
| `npx kokoro-js-jp-copy-assets <public-directory>` | 自己ホスト用に辞書tar.gz・HTS voice・Worker・WASMをconsumerアプリのpublicディレクトリへコピーする                                                                                                                          |
| `npm run format`                                  | `prettier --write .`(kokoro-jsと同じ`--print-width 1000`)                                                                                                                                                                  |
| `npm test`                                        | `vitest run`(g2p・ボイステーブルの純粋関数テストのみ。ブラウザ/WASMは絡まない)                                                                                                                                             |
| `npm run test:e2e`                                | `playwright test`(実ブラウザでWorker + WASM + ONNXパイプラインを実行するe2eテスト。要`npm run build`済み・`npx playwright install chromium`済み。詳細は[テスト](#テスト)節参照)                                            |
| `npm run typecheck`                               | `tsc --noEmit`                                                                                                                                                                                                             |

## テスト

`npm test`(vitest)はg2p/ボイス判定などの純粋関数のみを対象とし、Worker/WASM/ONNXは一切絡まない。実際のブラウザでの動作は`npm run test:e2e`(Playwright)で検証する:

```bash
npm run build          # test/e2eはdist/を対象にする(src/を直接は見ない)。変更後は必ず再ビルド
npx playwright install chromium   # 初回のみ
npm run test:e2e
```

初回実行はKokoro-82M ONNXモデル(`dtype: "q4"`、最小量子化)をHugging Face Hubからダウンロードするため数分かかることがある。

詳細な手順・デバッグ方法・既知の落とし穴(ビルド後の`dist/index.js`が`kokoro-js`をbare importする関係で、これを素のブラウザで直接実行する場合はimport mapが必要——CDNエントリ`dist/kokoro-jp.web.js`側は不要、等)は[`AGENTS.md`](AGENTS.md)を参照(メンテナ・エージェント向けの開発者向けドキュメントで、Claude Code連携(`.claude/`配下のサブエージェント・スキル)もそちらに記載している)。

## 既知の制限

- **対応ブラウザ**: 日本語辞書の展開にWeb標準の`DecompressionStream("gzip")`を使う。これを実装していない古いブラウザでは日本語G2Pを初期化できないため、最新版のChrome・Edge・Firefox・Safariを使用する。
- **Kokoro-82M ONNXモデルのrevision未固定**: `onnx-community/Kokoro-82M-v1.0-ONNX`はrevisionを固定せずHugging Face Hubから取得している。kokoro-js本体の`KokoroTTS.from_pretrained()`がrevision指定をサポートしていないため、本パッケージ側で固定することもできない。上流でモデルの中身が更新された場合、取得結果が変わりうる。モデル自体のライセンス・利用規約は[huggingface.co/hexgrad/Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M)を参照(本リポジトリには転載していない)。
- **`sharp`の脆弱性への対応**: `@huggingface/transformers`はNode向けに`sharp`(`^0.34.5`)へ依存しており、`0.35.0`未満には[GHSA-f88m-g3jw-g9cj](https://github.com/advisories/GHSA-f88m-g3jw-g9cj)(high)が存在する。本パッケージのブラウザTTS経路では`sharp`をimport・実行しないが、`@huggingface/transformers`側がまだ`sharp`を`0.35.x`系へ追従していないため、`package.json`の`overrides`で`sharp`を`^0.35.3`へ強制解決して回避している。上流(`@huggingface/transformers`)が追従次第、このoverrideは不要になる。

## ライセンス

Apache-2.0(kokoro-js本体、および本パッケージがportしている misaki の HEPBURN テーブルに合わせている)。サードパーティのライセンス・クレジット表記は[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)を参照。

## パッケージサイズについて

展開済み辞書(約107MB)はnpmパッケージへ収録せず、公式辞書アーカイブ`dist/open_jtalk_dic_utf_8-1.11.tar.gz`(約24MB)のみを収録する。Worker/WASM・voice・コード(CDN向けの自己完結ビルド約2.1MBを含む)を合わせたnpmパッケージ全体は展開後で約27MB(tarballは約25MB)である。公開後はバージョンを固定した次のjsDelivr URLからCORS付きで取得できる:

```text
https://cdn.jsdelivr.net/npm/kokoro-js-jp@0.2.0/dist/open_jtalk_dic_utf_8-1.11.tar.gz
```

ブラウザWorkerはtar.gzのSHA-256とtarヘッダーを検証しながらgzipをストリーミング展開し、必要な8ファイルをWASMのファイルシステムへ直接書き込む。約107MBの展開済みtar全体をJavaScriptヒープへ保持しない。

日本語辞書の取得・展開は`speak()`で日本語voiceIdを初めて使った時点まで遅延するため、英語のみの利用ではダウンロードもメモリ確保も発生しない。ブラウザ内では最終的にOpen JTalkが約100MBの辞書を保持するため、実行時メモリ自体が24MBになるわけではない。
