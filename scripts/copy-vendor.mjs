// The lazy worker client loads browser/worker.js from the explicit public URL
// configured by the consumer. worker.js itself is referenced only as a URL
// string (invisible to Rollup's import graph) and in turn
// resolves "../openjtalk-wasm-wrapper-*.js" and "../openjtalk-wasm.wasm"
// relative to itself. So these three assets must be copied to dist/ at the
// the same relative paths expected by `kokoro-js-jp-copy-assets`:
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
