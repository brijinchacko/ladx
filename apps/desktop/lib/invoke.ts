// Typed wrappers around Tauri commands. Frontend code calls these — never
// `fetch()` (HTTP is forbidden in the desktop app per ADR-005 / network policy).

import { invoke as tauriInvoke } from "@tauri-apps/api/core";

export const invoke = tauriInvoke;

// Phase 0: a smoke-test command. Real wrappers (parseProject, generateLadder,
// etc.) are added in Phase 2.
export async function ping(): Promise<string> {
  return tauriInvoke<string>("ping");
}
