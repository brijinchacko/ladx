/**
 * A test run, written up.
 *
 * Lives apart from the route because a route file may only export handlers,
 * and because the same writer will serve the desktop, where the record is a
 * file in the project folder rather than a row.
 */

export interface Step {
  kind: string;
  action: string;
  expect: string;
  from: string;
}
export interface Plan {
  groups: { subject: string; steps: Step[] }[];
  not_covered?: string[];
}
export interface Result {
  result?: "pass" | "fail" | "na";
  note?: string;
  at?: string;
}

function cell(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function when(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : "";
}

export function recordMarkdown(run: {
  title: string;
  kind: string;
  plan: Plan;
  results: Record<string, Result>;
  notes: string | null;
  startedAt: Date;
  completedAt: Date | null;
  signedBy: string | null;
  signedRole: string | null;
  signedAt: Date | null;
}): string {
  const label = run.kind === "sat" ? "Site Acceptance Test" : "Factory Acceptance Test";
  const total = run.plan.groups.reduce((n, g) => n + g.steps.length, 0);
  const all = Object.values(run.results);
  const passed = all.filter((r) => r.result === "pass").length;
  const failed = all.filter((r) => r.result === "fail").length;
  const na = all.filter((r) => r.result === "na").length;
  const notDone = total - passed - failed - na;

  const lines: string[] = [];
  lines.push(`# ${label} record`);
  lines.push("");
  lines.push(`Run: ${run.title}  `);
  lines.push(`Started: ${when(run.startedAt)}  `);
  if (run.completedAt) lines.push(`Completed: ${when(run.completedAt)}  `);
  lines.push("");
  lines.push("## Result");
  lines.push("");
  lines.push("| Steps | Passed | Failed | Not applicable | Not done |");
  lines.push("| --- | --- | --- | --- | --- |");
  lines.push(`| ${total} | ${passed} | ${failed} | ${na} | ${notDone} |`);
  lines.push("");
  if (failed > 0) {
    lines.push(
      `${failed} step${failed === 1 ? "" : "s"} failed. Each is listed below with what was seen.`,
    );
    lines.push("");
  }

  run.plan.groups.forEach((g, gi) => {
    lines.push(`## ${g.subject}`);
    lines.push("");
    lines.push("| # | Step | Expected | Result | Seen |");
    lines.push("| --- | --- | --- | --- | --- |");
    g.steps.forEach((s, si) => {
      const r = run.results[`${gi}.${si}`] ?? {};
      const result =
        r.result === "pass"
          ? "Pass"
          : r.result === "fail"
            ? "FAIL"
            : r.result === "na"
              ? "N/A"
              : "Not done";
      const safety = s.kind === "safety" ? " (safety)" : "";
      lines.push(
        `| ${si + 1} | ${cell(s.action)}${safety} | ${cell(s.expect)} | ${result} | ${cell(r.note ?? "")} |`,
      );
    });
    lines.push("");
  });

  if (run.plan.not_covered && run.plan.not_covered.length > 0) {
    lines.push("## Not covered by these tests");
    lines.push("");
    for (const n of run.plan.not_covered) lines.push(`- ${n}`);
    lines.push("");
  }

  if (run.notes?.trim()) {
    lines.push("## Notes");
    lines.push("");
    lines.push(run.notes.trim());
    lines.push("");
  }

  lines.push("## Sign off");
  lines.push("");
  if (run.signedBy) {
    lines.push(
      `Signed by ${run.signedBy}${run.signedRole ? `, ${run.signedRole}` : ""} on ${when(run.signedAt)}.`,
    );
  } else {
    lines.push("Not yet signed.");
    lines.push("");
    lines.push("| Name | Role | Signature | Date |");
    lines.push("| --- | --- | --- | --- |");
    lines.push("|  |  |  |  |");
  }
  lines.push("");
  return lines.join("\n");
}
