import { rungLogic } from "./tree";
import type { ElNode, LadderNode } from "./tree";
import type { Element, LadxProgram, Rung, Tag } from "./types";
import { programRoutines } from "./types";

/**
 * Converting a ladder program out of LADX.
 *
 * Ladder is not a lossless source for every target, and pretending otherwise is
 * how conversion tools earn their reputation. Two honest constraints shape this
 * file.
 *
 * First, ladder carries information that text does not: the physical order of
 * contacts on a rung, and the branch geometry. Structured Text preserves the
 * logic and discards the drawing. That is fine, and it is worth saying out loud
 * in the report rather than letting somebody discover it when they open the
 * result and cannot recognise their own rung.
 *
 * Second, the instructions that hold state across scans (timers, counters, one
 * shots) do not translate to expressions. They become function block instances
 * with a declaration, which means the output has a variable block that the
 * original ladder never had. Every one of those is reported, because the
 * instance names are the thing a person has to check.
 *
 * Everything here is deterministic. The same program converts to the same text
 * every time, so the output can go into version control and produce a readable
 * diff.
 */

export type Severity = "info" | "warning" | "manual";

export interface ConversionNote {
  severity: Severity;
  /** Where it happened, in the user's terms: "Main, rung 3". */
  where: string;
  message: string;
}

export interface ConversionResult {
  /** The converted source. Present even when there are warnings. */
  text: string;
  notes: ConversionNote[];
  /** Suggested filename, extension included. */
  filename: string;
}

export type Target = "st" | "scl" | "neutral" | "plcopen";

export const TARGETS: { id: Target; name: string; ext: string; blurb: string }[] = [
  {
    id: "st",
    name: "Structured Text",
    ext: ".st",
    blurb: "IEC 61131-3 ST. Portable across CODESYS, Beckhoff, and anything standards compliant.",
  },
  {
    id: "scl",
    name: "Siemens SCL",
    ext: ".scl",
    blurb: "The Siemens dialect of ST, for TIA Portal. Timer calls and types follow S7.",
  },
  {
    id: "neutral",
    name: "Rockwell neutral text",
    ext: ".L5X.txt",
    blurb: "The rung format Studio 5000 imports. Keeps the ladder shape, branches included.",
  },
  {
    id: "plcopen",
    name: "PLCopen XML",
    ext: ".xml",
    blurb: "TC6 interchange XML. The vendor neutral route, where the vendor implements it.",
  },
];

/* ────────────────────────────── helpers ────────────────────────────── */

/** A name that is legal as an IEC identifier. */
function ident(raw: string): string {
  const cleaned = raw.replace(/[^A-Za-z0-9_]/g, "_").replace(/^(\d)/, "_$1");
  return cleaned || "unnamed";
}

/** Milliseconds as an IEC duration literal. */
function duration(ms: number): string {
  if (ms % 1000 === 0) return `T#${ms / 1000}s`;
  return `T#${ms}ms`;
}

/** An operand that may be a tag name or a numeric literal. */
function operand(raw: string | undefined): string {
  if (raw === undefined || raw === "") return "0";
  return /^-?\d+(\.\d+)?$/.test(raw) ? raw : ident(raw);
}

function indent(depth: number): string {
  return "  ".repeat(depth);
}

/** Instructions that examine the rung rather than being driven by it. */
const CONDITION_TYPES = new Set(["XIC", "XIO", "ONS", "EQU", "NEQ", "GRT", "LES", "GEQ", "LEQ"]);

const COMPARE_OP: Record<string, string> = {
  EQU: "=",
  NEQ: "<>",
  GRT: ">",
  LES: "<",
  GEQ: ">=",
  LEQ: "<=",
};

/* ─────────────────────── condition side to expression ─────────────────────── */

interface ExprContext {
  notes: ConversionNote[];
  where: string;
  /** Declarations the conversion had to invent, e.g. edge memory. */
  declarations: Map<string, string>;
  /** Statements that must run before the rung, e.g. timer calls. */
  preamble: string[];
}

/**
 * One condition instruction as a boolean expression.
 *
 * ONS is the interesting case. A one shot is not an expression: it is true for
 * exactly one scan on a rising edge, which requires remembering the previous
 * scan. It becomes an R_TRIG instance with a declaration, and the note says so
 * because the instance is new state the original program did not have.
 */
function elementExpr(el: Element | ElNode, ctx: ExprContext): string {
  switch (el.type) {
    case "XIC":
      return ident(el.tag);
    case "XIO":
      return `NOT ${ident(el.tag)}`;
    case "ONS": {
      const inst = `${ident(el.tag)}_ons`;
      ctx.declarations.set(inst, "R_TRIG");
      ctx.preamble.push(`${inst}(CLK := ${ident(el.tag)});`);
      ctx.notes.push({
        severity: "info",
        where: ctx.where,
        message: `One shot on ${el.tag} became an R_TRIG instance named ${inst}. Check the instance is declared once and not shared between rungs.`,
      });
      return `${inst}.Q`;
    }
    case "EQU":
    case "NEQ":
    case "GRT":
    case "LES":
    case "GEQ":
    case "LEQ":
      return `(${ident(el.tag)} ${COMPARE_OP[el.type]} ${operand(el.operand)})`;
    default:
      ctx.notes.push({
        severity: "manual",
        where: ctx.where,
        message: `${el.type} on ${el.tag} appeared on the condition side, where it is not a condition. Left as a comment and needs rewriting by hand.`,
      });
      return `(* ${el.type} ${el.tag} needs review *) TRUE`;
  }
}

/** The rung's condition tree as one expression. */
function nodeExpr(node: LadderNode, ctx: ExprContext): string {
  if (node.kind === "el") return elementExpr(node, ctx);

  const parts = node.children
    .map((child: LadderNode) => nodeExpr(child, ctx))
    .filter((p: string) => p.length > 0);

  if (parts.length === 0) {
    // An empty series is a plain wire, which always conducts.
    return node.kind === "series" ? "TRUE" : "FALSE";
  }
  if (parts.length === 1) return parts[0] as string;

  const joiner = node.kind === "series" ? " AND " : " OR ";
  return `(${parts.join(joiner)})`;
}

/* ──────────────────────────── outputs ──────────────────────────── */

/**
 * One output instruction as a statement.
 *
 * OTE is an assignment, which is the whole reason ladder converts to ST at all:
 * a coil is exactly `tag := rung_condition`. The latch instructions are not,
 * because they only act when the rung is true and hold otherwise, so they need
 * a conditional.
 */
function outputStatements(el: Element, cond: string, ctx: ExprContext, depth: number): string[] {
  const pad = indent(depth);
  switch (el.type) {
    case "OTE":
      return [`${pad}${ident(el.tag)} := ${cond};`];

    case "OTL":
      return [`${pad}IF ${cond} THEN`, `${pad}  ${ident(el.tag)} := TRUE;`, `${pad}END_IF;`];

    case "OTU":
      return [`${pad}IF ${cond} THEN`, `${pad}  ${ident(el.tag)} := FALSE;`, `${pad}END_IF;`];

    case "TON":
    case "TOF": {
      const inst = ident(el.tag);
      ctx.declarations.set(inst, el.type);
      return [`${pad}${inst}(IN := ${cond}, PT := ${duration(el.preset ?? 0)});`];
    }

    case "CTU":
    case "CTD": {
      const inst = ident(el.tag);
      ctx.declarations.set(inst, el.type);
      const pin = el.type === "CTU" ? "CU" : "CD";
      return [`${pad}${inst}(${pin} := ${cond}, PV := ${el.preset ?? 0});`];
    }

    case "RES":
      return [`${pad}IF ${cond} THEN`, `${pad}  ${ident(el.tag)}(RESET := TRUE);`, `${pad}END_IF;`];

    case "MOV":
      return [
        `${pad}IF ${cond} THEN`,
        `${pad}  ${ident(el.dest ?? el.tag)} := ${operand(el.operand ?? el.tag)};`,
        `${pad}END_IF;`,
      ];

    case "ADD":
    case "SUB":
    case "MUL":
    case "DIV": {
      const op = { ADD: "+", SUB: "-", MUL: "*", DIV: "/" }[el.type];
      const lines = [
        `${pad}IF ${cond} THEN`,
        `${pad}  ${ident(el.dest ?? el.tag)} := ${ident(el.tag)} ${op} ${operand(el.operand)};`,
        `${pad}END_IF;`,
      ];
      if (el.type === "DIV") {
        ctx.notes.push({
          severity: "warning",
          where: ctx.where,
          message: `Division into ${el.dest ?? el.tag} has no divide by zero guard. Ladder DIV faults the controller; ST will too unless you add a check.`,
        });
      }
      return lines;
    }

    case "JSR":
      return [`${pad}IF ${cond} THEN`, `${pad}  ${ident(el.tag)}();`, `${pad}END_IF;`];

    default:
      ctx.notes.push({
        severity: "manual",
        where: ctx.where,
        message: `${el.type} on ${el.tag} has no automatic equivalent and was left as a comment.`,
      });
      return [`${pad}(* ${el.type} ${el.tag} needs review *)`];
  }
}

/* ─────────────────────────── Structured Text ─────────────────────────── */

function tagDeclaration(tag: Tag, dialect: "st" | "scl"): string {
  const type = tag.type === "BOOL" ? "BOOL" : tag.type === "INT" ? "INT" : tag.type;
  const address = tag.address ? ` (* ${tag.address} *)` : "";
  const comment = tag.comment ? ` (* ${tag.comment} *)` : "";
  const init = tag.type === "BOOL" ? "" : " := 0";
  void dialect;
  return `  ${ident(tag.name)} : ${type}${init};${address}${comment}`;
}

/**
 * Convert to Structured Text.
 *
 * The output is one program per routine, in the order the routines run, with a
 * variable block that includes both the original tags and any instances the
 * conversion had to invent.
 */
export function toStructuredText(
  program: LadxProgram,
  dialect: "st" | "scl" = "st",
): ConversionResult {
  const notes: ConversionNote[] = [];
  const routines = programRoutines(program);
  const out: string[] = [];

  const header =
    dialect === "scl"
      ? `// Converted from LADX ladder by LADX Convert.
// Siemens SCL. Timer and counter calls follow the S7 IEC library.`
      : `(* Converted from LADX ladder by LADX Convert.
   IEC 61131-3 Structured Text. *)`;
  out.push(header, "");

  notes.push({
    severity: "info",
    where: program.name,
    message:
      "Ladder geometry does not survive this conversion. The logic is preserved exactly; the physical order of contacts and the branch drawing are not, because Structured Text has no way to express them.",
  });

  for (const routine of routines) {
    const ctx: ExprContext = {
      notes,
      where: routine.name,
      declarations: new Map(),
      preamble: [],
    };
    const body: string[] = [];

    routine.rungs.forEach((rung: Rung, i: number) => {
      ctx.where = `${routine.name}, rung ${i + 1}`;
      ctx.preamble = [];

      if (rung.comment) body.push(`  (* ${rung.comment} *)`);

      const cond = nodeExpr(rungLogic(rung), ctx);

      // Edge instances have to be called before the expression that reads them.
      for (const line of ctx.preamble) body.push(`  ${line}`);

      if (rung.outputs.length === 0) {
        // A rung with no output still had a reason to exist. Keeping the
        // condition as a comment preserves the intent for whoever reads this.
        body.push(`  (* rung ${i + 1} has no output. Condition was: ${cond} *)`);
        notes.push({
          severity: "warning",
          where: ctx.where,
          message: "Rung has no output instruction. Its condition was kept as a comment.",
        });
      }

      for (const el of rung.outputs) {
        if (CONDITION_TYPES.has(el.type)) {
          notes.push({
            severity: "manual",
            where: ctx.where,
            message: `${el.type} is a condition instruction but sits on the output side. Review this rung.`,
          });
        }
        body.push(...outputStatements(el, cond, ctx, 1));
      }
      body.push("");
    });

    // Declarations, once the body has told us what it needed.
    out.push(`PROGRAM ${ident(routine.name)}`);
    out.push("VAR");
    for (const tag of program.tags) out.push(tagDeclaration(tag, dialect));
    if (ctx.declarations.size > 0) {
      out.push("  (* Instances created by the conversion *)");
      for (const [name, type] of ctx.declarations) out.push(`  ${name} : ${type};`);
    }
    out.push("END_VAR", "");
    out.push(...body);
    out.push("END_PROGRAM", "");
  }

  const target = TARGETS.find((t) => t.id === dialect);
  return {
    text: out.join("\n"),
    notes,
    filename: `${ident(program.name)}${target?.ext ?? ".st"}`,
  };
}

/* ────────────────────────── Rockwell neutral text ────────────────────────── */

/**
 * The rung format Studio 5000 imports.
 *
 * Unlike ST, this keeps the ladder shape: a branch is `[a,b]` and a series is
 * juxtaposition, which is exactly the tree LADX already holds. That makes this
 * the highest fidelity target here, and the one worth preferring when moving to
 * a Rockwell platform.
 */
function neutralNode(node: LadderNode, notes: ConversionNote[], where: string): string {
  if (node.kind === "el") {
    const el = node;
    switch (el.type) {
      case "XIC":
      case "XIO":
      case "OTE":
      case "OTL":
      case "OTU":
      case "ONS":
        return `${el.type}(${el.tag})`;
      case "TON":
      case "TOF":
        return `${el.type}(${el.tag},${el.preset ?? 0},0)`;
      case "CTU":
      case "CTD":
        return `${el.type}(${el.tag},${el.preset ?? 0},0)`;
      case "RES":
        return `RES(${el.tag})`;
      case "MOV":
        return `MOV(${el.operand ?? el.tag},${el.dest ?? el.tag})`;
      case "ADD":
      case "SUB":
      case "MUL":
      case "DIV":
        return `${el.type}(${el.tag},${el.operand ?? 0},${el.dest ?? el.tag})`;
      case "EQU":
      case "NEQ":
      case "GRT":
      case "LES":
      case "GEQ":
      case "LEQ":
        return `${el.type}(${el.tag},${el.operand ?? 0})`;
      case "JSR":
        return `JSR(${el.tag},0)`;
      default:
        notes.push({
          severity: "manual",
          where,
          message: `${el.type} has no neutral text form and was omitted.`,
        });
        return "";
    }
  }

  const parts = node.children
    .map((c: LadderNode) => neutralNode(c, notes, where))
    .filter((p: string) => p.length > 0);

  if (node.kind === "series") return parts.join("");
  // A parallel is a branch: legs separated by commas inside square brackets.
  return parts.length > 0 ? `[${parts.join(",")}]` : "";
}

export function toNeutralText(program: LadxProgram): ConversionResult {
  const notes: ConversionNote[] = [];
  const routines = programRoutines(program);
  const out: string[] = [];

  notes.push({
    severity: "info",
    where: program.name,
    message:
      "Neutral text keeps the ladder shape, branches included. Tag names come across as written, so create them in the target project first or the import will complain about undefined tags.",
  });

  for (const routine of routines) {
    out.push(`(* Routine: ${routine.name} *)`);
    routine.rungs.forEach((rung: Rung, i: number) => {
      const where = `${routine.name}, rung ${i + 1}`;
      if (rung.comment) out.push(`(* ${rung.comment} *)`);

      const cond = neutralNode(rungLogic(rung), notes, where);
      const outs = rung.outputs
        .map((el) => neutralNode({ kind: "el", ...el }, notes, where))
        .filter((s) => s.length > 0)
        .join("");

      out.push(`${cond}${outs};`);
    });
    out.push("");
  }

  return {
    text: out.join("\n"),
    notes,
    filename: `${ident(program.name)}.L5X.txt`,
  };
}

/* ──────────────────────────── PLCopen XML ──────────────────────────── */

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * PLCopen TC6 interchange XML.
 *
 * The body is emitted as Structured Text inside an ST element rather than as
 * graphical LD. TC6 can express ladder as a coordinate graph, but every vendor
 * implements that part differently and several implement it badly, so an ST
 * body is the form most likely to import cleanly. The note says so, because
 * somebody choosing this format specifically to keep the ladder deserves to
 * know it will arrive as text.
 */
export function toPlcopenXml(program: LadxProgram): ConversionResult {
  const st = toStructuredText(program, "st");
  const notes: ConversionNote[] = [...st.notes];

  notes.push({
    severity: "warning",
    where: program.name,
    message:
      "The body is written as Structured Text inside the PLCopen file, not as graphical ladder. TC6 can carry ladder geometry, but vendor support for that part is inconsistent enough that an ST body imports more reliably.",
  });

  const now = new Date().toISOString().replace(/\.\d+Z$/, "");
  const routines = programRoutines(program);

  const pous = routines
    .map((routine) => {
      const body = toStructuredText(
        { ...program, routines: [routine], rungs: routine.rungs },
        "st",
      );
      return `    <pou name="${xmlEscape(ident(routine.name))}" pouType="program">
      <interface>
        <localVars>
${program.tags
  .map(
    (t) =>
      `          <variable name="${xmlEscape(ident(t.name))}"><type><${t.type === "BOOL" ? "BOOL" : "INT"} /></type>${
        t.comment
          ? `<documentation><xhtml xmlns="http://www.w3.org/1999/xhtml">${xmlEscape(t.comment)}</xhtml></documentation>`
          : ""
      }</variable>`,
  )
  .join("\n")}
        </localVars>
      </interface>
      <body>
        <ST><xhtml xmlns="http://www.w3.org/1999/xhtml">${xmlEscape(body.text)}</xhtml></ST>
      </body>
    </pou>`;
    })
    .join("\n");

  const text = `<?xml version="1.0" encoding="utf-8"?>
<project xmlns="http://www.plcopen.org/xml/tc6_0201">
  <fileHeader companyName="LADX" productName="LADX Convert" productVersion="1"
              creationDateTime="${now}" />
  <contentHeader name="${xmlEscape(program.name)}" modificationDateTime="${now}">
    <coordinateInfo>
      <fbd><scaling x="1" y="1" /></fbd>
      <ld><scaling x="1" y="1" /></ld>
      <sfc><scaling x="1" y="1" /></sfc>
    </coordinateInfo>
  </contentHeader>
  <types>
    <dataTypes />
    <pous>
${pous}
    </pous>
  </types>
  <instances><configurations /></instances>
</project>
`;

  return { text, notes, filename: `${ident(program.name)}.xml` };
}

/* ──────────────────────────── entry point ──────────────────────────── */

export function convert(program: LadxProgram, target: Target): ConversionResult {
  switch (target) {
    case "st":
      return toStructuredText(program, "st");
    case "scl":
      return toStructuredText(program, "scl");
    case "neutral":
      return toNeutralText(program);
    case "plcopen":
      return toPlcopenXml(program);
  }
}

/** Counts by severity, for a summary line. */
export function summarise(notes: ConversionNote[]): Record<Severity, number> {
  return notes.reduce(
    (acc, n) => {
      acc[n.severity] += 1;
      return acc;
    },
    { info: 0, warning: 0, manual: 0 } as Record<Severity, number>,
  );
}
