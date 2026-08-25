import { api } from "@/lib/api";
import type { LadxProgram, StudioProject, StudioStorage } from "@ladx/studio";

/**
 * The ladder editor's store, backed by the local SQLite through Tauri.
 *
 * The cloud build uses browser storage or an HTTP one; neither is allowed
 * here. The desktop keeps everything in one file under the app data directory
 * and makes no outbound calls at all, which is the reason this surface exists:
 * sites that will not permit a cloud tool.
 *
 * The retention note is written by the store rather than the editor, because
 * retention is a property of where the work went and only the store can say it
 * truthfully. Telling somebody the wrong thing about whether their work is
 * safe is worse than telling them nothing.
 */
export function tauriStorage(): StudioStorage {
  return {
    retentionNote:
      "Saved on this machine, in the LADX data folder. It is not sent anywhere. " +
      "Back it up like any other file on this PC.",

    async load(projectId) {
      const row = await api.loadLadder(projectId === "scratch" ? null : projectId);
      if (!row) return null;
      try {
        const program = JSON.parse(row.doc) as LadxProgram;
        if (!program) return null;
        return { name: row.name, program };
      } catch {
        // A row written by an older build, or a partial write. Treated as
        // absent rather than thrown: an editor that will not open is worse
        // than one that opens empty.
        return null;
      }
    },

    async save(projectId: string, project: StudioProject) {
      await api.saveLadder(
        projectId === "scratch" ? null : projectId,
        project.name,
        project.program,
      );
    },
  };
}
