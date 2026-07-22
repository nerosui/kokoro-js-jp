// Minimal static file server for the e2e suite (playwright.config.ts webServer).
// Serves dist/ (the built package: index.js, the vendored openjtalkjs worker/WASM,
// and the bundled Open JTalk dictionary/voice) at the root, falling back to
// test/e2e/fixtures/ for the test host page. A real HTTP origin is required here —
// ES module Workers and the dictionary directory fetches this package makes at
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

const rootDir = path.resolve(fileURLToPath(import.meta.url), "../..");
const distDir = path.join(rootDir, "dist");
const fixturesDir = path.join(rootDir, "test/e2e/fixtures");

const VENDOR_FILES = {
  "/vendor/kokoro-js.web.js": path.join(rootDir, "node_modules/kokoro-js/dist/kokoro.web.js"),
};

const MIME_TYPES = {
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".wasm": "application/wasm",
  ".html": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
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
  const filePath = VENDOR_FILES[urlPath];
  if (!filePath) return null;
  try {
    return await readFile(filePath);
  } catch {
    return null;
  }
}

const server = createServer(async (req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  const data = (await readVendorFile(urlPath)) ?? (await readIfExists(distDir, urlPath)) ?? (await readIfExists(fixturesDir, urlPath));
  if (!data) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end(`not found: ${urlPath}`);
    return;
  }
  res.writeHead(200, { "Content-Type": MIME_TYPES[path.extname(urlPath)] ?? "application/octet-stream" });
  res.end(data);
});

const port = Number(process.env.PORT ?? 4173);
server.listen(port, "127.0.0.1", () => {
  console.log(`serve-dist: http://localhost:${port} (dist/ + test/e2e/fixtures/)`);
});
