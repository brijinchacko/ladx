import type { LadxProgram } from "@ladx/studio/lib/types";
import type { HmiDoc } from "./types";

/**
 * An application as one HTML file that runs it.
 *
 * Be exact about what this is, because "deploy to a panel" means a specific
 * thing to the people who would want it and this is not that thing. It does
 * not produce a TP1500 project or a PanelView application; those are closed
 * vendor formats and writing one without their tooling is not something to
 * claim.
 *
 * What it produces is a panel for the other kind of hardware, which is most of
 * the new kind: an industrial PC, a thin client, a tablet on the line, a small
 * board beside the machine. All of those run a browser, and this is a file
 * that runs in one. It carries the screens, the ladder program, the scan
 * engine and the renderer, and it fetches nothing, so it works from a USB
 * stick on a machine that has never had a network.
 *
 * The runtime inside it is the same code the builder runs. Not a port of it: a
 * second implementation would be faithful the day it was written and would
 * drift from then on, and the whole value of exporting a screen somebody
 * approved is that it is the screen they approved.
 */

export interface PanelExport {
  doc: HmiDoc;
  program: LadxProgram | null;
  name: string;
  /** The bundled runtime, as source. Fetched from /panel/runtime.js. */
  runtime: string;
  /** Stamped into the page so a file found later can be dated. */
  exportedAt?: string;
}

/**
 * Make a string safe to sit inside a `<script>` element.
 *
 * JSON.stringify is not enough on its own. A screen with the text `</script>`
 * on a button, or in an alarm message, ends the script element early and the
 * rest of the document becomes markup: the panel breaks, and it breaks in a
 * way that looks like the export is corrupt rather than like an escaping bug.
 * The other two are the HTML comment openers, which do the same thing in a
 * subtler way.
 */
export function safeJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/** Escape for a text node or an attribute value. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * A filename that survives every filesystem somebody might put this on.
 *
 * Leading dots go, along with runs of them. A screen called "../../etc/passwd"
 * would otherwise download as `..-..-etc-passwd.html`, which no browser will
 * treat as a path, but which is a filename that starts by looking like an
 * attempt at one. Hidden files on Unix start with a dot too, and a panel
 * nobody can see in a directory listing is a support call.
 */
export function panelFileName(name: string): string {
  const base = name
    .trim()
    .replace(/[^\w.-]+/g, "-")
    .replace(/\.{2,}/g, ".")
    .replace(/^[.\-]+|[.\-]+$/g, "")
    .replace(/-{2,}/g, "-");
  return `${base || "panel"}.html`;
}

export function buildPanelHtml({ doc, program, name, runtime, exportedAt }: PanelExport): string {
  const payload = safeJson({ doc, program, name });
  const title = escapeHtml(name || "LADX panel");
  const stamp = exportedAt ?? new Date().toISOString();

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${title}</title>
<meta name="generator" content="LADX HMI">
<meta name="ladx-exported" content="${escapeHtml(stamp)}">
<!--
  A LADX panel.

  Everything needed to run this screen is in this file. It makes no network
  requests, so it works from a USB stick, a share, or a machine that has never
  been online.

  It is not a Siemens or Rockwell panel project. It is a screen that runs in a
  browser, which is what an industrial PC, a thin client or a tablet on the
  line actually is.

  The process behind it is simulated by the ladder program included here, not
  read from plant equipment. Do not use it to judge the state of a machine.
-->
<style>
  html,body{margin:0;padding:0;height:100%;background:#0F1A24;overscroll-behavior:none}
  /* A panel is touched, not read. Selecting text on a mimic is never wanted
     and a long press that selects a label looks like the screen has hung. */
  body{-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent}
  #root{height:100%}
</style>
</head>
<body>
<div id="root"></div>
<script>window.__LADX_PANEL__=${payload};</script>
<script>${runtime}</script>
</body>
</html>
`;
}
