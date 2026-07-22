// rollup bundles src/vendor/openjtalk/browser.js directly (it's statically
// imported by src/g2p/japanese.ts), which inlines its
// `new URL("./browser/worker.js", import.meta.url)` into dist/index.js.
// worker.js itself is loaded by the browser as a Worker script (referenced
// only as a URL string, invisible to the bundler's import graph) and in turn
// resolves "../openjtalk-wasm-wrapper-*.js" and "../openjtalk-wasm.wasm"
// relative to itself. So these three assets must be copied to dist/ at the
// same relative paths they'd have next to a bundled dist/index.js:
//   dist/browser/worker.js            (was src/vendor/openjtalk/browser/worker.js)
//   dist/openjtalk-wasm-wrapper-*.js  (was src/vendor/openjtalk/openjtalk-wasm-wrapper-*.js)
//   dist/openjtalk-wasm.wasm          (was src/vendor/openjtalk/openjtalk-wasm.wasm)

import { cp, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(fileURLToPath(import.meta.url), "../..");
const vendorDir = path.join(rootDir, "src/vendor/openjtalk");
const distDir = path.join(rootDir, "dist");

await mkdir(path.join(distDir, "browser"), { recursive: true });
await cp(path.join(vendorDir, "browser/worker.js"), path.join(distDir, "browser/worker.js"));

const entries = await readdir(vendorDir, { withFileTypes: true });
for (const entry of entries) {
  if (!entry.isFile()) continue;
  if (entry.name.startsWith("openjtalk-wasm")) {
    await cp(path.join(vendorDir, entry.name), path.join(distDir, entry.name));
  }
}

console.log("copy-vendor: copied openjtalkjs worker + wasm assets into dist/");
