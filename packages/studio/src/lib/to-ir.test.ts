/**
 * The editor's model into the IR, and back.
 *
 * A round trip is the strongest available statement about the two bridges: if
 * a program survives IR to editor to IR unchanged, then moving the editor onto
 * the IR later cannot lose anything the editor could already hold.
 */

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import type { IrProject } from "@ladx/types";
import { describe, expect, it } from "vitest";
import { ladxProgramFromIr } from "./from-ir";
import { ladxProgramToIr } from "./to-ir";
import type { LadxProgram } from "./types";

const FIXTURES = path.resolve(__dirname, "../../../../tests/fixtures/projects");

function fixtures(): { slug: string; ir: IrProject }[] {
  return readdirSync(FIXTURES)
    .filter((d) => !d.startsWith("."))
    .sort()
    .map((slug) => ({
      slug,
      ir: JSON.parse(readFileSync(path.join(FIXTURES, slug, "project.ir.json"), "utf8")),
    }));
}

/**
 * What a project means, ignoring ids and arrangement bookkeeping.
 *
 * A series holding exactly one child is collapsed, because it is the same
 * circuit as that child on its own and the editor cannot avoid producing one:
 * its rung root is always a series, so a rung whose whole condition is a
 * parallel comes back wrapped. `plcopen_graph::normalise` is the same rule on
 * the Rust side, and the golden tests there already rely on it.
 */
function meaning(p: IrProject): string[] {
  const walk = (n: unknown): string[] => {
    const node = n as { kind: string; instruction?: unknown; children?: unknown[] };
    if (node.kind === "element") {
      const i = node.instruction as { op: string; operands: unknown[] };
      return [`${i.op}(${i.operands.map(operandText).join(",")})`];
    }
    const children = node.children ?? [];
    if (node.kind === "series" && children.length === 1) return walk(children[0]);
    return [`${node.kind}[`, ...children.flatMap(walk), "]"];
  };
  const operandText = (o: unknown): string => {
    const v = o as { kind: string; name?: string; value?: number };
    return v.kind === "tag" ? (v.name ?? "") : String(v.value);
  };

  const out: string[] = [];
  for (const pou of p.pous) {
    if (pou.body.language !== "ladder") continue;
    for (const rung of pou.body.rungs) {
      out.push(
        `${pou.name}|${walk(rung.logic).join(" ")}|${rung.outputs
          .map((o) => `${o.op}(${o.operands.map(operandText).join(",")})`)
          .join(" ")}`,
      );
    }
  }
  return out;
}

describe("the editor's model into the IR", () => {
  it.each(fixtures())("$slug survives IR to editor to IR", ({ slug, ir }) => {
    const { program, dropped } = ladxProgramFromIr(ir);

    // Anything the editor could not hold is out of scope for a round trip: it
    // never reached the program, so it cannot come back. Those are reported by
    // the other bridge and tested there.
    if (dropped.some((d) => !d.where.startsWith("Tag "))) return;

    const back = ladxProgramToIr(program);
    expect(meaning(back), `${slug} changed`).toEqual(meaning(ir));
  });

  it("keeps the scan period and the entry point", () => {
    const ir = fixtures().find((f) => f.slug === "08-multi-step-sequence")?.ir as IrProject;
    const back = ladxProgramToIr(ladxProgramFromIr(ir).program);
    expect(back.scan_ms).toBe(ir.scan_ms);
    expect(back.entry_point).toBe(ir.entry_point);
  });

  /**
   * A literal in an operand must not become a tag.
   *
   * The editor keeps both in one string field, so `MOV(10, Step)` and
   * `MOV(Source, Step)` look alike. Reading 10 as a tag would put it into the
   * dependency graph, and "what writes 10" is not a question anybody wants
   * answered.
   */
  it("tells a literal from a tag name", () => {
    const program: LadxProgram = {
      name: "P",
      routines: [
        {
          id: "r",
          name: "Main",
          rungs: [
            {
              id: "r1",
              logic: { kind: "series", id: "n1", children: [] },
              branches: [],
              outputs: [
                { id: "e1", type: "MOV", tag: "10", dest: "Step" },
                { id: "e2", type: "MOV", tag: "Source", dest: "Target" },
              ],
            },
          ],
        },
      ],
      rungs: [],
      tags: [],
      scanMs: 100,
    };

    const ir = ladxProgramToIr(program);
    const pou = ir.pous[0];
    if (pou?.body.language !== "ladder") throw new Error("expected ladder");
    const [literal, symbolic] = pou.body.rungs[0]?.outputs ?? [];

    expect(literal?.operands[0]).toEqual({ kind: "tag", name: "10" });
    expect(literal?.operands[1]).toEqual({ kind: "tag", name: "Step" });
    expect(symbolic?.operands[0]).toEqual({ kind: "tag", name: "Source" });
  });

  /**
   * Live simulator state is not part of a program.
   *
   * A tag's current value, a timer's accumulator and the last rung result
   * describe a program that is running. Carrying them into the IR would mean a
   * project saved while the simulator was going differed from the same project
   * saved while it was stopped.
   */
  it("leaves running state behind", () => {
    const program: LadxProgram = {
      name: "P",
      rungs: [],
      tags: [
        {
          name: "T1",
          type: "TIMER",
          value: 1,
          acc: 3200,
          preset: 5000,
          dn: true,
          tt: false,
          en: true,
          lastRung: true,
        },
      ],
      scanMs: 100,
    };

    const ir = ladxProgramToIr(program);
    const serialised = JSON.stringify(ir);
    expect(serialised).not.toContain("3200");
    expect(serialised).not.toContain("lastRung");
    expect(ir.tags[0]?.name).toBe("T1");
  });

  it("carries a tag's wiring direction", () => {
    const program: LadxProgram = {
      name: "P",
      rungs: [],
      tags: [
        { name: "In", type: "BOOL", value: 0, isInput: true },
        { name: "Out", type: "BOOL", value: 0, isOutput: true },
        { name: "Internal", type: "BOOL", value: 0 },
      ],
      scanMs: 100,
    };
    const ir = ladxProgramToIr(program);
    expect(ir.tags[0]?.field?.direction).toBe("input");
    expect(ir.tags[1]?.field?.direction).toBe("output");
    expect(ir.tags[2]?.field).toBeNull();
  });
});
