// Downloads and vendors the Open JTalk dictionary + default HTS voice this
// package's japanese g2p needs at runtime, so they ship inside dist/ (and
// therefore the published npm package) instead of being fetched from GitHub
// at runtime by every consumer.
//
// Why this exists: openjtalkjs's browser `configure({ dicUrl, voiceUrl })`
// treats `dicUrl` as a *directory prefix* and fetches 8 individual files
// from it (`${dicUrl}/sys.dic`, `${dicUrl}/matrix.bin`, ...) — verified by
// reading src/vendor/openjtalk's wrapper source and openjtalkjs's own
// browser demo (demo/src/main.js uses `dicUrl: "/assets/dic"`, a directory
// of loose files, NOT the upstream tarball URL). `voiceUrl` is a single
// .htsvoice file and IS effectively required: `ojt_configure()` in
// openjtalkjs's native bridge hard-fails (returns -1) unless it can load a
// voice via HTS_Engine_load, even though this package only ever calls
// runFrontendAsync (g2p), never synthesize().
//
// Upstream sources (see THIRD_PARTY_NOTICES.md for full license texts):
//  - dictionary: NAIST Japanese Dictionary (2009) + UniDic Consortium
//    (2011-2017) + Open JTalk/HTS Working Group (2008-2016), all
//    Modified-BSD; tarball published by the Open JTalk project.
//  - voice: "Mei" HTS voice, Copyright (c) 2009-2013 Nagoya Institute of
//    Technology / MMDAgent Project, CC BY 3.0; published via pyopenjtalk.
//
// Same URLs openjtalkjs's own scripts/fetch-assets.mjs uses for its Node
// native-addon demos, adapted here for this package's browser g2p path.

import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import https from "node:https";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";

const DIC_VERSION = "v1.11.1";
const DIC_URL = "https://github.com/r9y9/open_jtalk/releases/download/v1.11.1/open_jtalk_dic_utf_8-1.11.tar.gz";
const VOICE_URL = "https://raw.githubusercontent.com/r9y9/pyopenjtalk/master/pyopenjtalk/htsvoice/mei_normal.htsvoice";

const rootDir = path.resolve(fileURLToPath(import.meta.url), "../..");
const cacheDir = path.join(rootDir, ".cache/openjtalk-assets");
const cacheDicDir = path.join(cacheDir, "dic");
const cacheVoiceFile = path.join(cacheDir, "voice.htsvoice");
const markerFile = path.join(cacheDir, ".version");

const distDicDir = path.join(rootDir, "dist/openjtalk-dic");
const distVoiceFile = path.join(rootDir, "dist/openjtalk-voice.htsvoice");

async function download(url, outPath, redirects = 0) {
  if (redirects > 5) throw new Error(`Too many redirects while downloading ${url}`);
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          download(res.headers.location, outPath, redirects + 1)
            .then(resolve)
            .catch(reject);
          return;
        }
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`Download failed ${url}: ${res.statusCode}`));
          return;
        }
        pipeline(res, createWriteStream(outPath)).then(resolve).catch(reject);
      })
      .on("error", reject);
  });
}

async function isNonEmptyFile(file) {
  return fs
    .stat(file)
    .then((s) => s.size > 0)
    .catch(() => false);
}

async function ensureCache() {
  const cached =
    (await fs
      .readFile(markerFile, "utf8")
      .then((v) => v.trim() === DIC_VERSION)
      .catch(() => false)) &&
    (await isNonEmptyFile(path.join(cacheDicDir, "sys.dic"))) &&
    (await isNonEmptyFile(cacheVoiceFile));
  if (cached) {
    console.log("fetch-openjtalk-dic-assets: cache already populated, skipping download");
    return;
  }

  console.log(`fetch-openjtalk-dic-assets: downloading dictionary (${DIC_URL})`);
  const tgz = path.join(cacheDir, "dic.tar.gz");
  await download(DIC_URL, tgz);
  if (!(await isNonEmptyFile(tgz))) throw new Error("Downloaded dictionary archive is empty");

  const untar = spawnSync("tar", ["-xzf", tgz, "-C", cacheDir], { stdio: "inherit" });
  if (untar.status !== 0) throw new Error("Failed to extract dictionary archive");

  const extractedDir = path.join(cacheDir, "open_jtalk_dic_utf_8-1.11");
  await fs.rm(cacheDicDir, { recursive: true, force: true });
  await fs.rename(extractedDir, cacheDicDir);
  await fs.rm(tgz, { force: true });

  console.log(`fetch-openjtalk-dic-assets: downloading voice (${VOICE_URL})`);
  await download(VOICE_URL, cacheVoiceFile);

  await fs.writeFile(markerFile, `${DIC_VERSION}\n`, "utf8");
}

async function copyToDist() {
  await fs.rm(distDicDir, { recursive: true, force: true });
  await fs.cp(cacheDicDir, distDicDir, { recursive: true });
  await fs.cp(cacheVoiceFile, distVoiceFile);
}

await ensureCache();
await copyToDist();
console.log("fetch-openjtalk-dic-assets: dictionary + voice copied into dist/");
