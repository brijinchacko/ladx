import { type LadderNode, everyElement, rungLogic } from "./tree";
import type { Element, LadxProgram, Routine, Rung, Tag } from "./types";
import { programRoutines } from "./types";

/**
 * LADX Mini, the scan engine.
 *
 * A real PLC does three things forever: read the inputs, solve the logic
 * top-to-bottom, write the outputs. This does the same, and the fidelity that
 * matters for teaching lives in the details students actually get wrong:
 *
 *   OUTPUTS ARE WRITTEN, NOT READ, MID-SCAN. Every rung in one scan sees the
 *   tag values as they were at the start of that scan. That is why a coil on
 *   rung 5 does not affect a contact on rung 2 until the next scan, the single
 *   most common source of "but it should work" in a classroom.
 *
 *   EDGES ARE PER INSTRUCTION, NOT PER TAG. A CTU counts once when its rung
 *   goes false-to-true, so a held-down button counts one, not thousands. Each
 *   instruction keeps its own memory of the last rung state.
 *
 *   TIMERS ADVANCE BY ELAPSED TIME, NOT BY SCAN COUNT. Presets are in
 *   milliseconds and the engine is told how long really passed, so a timer set
 *   to 10 s takes 10 s whether the scan is 20 ms or 200 ms.
 *
 * Pure: it takes state in and returns new state. No React, no DOM, no clock of
 * its own, which is what makes it testable and what stops a rendering bug from
 * looking like a logic bug.
 */

export type ElementResult = { id: string; powered: boolean };

export type ScanResult = {
  tags: Tag[];
  /** Power state of every element, for the live green highlight. */
  elementPower: Record<string, boolean>;
  /** Whether each rung's condition side passed power. */
  rungPower: Record<string, boolean>;
  /** Per-instruction edge memory, threaded back in on the next scan. */
  edges: Record<string, boolean>;
  errors: string[];
};

type TagMap = Map<string, Tag>;

function toMap(tags: Tag[]): TagMap {
  return new Map(tags.map((t) => [t.name, { ...t }]));
}

/** A number from a tag name, or from a literal typed into the operand box. */
/**
 * Split "T1.PRE" into its parts. Returns null for a plain tag name.
 *
 * Dotted members were understood for bits: a student could already put T1.DN
 * on a contact, but nowhere else, so a timer's preset and accumulator could
 * be neither read as a number nor written to. That is most of what a timer is
 * for: MOV 5000 -> T1.PRE is how a recipe changes a dwell time, and on this
 * simulator it silently did nothing.
 */
function splitMember(name: string): { base: string; member: string } | null {
  const dot = name.indexOf(".");
  if (dot <= 0) return null;
  return { base: name.slice(0, dot), member: name.slice(dot + 1).toUpperCase() };
}

function operandValue(operand: string | undefined, tags: TagMap): number {
  if (operand === undefined || operand === "") return 0;
  const asNumber = Number(operand);
  if (!Number.isNaN(asNumber) && operand.trim() !== "") return asNumber;

  // "T1.PRE", "T1.ACC", and the status bits read as 1 or 0.
  const dotted = splitMember(operand);
  if (dotted) {
    const t = tags.get(dotted.base);
    if (!t) return 0;
    switch (dotted.member) {
      case "PRE":
        return t.preset ?? 0;
      case "ACC":
        return t.acc ?? 0;
      case "DN":
        return t.dn ? 1 : 0;
      case "TT":
        return t.tt ? 1 : 0;
      case "EN":
        return t.en ? 1 : 0;
      default:
        return 0;
    }
  }

  const tag = tags.get(operand);
  if (!tag) return 0;
  // A timer or counter used as a value means its accumulator.
  if (tag.type === "TIMER" || tag.type === "COUNTER") return tag.acc ?? 0;
  return tag.value;
}

/**
 * Write a number to a destination, which may be a tag or a tag member.
 *
 * Returns an error string rather than throwing, so one bad rung reports itself
 * and the rest of the program still scans.
 *
 * A bare timer or counter is refused on purpose. On real hardware you address
 * the member, T1.PRE or T1.ACC: and guessing which one a student meant would
 * teach them a habit that fails the first time they touch a real controller.
 * The message names both choices so the fix is obvious.
 */
function checkDest(dest: string, tags: TagMap): string | null {
  const dotted = splitMember(dest);
  if (dotted) {
    const t = tags.get(dotted.base);
    if (!t) return `Destination "${dest}" is not declared.`;
    if (dotted.member === "PRE" || dotted.member === "ACC") return null;
    if (["DN", "TT", "EN"].includes(dotted.member)) {
      return `"${dest}" is a status bit the controller owns, it cannot be written to. Use an OTE on a normal tag instead.`;
    }
    return `"${dest}" is not a member this simulator knows. Use .PRE or .ACC.`;
  }
  const d = tags.get(dest);
  if (!d) return `Destination "${dest}" is not declared.`;
  if (d.type === "TIMER" || d.type === "COUNTER") {
    return `"${dest}" is a ${d.type.toLowerCase()}. Say which part you mean: "${dest}.PRE" for the preset, or "${dest}.ACC" for the accumulator.`;
  }
  return null;
}

function writeNumber(dest: string, value: number, tags: TagMap): string | null {
  const dotted = splitMember(dest);

  if (dotted) {
    const t = tags.get(dotted.base);
    if (!t) return `Destination "${dest}" is not declared.`;
    switch (dotted.member) {
      case "PRE":
        // Presets are whole milliseconds and a negative one has no meaning.
        t.preset = Math.max(0, Math.round(value));
        return null;
      case "ACC":
        t.acc = Math.max(0, Math.round(value));
        return null;
      case "DN":
      case "TT":
      case "EN":
        return `"${dest}" is a status bit the controller owns, it cannot be written to. Use an OTE on a normal tag instead.`;
      default:
        return `"${dest}" is not a member this simulator knows. Use .PRE or .ACC.`;
    }
  }

  const d = tags.get(dest);
  if (!d) return `Destination "${dest}" is not declared.`;

  if (d.type === "TIMER" || d.type === "COUNTER") {
    return `"${dest}" is a ${d.type.toLowerCase()}. Say which part you mean: "${dest}.PRE" for the preset, or "${dest}.ACC" for the accumulator.`;
  }

  /*
   * Truncated toward zero, because every tag this simulator has holds a whole
   * number and a real controller's integer DIV discards the remainder.
   *
   * Without this, DIV 7 by 2 stored 3.5 in an INT tag: a value no PLC would
   * ever show, and one the manual explicitly promises you will not see.
   * Math.trunc rather than Math.round on purpose: 7/2 is 3 on the hardware,
   * not 4, and -7/2 is -3 rather than -4.
   */
  d.value = Math.trunc(value);
  return null;
}

/**
 * Reading a bit.
 *
 * `Timer.DN` and `Counter.DN` are addressed as "Tag.DN" so a student can use a
 * timer's done bit as a contact, exactly as they would on real hardware.
 */
function boolOf(name: string, tags: TagMap): boolean {
  if (!name) return false;

  const dot = name.indexOf(".");
  if (dot > 0) {
    const base = name.slice(0, dot);
    const member = name.slice(dot + 1).toUpperCase();
    const t = tags.get(base);
    if (!t) return false;
    if (member === "DN") return !!t.dn;
    if (member === "TT") return !!t.tt;
    if (member === "EN") return !!t.en;
    if (member === "ACC") return (t.acc ?? 0) !== 0;
    return false;
  }

  const t = tags.get(name);
  if (!t) return false;
  if (t.type === "TIMER" || t.type === "COUNTER") return !!t.dn;
  return t.value !== 0;
}

function setBool(name: string, on: boolean, tags: TagMap) {
  const t = tags.get(name);
  if (!t) return;
  t.value = on ? 1 : 0;
}

/** Evaluate one element on the condition side. */
function evalInput(
  el: Element,
  tags: TagMap,
  edges: Record<string, boolean>,
  nextEdges: Record<string, boolean>,
  incoming: boolean,
): boolean {
  switch (el.type) {
    case "XIC":
      return incoming && boolOf(el.tag, tags);
    case "XIO":
      return incoming && !boolOf(el.tag, tags);
    case "ONS": {
      // True for exactly one scan on the rising edge of the incoming power.
      const was = edges[el.id] ?? false;
      nextEdges[el.id] = incoming;
      return incoming && !was;
    }
    case "EQU":
      return incoming && operandValue(el.tag, tags) === operandValue(el.operand, tags);
    case "NEQ":
      return incoming && operandValue(el.tag, tags) !== operandValue(el.operand, tags);
    case "GRT":
      return incoming && operandValue(el.tag, tags) > operandValue(el.operand, tags);
    case "LES":
      return incoming && operandValue(el.tag, tags) < operandValue(el.operand, tags);
    case "GEQ":
      return incoming && operandValue(el.tag, tags) >= operandValue(el.operand, tags);
    case "LEQ":
      return incoming && operandValue(el.tag, tags) <= operandValue(el.operand, tags);
    default:
      // An output instruction placed on the condition side passes power
      // through rather than breaking the rung.
      return incoming;
  }
}

/** Apply one output instruction. */
function applyOutput(
  el: Element,
  powered: boolean,
  tags: TagMap,
  edges: Record<string, boolean>,
  nextEdges: Record<string, boolean>,
  dtMs: number,
  errors: string[],
) {
  const t = tags.get(el.tag);

  switch (el.type) {
    case "OTE":
      if (!t) {
        errors.push(`Coil references unknown tag "${el.tag}".`);
        return;
      }
      setBool(el.tag, powered, tags);
      return;

    case "OTL":
      if (!t) {
        errors.push(`Latch references unknown tag "${el.tag}".`);
        return;
      }
      if (powered) setBool(el.tag, true, tags);
      return;

    case "OTU":
      if (!t) {
        errors.push(`Unlatch references unknown tag "${el.tag}".`);
        return;
      }
      if (powered) setBool(el.tag, false, tags);
      return;

    case "TON": {
      if (!t) {
        errors.push(`Timer "${el.tag}" is not declared.`);
        return;
      }
      /*
       * The TAG's preset wins at runtime, not the instruction's.
       *
       * This read `el.preset ?? t.preset` and then assigned it back to
       * t.preset every scan. The instruction box carries the literal a
       * student typed, so a MOV or ADD into T1.PRE was overwritten on the
       * very next scan by the old number, the value visibly changed and the
       * timer went on timing to the original, which is the "addition is not
       * resolved" report.
       *
       * On real hardware the preset is a field of the timer structure and
       * writing to it is how a recipe changes a dwell time. The instruction's
       * literal seeds that field (see seedPresets, called on load and reset)
       * and does not re-assert itself afterwards.
       */
      const preset = t.preset ?? el.preset ?? 0;
      t.en = powered;
      if (powered) {
        t.acc = Math.min(preset, (t.acc ?? 0) + dtMs);
        t.dn = (t.acc ?? 0) >= preset && preset > 0;
        t.tt = !t.dn;
      } else {
        // A TON resets the moment it loses power. Students expect it to hold;
        // it does not, and that is the lesson.
        t.acc = 0;
        t.dn = false;
        t.tt = false;
      }
      return;
    }

    case "TOF": {
      if (!t) {
        errors.push(`Timer "${el.tag}" is not declared.`);
        return;
      }
      const preset = t.preset ?? el.preset ?? 0;
      t.en = powered;
      if (powered) {
        t.acc = 0;
        t.dn = true;
        t.tt = false;
      } else {
        t.acc = Math.min(preset, (t.acc ?? 0) + dtMs);
        t.tt = (t.acc ?? 0) < preset;
        t.dn = t.tt;
      }
      return;
    }

    case "CTU": {
      if (!t) {
        errors.push(`Counter "${el.tag}" is not declared.`);
        return;
      }
      // The tag's preset wins, as with the timers, writing to C1.PRE is how
      // a batch size is changed while the machine runs.
      const preset = t.preset ?? el.preset ?? 0;
      const was = edges[el.id] ?? false;
      nextEdges[el.id] = powered;
      // Counts on the rising edge only: a held input counts once.
      if (powered && !was) t.acc = (t.acc ?? 0) + 1;
      t.dn = (t.acc ?? 0) >= preset && preset > 0;
      t.en = powered;
      return;
    }

    case "CTD": {
      if (!t) {
        errors.push(`Counter "${el.tag}" is not declared.`);
        return;
      }
      // The tag's preset wins, as with the timers, writing to C1.PRE is how
      // a batch size is changed while the machine runs.
      const preset = t.preset ?? el.preset ?? 0;
      const was = edges[el.id] ?? false;
      nextEdges[el.id] = powered;
      if (powered && !was) t.acc = (t.acc ?? 0) - 1;
      t.dn = (t.acc ?? 0) <= 0;
      t.en = powered;
      return;
    }

    case "RES": {
      if (!t) {
        errors.push(`Reset references unknown tag "${el.tag}".`);
        return;
      }
      if (powered) {
        t.acc = 0;
        t.dn = false;
        t.tt = false;
      }
      return;
    }

    case "MOV": {
      if (!el.dest) {
        errors.push("Move has no destination.");
        return;
      }
      // Checked on every scan, powered or not, so a mistyped destination is
      // reported while the student is looking at it rather than only once the
      // rung happens to go true. Written only when powered.
      const bad = checkDest(el.dest, tags);
      if (bad) {
        errors.push(`Move: ${bad}`);
        return;
      }
      if (powered) writeNumber(el.dest, operandValue(el.tag, tags), tags);
      return;
    }

    case "ADD":
    case "SUB":
    case "MUL":
    case "DIV": {
      if (!el.dest) {
        errors.push(`${el.type} has no destination.`);
        return;
      }
      const a = operandValue(el.tag, tags);
      const b = operandValue(el.operand, tags);

      // Division by zero faults a real processor. Here it reports and leaves
      // the destination alone, which is the honest answer and keeps the rest
      // of the scan running.
      if (el.type === "DIV" && powered && b === 0) {
        errors.push(`Divide: cannot divide ${a} by zero.`);
        return;
      }

      let result: number;
      switch (el.type) {
        case "ADD":
          result = a + b;
          break;
        case "SUB":
          result = a - b;
          break;
        case "MUL":
          result = a * b;
          break;
        default:
          result = a / b;
          break;
      }

      const bad = checkDest(el.dest, tags);
      if (bad) {
        errors.push(`${el.type}: ${bad}`);
        return;
      }
      if (powered) writeNumber(el.dest, result, tags);
      return;
    }

    default:
      return;
  }
}

/**
 * Solve one node of the condition side.
 *
 * The whole point of the tree is that this is three lines of meaning:
 *
 *   an element  passes what it passes, given the power arriving at it
 *   a series    hands each child the power the previous one let through   (AND)
 *   a parallel  hands EVERY leg the same incoming power, and passes if any
 *               leg gets to the other side                                (OR)
 *
 * An empty series is a wire and passes power. That is not a special case to be
 * tolerated, it is what an empty branch leg physically is, and it is why a
 * half-built branch behaves the way a student expects while they are building
 * it.
 *
 * Every leg is evaluated even once the answer is known, because short-circuit
 * evaluation would leave the unvisited elements without a power value and the
 * live green highlight would go dark on a branch that is genuinely energised.
 */
function solveNode(
  node: LadderNode,
  incoming: boolean,
  tags: TagMap,
  edges: Record<string, boolean>,
  nextEdges: Record<string, boolean>,
  power: Record<string, boolean>,
): boolean {
  if (node.kind === "el") {
    const out = evalInput(node as unknown as Element, tags, edges, nextEdges, incoming);
    power[node.id] = out;
    return out;
  }

  if (node.kind === "series") {
    let flow = incoming;
    for (const child of node.children) {
      flow = solveNode(child, flow, tags, edges, nextEdges, power);
    }
    power[node.id] = flow;
    return flow;
  }

  let any = false;
  for (const leg of node.children) {
    if (solveNode(leg, incoming, tags, edges, nextEdges, power)) any = true;
  }
  power[node.id] = any;
  return any;
}

/** Solve one rung's condition side. */
function solveRung(
  rung: Rung,
  tags: TagMap,
  edges: Record<string, boolean>,
  nextEdges: Record<string, boolean>,
  power: Record<string, boolean>,
): boolean {
  return solveNode(rungLogic(rung), true, tags, edges, nextEdges, power);
}

/**
 * One scan.
 *
 * `dtMs` is how much real time has passed since the previous scan, the caller
 * measures it, so timers stay honest even if the browser throttles the tab.
 */
export function scan(
  program: LadxProgram,
  currentTags: Tag[],
  edges: Record<string, boolean>,
  dtMs: number,
): ScanResult {
  const tags = toMap(currentTags);
  const nextEdges: Record<string, boolean> = { ...edges };
  const elementPower: Record<string, boolean> = {};
  const rungPower: Record<string, boolean> = {};
  const errors: string[] = [];

  const routines = programRoutines(program);
  const byName = new Map(routines.map((r) => [r.name.toLowerCase(), r]));

  /**
   * Run one routine's rungs top to bottom.
   *
   * A JSR runs the named routine THERE AND THEN and comes back, which is what
   * the instruction does on hardware and why a student can reason about order.
   * `stack` guards recursion: a routine that calls itself, directly or round a
   * loop, would hang the browser, so it is reported as a fault instead, which
   * is also what a real controller does.
   */
  function runRoutine(routine: Routine, stack: string[]) {
    if (stack.includes(routine.name)) {
      errors.push(
        `Routine "${routine.name}" calls itself (${[...stack, routine.name].join(" -> ")}). The call was skipped.`,
      );
      return;
    }
    const nextStack = [...stack, routine.name];

    for (const rung of routine.rungs) {
      const powered = solveRung(rung, tags, edges, nextEdges, elementPower);
      rungPower[rung.id] = powered;
      for (const out of rung.outputs) {
        elementPower[out.id] = powered;
        if (out.type === "JSR") {
          if (!powered) continue;
          const target = byName.get((out.tag ?? "").toLowerCase());
          if (!target) {
            errors.push(`JSR refers to "${out.tag}", which is not a routine.`);
            continue;
          }
          runRoutine(target, nextStack);
          continue;
        }
        applyOutput(out, powered, tags, edges, nextEdges, dtMs, errors);
      }
    }
  }

  if (routines.length > 0) runRoutine(routines[0], []);

  return {
    tags: [...tags.values()],
    elementPower,
    rungPower,
    edges: nextEdges,
    errors: [...new Set(errors)],
  };
}

/** Clear runtime state back to a cold start, outputs off, timers zeroed. */
export function resetTags(tags: Tag[]): Tag[] {
  return tags.map((t) => ({
    ...t,
    // Inputs keep whatever the switches are set to; everything else clears.
    value: t.isInput ? t.value : 0,
    acc: 0,
    dn: false,
    tt: false,
    en: false,
    lastRung: false,
  }));
}

/**
 * Copy the presets typed into instructions onto their tags.
 *
 * The runtime reads the preset from the TAG, so that a MOV into T1.PRE sticks
 * rather than being overwritten on the next scan. That leaves the number typed
 * into a TON box needing somewhere to go: it seeds the tag here, when a
 * project loads and whenever the controller is reset.
 *
 * Which gives both behaviours students need, edit the box and press Run to
 * see the new time, or MOV a value into .PRE and watch it change on the fly, * without the instruction fighting the program for the same field every scan.
 */
export function seedPresets(program: LadxProgram, tags: Tag[]): Tag[] {
  const fromInstruction = new Map<string, number>();

  const walk = (node: LadderNode) => {
    if (node.kind === "el") {
      const el = node as unknown as Element;
      if (el.preset !== undefined && el.tag && !fromInstruction.has(el.tag)) {
        fromInstruction.set(el.tag, el.preset);
      }
      return;
    }
    node.children.forEach(walk);
  };

  for (const r of programRoutines(program)) {
    for (const rung of r.rungs) {
      walk(rungLogic(rung));
      for (const o of rung.outputs) {
        if (o.preset !== undefined && o.tag && !fromInstruction.has(o.tag)) {
          fromInstruction.set(o.tag, o.preset);
        }
      }
    }
  }

  return tags.map((t) => {
    if (t.type !== "TIMER" && t.type !== "COUNTER") return t;
    const seeded = fromInstruction.get(t.name);
    return seeded === undefined ? t : { ...t, preset: seeded };
  });
}

/**
 * Problems worth telling a student about before they press Run.
 *
 * Deliberately warnings, not errors: a half-built program should still run, so
 * they can watch what the missing piece does to the logic.
 */
export function validate(program: LadxProgram): string[] {
  const out: string[] = [];
  const names = new Set(program.tags.map((t) => t.name));

  const known = (name: string) => {
    if (!name) return true;
    const base = name.includes(".") ? name.slice(0, name.indexOf(".")) : name;
    return names.has(base);
  };

  const byName = new Map(program.tags.map((t) => [t.name, t]));
  const routineNames = new Set(programRoutines(program).map((r) => r.name.toLowerCase()));

  /**
   * The same rule the engine enforces at scan time, checked at compile time.
   *
   * A destination that names a timer without saying which part of it is meant
   * used to compile clean and then do nothing at all, which is the hardest
   * kind of fault for a student to see: the program runs, and the number never
   * changes. Better to be told before pressing run.
   */
  const destProblem = (dest: string): string | null => {
    const dot = dest.indexOf(".");
    if (dot > 0) {
      const t = byName.get(dest.slice(0, dot));
      if (!t) return null; // already reported by `known`
      const member = dest.slice(dot + 1).toUpperCase();
      if (member === "PRE" || member === "ACC") return null;
      if (["DN", "TT", "EN"].includes(member)) {
        return `"${dest}" is a status bit the controller sets. Drive a normal tag with an OTE instead.`;
      }
      return `"${dest}" is not a member this simulator knows. Use .PRE or .ACC.`;
    }
    const t = byName.get(dest);
    if (!t) return null;
    if (t.type === "TIMER" || t.type === "COUNTER") {
      return `"${dest}" is a ${t.type.toLowerCase()}. Say which part you mean: "${dest}.PRE" or "${dest}.ACC".`;
    }
    return null;
  };

  /*
   * Every routine, not just program.rungs.
   *
   * This walked the legacy flat list, which programRoutines() only falls back
   * to when there are no routines, so the moment a student added a second
   * page, nothing on any page was validated. Undeclared tags and empty rungs
   * in routines compiled silently clean.
   */
  for (const routine of programRoutines(program)) {
    const where = (i: number) =>
      routineNames.size > 1 ? `${routine.name} rung ${i + 1}` : `Rung ${i + 1}`;

    routine.rungs.forEach((r, i) => {
      const all = [...everyElement(rungLogic(r)), ...r.outputs];
      for (const el of all) {
        // A JSR names a routine, not a tag, check it against the routines.
        if (el.type === "JSR") {
          if (!el.tag) {
            out.push(`${where(i)}: a JSR has no routine chosen.`);
          } else if (!routineNames.has(el.tag.toLowerCase())) {
            out.push(`${where(i)}: JSR calls "${el.tag}", which is not a routine.`);
          }
        } else if (el.tag && !known(el.tag)) {
          out.push(`${where(i)}: "${el.tag}" is not in the tag table.`);
        }

        // An operand that is neither a number nor a declared tag reads as zero
        // and quietly makes the maths wrong.
        if (el.operand && Number.isNaN(Number(el.operand)) && !known(el.operand)) {
          out.push(`${where(i)}: "${el.operand}" is neither a number nor a tag.`);
        }

        if (el.dest) {
          if (!known(el.dest)) {
            out.push(`${where(i)}: destination "${el.dest}" is not in the tag table.`);
          } else {
            const problem = destProblem(el.dest);
            if (problem) out.push(`${where(i)}: ${problem}`);
          }
        }
      }
      if (r.outputs.length === 0) {
        out.push(`${where(i)} has no output, it will do nothing.`);
      }
    });
  }

  // Two coils driving one tag is the classic duplicate-output fault.
  const coilCounts = new Map<string, number>();
  for (const r of programRoutines(program).flatMap((x) => x.rungs)) {
    for (const o of r.outputs) {
      if (o.type === "OTE") coilCounts.set(o.tag, (coilCounts.get(o.tag) ?? 0) + 1);
    }
  }
  for (const [tag, n] of coilCounts) {
    if (n > 1) {
      out.push(
        `"${tag}" is driven by ${n} coils. The last rung wins every scan, this is a duplicate output.`,
      );
    }
  }

  return [...new Set(out)];
}
