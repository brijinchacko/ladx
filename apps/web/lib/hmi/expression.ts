/**
 * The binding expression language.
 *
 * A tokeniser, a recursive-descent parser and a walker over the resulting
 * tree. Deliberately not JavaScript, and deliberately not `new Function`.
 *
 * An HMI runs expressions written by whoever built the screen, and those
 * screens get shared, imported and generated. Evaluating that text as
 * JavaScript hands it the DOM, fetch, and the user's session, and no amount of
 * blocklisting fixes that: the sandbox is the bug. This grammar has no
 * property access, no function values and no way to reach a host object, so
 * the worst a hostile expression can do is return the wrong number.
 *
 * It is also small enough to read: numbers, booleans, strings, tag references,
 * arithmetic, comparison, boolean logic, a ternary, and a fixed set of maths
 * functions. That covers what bindings are actually for, which is deciding a
 * colour from a level and formatting a number.
 *
 *   {Level} > 80 ? 1 : 0
 *   {plc:Motor_Run} && !{plc:Fault}
 *   clamp(({Level} - 4) / 16 * 100, 0, 100)
 */

export type Value = number | boolean | string;

export interface EvalContext {
  /** Resolve a tag reference. Unknown tags are an error, not silently zero. */
  tag(source: "plc" | "hmi" | "auto", name: string): number | undefined;
}

/* ─────────────────────────────── tokens ─────────────────────────────── */

type Tok =
  | { t: "num"; v: number }
  | { t: "str"; v: string }
  | { t: "tag"; source: "plc" | "hmi" | "auto"; name: string }
  | { t: "id"; v: string }
  | { t: "op"; v: string }
  | { t: "eof" };

const OPS3 = ["==="];
const OPS2 = ["==", "!=", "<=", ">=", "&&", "||"];
const OPS1 = ["+", "-", "*", "/", "%", "<", ">", "!", "(", ")", ",", "?", ":"];

export class ExprError extends Error {}

function lex(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i] as string;

    if (/\s/.test(c)) {
      i++;
      continue;
    }

    // {tag} or {plc:tag} or {hmi:tag}
    if (c === "{") {
      const end = src.indexOf("}", i);
      if (end === -1) throw new ExprError("A tag reference is missing its closing brace.");
      const raw = src.slice(i + 1, end).trim();
      if (!raw) throw new ExprError("An empty tag reference: {}.");
      const colon = raw.indexOf(":");
      let source: "plc" | "hmi" | "auto" = "auto";
      let name = raw;
      if (colon !== -1) {
        const p = raw.slice(0, colon).trim().toLowerCase();
        if (p !== "plc" && p !== "hmi") {
          throw new ExprError(`Unknown tag source "${p}". Use plc: or hmi:, or leave it off.`);
        }
        source = p;
        name = raw.slice(colon + 1).trim();
      }
      if (!name) throw new ExprError("A tag reference with a source but no name.");
      out.push({ t: "tag", source, name });
      i = end + 1;
      continue;
    }

    if (c === '"' || c === "'") {
      const end = src.indexOf(c, i + 1);
      if (end === -1) throw new ExprError("A string is missing its closing quote.");
      out.push({ t: "str", v: src.slice(i + 1, end) });
      i = end + 1;
      continue;
    }

    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(src[i + 1] ?? ""))) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j] as string)) j++;
      const text = src.slice(i, j);
      const n = Number(text);
      if (!Number.isFinite(n)) throw new ExprError(`"${text}" is not a number.`);
      out.push({ t: "num", v: n });
      i = j;
      continue;
    }

    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j] as string)) j++;
      out.push({ t: "id", v: src.slice(i, j) });
      i = j;
      continue;
    }

    const three = src.slice(i, i + 3);
    if (OPS3.includes(three)) {
      out.push({ t: "op", v: "==" });
      i += 3;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (OPS2.includes(two)) {
      out.push({ t: "op", v: two });
      i += 2;
      continue;
    }
    if (OPS1.includes(c)) {
      out.push({ t: "op", v: c });
      i++;
      continue;
    }

    throw new ExprError(`I do not understand "${c}" here.`);
  }
  out.push({ t: "eof" });
  return out;
}

/* ─────────────────────────────── the tree ─────────────────────────────── */

type Node =
  | { n: "lit"; v: Value }
  | { n: "tag"; source: "plc" | "hmi" | "auto"; name: string }
  | { n: "un"; op: string; a: Node }
  | { n: "bin"; op: string; a: Node; b: Node }
  | { n: "cond"; c: Node; a: Node; b: Node }
  | { n: "call"; name: string; args: Node[] };

/**
 * The only callable things.
 *
 * A fixed table rather than a lookup into any host object: there is no way to
 * name something outside this list, so there is nothing to escape into.
 */
const FUNCS: Record<string, { arity: number | [number, number]; fn: (...a: number[]) => number }> =
  {
    abs: { arity: 1, fn: (a) => Math.abs(a as number) },
    round: {
      arity: [1, 2],
      fn: (a, b) => {
        const p = 10 ** Math.trunc(b ?? 0);
        return Math.round((a as number) * p) / p;
      },
    },
    floor: { arity: 1, fn: (a) => Math.floor(a as number) },
    ceil: { arity: 1, fn: (a) => Math.ceil(a as number) },
    sqrt: { arity: 1, fn: (a) => Math.sqrt(a as number) },
    min: { arity: [1, 8], fn: (...a) => Math.min(...a) },
    max: { arity: [1, 8], fn: (...a) => Math.max(...a) },
    clamp: {
      arity: 3,
      fn: (v, lo, hi) => Math.min(Math.max(v as number, lo as number), hi as number),
    },
    /** Linear scale, which is most of what an analogue binding needs. */
    scale: {
      arity: 5,
      fn: (v, inLo, inHi, outLo, outHi) => {
        const span = (inHi as number) - (inLo as number);
        if (span === 0) return outLo as number;
        return (
          ((v as number) - (inLo as number)) * (((outHi as number) - (outLo as number)) / span) +
          (outLo as number)
        );
      },
    },
  };

class Parser {
  private i = 0;
  constructor(private toks: Tok[]) {}

  private peek(): Tok {
    return this.toks[this.i] as Tok;
  }
  private eat(op?: string): Tok {
    const t = this.peek();
    if (op && !(t.t === "op" && t.v === op)) {
      throw new ExprError(`Expected "${op}".`);
    }
    this.i++;
    return t;
  }
  private isOp(v: string): boolean {
    const t = this.peek();
    return t.t === "op" && t.v === v;
  }

  parse(): Node {
    const n = this.ternary();
    if (this.peek().t !== "eof") throw new ExprError("Unexpected text after the expression.");
    return n;
  }

  private ternary(): Node {
    const c = this.or();
    if (this.isOp("?")) {
      this.eat("?");
      const a = this.ternary();
      this.eat(":");
      const b = this.ternary();
      return { n: "cond", c, a, b };
    }
    return c;
  }

  private or(): Node {
    let a = this.and();
    while (this.isOp("||")) {
      this.eat();
      a = { n: "bin", op: "||", a, b: this.and() };
    }
    return a;
  }
  private and(): Node {
    let a = this.equality();
    while (this.isOp("&&")) {
      this.eat();
      a = { n: "bin", op: "&&", a, b: this.equality() };
    }
    return a;
  }
  private equality(): Node {
    let a = this.relational();
    while (this.isOp("==") || this.isOp("!=")) {
      const op = (this.eat() as { v: string }).v;
      a = { n: "bin", op, a, b: this.relational() };
    }
    return a;
  }
  private relational(): Node {
    let a = this.additive();
    while (this.isOp("<") || this.isOp(">") || this.isOp("<=") || this.isOp(">=")) {
      const op = (this.eat() as { v: string }).v;
      a = { n: "bin", op, a, b: this.additive() };
    }
    return a;
  }
  private additive(): Node {
    let a = this.multiplicative();
    while (this.isOp("+") || this.isOp("-")) {
      const op = (this.eat() as { v: string }).v;
      a = { n: "bin", op, a, b: this.multiplicative() };
    }
    return a;
  }
  private multiplicative(): Node {
    let a = this.unary();
    while (this.isOp("*") || this.isOp("/") || this.isOp("%")) {
      const op = (this.eat() as { v: string }).v;
      a = { n: "bin", op, a, b: this.unary() };
    }
    return a;
  }
  private unary(): Node {
    if (this.isOp("!")) {
      this.eat();
      return { n: "un", op: "!", a: this.unary() };
    }
    if (this.isOp("-")) {
      this.eat();
      return { n: "un", op: "-", a: this.unary() };
    }
    return this.primary();
  }

  private primary(): Node {
    const t = this.peek();
    if (t.t === "num") {
      this.i++;
      return { n: "lit", v: t.v };
    }
    if (t.t === "str") {
      this.i++;
      return { n: "lit", v: t.v };
    }
    if (t.t === "tag") {
      this.i++;
      return { n: "tag", source: t.source, name: t.name };
    }
    if (t.t === "id") {
      this.i++;
      const lower = t.v.toLowerCase();
      if (lower === "true") return { n: "lit", v: true };
      if (lower === "false") return { n: "lit", v: false };
      if (this.isOp("(")) {
        this.eat("(");
        const args: Node[] = [];
        if (!this.isOp(")")) {
          args.push(this.ternary());
          while (this.isOp(",")) {
            this.eat(",");
            args.push(this.ternary());
          }
        }
        this.eat(")");
        return { n: "call", name: lower, args };
      }
      throw new ExprError(`"${t.v}" is not a value. Tags go in braces: {${t.v}}.`);
    }
    if (t.t === "op" && t.v === "(") {
      this.eat("(");
      const n = this.ternary();
      this.eat(")");
      return n;
    }
    throw new ExprError("Expected a value.");
  }
}

/* ─────────────────────────────── evaluate ─────────────────────────────── */

function num(v: Value): number {
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function truthy(v: Value): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  return v.length > 0;
}

function evalNode(node: Node, ctx: EvalContext): Value {
  switch (node.n) {
    case "lit":
      return node.v;
    case "tag": {
      const v = ctx.tag(node.source, node.name);
      if (v === undefined) throw new ExprError(`No tag called "${node.name}".`);
      return v;
    }
    case "un": {
      const a = evalNode(node.a, ctx);
      return node.op === "!" ? !truthy(a) : -num(a);
    }
    case "cond":
      return truthy(evalNode(node.c, ctx)) ? evalNode(node.a, ctx) : evalNode(node.b, ctx);
    case "bin": {
      // Short-circuit, so `{A} && 1/{B}` does not divide when A is false.
      if (node.op === "&&") {
        const a = evalNode(node.a, ctx);
        return truthy(a) ? truthy(evalNode(node.b, ctx)) : false;
      }
      if (node.op === "||") {
        const a = evalNode(node.a, ctx);
        return truthy(a) ? true : truthy(evalNode(node.b, ctx));
      }
      const a = evalNode(node.a, ctx);
      const b = evalNode(node.b, ctx);
      switch (node.op) {
        case "+":
          // Strings concatenate, everything else is arithmetic. Useful for
          // building a caption out of a number and a unit.
          if (typeof a === "string" || typeof b === "string") return `${a}${b}`;
          return num(a) + num(b);
        case "-":
          return num(a) - num(b);
        case "*":
          return num(a) * num(b);
        case "/":
          // A divide by zero on a screen must not print Infinity or NaN at an
          // operator: zero is wrong too, but it is quiet and obvious.
          return num(b) === 0 ? 0 : num(a) / num(b);
        case "%":
          return num(b) === 0 ? 0 : num(a) % num(b);
        case "<":
          return num(a) < num(b);
        case ">":
          return num(a) > num(b);
        case "<=":
          return num(a) <= num(b);
        case ">=":
          return num(a) >= num(b);
        case "==":
          return typeof a === "string" || typeof b === "string"
            ? `${a}` === `${b}`
            : num(a) === num(b);
        case "!=":
          return typeof a === "string" || typeof b === "string"
            ? `${a}` !== `${b}`
            : num(a) !== num(b);
        default:
          throw new ExprError(`Unknown operator "${node.op}".`);
      }
    }
    case "call": {
      const f = FUNCS[node.name];
      if (!f) throw new ExprError(`There is no function called "${node.name}".`);
      const [lo, hi] = Array.isArray(f.arity) ? f.arity : [f.arity, f.arity];
      if (node.args.length < lo || node.args.length > hi) {
        throw new ExprError(
          `${node.name}() takes ${lo === hi ? lo : `${lo} to ${hi}`} arguments, not ${node.args.length}.`,
        );
      }
      return f.fn(...node.args.map((a) => num(evalNode(a, ctx))));
    }
    default:
      throw new ExprError("Malformed expression.");
  }
}

const CACHE = new Map<string, Node>();

/** Parse once and keep it: a binding is evaluated every frame. */
export function compile(src: string): Node {
  const hit = CACHE.get(src);
  if (hit) return hit;
  const node = new Parser(lex(src)).parse();
  if (CACHE.size > 500) CACHE.clear();
  CACHE.set(src, node);
  return node;
}

export interface EvalResult {
  value: Value | null;
  error: string | null;
}

/**
 * Evaluate, never throw.
 *
 * A screen with one bad binding must still render: an operator looking at a
 * pump needs the other fourteen objects, not a blank page. The error is
 * returned so the editor can show it against the widget that owns it.
 */
export function evaluate(src: string, ctx: EvalContext): EvalResult {
  try {
    return { value: evalNode(compile(src), ctx), error: null };
  } catch (e) {
    return { value: null, error: e instanceof Error ? e.message : "Bad expression." };
  }
}

/** Tag names an expression depends on, for the cross-reference. */
export function referencedTags(src: string): { source: string; name: string }[] {
  const out: { source: string; name: string }[] = [];
  const walk = (n: Node) => {
    if (n.n === "tag") out.push({ source: n.source, name: n.name });
    else if (n.n === "un") walk(n.a);
    else if (n.n === "bin") {
      walk(n.a);
      walk(n.b);
    } else if (n.n === "cond") {
      walk(n.c);
      walk(n.a);
      walk(n.b);
    } else if (n.n === "call") for (const a of n.args) walk(a);
  };
  try {
    walk(compile(src));
  } catch {
    // A broken expression references nothing we can be sure of.
  }
  return out;
}
