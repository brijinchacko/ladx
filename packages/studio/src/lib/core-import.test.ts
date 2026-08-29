import type { ConversionReport } from "@ladx/types";
import { describe, expect, it } from "vitest";
import { reportToNotes } from "./core-import";
import type { DroppedInstruction } from "./from-ir";

const report = (notes: ConversionReport["notes"]): ConversionReport => ({ notes });

describe("showing a conversion report", () => {
  /**
   * A clean rung is not news. A project with nine hundred of them would bury
   * the four lines somebody actually has to read.
   */
  it("says nothing about what converted cleanly", () => {
    const notes = reportToNotes(
      report([
        { fidelity: "exact", subject: "Main rung 0", detail: "" },
        { fidelity: "exact", subject: "Main rung 1", detail: "" },
      ]),
    );
    expect(notes).toEqual([]);
  });

  /**
   * Preserved is a success. Content LADX passed through untouched has been
   * handled correctly, and calling it a warning would train people to ignore
   * warnings.
   */
  it("treats preserved content as information, not a problem", () => {
    const [note] = reportToNotes(
      report([{ fidelity: "preserved", subject: "AOI MotorAOI", detail: "Carried across." }]),
    );
    expect(note?.severity).toBe("info");
  });

  it("asks for a look at anything approximate", () => {
    const [note] = reportToNotes(
      report([
        {
          fidelity: "approximate",
          subject: "Tag Conveyor_Speed",
          detail: "The source declared no data type; read as BOOL.",
        },
      ]),
    );
    expect(note?.severity).toBe("warning");
    expect(note?.message).toContain("read as BOOL");
  });

  it("sends unsupported and manual review to the same place, which is a person", () => {
    const notes = reportToNotes(
      report([
        { fidelity: "unsupported", subject: "PID", detail: "No equivalent." },
        { fidelity: "manualReview", subject: "SFC Seq", detail: "Carried as source." },
      ]),
    );
    expect(notes.map((n) => n.severity)).toEqual(["manual", "manual"]);
  });

  /**
   * The wording matters here more than the severity.
   *
   * An instruction the editor cannot draw is still in the file and still in
   * the IR. Somebody told "PID was dropped" would reasonably conclude their
   * loop is gone, so the note has to say where it went.
   */
  it("distinguishes what the editor cannot draw from what the import could not read", () => {
    const dropped: DroppedInstruction[] = [
      {
        where: "Main rung 3",
        what: "PID",
        why: "LADX did not recognise this instruction, so the editor has nothing to draw for it. It is still in the project file.",
      },
    ];
    const notes = reportToNotes(report([]), dropped);
    expect(notes).toHaveLength(1);
    expect(notes[0]?.where).toBe("Main rung 3");
    expect(notes[0]?.message).toContain("still in the project file");
  });

  it("keeps the subject so somebody can go and find the thing", () => {
    const [note] = reportToNotes(
      report([{ fidelity: "unsupported", subject: "MainProgram/Main rung 12", detail: "x" }]),
    );
    expect(note?.where).toBe("MainProgram/Main rung 12");
  });

  it("falls back to the verdict when a note carries no detail", () => {
    const [note] = reportToNotes(report([{ fidelity: "unsupported", subject: "PID", detail: "" }]));
    expect(note?.message).toBe("unsupported");
  });
});
