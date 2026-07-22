---
name: browser-e2e-test
description: Build kokoro-js-jp and run its real-browser e2e suite (Worker + WASM openjtalkjs g2p + ONNX kokoro-js synthesis, English and Japanese). Use when asked to verify this package actually works in a browser, to check whether a change broke synthesis, or to add browser-level regression coverage for a bug in the g2p/synthesis pipeline that vitest's pure-function tests can't catch. Not for typecheck/lint/unit-test requests — use npm run typecheck / npm test for those.
---

Runs `kokoro-js-jp`'s browser e2e suite (`test/e2e/tts.spec.ts`, Playwright) and reports the
result. This is the only verification path that exercises the actual Worker + WASM +
ONNX pipeline — `npm test` (vitest) only covers pure functions. See `AGENTS.md` at the repo
root for the full rationale (this pipeline had a long-standing bug that silently broke
every `KokoroJP.load()` call and only real-browser testing could have caught it).

## Steps

1. Confirm you're in the `kokoro-js-jp` repo (`package.json` name field). If not, find it —
   it's a separate repo from whatever else is open, commonly at `~/public_html/kokoro-js-jp`.
2. Delegate to the `browser-e2e-tester` subagent (`.claude/agents/browser-e2e-tester.md`) to
   build, run, and — if something fails — investigate and either fix it or report exactly
   what's broken and where. Don't duplicate its debugging logic here; that file is the
   source of truth for how to interpret failures.
3. Relay the agent's result plainly: pass/fail, and for a fail, what broke and what (if
   anything) was fixed. Don't editorialize beyond that.

## Args

If the user names a specific scenario to check (e.g. "does the French voiceId error case
still work", "check the dictionary reachability regression"), pass that through to the
subagent as extra context rather than just re-running the whole suite blind — it can target
`npx playwright test -g "<pattern>"` if that's faster for the ask.
