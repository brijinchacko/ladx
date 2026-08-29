/**
 * A conversion report, in the shape Convert already knows how to show.
 *
 * Convert has had an import notes panel since it could read an L5X, and the
 * Rust reader produces a richer report of the same thing. Rendering that
 * through the existing panel rather than building a second one keeps the two
 * import paths looking like one feature, which is what they are.
 *
 * The mapping is where the honesty lives, so it is written out rather than
 * done inline:
 *
 *   exact         not shown at all. A clean rung is not news, and a list of
 *                 hundreds of them buries the four lines that matter.
 *   preserved     shown as information. Content LADX passed through untouched
 *                 has been handled correctly, so it is not a warning.
 *   approximate   shown as something to check. It worked, with a stated
 *                 difference, and the difference is the point.
 *   unsupported   shown as by-hand. Nothing was lost from the file, but the
 *                 target will not do this until somebody writes it.
 *   manualReview  shown as by-hand, for the same reason.
 */

import type { ConversionReport } from "@ladx/types";
import type { DroppedInstruction } from "./from-ir";
import type { ImportNote, ImportSeverity } from "./import-l5x";

const SEVERITY: Record<string, ImportSeverity> = {
  preserved: "info",
  approximate: "warning",
  unsupported: "manual",
  manualReview: "manual",
};

export function reportToNotes(
  report: ConversionReport,
  dropped: DroppedInstruction[] = [],
): ImportNote[] {
  const notes: ImportNote[] = [];

  for (const n of report.notes) {
    const severity = SEVERITY[n.fidelity];
    if (!severity) continue; // exact
    notes.push({
      severity,
      where: n.subject,
      message: n.detail || n.fidelity,
    });
  }

  /*
   * What the editor could not draw, which is a different thing from what the
   * import could not read.
   *
   * Worth keeping separate in the wording: the instruction is in the file and
   * in the IR, it simply has no picture in this editor. Somebody told "PID was
   * dropped" would reasonably assume their loop is gone.
   */
  for (const d of dropped) {
    notes.push({
      severity: "warning",
      where: d.where,
      message: `${d.what}: ${d.why}`,
    });
  }

  return notes;
}
