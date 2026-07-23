// Downloads and vendors the Open JTalk dictionary + default HTS voice this
// package's japanese g2p needs at runtime. The verified upstream tarball
// ships intact so the browser Worker can stream-decompress it directly into
// the WASM filesystem without duplicating ~100MB of loose files in npm.
//
// `voiceUrl` is a single .htsvoice file and IS effectively required:
// `ojt_configure()` in
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
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import https from "node:https";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";

const DIC_VERSION = "v4"; // bump to invalidate .cache/ when URLs/hashes below change
const DIC_ARCHIVE_NAME = "open_jtalk_dic_utf_8-1.11.tar.gz";
const DIC_URL = `https://downloads.sourceforge.net/project/open-jtalk/Dictionary/open_jtalk_dic-1.11/${DIC_ARCHIVE_NAME}`;
// sha256 of the official SourceForge tarball itself, verified 2026-07-23.
const DIC_SHA256 = "33e9cd251bc41aa2bd7ca36f57abbf61eae3543ca25ca892ae345e394cb10549";
// Pinned to a specific commit (not `master`, which is mutable) so this
// download can't silently change contents underneath the sha256 pin below.
const VOICE_URL = "https://raw.githubusercontent.com/r9y9/pyopenjtalk/9029fbc9c4ba323f113343d893d72ed76a67d77c/pyopenjtalk/htsvoice/mei_normal.htsvoice";
const VOICE_SHA256 = "f3be49a6838904a6c218790b64e07c3e83c1886e995dca284b413caab19184de";

async function sha256(file) {
  const buf = await fs.readFile(file);
  return createHash("sha256").update(buf).digest("hex");
}

async function verifyChecksum(file, expected, label) {
  const actual = await sha256(file);
  if (actual !== expected) {
    throw new Error(`fetch-openjtalk-dic-assets: checksum mismatch for ${label}\n  expected: ${expected}\n  actual:   ${actual}\nRefusing to use this download. If upstream intentionally changed the file, update the pinned hash in scripts/fetch-openjtalk-dic-assets.mjs after manually verifying the new content.`);
  }
}

const rootDir = path.resolve(fileURLToPath(import.meta.url), "../..");
const cacheDir = path.join(rootDir, ".cache/openjtalk-assets");
const cacheArchiveFile = path.join(cacheDir, DIC_ARCHIVE_NAME);
const cacheVoiceFile = path.join(cacheDir, "voice.htsvoice");
const markerFile = path.join(cacheDir, ".version");

const distArchiveFile = path.join(rootDir, `dist/${DIC_ARCHIVE_NAME}`);
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

async function verifyCache() {
  if (!(await isNonEmptyFile(cacheArchiveFile))) return false;
  if ((await sha256(cacheArchiveFile)) !== DIC_SHA256) return false;
  if (!(await isNonEmptyFile(cacheVoiceFile))) return false;
  return (await sha256(cacheVoiceFile)) === VOICE_SHA256;
}

async function ensureCache() {
  const versionOk = await fs
    .readFile(markerFile, "utf8")
    .then((v) => v.trim() === DIC_VERSION)
    .catch(() => false);
  const cached = versionOk && (await verifyCache());
  if (cached) {
    console.log("fetch-openjtalk-dic-assets: cache already populated and verified, skipping download");
    return;
  }

  console.log(`fetch-openjtalk-dic-assets: downloading dictionary (${DIC_URL})`);
  await download(DIC_URL, cacheArchiveFile);
  if (!(await isNonEmptyFile(cacheArchiveFile))) throw new Error("Downloaded dictionary archive is empty");
  await verifyChecksum(cacheArchiveFile, DIC_SHA256, "dictionary tarball");

  console.log(`fetch-openjtalk-dic-assets: downloading voice (${VOICE_URL})`);
  await download(VOICE_URL, cacheVoiceFile);
  if (!(await isNonEmptyFile(cacheVoiceFile))) throw new Error("Downloaded voice file is empty");
  await verifyChecksum(cacheVoiceFile, VOICE_SHA256, "HTS voice file");

  await fs.writeFile(markerFile, `${DIC_VERSION}\n`, "utf8");
}

async function copyToDist() {
  await fs.cp(cacheArchiveFile, distArchiveFile);
  await fs.cp(cacheVoiceFile, distVoiceFile);
}

await ensureCache();
await copyToDist();
console.log("fetch-openjtalk-dic-assets: dictionary archive + voice copied into dist/");
