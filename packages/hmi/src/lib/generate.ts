/**
 * Building a screen from a description.
 *
 * The thing people want from AI on an HMI tool, and the thing that is easy to
 * do in a way that looks impressive and is useless. A screen is not a picture:
 * every object on it is wired to a tag in a controller, and an object bound to
 * a tag that does not exist is worse than no object at all, because it draws
 * perfectly and reads nothing.
 *
 * So the model is never trusted with the parts that have to be right. It is
 * given the real tag table and asked for a layout; what comes back is put
 * through `normaliseScreen`, which mints the ids, clamps every rectangle to the
 * glass, checks every binding against the tag table it was given, and reports
 * what it had to change. Nothing reaches the document without going through it.
 *
 * `draftScreen` is the same feature without a model: a deterministic layout
 * straight off the tag table. It exists because a builder that only works when
 * somebody has connected a provider is a builder that does not work, and
 * because it is the honest baseline the generated version has to beat.
 */

import type { Tag } from "@ladx/studio";
import { compile } from "./expression";
import { getSymbol } from "./symbols";
import type {
  Action,
  AlarmCondition,
  AlarmDef,
  AlarmPriority,
  Animation,
  Binding,
  HmiTag,
  Rect,
  ScreenSize,
  TagRef,
  Widget,
  WidgetKind,
} from "./types";

/* ─────────────────────────── what the model may use ─────────────────────── */

const KINDS: WidgetKind[] = [
  "rect",
  "ellipse",
  "line",
  "text",
  "numeric",
  "lamp",
  "bar",
  "gauge",
  "multistate",
  "button",
  "toggle",
  "numericEntry",
  "slider",
  "selector",
  "trend",
  "alarmSummary",
  "alarmHistory",
  "alarmBanner",
  "alarmBadge",
  "alarmMarquee",
  "symbol",
];
const KIND_SET = new Set<string>(KINDS);

const PRIORITIES: AlarmPriority[] = ["critical", "high", "medium", "low", "journal"];
const CONDITIONS: AlarmCondition[] = ["digital", "hi", "hihi", "lo", "lolo", "deviation", "roc"];

/** Timer and counter members the ladder actually publishes. */
const MEMBERS = new Set(["DN", "TT", "EN", "ACC", "PRE"]);

/** The smallest object worth drawing. Below this a widget is an accident. */
const MIN_SIZE = 8;

/* ──────────────────────────────── context ───────────────────────────────── */

export interface GenContext {
  /** The ladder program's tags. The only PLC tags that exist. */
  plcTags: Tag[];
  /** Tags the document already owns. */
  hmiTags: HmiTag[];
  /** The glass. Nothing may be placed outside it. */
  size: ScreenSize;
  /** What is already on the screen, for placement and for extend context. */
  existing: Widget[];
  /** Slugs a "go to screen" action may name. */
  screenSlugs: string[];
  /** Alarms already defined, so the model does not propose them twice. */
  alarms: AlarmDef[];
  mode: "replace" | "extend";
}

/**
 * Asking for a screen.
 *
 * The context travels with the request because the editor is the only thing
 * that knows it: which screen is open, how big the glass is, what is on it
 * already. The host does the talking, so the web can reach a provider over
 * HTTP and the desktop can reach Ollama over IPC without either shape leaking
 * into the editor.
 */
export interface GenerateRequest {
  prompt: string;
  ctx: GenContext;
  /**
   * Which model to ask, or undefined to let the host choose.
   *
   * Chosen in the assistant rather than in a settings page, because which model
   * answered is the single biggest factor in whether a generated screen is any
   * good, and burying the choice means somebody concludes the feature is bad
   * when what they have is a bad model.
   */
  model?: string | null;
  /** Aborts when the person presses Stop. */
  signal?: AbortSignal;
}

export type GenerateScreen = (
  req: GenerateRequest,
) => Promise<GeneratedScreen & { model?: string }>;

export interface GeneratedScreen {
  widgets: Widget[];
  /** New HMI-owned tags the layout needs. Merged by name, never replacing. */
  hmiTags: HmiTag[];
  /** New alarm definitions. */
  alarms: AlarmDef[];
  background?: string;
  notes?: string;
  /** Everything that was repaired, dropped or looks wrong. Always shown. */
  problems: string[];
}

/* ─────────────────────────────── the prompt ─────────────────────────────── */

/**
 * A tag as the model should see it.
 *
 * The device kind matters more than it looks: it is how the model knows that
 * `Stop` is a normally-closed button, which is the difference between a stop
 * button that stops the machine and one that starts it.
 */
function describeTag(t: Tag): string {
  const bits: string[] = [t.type];
  if (t.isInput) bits.push("input");
  if (t.isOutput) bits.push("output");
  if (t.device) bits.push(t.device);
  if (t.type === "TIMER" || t.type === "COUNTER") bits.push(`preset ${t.preset ?? 0}`);
  if (t.comment) bits.push(`"${t.comment}"`);
  return `  ${t.name} (${bits.join(", ")})`;
}

export function screenSystemPrompt(): string {
  return [
    "You lay out operator screens for an industrial HMI.",
    "",
    "Reply with ONE JSON object and nothing else. No prose, no code fence.",
    "",
    "{",
    '  "background": "#RRGGBB",',
    '  "hmiTags": [{ "name": "", "type": "BOOL|INT", "value": 0, "comment": "" }],',
    '  "widgets": [ ... ],',
    '  "alarms":  [ ... ],',
    '  "notes": "what you assumed, in one or two sentences"',
    "}",
    "",
    "A widget:",
    '  { "kind": "", "name": "", "x": 0, "y": 0, "w": 0, "h": 0,',
    '    "fill": "#RRGGBB", "stroke": "#RRGGBB", "text": "", "units": "",',
    '    "decimals": 0, "min": 0, "max": 100, "symbol": "",',
    '    "value": <binding>, "animations": [...], "onPress": [...], "onRelease": [...] }',
    "",
    `  kind is one of: ${KINDS.join(", ")}.`,
    "  x, y, w, h are whole pixels on the glass, origin top left.",
    "",
    "A binding is one of:",
    '  { "plc": "TagName" }     read the controller tag table',
    '  { "hmi": "TagName" }     read a tag this screen owns',
    '  { "const": 1 }           a literal',
    '  { "expr": "{plc:Level} > 80" }   a comparison, for an animation',
    "",
    "In an expression a tag is written in braces: {plc:Level}, {hmi:Setpoint},",
    "or {Level} to look in the controller first. There is no dot access and no",
    "JavaScript: the operators are + - * / % < > <= >= == != && || ! and ?:, and",
    "the functions are abs, round, floor, ceil, sqrt, min, max, clamp(v,lo,hi)",
    "and scale(v,inLo,inHi,outLo,outHi). Writing plc.Level is a syntax error.",
    "",
    "An animation changes the base drawing when a condition holds. Evaluated in",
    "order, last match wins:",
    '  { "when": <binding>, "fill": "#RRGGBB", "hidden": false, "opacity": 1 }',
    "",
    "An action:",
    '  { "kind": "setTag", "source": "plc", "tag": "", "value": <binding> }',
    '  { "kind": "toggleTag", "source": "plc", "tag": "" }',
    '  { "kind": "goToScreen", "slug": "" }',
    '  { "kind": "ackAll" }',
    "",
    "An alarm:",
    '  { "source": "plc", "tag": "", "condition": "digital|hi|hihi|lo|lolo",',
    '    "setpoint": 0, "deadband": 0, "onDelay": 0, "trueIsAlarm": true,',
    '    "priority": "critical|high|medium|low|journal", "message": "", "response": "" }',
    "",
    "The things that make a screen correct, and that get built wrong:",
    "",
    "- Every tag you name must be in the tag table you were given. You cannot",
    "  invent a controller tag: the screen binds to a real program, and a widget",
    "  bound to a name that is not there draws perfectly and reads nothing.",
    "  If you need a value the controller does not have, declare an hmiTag.",
    "- A push button on glass is MOMENTARY. onPress writes 1, onRelease writes 0.",
    "  A button with only an onPress latches the tag on and the machine never",
    "  stops. This is the single commonest way an HMI is built wrong.",
    "- A STOP button's tag is wired NORMALLY CLOSED: it reads 1 when healthy and",
    "  the ladder examines it with XIC. So a stop button on glass writes ZERO on",
    "  press and 1 on release. Writing 1 on press starts the machine. Any tag",
    "  described as PUSHBUTTON_NC follows this rule.",
    "- Timer and counter values are MEMBERS, not the tag. A progress bar for a",
    "  five second timer binds to T1.ACC with max T1.PRE, and a lamp for the same",
    "  timer binds to T1.DN. Binding to T1 itself reads zero forever.",
    "- ISA-101: the ground is quiet and colour means deviation. Use a light grey",
    "  background (#E8EAEC) and greys for pipework, vessels and static text.",
    "  Keep saturated red and amber for alarm states only, so that when something",
    "  is wrong it is the only coloured thing on the glass.",
    "- Anything an operator must not miss goes at the top. An alarmBanner across",
    "  the full width, about 30px tall, is normal and is worth including on any",
    "  screen with alarms on it.",
    "- Nothing may be placed outside the glass, and objects must not overlap",
    "  unless one is deliberately a background for the other. Leave 8px gutters.",
    "- Label everything. A numeric with no caption beside it is a number nobody",
    "  can act on. Use text widgets for captions and units for the engineering",
    "  unit, rather than baking the unit into the caption.",
    "",
    "Do not claim a safety function. A stop button on glass is not an emergency",
    "stop: an E-stop is a hardwired device and cannot be drawn. If asked for one,",
    "lay out an indicator for the E-stop's status and say so in notes.",
  ].join("\n");
}

export function screenUserPrompt(ctx: GenContext, prompt: string): string {
  const out: string[] = [];

  out.push(`The glass is ${ctx.size.width} by ${ctx.size.height} pixels.`);
  out.push("");

  if (ctx.plcTags.length === 0) {
    out.push("The controller program has no tags yet, so bind nothing to `plc`.");
    out.push("Declare any values you need as hmiTags.");
  } else {
    out.push("The controller program has these tags, and only these:");
    out.push(ctx.plcTags.map(describeTag).join("\n"));
  }

  if (ctx.hmiTags.length) {
    out.push("");
    out.push("The screen already owns these tags:");
    out.push(ctx.hmiTags.map((t) => `  ${t.name} (${t.type})`).join("\n"));
  }

  if (ctx.screenSlugs.length) {
    out.push("");
    out.push(`Screens a goToScreen may name: ${ctx.screenSlugs.join(", ")}.`);
  }

  if (ctx.alarms.length) {
    out.push("");
    out.push(`${ctx.alarms.length} alarms are already defined. Do not repeat them.`);
  }

  if (ctx.mode === "extend" && ctx.existing.length) {
    const bottom = ctx.existing.reduce((y, w) => Math.max(y, w.rect.y + w.rect.h), 0);
    out.push("");
    out.push(
      `The screen already has ${ctx.existing.length} objects, occupying down to y=${bottom}.`,
    );
    out.push(
      `Return only the NEW objects, placed below y=${bottom + 8}, and do not repeat what is there.`,
    );
  } else {
    out.push("");
    out.push("The screen is empty. Lay out the whole thing.");
  }

  out.push("");
  out.push(prompt);
  return out.join("\n");
}

/* ─────────────────────────────── the parser ─────────────────────────────── */

/**
 * The first JSON object in a block of text.
 *
 * Models wrap JSON in a code fence, or open with a sentence, whatever the
 * instructions said. Scanning for the first balanced object costs nothing and
 * removes the commonest reason a good answer is thrown away. String-aware, so
 * a brace inside a caption does not end the object early.
 */
export function firstJsonObject(text: string): unknown {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function num(v: unknown, fallback: number): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  if (typeof v === "boolean") return v ? 1 : 0;
  return fallback;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
}

/** A colour, or nothing. Anything that is not a colour is dropped silently. */
function colour(v: unknown): string | undefined {
  const s = str(v);
  if (!s) return undefined;
  if (/^#[0-9a-fA-F]{3}$|^#[0-9a-fA-F]{6}$|^#[0-9a-fA-F]{8}$/.test(s)) return s;
  if (/^(rgb|hsl)a?\([0-9.,%\s/-]+\)$/.test(s)) return s;
  if (/^[a-z]{3,20}$/.test(s)) return s;
  return undefined;
}

/* ──────────────────────────── tag name repair ───────────────────────────── */

/**
 * A tag name as it would be typed by somebody who was nearly right.
 *
 * `Motor_Run`, `motorrun` and `MotorRun` are the same tag to everybody except
 * a string comparison, and a model asked for forty widgets will get the
 * punctuation wrong on one of them. Case and separators are dropped for
 * matching only: a repair is recorded and reported, never silent, and it only
 * fires when exactly one real tag matches, so it can never pick between two.
 */
function fold(name: string): string {
  return name.toLowerCase().replace(/[_\s-]/g, "");
}

class TagIndex {
  private plc = new Map<string, string>();
  private hmi = new Map<string, string>();
  private plcAmbiguous = new Set<string>();
  private hmiAmbiguous = new Set<string>();
  /**
   * Every real name, exactly as declared.
   *
   * Kept beside the folded map rather than derived from it. A program with
   * both `Level` and `level` folds them to one key and marks it ambiguous, and
   * an exact hit read off the folded map would then fail to find either, which
   * is the one case where there is nothing to guess about.
   */
  private plcExact = new Set<string>();
  private hmiExact = new Set<string>();
  readonly plcTypes = new Map<string, Tag["type"]>();

  constructor(plcTags: Tag[], hmiTags: HmiTag[]) {
    for (const t of plcTags) {
      this.plcTypes.set(t.name, t.type);
      this.plcExact.add(t.name);
      const k = fold(t.name);
      if (this.plc.has(k) && this.plc.get(k) !== t.name) this.plcAmbiguous.add(k);
      else this.plc.set(k, t.name);
    }
    for (const t of hmiTags) {
      this.hmiExact.add(t.name);
      const k = fold(t.name);
      if (this.hmi.has(k) && this.hmi.get(k) !== t.name) this.hmiAmbiguous.add(k);
      else this.hmi.set(k, t.name);
    }
  }

  /** Add a tag the same generation declared, so later widgets can bind to it. */
  addHmi(name: string) {
    this.hmiExact.add(name);
    const k = fold(name);
    if (!this.hmi.has(k)) this.hmi.set(k, name);
  }

  /**
   * The real name for what the model wrote, or null.
   *
   * Members are resolved against the base tag and reattached, so `t1.dn`
   * becomes `T1.DN` rather than being rejected for the case of two letters.
   */
  resolve(source: "plc" | "hmi", written: string): { name: string; repaired: boolean } | null {
    const dot = written.indexOf(".");
    const base = dot === -1 ? written : written.slice(0, dot);
    const member = dot === -1 ? null : written.slice(dot + 1).toUpperCase();

    if (member !== null) {
      // Only controller tags have members, and only these ones.
      if (source !== "plc" || !MEMBERS.has(member)) return null;
    }

    const map = source === "plc" ? this.plc : this.hmi;
    const ambiguous = source === "plc" ? this.plcAmbiguous : this.hmiAmbiguous;

    // An exact hit first, so a program with both `Level` and `level` still
    // binds each to itself.
    const exact = (source === "plc" ? this.plcExact : this.hmiExact).has(base);
    const key = fold(base);
    const real = exact ? base : ambiguous.has(key) ? undefined : map.get(key);
    if (!real) return null;

    if (member !== null) {
      const type = this.plcTypes.get(real);
      if (type !== "TIMER" && type !== "COUNTER") return null;
      return {
        name: `${real}.${member}`,
        repaired: real !== base || member !== written.slice(dot + 1),
      };
    }
    return { name: real, repaired: real !== base };
  }
}

/* ────────────────────────────── normalising ─────────────────────────────── */

interface Repairs {
  problems: string[];
  index: TagIndex;
  ctx: GenContext;
}

/**
 * One binding, checked against the tag table.
 *
 * Returns undefined for anything that cannot be made to point at a real tag.
 * The widget keeps its shape and loses its value, which is visible in the
 * editor and in the problem list, rather than silently reading a name that
 * does not exist.
 */
function readBinding(raw: unknown, where: string, r: Repairs): Binding | undefined {
  if (raw === null || raw === undefined) return undefined;

  // A bare number or string is a literal, which is what a model writes when it
  // means one and the wrapper felt redundant.
  if (typeof raw === "number" || typeof raw === "boolean") return { kind: "const", value: raw };
  if (typeof raw === "string") {
    // A bare string is ambiguous: a tag name if it is one, otherwise a caption.
    // Which table it came from has to be carried through, or a screen tag
    // resolves and is then labelled `plc`, which reads nothing at all.
    const plc = r.index.resolve("plc", raw);
    if (plc) return { kind: "plc", tag: plc.name };
    const hmi = r.index.resolve("hmi", raw);
    if (hmi) return { kind: "hmi", tag: hmi.name };
    return { kind: "const", value: raw };
  }
  if (typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;

  // Both the compact form the prompt asks for and the document's own tagged
  // form, because a model shown one shape will occasionally answer in the other.
  const kind = str(o.kind);
  if (kind === "const") return { kind: "const", value: (o.value as never) ?? 0 };
  if (kind === "plc" || kind === "hmi") return bindTag(kind, o.tag, where, r);
  if (kind === "expr") return bindExpr(o.source, where, r);

  if ("plc" in o) return bindTag("plc", o.plc, where, r);
  if ("hmi" in o) return bindTag("hmi", o.hmi, where, r);
  if ("expr" in o) return bindExpr(o.expr, where, r);
  if ("const" in o) return { kind: "const", value: (o.const as never) ?? 0 };
  if ("value" in o) return { kind: "const", value: (o.value as never) ?? 0 };
  return undefined;
}

function bindTag(
  source: "plc" | "hmi",
  rawName: unknown,
  where: string,
  r: Repairs,
): Binding | undefined {
  const name = str(rawName);
  if (!name) return undefined;
  const hit = r.index.resolve(source, name);
  if (!hit) {
    r.problems.push(`${where} was bound to ${name}, which is not in the tag table. Left unbound.`);
    return undefined;
  }
  if (hit.repaired) r.problems.push(`${where}: ${name} matched the tag ${hit.name}.`);
  return { kind: source, tag: hit.name };
}

/**
 * Rewrite the tag references inside an expression against the real table.
 *
 * Walks the source the way the lexer does rather than with a pattern, so a
 * brace inside a string literal is left alone. Every `{Tag}`, `{plc:Tag}` and
 * `{hmi:Tag}` is resolved; a name that is nearly right is corrected in place,
 * and one that matches nothing is reported, because an expression referring to
 * a tag that does not exist evaluates to an error every scan and shows as a
 * blank widget with no indication why.
 */
function repairExprTags(
  src: string,
  r: Repairs,
  where: string,
): { src: string; missing: string[] } {
  const missing: string[] = [];
  let out = "";
  let i = 0;
  while (i < src.length) {
    const c = src[i] as string;
    if (c === '"' || c === "'") {
      const end = src.indexOf(c, i + 1);
      if (end === -1) {
        out += src.slice(i);
        break;
      }
      out += src.slice(i, end + 1);
      i = end + 1;
      continue;
    }
    if (c === "{") {
      const end = src.indexOf("}", i);
      if (end === -1) {
        out += src.slice(i);
        break;
      }
      const raw = src.slice(i + 1, end).trim();
      const colon = raw.indexOf(":");
      const prefix = colon === -1 ? "" : raw.slice(0, colon).trim().toLowerCase();
      const name = colon === -1 ? raw : raw.slice(colon + 1).trim();
      const source: "plc" | "hmi" = prefix === "hmi" ? "hmi" : "plc";
      // An unqualified reference reads the controller first and the screen's
      // own tags second, which is what the runtime does, so resolve it the
      // same way round rather than assuming one table.
      const hit =
        prefix === ""
          ? (r.index.resolve("plc", name) ?? r.index.resolve("hmi", name))
          : r.index.resolve(source, name);
      if (!hit) {
        missing.push(name);
        out += src.slice(i, end + 1);
      } else {
        if (hit.repaired) r.problems.push(`${where}: ${name} matched the tag ${hit.name}.`);
        out += prefix === "" ? `{${hit.name}}` : `{${prefix}:${hit.name}}`;
      }
      i = end + 1;
      continue;
    }
    out += c;
    i++;
  }
  return { src: out, missing };
}

/**
 * An expression binding, checked by compiling it and by resolving its tags.
 *
 * The parser is already there and already refuses everything that is not an
 * expression, so the syntax check costs one call. The tag check matters more:
 * an expression is the one binding whose tag names are buried in a string,
 * where nothing else in the editor would ever notice they are wrong.
 */
function bindExpr(rawSource: unknown, where: string, r: Repairs): Binding | undefined {
  const written = str(rawSource);
  if (!written) return undefined;

  const { src, missing } = repairExprTags(written, r, where);
  if (missing.length) {
    r.problems.push(
      `${where}: the expression reads ${missing.join(", ")}, which ${
        missing.length === 1 ? "is not a tag" : "are not tags"
      }. Left unbound.`,
    );
    return undefined;
  }
  try {
    compile(src);
  } catch {
    r.problems.push(`${where}: could not read the expression "${written}". Left unbound.`);
    return undefined;
  }
  return { kind: "expr", source: src };
}

function readTagRef(o: Record<string, unknown>, where: string, r: Repairs): TagRef | undefined {
  const source = str(o.source) === "hmi" ? "hmi" : "plc";
  const name = str(o.tag) ?? str(o.target) ?? str(o.name);
  if (!name) return undefined;
  const hit = r.index.resolve(source, name);
  if (!hit) {
    // A model told to write to `plc` will name an HMI tag it declared itself,
    // and the other way round. Try the other table before giving up.
    const other = r.index.resolve(source === "plc" ? "hmi" : "plc", name);
    if (other) return { source: source === "plc" ? "hmi" : "plc", tag: other.name };
    r.problems.push(`${where} writes to ${name}, which is not in the tag table. Dropped.`);
    return undefined;
  }
  // A member is a read, never a write: nothing may store into T1.DN.
  if (hit.name.includes(".")) {
    r.problems.push(`${where} writes to ${hit.name}, which is read only. Dropped.`);
    return undefined;
  }
  return { source, tag: hit.name };
}

function readActions(raw: unknown, where: string, r: Repairs): Action[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: Action[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const kind = str(o.kind);
    switch (kind) {
      case "setTag": {
        const target = readTagRef(o, where, r);
        if (!target) break;
        const value = readBinding(o.value ?? 1, where, r) ?? { kind: "const" as const, value: 1 };
        out.push({ kind: "setTag", target, value });
        break;
      }
      case "toggleTag": {
        const target = readTagRef(o, where, r);
        if (target) out.push({ kind: "toggleTag", target });
        break;
      }
      case "goToScreen": {
        const slug = str(o.slug);
        if (!slug) break;
        if (!r.ctx.screenSlugs.includes(slug)) {
          r.problems.push(`${where} navigates to a screen called ${slug}, which does not exist.`);
          break;
        }
        out.push({ kind: "goToScreen", slug });
        break;
      }
      case "ackAll":
        out.push({ kind: "ackAll" });
        break;
      case "ackAlarm":
        out.push({ kind: "ackAlarm", alarm: str(o.alarm) });
        break;
      case "shelveAlarm": {
        const alarm = str(o.alarm);
        if (alarm) out.push({ kind: "shelveAlarm", alarm, minutes: num(o.minutes, 30) });
        break;
      }
      default:
        break;
    }
  }
  return out.length ? out : undefined;
}

function readAnimations(raw: unknown, where: string, r: Repairs, seq: () => string): Animation[] {
  if (!Array.isArray(raw)) return [];
  const out: Animation[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const when = readBinding(o.when ?? o.condition ?? o.value, `${where} animation`, r);
    if (!when) continue;
    const a: Animation = { id: seq(), when };
    const f = colour(o.fill);
    const s = colour(o.stroke);
    if (f) a.fill = f;
    if (s) a.stroke = s;
    if (typeof o.hidden === "boolean") a.hidden = o.hidden;
    if (o.opacity !== undefined) a.opacity = Math.max(0, Math.min(1, num(o.opacity, 1)));
    out.push(a);
  }
  return out;
}

/**
 * A rectangle on the glass.
 *
 * Clamped rather than rejected. A model that puts a trend 40px off the right
 * edge has produced a usable screen with one thing to nudge, and throwing the
 * whole answer away over it would be the wrong trade.
 */
function readRect(o: Record<string, unknown>, size: ScreenSize, fallback: Rect): Rect {
  const src = (o.rect && typeof o.rect === "object" ? o.rect : o) as Record<string, unknown>;
  const w = Math.max(
    MIN_SIZE,
    Math.min(size.width, Math.round(num(src.w ?? src.width, fallback.w))),
  );
  const h = Math.max(
    MIN_SIZE,
    Math.min(size.height, Math.round(num(src.h ?? src.height, fallback.h))),
  );
  const x = Math.max(0, Math.min(size.width - w, Math.round(num(src.x ?? src.left, fallback.x))));
  const y = Math.max(0, Math.min(size.height - h, Math.round(num(src.y ?? src.top, fallback.y))));
  return { x, y, w, h };
}

function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/**
 * Everything the model returned, made safe to put in a document.
 *
 * Never throws. A generation that produced nothing usable comes back as an
 * empty widget list and a problem saying so, because an editor that crashes on
 * a bad answer is worse than one that says it could not do it.
 */
export function normaliseScreen(raw: unknown, ctx: GenContext): GeneratedScreen {
  const problems: string[] = [];
  const index = new TagIndex(ctx.plcTags, ctx.hmiTags);
  const r: Repairs = { problems, index, ctx };

  if (!raw || typeof raw !== "object") {
    return {
      widgets: [],
      hmiTags: [],
      alarms: [],
      problems: ["The model did not return a screen."],
    };
  }
  const root = raw as Record<string, unknown>;

  let n = 0;
  const stamp = Date.now().toString(36);
  const seq = () => `g${stamp}${(n++).toString(36)}`;

  /* ── tags the screen declares for itself, first: widgets may bind to them ── */

  const hmiTags: HmiTag[] = [];
  const existingNames = new Set(ctx.hmiTags.map((t) => t.name));
  if (Array.isArray(root.hmiTags)) {
    for (const item of root.hmiTags) {
      if (!item || typeof item !== "object") continue;
      const o = item as Record<string, unknown>;
      const name = str(o.name);
      // A tag name has to be usable in an expression, which is the same rule
      // the expression tokeniser applies. Anything else is dropped rather than
      // stored as a tag nothing can reference.
      if (!name || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) continue;
      if (existingNames.has(name)) continue;
      if (index.resolve("plc", name)) {
        problems.push(`The screen tried to declare ${name}, which the controller already has.`);
        continue;
      }
      existingNames.add(name);
      const type = str(o.type)?.toUpperCase();
      hmiTags.push({
        name,
        type:
          type === "BOOL" || type === "INT" || type === "TIMER" || type === "COUNTER"
            ? (type as HmiTag["type"])
            : "INT",
        value: num(o.value, 0),
        comment: str(o.comment),
      });
      index.addHmi(name);
    }
  }

  /* ─────────────────────────────── widgets ─────────────────────────────── */

  const widgets: Widget[] = [];
  const rawWidgets = Array.isArray(root.widgets)
    ? root.widgets
    : Array.isArray(root.objects)
      ? root.objects
      : [];

  if (rawWidgets.length === 0) problems.push("The model returned no objects.");

  let z = ctx.existing.reduce((m, w) => Math.max(m, w.z ?? 0), 0);

  for (const item of rawWidgets) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const kindRaw = str(o.kind) ?? str(o.type);
    if (!kindRaw || !KIND_SET.has(kindRaw)) {
      if (kindRaw) problems.push(`Dropped an object of an unknown kind, "${kindRaw}".`);
      continue;
    }
    const kind = kindRaw as WidgetKind;

    const label = `${str(o.name) ?? str(o.text) ?? kind}`;
    const rect = readRect(o, ctx.size, { x: 8, y: 8, ...defaultSize(kind) });

    const w: Widget = { id: seq(), kind, rect, z: ++z };

    const name = str(o.name);
    if (name) w.name = name;
    const text = str(o.text) ?? str(o.caption) ?? str(o.label);
    if (text) w.text = text;

    const fill = colour(o.fill);
    const stroke = colour(o.stroke);
    if (fill) w.fill = fill;
    if (stroke) w.stroke = stroke;
    if (o.strokeWidth !== undefined) w.strokeWidth = Math.max(0, num(o.strokeWidth, 1));
    if (o.radius !== undefined) w.radius = Math.max(0, num(o.radius, 0));
    if (o.fontSize !== undefined) w.fontSize = Math.max(6, num(o.fontSize, 13));
    if (o.decimals !== undefined) w.decimals = Math.max(0, Math.min(6, num(o.decimals, 0)));
    const units = str(o.units);
    if (units) w.units = units;
    if (o.min !== undefined) w.min = num(o.min, 0);
    if (o.max !== undefined) w.max = num(o.max, 100);
    if (typeof o.rotation === "number") w.rotation = num(o.rotation, 0);

    if (kind === "symbol") {
      const id = str(o.symbol) ?? str(o.symbolId);
      if (!id || !getSymbol(id)) {
        problems.push(
          id
            ? `There is no symbol called "${id}", so ${label} was drawn as a box.`
            : `A symbol object named no symbol, so ${label} was drawn as a box.`,
        );
        w.kind = "rect";
      } else {
        w.symbol = id;
      }
    }

    const value = readBinding(o.value ?? o.tag ?? o.binding, label, r);
    if (value) w.value = value;

    const animations = readAnimations(o.animations, label, r, seq);
    if (animations.length) w.animations = animations;

    const onPress = readActions(o.onPress ?? o.actions, label, r);
    const onRelease = readActions(o.onRelease, label, r);
    if (onPress) w.onPress = onPress;
    if (onRelease) w.onRelease = onRelease;

    if (o.config && typeof o.config === "object") w.config = o.config as Record<string, unknown>;

    checkButton(w, label, r);
    widgets.push(w);
  }

  /* ── one uniform shift, so an extend does not land on what is there ── */

  if (ctx.mode === "extend" && widgets.length && ctx.existing.length) {
    const hits = widgets.some((w) => ctx.existing.some((e) => intersects(w.rect, e.rect)));
    if (hits) {
      const top = Math.min(...widgets.map((w) => w.rect.y));
      const bottom = Math.max(...widgets.map((w) => w.rect.y + w.rect.h));
      const free = Math.max(...ctx.existing.map((e) => e.rect.y + e.rect.h)) + 8;
      const delta = free - top;
      if (delta > 0 && bottom + delta <= ctx.size.height) {
        for (const w of widgets) w.rect.y += delta;
      } else {
        problems.push(
          "The new objects overlap what was already on the screen, and there was no room below. Move them, or put them on a new screen.",
        );
      }
    }
  }

  /* ─────────────────────────────── alarms ──────────────────────────────── */

  const alarms: AlarmDef[] = [];
  if (Array.isArray(root.alarms)) {
    for (const item of root.alarms) {
      if (!item || typeof item !== "object") continue;
      const o = item as Record<string, unknown>;
      const target = readTagRef(o, "An alarm", r);
      if (!target) continue;
      const condition = str(o.condition)?.toLowerCase();
      const message = str(o.message) ?? `${target.tag} alarm`;
      const priority = str(o.priority)?.toLowerCase();
      const def: AlarmDef = {
        id: seq(),
        target,
        condition: CONDITIONS.includes(condition as AlarmCondition)
          ? (condition as AlarmCondition)
          : "digital",
        priority: PRIORITIES.includes(priority as AlarmPriority)
          ? (priority as AlarmPriority)
          : "medium",
        message,
        enabled: true,
      };
      if (def.condition !== "digital") def.setpoint = num(o.setpoint, 0);
      if (o.deadband !== undefined) def.deadband = Math.abs(num(o.deadband, 0));
      if (o.onDelay !== undefined) def.onDelay = Math.max(0, num(o.onDelay, 0));
      if (def.condition === "digital") def.trueIsAlarm = o.trueIsAlarm !== false;
      const response = str(o.response);
      if (response) def.response = response;

      // The same condition on the same tag twice is a duplicate alarm, which
      // is how a list becomes one nobody reads.
      const dup = [...ctx.alarms, ...alarms].some(
        (a) =>
          a.target.source === def.target.source &&
          a.target.tag === def.target.tag &&
          a.condition === def.condition,
      );
      if (dup) continue;
      alarms.push(def);
    }
  }

  return {
    widgets,
    hmiTags,
    alarms,
    background: colour(root.background),
    notes: str(root.notes),
    problems,
  };
}

/**
 * The stop-button check.
 *
 * A normally closed stop tag reads 1 when healthy, so a button that writes 1
 * on press does nothing at all and one that writes 0 stops the machine. It is
 * exactly backwards from what it looks like, which is why it is worth checking
 * rather than trusting, and why a momentary button with no release handler is
 * called out even when the value is right.
 */
function checkButton(w: Widget, label: string, r: Repairs) {
  if (w.kind !== "button" || !w.onPress) return;
  for (const a of w.onPress) {
    if (a.kind !== "setTag" || a.target.source !== "plc") continue;
    const tag = r.ctx.plcTags.find((t) => t.name === a.target.tag);
    const pressed = a.value.kind === "const" ? Number(a.value.value) : null;
    if (tag?.device === "PUSHBUTTON_NC" && pressed === 1) {
      r.problems.push(
        `${label} writes 1 to ${tag.name}, which is a normally closed button: pressing it would release the stop rather than apply it. It should write 0 on press and 1 on release.`,
      );
    }
    if (pressed !== null && !w.onRelease) {
      r.problems.push(
        `${label} writes ${pressed} to ${a.target.tag} on press and never writes back, so the tag latches. Add a release action.`,
      );
    }
  }
}

/* ────────────────────────── the deterministic draft ─────────────────────── */

export function defaultSize(kind: WidgetKind): { w: number; h: number } {
  switch (kind) {
    case "lamp":
      return { w: 32, h: 32 };
    // Sizes chosen so an object dropped on the panel is immediately the right
    // shape. A tank that arrives square has to be resized before it reads as a
    // tank, and every one of those is a small tax on drawing a screen.
    case "tank":
      return { w: 90, h: 150 };
    case "thermometer":
      return { w: 44, h: 150 };
    case "statusStack":
      return { w: 28, h: 90 };
    case "pipe":
      return { w: 180, h: 24 };
    case "xyChart":
      return { w: 260, h: 180 };
    case "table":
      return { w: 260, h: 140 };
    case "clock":
      return { w: 150, h: 52 };
    case "steps":
      return { w: 320, h: 32 };
    case "radioGroup":
      return { w: 180, h: 32 };
    case "checkbox":
      return { w: 150, h: 28 };
    case "textEntry":
      return { w: 160, h: 30 };
    case "faceplate":
      return { w: 140, h: 90 };
    case "bar":
      return { w: 40, h: 120 };
    case "gauge":
      return { w: 120, h: 120 };
    case "trend":
      return { w: 280, h: 140 };
    case "alarmSummary":
    case "alarmHistory":
      return { w: 320, h: 120 };
    case "alarmBanner":
      return { w: 400, h: 30 };
    case "alarmBadge":
      return { w: 64, h: 48 };
    case "alarmMarquee":
      return { w: 360, h: 26 };
    case "text":
      return { w: 120, h: 24 };
    case "numeric":
    case "numericEntry":
      return { w: 96, h: 28 };
    case "line":
      return { w: 120, h: 8 };
    case "button":
    case "toggle":
      return { w: 96, h: 36 };
    default:
      return { w: 96, h: 72 };
  }
}

/** ISA-101: the ground is quiet, and these are the only colours used. */
const INK = "#3A464F";
const LABEL = "#5A6670";
const PLATE = "rgb(var(--ink-200))";
const LIVE = "rgb(var(--teal-400))";

/**
 * A screen laid out straight from the tag table, with no model involved.
 *
 * Every tag gets the object it should have: an output gets a lamp, an input
 * gets a control that writes it the right way round, a timer gets a bar on its
 * accumulated value against its own preset. It is not a mimic and it does not
 * pretend to be one, but it is a working screen for the program that is open,
 * every binding on it is real, and it takes no provider, no key and no network.
 */
export function draftScreen(ctx: GenContext): GeneratedScreen {
  const widgets: Widget[] = [];
  const problems: string[] = [];
  let n = 0;
  const stamp = Date.now().toString(36);
  const seq = () => `d${stamp}${(n++).toString(36)}`;
  let z = 0;

  const add = (w: Omit<Widget, "id" | "z">): Widget => {
    const full = { ...w, id: seq(), z: ++z } as Widget;
    widgets.push(full);
    return full;
  };

  const pad = 12;
  const width = ctx.size.width;

  add({
    kind: "text",
    rect: { x: pad, y: 10, w: Math.min(360, width - pad * 2), h: 22 },
    text: "Overview",
    fill: INK,
    fontSize: 16,
    text_: { fontWeight: 700 },
  });

  add({
    kind: "alarmBanner",
    rect: { x: pad, y: 38, w: width - pad * 2, h: 30 },
    config: { filter: "outstanding" },
  });

  /* Three columns of controls, sized to the glass rather than assumed. */
  const colW = Math.max(150, Math.floor((width - pad * 2 - 24) / 3));
  const cols = Math.max(1, Math.floor((width - pad * 2 + 12) / (colW + 12)));
  let col = 0;
  let y = 84;
  const rowH = 34;
  const colX = (i: number) => pad + i * (colW + 12);

  /**
   * The next slot, or null when the glass is full.
   *
   * Null rather than wrapping back to the first column. Wrapping looks like it
   * fits more in and actually draws the last rows on top of the first, which
   * is the worst of the three options: nobody can tell what is bound to what,
   * and it is not obvious anything went wrong. Running out is reported instead.
   */
  const place = (h: number): { x: number; y: number } | null => {
    if (y + h > ctx.size.height - 8) {
      col++;
      y = 84;
    }
    if (col >= cols) return null;
    const at = { x: colX(col), y };
    y += h + 8;
    return at;
  };

  let dropped = 0;

  const caption = (x: number, y2: number, text: string) =>
    add({
      kind: "text",
      rect: { x, y: y2 + 8, w: Math.floor(colW * 0.5) - 6, h: 18 },
      text,
      fill: LABEL,
      fontSize: 12,
    });

  const inputs = ctx.plcTags.filter((t) => t.type === "BOOL" && t.isInput);
  const outputs = ctx.plcTags.filter((t) => t.type === "BOOL" && t.isOutput);
  const bools = ctx.plcTags.filter((t) => t.type === "BOOL" && !t.isInput && !t.isOutput);
  const ints = ctx.plcTags.filter((t) => t.type === "INT");
  const timers = ctx.plcTags.filter((t) => t.type === "TIMER");
  const counters = ctx.plcTags.filter((t) => t.type === "COUNTER");

  if (ctx.plcTags.length === 0) {
    problems.push(
      "The controller program has no tags, so there was nothing to lay out. Write some ladder first, or add tags to this screen.",
    );
    return { widgets, hmiTags: [], alarms: [], problems, notes: "Nothing to draw." };
  }

  for (const t of inputs) {
    const at = place(rowH);
    if (!at) {
      dropped++;
      continue;
    }
    caption(at.x, at.y, t.comment ?? t.name);
    const bx = at.x + Math.floor(colW * 0.5);
    /*
     * A normally closed button reads 1 when healthy, so the control that
     * operates it writes 0 while held. Momentary either way: press and release
     * are a pair, and a button with only a press latches the machine on.
     */
    const held = t.device === "PUSHBUTTON_NC" ? 0 : 1;
    add({
      kind: "button",
      rect: { x: bx, y: at.y, w: colW - Math.floor(colW * 0.5), h: rowH },
      text: t.name,
      fill: PLATE,
      stroke: INK,
      radius: 4,
      onPress: [
        {
          kind: "setTag",
          target: { source: "plc", tag: t.name },
          value: { kind: "const", value: held },
        },
      ],
      onRelease: [
        {
          kind: "setTag",
          target: { source: "plc", tag: t.name },
          value: { kind: "const", value: held === 1 ? 0 : 1 },
        },
      ],
    });
  }

  for (const t of [...outputs, ...bools]) {
    const at = place(rowH);
    if (!at) {
      dropped++;
      continue;
    }
    caption(at.x, at.y, t.comment ?? t.name);
    add({
      kind: "lamp",
      rect: { x: at.x + Math.floor(colW * 0.5), y: at.y, w: 30, h: 30 },
      value: { kind: "plc", tag: t.name },
      fill: PLATE,
      animations: [{ id: seq(), when: { kind: "plc", tag: t.name }, fill: LIVE }],
    });
  }

  for (const t of [...ints, ...counters]) {
    const at = place(rowH);
    if (!at) {
      dropped++;
      continue;
    }
    caption(at.x, at.y, t.comment ?? t.name);
    add({
      kind: "numeric",
      rect: { x: at.x + Math.floor(colW * 0.5), y: at.y, w: colW - Math.floor(colW * 0.5), h: 28 },
      value: { kind: "plc", tag: t.type === "COUNTER" ? `${t.name}.ACC` : t.name },
      fill: "rgb(var(--raised))",
      stroke: INK,
      decimals: 0,
    });
  }

  for (const t of timers) {
    const at = place(44);
    if (!at) {
      dropped++;
      continue;
    }
    caption(at.x, at.y, t.comment ?? t.name);
    const bx = at.x + Math.floor(colW * 0.5);
    // Against the timer's own preset, so the bar reads full exactly when .DN
    // goes true rather than at whatever round number looked plausible.
    add({
      kind: "bar",
      rect: { x: bx, y: at.y, w: colW - Math.floor(colW * 0.5) - 38, h: 24 },
      value: { kind: "plc", tag: `${t.name}.ACC` },
      min: 0,
      max: t.preset && t.preset > 0 ? t.preset : 1000,
      fill: LIVE,
      stroke: INK,
    });
    add({
      kind: "lamp",
      rect: { x: at.x + colW - 30, y: at.y, w: 24, h: 24 },
      value: { kind: "plc", tag: `${t.name}.DN` },
      fill: PLATE,
      animations: [{ id: seq(), when: { kind: "plc", tag: `${t.name}.DN` }, fill: LIVE }],
    });
  }

  const drawn = widgets.filter((w) => w.rect.y + w.rect.h <= ctx.size.height);
  if (drawn.length !== widgets.length || dropped > 0) {
    const missed = widgets.length - drawn.length + dropped;
    problems.push(
      `${missed} tag${missed === 1 ? "" : "s"} did not fit on a ${ctx.size.width} by ${ctx.size.height} panel and ${missed === 1 ? "was" : "were"} left off. A larger panel, or a second screen, would hold them.`,
    );
  }

  return {
    widgets: drawn,
    hmiTags: [],
    alarms: [],
    background: "rgb(var(--ink-100))",
    notes: `Laid out from the tag table: ${inputs.length} controls, ${outputs.length + bools.length} indicators, ${ints.length + counters.length} values, ${timers.length} timers.`,
    problems,
  };
}
