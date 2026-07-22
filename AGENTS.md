# AGENTS.md

Instructions for AI coding agents (Codex, Claude Code, or others) working in this repo.

## Running the browser e2e suite

This package (Worker + WASM g2p + ONNX synthesis) cannot be meaningfully verified by
`npm test` (vitest) alone — that suite only covers pure functions (`test/*.test.ts`), not
whether the actual pipeline works in a browser. For a long time it didn't: the default
`dicUrl` pointed at the wrong kind of URL and every `KokoroJP.load()` call failed silently
in the one way that never got caught until someone actually ran it in a browser. Don't
repeat that mistake — after touching anything under `src/`, `scripts/copy-vendor.mjs`,
`scripts/fetch-openjtalk-dic-assets.mjs`, or `rollup.config.js`, rebuild and re-run this
suite before concluding the change works.

```bash
npm run build      # test/e2e tests dist/, not src/ — always rebuild first
npm run test:e2e   # playwright test
```

First run installs nothing extra automatically — if Chromium isn't installed yet:

```bash
npx playwright install chromium
```

**First run is slow (and re-downloads on every run — see below):** it downloads the
Kokoro-82M ONNX model (`dtype: "q4"` in `test/e2e/tts.spec.ts`, the smallest quantization,
specifically to keep this fast) from Hugging Face Hub. Budget a few minutes on a slow
connection; the config's test timeout is 5 minutes for this reason. Cache Storage (where
`kokoro-js`/`transformers.js` cache the model) does **not** persist across Playwright
`test()` runs by default (fresh browser context each time) — this is a known cost of the
current setup, not a bug to "fix" by adding retries or shortening timeouts.

## What the suite actually covers

`test/e2e/tts.spec.ts`:

1. **Dictionary/voice reachability** (fast, no browser page needed) — a direct regression
   test for the dicUrl bug: `dist/openjtalk-dic/` must serve 8 individual files
   (`${dicUrl}/sys.dic`, `${dicUrl}/matrix.bin`, ...), not an archive. If this fails, don't
   look further — check `DEFAULT_DIC_URL`/`DEFAULT_VOICE_URL` in `src/index.ts` and
   `scripts/fetch-openjtalk-dic-assets.mjs` first.
2. **Full pipeline** — one `page.evaluate()`, one `KokoroJP.load()` (kept to one to avoid
   re-downloading the model 3x in one run): English synthesis via kokoro-js's own
   phonemizer, Japanese synthesis via this package's Open JTalk g2p (Worker + WASM), and an
   unsupported-voiceId error case. Asserts real non-silent audio came back (sample count,
   24kHz sample rate, non-zero signal), not just "didn't throw."

## Debugging a failure

```bash
npx playwright test --headed         # watch it run in a real window
npx playwright test --ui             # interactive time-travel debugger
npx playwright show-trace test-results/*/trace.zip   # after a failure, if a trace was captured
```

`test/e2e/tts.spec.ts` forwards browser `console` and `pageerror` events to the Node/CI log
(`[browser:...]` prefix) — read those first; the actual WASM/ONNX error is almost always
there, not in the Playwright assertion message.

### The bare-specifier gotcha

`dist/index.js` has `import ... from "kokoro-js"` — left as a bare external import on
purpose (`rollup.config.js`'s `external: [...]`; a real consumer's bundler resolves that
from `node_modules`). A raw browser can't resolve bare specifiers with no bundler, so
`test/e2e/fixtures/index.html` maps `"kokoro-js"` to `/vendor/kokoro-js.web.js` via an
import map — `scripts/serve-dist.mjs` serves that file straight from
`node_modules/kokoro-js/dist/kokoro.web.js`, kokoro-js's own dependency-free browser
build (the one it publishes for jsdelivr/unpkg `<script type="module">` use). If you add a
new bare import to `src/`, either keep it external and add it to both the import map in
`test/e2e/fixtures/index.html` and `VENDOR_FILES` in `scripts/serve-dist.mjs` (pointing at
that package's own bundled browser build, if it has one), or don't add it as external.

## Claude Code users

A `browser-e2e-tester` subagent (`.claude/agents/browser-e2e-tester.md`) and a
`/browser-e2e-test` skill (`.claude/skills/browser-e2e-test/SKILL.md`) wrap this workflow.
Claude Code sessions with the integrated browser MCP tool can also drive
`scripts/serve-dist.mjs` interactively (navigate, inspect console/network, screenshot) for
debugging beyond what Playwright's own output gives — see the subagent file for how.
