/**
 * @vitest-environment jsdom
 *
 * The TypeScript reader parses with the browser's `DOMParser`, so it cannot run
 * at all under plain Node. That is worth noticing on its own: it means that
 * reader can only ever work in a browser, while the Rust one has no such
 * constraint and can read a project on a server or in a build step.
 *
 * The two L5X importers, on the same bytes.
 *
 * There are two ways to read an L5X in this repository: the TypeScript reader
 * in `import-l5x.ts`, which the file input has always used, and the Rust reader
 * behind `vendor.rockwell`. The plan is for the Rust one to win and the
 * TypeScript one to be retired, and the condition for retiring it is that they
 * agree on what a project contains.
 *
 * This is that comparison. It reads `tests/golden/*.L5X`, which is what the
 * Rust exporter writes from the fixture projects, with the TypeScript reader,
 * and checks the result against the fixture the L5X was written from. Both
 * paths therefore describe the same project and any difference between them is
 * a real disagreement rather than a difference of input.
 *
 * Where they legitimately differ, the test says so out loud rather than being
 * relaxed until it passes. A silent tolerance here would be the exact thing
 * that lets the retirement lose something.
 */

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import type { IrProject } from "@ladx/types";
import { describe, expect, it } from "vitest";
import { ladxProgramFromIr } from "./from-ir";
import { readProgramFile } from "./import-any";
import { rungLogic } from "./tree";
import { type LadxProgram, programRoutines } from "./types";

const ROOT = path.resolve(__dirname, "../../../..");
const FIXTURES = path.join(ROOT, "tests/fixtures/projects");
const GOLDEN = path.join(ROOT, "tests/golden");

function cases(): { slug: string; l5x: string; ir: IrProject }[] {
  return readdirSync(FIXTURES)
    .filter((d) => !d.startsWith("."))
    .sort()
    .map((slug) => ({
      slug,
      l5x: readFileSync(path.join(GOLDEN, `${slug}.L5X`), "utf8"),
      ir: JSON.parse(
        readFileSync(path.join(FIXTURES, slug, "project.ir.json"), "utf8"),
      ) as IrProject,
    }));
}

/**
 * Every rung, flattened to the instructions it contains, in order.
 *
 * Read through `programRoutines` rather than `program.routines`, because the
 * two readers structure a project differently and that is not the difference
 * being tested here. The TypeScript one flattens every routine into a single
 * rung list and records the origin in each rung's comment; the Rust one keeps
 * routines apart. `programRoutines` is the existing answer to that and both
 * shapes go through it.
 *
 * Routine names are therefore left out of the comparison. What is compared is
 * the logic: the same instructions on the same tags in the same order.
 */
function shape(program: LadxProgram): string[] {
  const out: string[] = [];
  for (const routine of programRoutines(program)) {
    for (const rung of routine.rungs) {
      const walk = (n: unknown): string[] => {
        const node = n as { kind?: string; type?: string; tag?: string; children?: unknown[] };
        if (node.kind === "el") return [`${node.type}(${node.tag})`];
        return (node.children ?? []).flatMap(walk);
      };
      // Through rungLogic, because the TypeScript reader still fills the older
      // flat `branches` shape while the Rust path builds the tree. Reading
      // `rung.logic` directly would silently see nothing on one side.
      const cond = walk(rungLogic(rung));
      const outs = rung.outputs.map((o) => `${o.type}(${o.tag})`);
      out.push(`${cond.join(" ")} -> ${outs.join(" ")}`);
    }
  }
  return out;
}

/** The multiset of instructions in a program, ignoring arrangement. */
function instructions(program: LadxProgram): string[] {
  const out: string[] = [];
  for (const routine of programRoutines(program)) {
    for (const rung of routine.rungs) {
      const walk = (n: unknown): void => {
        const node = n as { kind?: string; type?: string; tag?: string; children?: unknown[] };
        if (node.kind === "el") out.push(`${node.type}(${node.tag})`);
        else for (const c of node.children ?? []) walk(c);
      };
      walk(rungLogic(rung));
      for (const o of rung.outputs) out.push(`${o.type}(${o.tag})`);
    }
  }
  return out.sort();
}

describe("the two L5X readers, compared", () => {
  /**
   * Outputs are the part neither reader has any excuse to get wrong, so they
   * are compared exactly.
   */
  it.each(cases())("$slug drives the same coils", ({ slug, l5x, ir }) => {
    const viaTs = readProgramFile(`${slug}.L5X`, l5x);
    expect(viaTs.ok, `the TypeScript reader refused ${slug}`).toBe(true);
    if (!viaTs.ok) return;

    const coils = (p: LadxProgram) =>
      programRoutines(p)
        .flatMap((r) => r.rungs)
        .flatMap((r) => r.outputs.map((o) => `${o.type}(${o.tag})`));

    expect(coils(viaTs.imported.program)).toEqual(coils(ladxProgramFromIr(ir).program));
  });

  /**
   * The finding this file was written to record.
   *
   * On a rung with a branch, the TypeScript reader emits the contacts after the
   * branch once per leg. It is not a bug in that reader: its `branches` model is
   * an OR of ANDs, so a branch can only span the whole rung, and the only way to
   * express a seal-in is to repeat the rest of the chain in both legs. The
   * result runs correctly and reads as a duplicate.
   *
   * The Rust reader keeps the tree, so `[A,B] C D` stays four instructions
   * rather than becoming six.
   *
   * That difference is the concrete reason to prefer the Rust path, and it is
   * asserted here so that if the TypeScript reader is ever fixed, or the Rust
   * one ever regresses to a flat model, somebody is told rather than left
   * assuming they still agree.
   */
  it("shows the TypeScript reader repeating shared contacts on a branched rung", () => {
    const { l5x, ir } = cases().find(
      (c) => c.slug === "01-motor-starter",
    ) as typeof cases extends () => (infer T)[] ? T : never;
    const viaTs = readProgramFile("01-motor-starter.L5X", l5x);
    if (!viaTs.ok) throw new Error("refused");

    const ts = instructions(viaTs.imported.program);
    const rust = instructions(ladxProgramFromIr(ir).program);

    expect(rust).toEqual([
      "OTE(Motor)",
      "XIC(Motor)",
      "XIC(Overload_OK)",
      "XIC(Start_PB)",
      "XIC(Stop_PB)",
    ]);

    // The same rung, with Stop_PB and Overload_OK appearing twice.
    expect(ts.filter((i) => i === "XIC(Stop_PB)")).toHaveLength(2);
    expect(ts.filter((i) => i === "XIC(Overload_OK)")).toHaveLength(2);
    expect(ts.length).toBeGreaterThan(rust.length);
  });

  /**
   * Neither reader may invent or lose a tag reference, whatever it does with
   * the arrangement. This is the property that has to hold for the Rust path
   * to be a safe replacement.
   */
  it.each(cases())("$slug refers to the same tags either way", ({ slug, l5x, ir }) => {
    const viaTs = readProgramFile(`${slug}.L5X`, l5x);
    if (!viaTs.ok) return;

    const uniq = (xs: string[]) => [...new Set(xs)].sort();
    expect(uniq(instructions(viaTs.imported.program)), `${slug}`).toEqual(
      uniq(instructions(ladxProgramFromIr(ir).program)),
    );
  });

  /**
   * Declared tags, where the two readers make different and both defensible
   * choices about a type neither editor model can hold.
   *
   * The TypeScript reader leaves a REAL out and says so. The Rust path keeps it
   * as an INT and says so. Both are honest; they are not the same. Asserted as
   * a known difference rather than smoothed over, because whichever survives,
   * somebody has to decide which behaviour is wanted rather than inherit it.
   */
  it("differs on a REAL, and both readers say so", () => {
    const { l5x, ir } = cases().find(
      (c) => c.slug === "06-pid-loop",
    ) as typeof cases extends () => (infer T)[] ? T : never;
    const viaTs = readProgramFile("06-pid-loop.L5X", l5x);
    if (!viaTs.ok) throw new Error("refused");

    expect(
      viaTs.imported.notes.some(
        (n) => n.message.includes("REAL") && n.message.includes("left out"),
      ),
    ).toBe(true);

    const { program, dropped } = ladxProgramFromIr(ir);
    expect(program.tags.some((t) => t.name === "PV_Temp")).toBe(true);
    expect(dropped.some((d) => d.where === "Tag PV_Temp" && d.why.includes("REAL"))).toBe(true);
  });
});
