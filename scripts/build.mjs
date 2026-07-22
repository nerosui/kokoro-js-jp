// Runs the full build (rollup bundle + vendor copy + dictionary fetch) in a
// single Node process and calls process.exit(0) itself at the end.
//
// Why: `rollup -c` (via its own CLI) has been observed to bundle
// successfully (prints "created ./dist/index.js") but then hang instead of
// exiting, in some sandboxed/CI environments — most likely @rollup/plugin-terser's
// worker_threads pool (see node_modules/@rollup/plugin-terser) not fully
// releasing the event loop even after WorkerPool.close()/worker.terminate().
// Since `npm run build` chains steps with `&&`, a hung `rollup -c` silently
// blocks copy-vendor.mjs and fetch-openjtalk-dic-assets.mjs from ever
// running — and `prepack` (which npm runs before `npm publish`/`npm pack`)
// would hang too. Running the bundle via rollup's JS API in-process and
// force-exiting afterwards sidesteps this regardless of the exact root
// cause.

import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rollup } from "rollup";
import rollupOptions from "../rollup.config.js";

const rootDir = path.resolve(fileURLToPath(import.meta.url), "../..");

rmSync(path.join(rootDir, "dist"), { recursive: true, force: true });

const bundle = await rollup(rollupOptions);
await bundle.write(rollupOptions.output);
await bundle.close();
console.log(`build: created ${rollupOptions.output.file}`);

execFileSync(process.execPath, [path.join(rootDir, "scripts/copy-vendor.mjs")], { stdio: "inherit" });
execFileSync(process.execPath, [path.join(rootDir, "scripts/fetch-openjtalk-dic-assets.mjs")], { stdio: "inherit" });

process.exit(0);
