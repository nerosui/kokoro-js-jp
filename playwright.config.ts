import { defineConfig } from "@playwright/test";

// Real-browser e2e: exercises the Worker + WASM (openjtalkjs) + ONNX (kokoro-js)
// pipeline this package can't verify any other way (vitest unit tests only cover
// pure functions, see test/*.test.ts). Requires `npm run build` first — it tests
// a consumer bundle generated from the built dist/, not src/. See AGENTS.md.
export default defineConfig({
  testDir: "./test/e2e",
  // Generous: first run downloads the Kokoro ONNX model (dtype: "q4" in the spec
  // to keep this as small as practical) plus this package's bundled ~100MB Open
  // JTalk dictionary, both over the network, with no cross-run cache (see
  // AGENTS.md for why).
  timeout: 5 * 60 * 1000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  webServer: {
    command: "node scripts/serve-dist.mjs",
    port: 4173,
    reuseExistingServer: !process.env.CI,
    timeout: 30 * 1000,
  },
  use: {
    baseURL: "http://localhost:4173",
  },
});
