// Guards the CDN consumption path (`<script type="module">` straight from jsDelivr).
// None of it is reachable from src/, so nothing else in the test suite would notice
// if the manifest, the demo pin, or the README drifted from the built filename or
// the package version — and the failure mode is a 404 for every CDN consumer.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import packageJson from "../package.json";
import rollupConfigs from "../rollup.config.js";

const rootDir = path.resolve(fileURLToPath(import.meta.url), "../..");
const read = (relativePath: string) => readFileSync(path.join(rootDir, relativePath), "utf8");

const CDN_ENTRY = "./dist/kokoro-jp.web.js";

// Every `https://cdn.jsdelivr.net/npm/kokoro-js-jp@<version>` occurrence, wherever it appears.
function pinnedVersions(source: string): string[] {
  return [...source.matchAll(/cdn\.jsdelivr\.net\/npm\/kokoro-js-jp@([^/\s`"')]+)/g)].map((match) => match[1]!);
}

describe("CDN entry point", () => {
  it("is declared for both jsDelivr and unpkg", () => {
    expect(packageJson.jsdelivr).toBe(CDN_ENTRY);
    expect(packageJson.unpkg).toBe(CDN_ENTRY);
  });

  it("is actually produced by the build", () => {
    const outputs = (rollupConfigs as { output: { file: string } }[]).map((config) => config.output.file);
    expect(outputs).toContain(CDN_ENTRY);
    expect(outputs).toContain(packageJson.exports.default);
  });

  it("is bundled self-contained, with no bare imports left for the browser to resolve", () => {
    const webBuild = (rollupConfigs as { output: { file: string }; external?: string[] }[]).find((config) => config.output.file === CDN_ENTRY)!;
    // The npm entry keeps `kokoro-js`/`@huggingface/transformers` external for the
    // consumer's bundler; the CDN entry must not, or a raw browser page would need
    // an import map (which is exactly what this output exists to remove).
    expect(webBuild.external).toBeUndefined();
  });
});

describe("pinned CDN URLs", () => {
  it("keeps the demo on this package version", () => {
    const versions = pinnedVersions(read("demo/main.js"));
    expect(versions).not.toHaveLength(0);
    for (const version of versions) expect(version).toBe(packageJson.version);
  });

  it("keeps every README URL on this package version", () => {
    const versions = pinnedVersions(read("README.md"));
    expect(versions).not.toHaveLength(0);
    for (const version of versions) expect(version).toBe(packageJson.version);
  });

  it("documents the CDN entry in the README", () => {
    expect(read("README.md")).toContain(`kokoro-js-jp@${packageJson.version}/dist/kokoro-jp.web.js`);
  });
});
