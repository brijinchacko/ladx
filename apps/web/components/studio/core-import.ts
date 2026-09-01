"use client";

import { ladxProgramFromIr, reportToNotes } from "@ladx/studio";
import type { ConversionReport, IrProject } from "@ladx/types";

/**
 * Opening an L5X with the Rust reader, on the web.
 *
 * The desktop uses a native dialog and passes a path, because an L5X is
 * routinely tens of megabytes and a browser file input would put all of it
 * across the IPC boundary. Here the file has to be uploaded regardless: the
 * reader is a binary on the server, and there is no way to it from the browser
 * that does not involve sending the bytes.
 *
 * That is a real difference between the two surfaces rather than an
 * implementation detail, and the page says so rather than leaving somebody to
 * assume their project stayed on their machine.
 */
export const coreImportViaApi = {
  label: "Open an L5X",
  run: async () => {
    const file = await pickFile();
    // A cancelled dialog is not an error and nothing on screen should change.
    if (!file) return null;

    const form = new FormData();
    form.append("file", file);

    const res = await fetch("/api/convert/l5x", { method: "POST", body: form });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(body?.error ?? "That file could not be read.");
    }

    const project = body.project as IrProject;
    const report = body.report as ConversionReport;
    const { program, dropped } = ladxProgramFromIr(project);

    return {
      program,
      notes: reportToNotes(report, dropped),
      summary: body.summary as string,
      name: project.name,
    };
  },
};

/** The browser's own file picker, as a promise. */
function pickFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".L5X,.l5x";
    // Resolving on cancel is not free: a file input fires no event when
    // dismissed, so without this the promise never settles and the button
    // stays spinning until the page is reloaded.
    input.addEventListener("cancel", () => resolve(null), { once: true });
    input.addEventListener("change", () => resolve(input.files?.[0] ?? null), { once: true });
    input.click();
  });
}
