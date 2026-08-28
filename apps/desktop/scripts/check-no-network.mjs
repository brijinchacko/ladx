/**
 * The desktop's one promise, checked against what actually shipped.
 *
 * This app exists because a plant will not put its control programs on
 * somebody else's server. That promise is not kept by intending to keep it: it
 * is kept by the bundle containing no way to break it. Three times now a
 * shared component has reached for an HTTP call that was correct on the web
 * and silently wrong here, and each was found by a person looking rather than
 * by anything failing.
 *
 * Two checks, and the second is the interesting one.
 *
 * 1. No absolute URL to a host outside the allow list. That is what an
 *    outbound call needs, so it is the direct check.
 *
 * 2. No new reference to an API route. The desktop has no API routes at all,
 *    so every one of these is a call that cannot succeed. A handful are in the
 *    bundle today as unused default parameters of shared components, which is
 *    exactly the state the three bugs were in before somebody wired a surface
 *    that used the default. They are pinned below: the set may shrink, and it
 *    may not grow.
 */

import { readFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, "../out");

/**
 * Hosts allowed to appear as a string.
 *
 * XML namespaces are identifiers, not addresses: nothing resolves them. The
 * framework ones appear in its own error messages. ollama.com is the single
 * real link, on a button a person presses to go and install it, which opens
 * their browser rather than making a request from here.
 */
const ALLOWED_HOSTS = [
  "www.w3.org",
  "www.plcopen.org",
  "nextjs.org",
  "react.dev",
  "radix-ui.com",
  "github.com",
  "ollama.com",
  // An XMP metadata namespace jsPDF stamps into every document. A namespace
  // URI is an identifier; nothing resolves it.
  "jspdf.default.namespaceuri",
  // jsPDF's `output("pdfobjectnewwindow")` loads PDFObject from a CDN to
  // preview in a browser tab. We never call that mode: the CAD writer returns
  // `output("blob")`, which is asserted by a test in @ladx/cad so this stays
  // dead rather than becoming true quietly.
  "cdnjs.cloudflare.com",
  // OOXML and Dublin Core namespace URIs, stamped into every .docx by the docx
  // library. Namespaces again: identifiers, and nothing resolves them.
  "schemas.openxmlformats.org",
  "schemas.microsoft.com",
  "purl.org",
  // Links inside library error messages, none of them fetched: docx points at
  // a Microsoft forum thread when a compression level is out of range, JSZip
  // at its own docs when a file is not a zip, and the bundler at an
  // explanation of requiring a CJS module.
  "answers.microsoft.com",
  "stuk.github.io",
  "rolldown.rs",
];

/**
 * API routes still referenced, all of them unreachable today.
 *
 * Each is a default parameter of a shared component that this app overrides:
 * the model list comes from Ollama, code validation from a Tauri command, and
 * the exercise surfaces are not mounted here at all. Shrinking this list is
 * always right. Growing it means a surface has started using a default that
 * cannot work.
 */
const KNOWN_DEAD_ROUTES = [
  "/api/",
  "/api/code/auto-fix",
  "/api/models",
  "/api/student/ladx-exercises/",
  "/api/student/ladx/",
  "/api/validate-code",
];

async function jsFiles(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await jsFiles(p)));
    else if (entry.name.endsWith(".js")) found.push(p);
  }
  return found;
}

const files = await jsFiles(out);
if (files.length === 0) {
  console.error("check-no-network: no built JS found. Run the build first.");
  process.exit(1);
}

const hosts = new Set();
const routes = new Set();

for (const f of files) {
  const src = await readFile(f, "utf8");
  for (const m of src.matchAll(/https?:\/\/([a-zA-Z0-9._-]+\.[a-z]{2,})/g)) hosts.add(m[1]);
  for (const m of src.matchAll(/"(\/api\/[a-zA-Z0-9/_-]*)"/g)) routes.add(m[1]);
}

const strangers = [...hosts].filter((h) => !ALLOWED_HOSTS.includes(h)).sort();
const newRoutes = [...routes].filter((r) => !KNOWN_DEAD_ROUTES.includes(r)).sort();

if (strangers.length > 0) {
  console.error("\ncheck-no-network: the desktop bundle names hosts it should not.\n");
  for (const h of strangers) console.error(`  ${h}`);
  console.error(
    "\nThis app makes no outbound call but the one licence activation, which is\n" +
      "the Rust side's job. If this host is a link a person clicks rather than a\n" +
      "request, add it to ALLOWED_HOSTS and say why.\n",
  );
  process.exit(1);
}

if (newRoutes.length > 0) {
  console.error(
    "\ncheck-no-network: the desktop bundle references API routes it did not before.\n",
  );
  for (const r of newRoutes) console.error(`  ${r}`);
  console.error(
    "\nThere are no API routes in a static export, so this call cannot succeed.\n" +
      "Inject the behaviour instead, the way askModel and StudioStorage are, and\n" +
      "look at whether a shared component's default has just become reachable.\n",
  );
  process.exit(1);
}

const gone = KNOWN_DEAD_ROUTES.filter((r) => !routes.has(r));
const trimmable = gone.length ? `, ${gone.length} now gone (trim KNOWN_DEAD_ROUTES)` : "";
console.log(
  `no-network: ${files.length} files, ${hosts.size} hosts, all allowed; ${routes.size} dead API references, none new${trimmable}`,
);
