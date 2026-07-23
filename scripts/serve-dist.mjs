// Minimal static file server for the e2e suite (playwright.config.ts webServer).
// Serves dist/ (the built package: index.js, the vendored openjtalkjs worker/WASM,
// and the bundled Open JTalk dictionary archive/voice) at the root, falling back to
// test/e2e/fixtures/ for the test host page. A real HTTP origin is required here —
// ES module Workers and the dictionary archive fetches this package makes at
// runtime don't reliably work under file://.
//
// dist/index.js has a bare `import ... from "kokoro-js"` (left external by
// rollup.config.js on purpose — a real consumer's bundler resolves that from
// node_modules; see THIRD_PARTY_NOTICES.md / README for why this package has
// no bundler of its own). A raw browser can't resolve bare specifiers without
// an import map, so test/e2e/fixtures/index.html maps "kokoro-js" to
// /vendor/kokoro-js.web.js, served below from kokoro-js's own npm package —
// its dedicated dependency-free browser build (kokoro-js ships this exact
// file for jsdelivr/unpkg <script type="module"> consumption, see its
// package.json `jsdelivr`/`unpkg` fields and kokoro.js/rollup.config.js).

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rollup } from "rollup";
import { nodeResolve } from "@rollup/plugin-node-resolve";

const rootDir = path.resolve(fileURLToPath(import.meta.url), "../..");
const distDir = path.join(rootDir, "dist");
const fixturesDir = path.join(rootDir, "test/e2e/fixtures");

const VENDOR_FILES = {
  "/vendor/kokoro-js.web.js": path.join(rootDir, "node_modules/kokoro-js/dist/kokoro.web.js"),
};

// Bundle the package through the same public `exports` entry an installed
// consumer resolves. This catches asset-URL and top-level side-effect bugs
// that importing dist/index.js directly cannot reproduce.
const consumerEntry = path.join(rootDir, "test/e2e/fixtures/consumer-entry.js");
const consumerBundle = await rollup({
  input: consumerEntry,
  external: ["kokoro-js", "@huggingface/transformers"],
  plugins: [nodeResolve({ browser: true })],
});
const consumerOutput = await consumerBundle.generate({ format: "esm" });
await consumerBundle.close();
const consumerCode = Buffer.from(consumerOutput.output[0].code);

const MIME_TYPES = {
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".wasm": "application/wasm",
  ".html": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".gz": "application/gzip",
};

async function readIfExists(dir, urlPath) {
  const filePath = path.join(dir, urlPath);
  if (!filePath.startsWith(dir + path.sep) && filePath !== dir) return null;
  try {
    return await readFile(filePath);
  } catch {
    return null;
  }
}

async function readVendorFile(urlPath) {
  if (urlPath === "/consumer.js") return consumerCode;
  const filePath = VENDOR_FILES[urlPath];
  if (!filePath) return null;
  try {
    return await readFile(filePath);
  } catch {
    return null;
  }
}

async function handleRequest(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  const data = (await readVendorFile(urlPath)) ?? (await readIfExists(distDir, urlPath)) ?? (await readIfExists(fixturesDir, urlPath));
  if (!data) {
    res.writeHead(404, { "Access-Control-Allow-Origin": "*", "Content-Type": "text/plain" });
    res.end(`not found: ${urlPath}`);
    return;
  }
  res.writeHead(200, { "Access-Control-Allow-Origin": "*", "Content-Type": MIME_TYPES[path.extname(urlPath)] ?? "application/octet-stream" });
  res.end(data);
}

const port = Number(process.env.PORT ?? 4173);
const server = createServer(handleRequest);
server.listen(port, "127.0.0.1", () => {
  console.log(`serve-dist: http://localhost:${port} (dist/ + test/e2e/fixtures/)`);
});
const cdnServer = createServer(handleRequest);
cdnServer.listen(port + 1, "127.0.0.1", () => {
  console.log(`serve-dist: http://127.0.0.1:${port + 1} (cross-origin CDN fixture)`);
});
