#!/usr/bin/env node

import { cp, mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const destinationArg = process.argv[2];
if (!destinationArg || destinationArg === "--help" || destinationArg === "-h") {
  console.log("Usage: kokoro-js-jp-copy-assets <public-directory>");
  console.log("Example: kokoro-js-jp-copy-assets public/kokoro-js-jp");
  process.exit(destinationArg ? 0 : 1);
}

const packageRoot = path.resolve(fileURLToPath(import.meta.url), "../..");
const distDir = path.join(packageRoot, "dist");
const destination = path.resolve(process.cwd(), destinationArg);
const wasmAssets = (await readdir(distDir)).filter((name) => name.startsWith("openjtalk-wasm"));
const assets = ["browser", "openjtalk-dic", "openjtalk-voice.htsvoice", ...wasmAssets];

await mkdir(destination, { recursive: true });
for (const asset of assets) {
  const target = path.join(destination, asset);
  await rm(target, { recursive: true, force: true });
  await cp(path.join(distDir, asset), target, { recursive: true });
}

console.log(`kokoro-js-jp: copied browser assets to ${destination}`);
