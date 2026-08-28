/**
 * Where the assistant keeps what it remembers.
 *
 * Two different kinds of thing get remembered and only one of them is the
 * person's work. The conversation is: it is the reasoning behind a rung that
 * is now in a machine, and asked for by name as the memory a project keeps
 * when you open it. Which model is selected, and where the panel is docked,
 * are window state.
 *
 * The web keeps both in localStorage, which is right for a browser. The
 * desktop must not: `apps/desktop/CLAUDE.md` says so, and the reason is not
 * pedantry. Webview storage is not the project folder, is not backed up with
 * it, does not travel on the memory stick at handover, and is cleared by
 * things that have nothing to do with LADX. A conversation about why a
 * conveyor interlock is written the way it is deserves better than that.
 *
 * So this is injected. Absent, it is localStorage and nothing changes.
 */

export interface AssistantStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

/**
 * The browser's own storage.
 *
 * Every method swallows its failure on purpose. Private browsing, a full
 * quota and a blocked third-party context all throw here, and none of them is
 * a reason to stop the assistant working for this visit: that is exactly what
 * it did before anything was remembered at all.
 */
export const localAssistantStore: AssistantStore = {
  async get(key) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  async set(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Nothing to do, and nothing worth telling somebody about.
    }
  },
  async remove(key) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // As above.
    }
  },
};
