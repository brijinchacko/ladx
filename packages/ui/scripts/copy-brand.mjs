/**
 * Put the brand artwork where an app can serve it.
 *
 * The Logo component draws shipped artwork rather than type, because the real
 * mark is set in a licensed face that is not redistributable. That makes the
 * PNGs part of the component, not part of one app: any surface using @ladx/ui
 * needs them at /brand/.
 *
 * They used to live in apps/web/public, so the desktop app, which uses the same
 * component, showed a broken image where its logo should be for as long as it
 * has existed. The source of truth is now next to the component and each app
 * copies it in at build, the same arrangement as the panel runtime.
 */

import { copyFile, mkdir, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const from = resolve(here, "../assets/brand");

const flag = process.argv.indexOf("--out");
if (flag === -1 || !process.argv[flag + 1]) {
  console.error("copy-brand: --out <public dir> is required");
  process.exit(1);
}
const to = resolve(process.cwd(), process.argv[flag + 1], "brand");

await mkdir(to, { recursive: true });
const files = await readdir(from);
await Promise.all(files.map((f) => copyFile(resolve(from, f), resolve(to, f))));

// Named rather than counted: a silent "copied 0 files" is how a missing asset
// ships, and a missing wordmark is visible on every screen of the product.
if (files.length === 0) {
  console.error("copy-brand: nothing in assets/brand");
  process.exit(1);
}
console.log(`brand: ${files.join(", ")} -> ${to}`);
