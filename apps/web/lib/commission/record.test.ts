import { describe, expect, it } from "vitest";
import { recordMarkdown } from "./record";

const plan = {
  groups: [
    {
      subject: "Motor_Run",
      steps: [
        { kind: "positive", action: "Press Start", expect: "Motor runs", from: "Main rung 1" },
        { kind: "safety", action: "Press E-stop", expect: "Motor stops", from: "Main rung 1" },
      ],
    },
  ],
  not_covered: ["Anything the HMI writes directly"],
};

describe("the test record", () => {
  it("writes every step with its result and what was seen", () => {
    const md = recordMarkdown({
      title: "Line 2 FAT 1",
      kind: "fat",
      plan,
      results: {
        "0.0": { result: "pass" },
        "0.1": { result: "fail", note: "Contactor held in | relay K3 sticky" },
      },
      notes: "Witnessed by the client.",
      startedAt: new Date("2026-09-02T09:00:00Z"),
      completedAt: new Date("2026-09-02T11:30:00Z"),
      signedBy: "A. Engineer",
      signedRole: "Commissioning engineer",
      signedAt: new Date("2026-09-02T11:30:00Z"),
    });
    expect(md).toContain("# Factory Acceptance Test record");
    expect(md).toContain("| 2 | 1 | 1 | 0 | 0 |");
    expect(md).toContain("| 1 | Press Start | Motor runs | Pass |  |");
    // A pipe in a note must not break the table.
    expect(md).toContain(
      "| 2 | Press E-stop (safety) | Motor stops | FAIL | Contactor held in \\| relay K3 sticky |",
    );
    expect(md).toContain("Signed by A. Engineer, Commissioning engineer on 2026-09-02.");
    expect(md).toContain("- Anything the HMI writes directly");
    expect(md).toContain("Witnessed by the client.");
  });

  it("leaves a signature line when nobody has signed", () => {
    const md = recordMarkdown({
      title: "SAT",
      kind: "sat",
      plan,
      results: {},
      notes: null,
      startedAt: new Date("2026-09-02T09:00:00Z"),
      completedAt: null,
      signedBy: null,
      signedRole: null,
      signedAt: null,
    });
    expect(md).toContain("# Site Acceptance Test record");
    expect(md).toContain("| 2 | 0 | 0 | 0 | 2 |");
    expect(md).toContain("Not yet signed.");
    expect(md).toContain("| Name | Role | Signature | Date |");
  });
});
