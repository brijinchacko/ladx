"use client";

import {
  type ImportNote,
  type ImportSeverity,
  ladxProgramFromIr,
  reportToNotes,
} from "@ladx/studio";
import type { ConversionReport, IrProject } from "@ladx/types";

/**
 * Opening somebody else's program with the Rust readers, on the web.
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
  label: "Open an L5X or SCL",
  run: async () => {
    const file = await pickFile();
    // A cancelled dialog is not an error and nothing on screen should change.
    if (!file) return null;

    // One button rather than two. Which reader to use is a fact about the file
    // that was chosen, not a decision to put to somebody: nobody picks a .scl
    // and then wants it read as an L5X. Two buttons would only be two chances
    // to press the wrong one.
    if (/\.(scl|st|awl)$/i.test(file.name)) {
      return readScl(file);
    }

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

    /*
     * Said where somebody is looking, not on a settings page they will never
     * open.
     *
     * This reader has never been run against a project exported by Studio 5000.
     * It is checked against LADX's own fixtures, which is a real check and a
     * different claim, and the difference matters to an engineer deciding
     * whether to trust what came back. Putting it first in the notes panel
     * costs one line and is the only place it would actually be read.
     */
    const notes = [
      {
        severity: "info" as const,
        where: "This reader",
        message:
          "Checked against LADX's own test projects, not against a file exported by Studio 5000. " +
          "Read what came across before relying on it.",
      },
      ...reportToNotes(report, dropped),
    ];

    return {
      program,
      notes,
      summary: body.summary as string,
      name: project.name,
    };
  },
};

/**
 * SCL in.
 *
 * Sent as text rather than as a file because that is what an S7 block is, and
 * because the reader takes the source. The important part of the answer is not
 * the program: it is whether the program is the whole program. A block with
 * statements this reader could not read imports as an IR that looks complete
 * and is missing rungs, and every analysis downstream would then report
 * confidently on something that is not what is on the machine. So that goes
 * first in the notes, above everything else.
 */
async function readScl(file: File) {
  const scl = await file.text();
  const res = await fetch("/api/convert/siemens", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ scl, name: file.name.replace(/\.[^.]+$/, "") }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(body?.error ?? "That block could not be read.");
  }

  const project = body.project as IrProject;
  const { program, dropped } = ladxProgramFromIr(project);
  const readNotes = (body.notes ?? []) as {
    fidelity: "exact" | "approximate" | "unread";
    at: string;
    detail: string;
  }[];

  const notes = [
    body.complete
      ? {
          severity: "info" as const,
          where: "This reader",
          message: `Every statement was read. ${body.summary}`,
        }
      : {
          severity: "warning" as const,
          where: "This reader",
          message: `${body.unread} statement(s) could not be read into ladder and are carried as text. The program here is not the whole program, so treat anything computed from it as incomplete.`,
        },
    {
      severity: "info" as const,
      where: "Addresses",
      message:
        "SCL carries no hardware addresses. They live in the TIA hardware configuration, so " +
        "nothing read from a block has one.",
    },
    ...readNotes
      .filter((n) => n.fidelity !== "exact")
      .map((n) => ({
        severity: (n.fidelity === "unread" ? "warning" : "info") as ImportSeverity,
        where: n.at,
        message: n.detail,
      })),
    // A DroppedInstruction, said the same way the L5X path says it, so the
    // panel reads identically whichever reader ran.
    ...dropped.map((d) => ({
      severity: "warning" as const,
      where: d.where,
      message: `${d.what} was not brought across: ${d.why}`,
    })),
  ] satisfies ImportNote[];

  return {
    program,
    notes,
    summary: body.summary as string,
    name: project.name,
  };
}

/** The browser's own file picker, as a promise. */
function pickFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".L5X,.l5x,.scl,.SCL,.st,.awl";
    // Resolving on cancel is not free: a file input fires no event when
    // dismissed, so without this the promise never settles and the button
    // stays spinning until the page is reloaded.
    input.addEventListener("cancel", () => resolve(null), { once: true });
    input.addEventListener("change", () => resolve(input.files?.[0] ?? null), { once: true });
    input.click();
  });
}
