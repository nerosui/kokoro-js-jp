// Mirrors kokoro-js's own rollup.config.js (hexgrad/kokoro, kokoro.js/rollup.config.js):
// nodeResolve + terser, external peer packages left unbundled. Unlike kokoro-js this package
// is browser-only (Worker + WASM g2p, no viable Node target), so there is no node(cjs+esm)
// target here — but there are still two ESM outputs, for the same two consumption modes
// kokoro-js serves:
//
//   dist/index.js          npm/bundler entry (package.json "exports"). `kokoro-js` stays a
//                          bare external import; the consumer's bundler resolves it from
//                          node_modules.
//   dist/kokoro-jp.web.js  CDN entry (package.json "jsdelivr"/"unpkg"). Self-contained, so a
//                          raw `<script type="module">` can import it from jsDelivr without
//                          an import map. `kokoro-js` is resolved to kokoro-js's *own*
//                          dependency-free browser build (its "jsdelivr" entry) and inlined —
//                          the build-time equivalent of the import map that demo/index.html
//                          and test/e2e/fixtures/index.html used to need.
//
// `@huggingface/transformers` is type-only in src/ (`import type { RawAudio }`), so it is
// erased at compile time and never appears in either output.
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import terser from "@rollup/plugin-terser";
import typescript from "@rollup/plugin-typescript";

const require = createRequire(import.meta.url);

// kokoro-js's package "exports" deliberately doesn't expose "./package.json" or its dist
// files, so walk up from its resolved entry point to read the manifest directly.
function packageRootOf(specifier) {
  let dir = path.dirname(require.resolve(specifier));
  for (;;) {
    if (existsSync(path.join(dir, "package.json"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error(`could not locate the package root of ${specifier}`);
    dir = parent;
  }
}

const kokoroRoot = packageRootOf("kokoro-js");
const kokoroPackageJson = JSON.parse(readFileSync(path.join(kokoroRoot, "package.json"), "utf8"));
// kokoro-js's "jsdelivr"/"unpkg" field — the build it publishes for
// <script type="module"> use, with @huggingface/transformers and phonemizer bundled in.
const kokoroWebBuild = path.resolve(kokoroRoot, kokoroPackageJson.jsdelivr);

// Rollup can't follow `kokoro-js`'s package "exports" to that web build (it has no "browser"
// condition — "default" points at the Node-flavored dist/kokoro.js, which pulls in the whole
// unbundled transformers.js/onnxruntime-node graph). Redirect the bare specifier explicitly.
const resolveKokoroWebBuild = {
  name: "resolve-kokoro-web-build",
  resolveId(source) {
    return source === "kokoro-js" ? kokoroWebBuild : null;
  },
};

const external = ["kokoro-js", "@huggingface/transformers"];
const onwarn = (warning, warn) => {
  if (!warning.message.includes("@huggingface/transformers")) warn(warning);
};

export default [
  {
    input: "./src/index.ts",
    output: {
      file: "./dist/index.js",
      format: "esm",
    },
    external,
    onwarn,
    plugins: [
      nodeResolve({ browser: true }),
      typescript({
        tsconfig: "./tsconfig.build.json",
        declaration: true,
        declarationDir: "./dist",
        outputToFilesystem: true,
      }),
      terser({ format: { comments: false } }),
    ],
  },
  {
    input: "./src/index.ts",
    output: {
      file: "./dist/kokoro-jp.web.js",
      format: "esm",
    },
    // Only the npm entry emits .d.ts — both outputs share one source tree and one public API,
    // and two declaration passes into the same dist/ would race on identical filenames.
    onwarn,
    plugins: [
      resolveKokoroWebBuild,
      nodeResolve({ browser: true }),
      typescript({
        tsconfig: "./tsconfig.build.json",
        declaration: false,
        outputToFilesystem: false,
      }),
      // kokoro-js's web build is already minified; terser only meaningfully shrinks our own
      // code here, at the cost of re-parsing ~2MB. Kept for parity with the npm output.
      terser({ format: { comments: false } }),
    ],
  },
];
