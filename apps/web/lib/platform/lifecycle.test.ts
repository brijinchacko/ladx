import { describe, expect, it } from "vitest";
import {
  ACTIVE_PHASES,
  PHASES,
  type PhaseId,
  allDeliverables,
  deliverablesFor,
  getPhase,
  nextPhase,
  phaseIndex,
} from "./lifecycle";

describe("the lifecycle", () => {
  it("opens on Summary, which produces nothing", () => {
    // The phase-nav prints a dot rather than a number for step 0, and the
    // planner seeds one task per deliverable, so a Summary deliverable would
    // put a document in the plan that the phase has no way to write.
    const first = PHASES[0];
    expect(first?.id).toBe("summary");
    expect(first?.step).toBe(0);
    expect(first?.deliverables).toEqual([]);
    expect(deliverablesFor("summary")).toEqual([]);
  });

  it("numbers the working phases 1..n with no gaps", () => {
    const steps = ACTIVE_PHASES.filter((p) => p.id !== "summary").map((p) => p.step);
    expect(steps).toEqual(steps.map((_, i) => i + 1));
  });

  it("closes last, without a number", () => {
    const last = PHASES[PHASES.length - 1];
    expect(last?.id).toBe("closed");
    expect(last?.step).toBeNull();
    expect(ACTIVE_PHASES).not.toContain(last);
  });

  it("resolves every deliverable slug to a real template", () => {
    // deliverablesFor drops a slug it cannot resolve. A typo would therefore
    // not fail anywhere: the phase would just quietly hold one document fewer
    // and every seeded plan would be short a task.
    for (const phase of PHASES) {
      expect(deliverablesFor(phase.id)).toHaveLength(phase.deliverables.length);
    }
  });

  it("never lists the same deliverable in two phases", () => {
    const slugs = PHASES.flatMap((p) => p.deliverables);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("seeds a plan of one task per deliverable, spread across the phases", () => {
    // What POST /api/projects/:id/tasks {seed:true} writes.
    const seeded = ACTIVE_PHASES.flatMap((phase) =>
      deliverablesFor(phase.id).map((d) => ({ phase: phase.id, slug: d.slug })),
    );
    expect(seeded.length).toBe(PHASES.flatMap((p) => p.deliverables).length);
    expect(seeded.every((t) => t.phase !== "summary")).toBe(true);
    // Every working phase carries work, so no phase opens onto an empty plan.
    for (const phase of ACTIVE_PHASES) {
      if (phase.id === "summary") continue;
      expect(seeded.filter((t) => t.phase === phase.id).length).toBeGreaterThan(0);
    }
  });

  it("walks from the first phase to the last and stops", () => {
    const walked: PhaseId[] = ["summary"];
    let at = nextPhase("summary");
    while (at) {
      walked.push(at.id);
      at = nextPhase(at.id);
    }
    expect(walked).toEqual(PHASES.map((p) => p.id));
    expect(nextPhase("closed")).toBeNull();
  });

  it("orders phases so 'is this behind us' is a comparison", () => {
    expect(phaseIndex("summary")).toBeLessThan(phaseIndex("design"));
    expect(phaseIndex("design")).toBeLessThan(phaseIndex("commissioning"));
    expect(phaseIndex("closed")).toBe(PHASES.length - 1);
  });

  it("falls back to Summary for a phase it does not know", () => {
    // A project row read back with a phase this build has dropped must still
    // render something rather than throwing on the server.
    expect(getPhase("nonsense" as PhaseId).id).toBe("summary");
  });

  it("covers the whole lifecycle in the overview", () => {
    expect(allDeliverables().map((g) => g.phase.id)).toEqual(ACTIVE_PHASES.map((p) => p.id));
  });
});
