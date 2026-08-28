/**
 * Where this app keeps what the assistant remembers.
 *
 * In the same SQLite database as the projects, the ladder programs and the
 * chat history, not in the webview's localStorage. The rule against browser
 * storage here is not pedantry: a conversation about why an interlock is
 * written the way it is is the reasoning behind logic that is now in a
 * machine, and webview storage is not backed up with the project, does not
 * travel on the memory stick at handover, and is cleared by things that have
 * nothing to do with LADX.
 *
 * Reads and writes are allowed to fail quietly, exactly as the browser one
 * does. Losing a thread is a bad day; refusing to answer a question because
 * the thread could not be saved is a worse one.
 */

import { type AssistantStore, localAssistantStore } from "@ladx/ui";
import { invoke } from "@tauri-apps/api/core";

export const tauriAssistantStore: AssistantStore = {
  async get(key) {
    try {
      return await invoke<string | null>("memory_get", { key });
    } catch {
      return null;
    }
  },
  async set(key, value) {
    try {
      await invoke<void>("memory_set", { key, value });
    } catch {
      // The assistant still works for this visit.
    }
  },
  async remove(key) {
    try {
      await invoke<void>("memory_remove", { key });
    } catch {
      // Nothing was stored, or it could not be cleared. Either way the screen
      // has already been emptied, which is what the person asked for.
    }
  },
};

/**
 * The store, or the browser's, when there is no Tauri to talk to.
 *
 * `next dev` in a plain browser is how this app's pages get looked at during
 * development, and an assistant that throws on every keystroke there is one
 * nobody can work on.
 *
 * Decided per call rather than once when this module loads. Load order is not
 * something to depend on: the answer was wrong for the whole session if this
 * module happened to be evaluated first, and the failure was silent, with
 * conversations quietly going to the browser instead.
 */
function backing(): AssistantStore {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
    ? tauriAssistantStore
    : localAssistantStore;
}

export const desktopAssistantStore: AssistantStore = {
  get: (key) => backing().get(key),
  set: (key, value) => backing().set(key, value),
  remove: (key) => backing().remove(key),
};
