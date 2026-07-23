// Downloads and vendors the Open JTalk dictionary + default HTS voice this
// package's japanese g2p needs at runtime. The extracted files ship inside
// dist/ for the current directory-based loader, and the verified upstream
// tarball ships alongside them for CDN/browser archive loaders.
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
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import https from "node:https";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";

const DIC_VERSION = "v3"; // bump to invalidate .cache/ when URLs/hashes below change
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
const cacheDicDir = path.join(cacheDir, "dic");
const cacheVoiceFile = path.join(cacheDir, "voice.htsvoice");
const markerFile = path.join(cacheDir, ".version");
const manifestFile = path.join(cacheDir, ".checksums.json");

const distDicDir = path.join(rootDir, "dist/openjtalk-dic");
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

// The 8 files openjtalkjs's browser runtime fetches individually from
// `dicUrl` at load time (see src/index.ts) — a cache is only valid if all 8
// are present, not just sys.dic.
const DIC_FILES = ["sys.dic", "matrix.bin", "char.bin", "unk.dic", "left-id.def", "right-id.def", "pos-id.def", "rewrite.def"];

// There's no upstream-published per-file checksum for the 8 extracted
// dictionary files (only the tarball as a whole, verified against DIC_SHA256
// right after download). So once extraction succeeds, we compute our own
// per-file hashes and persist them here, then re-verify every file against
// this manifest on every run — including cache *hits* — so a truncated or
// corrupted cache entry (e.g. from an interrupted CI cache restore) can't
// silently make it into dist/.
async function writeManifest() {
  const entries = await Promise.all([
    ...DIC_FILES.map(async (f) => [f, await sha256(path.join(cacheDicDir, f))]),
    sha256(cacheArchiveFile).then((h) => [DIC_ARCHIVE_NAME, h]),
    sha256(cacheVoiceFile).then((h) => ["voice.htsvoice", h]),
  ]);
  await fs.writeFile(manifestFile, JSON.stringify(Object.fromEntries(entries), null, 2), "utf8");
}

async function verifyManifest() {
  const manifest = await fs
    .readFile(manifestFile, "utf8")
    .then(JSON.parse)
    .catch(() => null);
  if (!manifest) return false;
  if (manifest[DIC_ARCHIVE_NAME] !== DIC_SHA256 || !(await isNonEmptyFile(cacheArchiveFile))) return false;
  if ((await sha256(cacheArchiveFile)) !== DIC_SHA256) return false;
  for (const f of DIC_FILES) {
    const expected = manifest[f];
    if (!expected || !(await isNonEmptyFile(path.join(cacheDicDir, f)))) return false;
    if ((await sha256(path.join(cacheDicDir, f))) !== expected) return false;
  }
  if (!manifest["voice.htsvoice"] || !(await isNonEmptyFile(cacheVoiceFile))) return false;
  return (await sha256(cacheVoiceFile)) === manifest["voice.htsvoice"];
}

async function ensureCache() {
  const versionOk = await fs
    .readFile(markerFile, "utf8")
    .then((v) => v.trim() === DIC_VERSION)
    .catch(() => false);
  const cached = versionOk && (await verifyManifest());
  if (cached) {
    console.log("fetch-openjtalk-dic-assets: cache already populated and verified, skipping download");
    return;
  }

  console.log(`fetch-openjtalk-dic-assets: downloading dictionary (${DIC_URL})`);
  await download(DIC_URL, cacheArchiveFile);
  if (!(await isNonEmptyFile(cacheArchiveFile))) throw new Error("Downloaded dictionary archive is empty");
  await verifyChecksum(cacheArchiveFile, DIC_SHA256, "dictionary tarball");

  const extractedDir = path.join(cacheDir, "open_jtalk_dic_utf_8-1.11");
  await fs.rm(extractedDir, { recursive: true, force: true });
  const untar = spawnSync("tar", ["-xzf", cacheArchiveFile, "-C", cacheDir], { stdio: "inherit" });
  if (untar.status !== 0) throw new Error("Failed to extract dictionary archive");

  await fs.rm(cacheDicDir, { recursive: true, force: true });
  await fs.rename(extractedDir, cacheDicDir);

  console.log(`fetch-openjtalk-dic-assets: downloading voice (${VOICE_URL})`);
  await download(VOICE_URL, cacheVoiceFile);
  if (!(await isNonEmptyFile(cacheVoiceFile))) throw new Error("Downloaded voice file is empty");
  await verifyChecksum(cacheVoiceFile, VOICE_SHA256, "HTS voice file");

  await writeManifest();
  await fs.writeFile(markerFile, `${DIC_VERSION}\n`, "utf8");
}

async function copyToDist() {
  await fs.rm(distDicDir, { recursive: true, force: true });
  await fs.cp(cacheDicDir, distDicDir, { recursive: true });
  await fs.cp(cacheArchiveFile, distArchiveFile);
  await fs.cp(cacheVoiceFile, distVoiceFile);
}

await ensureCache();
await copyToDist();
console.log("fetch-openjtalk-dic-assets: dictionary archive + extracted files + voice copied into dist/");
