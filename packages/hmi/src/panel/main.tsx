import type { LadxProgram } from "@ladx/studio/lib/types";
import { createRoot } from "react-dom/client";
import type { HmiDoc } from "../lib/types";
import PanelApp from "./panel-app";

/**
 * The entry point of an exported panel.
 *
 * Bundled by `scripts/build-panel-runtime.mjs` into one file that the export
 * inlines, along with the document, into a single HTML page. The page reads
 * its application from a global rather than fetching it: an exported panel has
 * to work from a file:// URL on a machine with no network, and a fetch is the
 * one thing that would stop it.
 */

declare global {
  interface Window {
    __LADX_PANEL__?: { doc: HmiDoc; program: LadxProgram | null; name?: string };
  }
}

function fail(message: string): void {
  const el = document.getElementById("root");
  if (!el) return;
  el.textContent = message;
  el.setAttribute(
    "style",
    "position:fixed;inset:0;display:flex;align-items:center;justify-content:center;" +
      "background:#0F1A24;color:#9FB0BE;font:14px ui-sans-serif,system-ui,sans-serif;padding:24px;text-align:center",
  );
}

const payload = window.__LADX_PANEL__;
const root = document.getElementById("root");

if (!root) {
  // Nothing to say it to, so nothing to say.
} else if (!payload?.doc) {
  // A truncated download or an edited file. Saying so beats a blank screen
  // that looks like a panel which has crashed.
  fail("This panel file has no application in it. Export it again from LADX.");
} else {
  if (payload.name) document.title = payload.name;
  createRoot(root).render(<PanelApp doc={payload.doc} program={payload.program ?? null} />);
}
