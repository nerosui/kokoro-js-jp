// Mirrors kokoro-js's own rollup.config.js (hexgrad/kokoro, kokoro.js/rollup.config.js):
// nodeResolve + terser, external peer packages left unbundled. Unlike kokoro-js this package
// is browser-only (Worker + WASM g2p, no viable Node target), so there is a single ESM "web"
// output here instead of kokoro-js's node(cjs+esm)/web split.
import { nodeResolve } from "@rollup/plugin-node-resolve";
import terser from "@rollup/plugin-terser";
import typescript from "@rollup/plugin-typescript";

export default {
  input: "./src/index.ts",
  output: {
    file: "./dist/index.js",
    format: "esm",
  },
  external: ["kokoro-js", "@huggingface/transformers"],
  onwarn: (warning, warn) => {
    if (!warning.message.includes("@huggingface/transformers")) warn(warning);
  },
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
};
