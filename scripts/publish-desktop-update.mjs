/**
 * Publish a desktop release so existing installs can find it.
 *
 * `tauri-action` builds the installers, signs the update packages and writes a
 * `latest.json` that points at the GitHub release. That last part is the
 * problem: the repository is private, so its release assets need a token, and
 * an updater cannot carry one. So the manifest is rewritten to point at
 * ladx.ai, which already serves the installers from the download page.
 *
 * Run after a release build, from the repository root:
 *
 *     node scripts/publish-desktop-update.mjs 0.3.2
 *
 * It only prepares the files. Uploading them is the same scp the installers
 * take, and it is deliberately a separate step: a manifest that arrives before
 * the packages it names would tell every running copy to fetch something that
 * is not there yet.
 */

import { execFile } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

const version = process.argv[2];
if (!version) {
  console.error("usage: node scripts/publish-desktop-update.mjs <version>");
  process.exit(1);
}

const REPO = "brijinchacko/ladx";
const TAG = `desktop-v${version}`;
const BASE = "https://ladx.ai/downloads";
const OUT = resolve("apps/web/public/downloads");

await mkdir(OUT, { recursive: true });

console.log(`downloading ${TAG}`);
await run("gh", [
  "release",
  "download",
  TAG,
  "-R",
  REPO,
  "--clobber",
  "-D",
  OUT,
  "-p",
  "*.msi",
  "-p",
  "*universal.dmg",
  "-p",
  "*.app.tar.gz",
  "-p",
  "*.app.tar.gz.sig",
  "-p",
  "*-setup.exe",
  "-p",
  "*-setup.exe.sig",
  "-p",
  "latest.json",
]);

const manifestPath = resolve(OUT, "latest.json");
let manifest;
try {
  manifest = JSON.parse(await readFile(manifestPath, "utf8"));
} catch {
  console.error(
    `\nNo latest.json in ${TAG}.\n
Nothing can update from that release. Two things have to be true for one to
exist, and both have caught us out:

  1. bundle.createUpdaterArtifacts is true in tauri.conf.json. Tauri 2 builds
     no update package at all without it, and the build still succeeds, so the
     only symptom is this file being absent.
  2. TAURI_SIGNING_PRIVATE_KEY and its password are set as repository secrets.

Fix whichever is missing and cut another release.\n`,
  );
  process.exit(1);
}

/*
 * Point every platform at ladx.ai.
 *
 * Keeping the file names tauri-action produced rather than renaming them the
 * way the download page's installers are renamed: the manifest and the file it
 * names have to agree, and one rename in two places is one that eventually
 * disagrees.
 */
const files = await readdir(OUT);
let rewritten = 0;
for (const [platform, entry] of Object.entries(manifest.platforms ?? {})) {
  const name = decodeURIComponent(entry.url.split("/").pop());
  if (!files.includes(name)) {
    console.error(`\n${platform} names ${name}, which was not downloaded. Aborting.\n`);
    process.exit(1);
  }
  entry.url = `${BASE}/${encodeURIComponent(name)}`;
  rewritten++;
  console.log(`  ${platform} -> ${name}`);
}

if (rewritten === 0) {
  console.error("\nlatest.json lists no platforms. Nothing could update from it.\n");
  process.exit(1);
}

await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`\nlatest.json ready for ${manifest.version}, ${rewritten} platform(s).`);
console.log("Upload the downloads directory, restart ladx-web, then bump the download page.");
