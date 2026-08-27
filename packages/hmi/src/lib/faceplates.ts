/**
 * Expanding a faceplate instance into the widgets it stands for.
 *
 * The definition draws a valve once with `{{Tag}}` where a tag name would go.
 * An instance supplies `Tag: "XV101"`. Expansion walks the definition, puts
 * the arguments in, scales the result to the instance's rectangle, and hands
 * back ordinary widgets the renderer already knows how to draw.
 *
 * Two decisions worth stating.
 *
 * Substitution is textual, into binding tag names and captions only. Not into
 * arbitrary fields, and never into anything evaluated: `{{...}}` in a widget's
 * fill colour does nothing, and there is no path from a parameter to code. A
 * faceplate is a drawing with holes in it, not a macro language, and keeping
 * it that way is what stops it becoming one.
 *
 * Expansion is not recursive. A faceplate containing a faceplate is refused
 * rather than expanded, because the first thing anybody does with a recursive
 * template system is make one that contains itself, and the second thing is
 * report that the editor hangs.
 */

import type { Faceplate, Widget } from "./types";

const PARAM = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;

/** Put the arguments into one string. An unknown parameter is left visible. */
export function substitute(text: string, args: Record<string, string>): string {
  return text.replace(PARAM, (whole, name: string) => {
    const v = args[name];
    // Left as written rather than blanked, so a missing argument shows up as
    // `{{Tag}}` on the screen instead of as a binding to an empty name that
    // silently reads nothing.
    return v === undefined || v === "" ? whole : v;
  });
}

/** Every parameter a definition actually refers to, in the order first seen. */
export function paramsUsed(fp: Faceplate): string[] {
  const seen = new Set<string>();
  const scan = (text: string | undefined) => {
    if (!text) return;
    PARAM.lastIndex = 0;
    let m = PARAM.exec(text);
    while (m) {
      if (m[1]) seen.add(m[1]);
      m = PARAM.exec(text);
    }
  };
  for (const w of fp.widgets) {
    scan(w.text);
    scan(w.name);
    if (w.value?.kind === "plc" || w.value?.kind === "hmi") scan(w.value.tag);
    if (w.value?.kind === "expr") scan(w.value.source);
    for (const a of w.animations ?? []) {
      if (a.when.kind === "plc" || a.when.kind === "hmi") scan(a.when.tag);
      if (a.when.kind === "expr") scan(a.when.source);
    }
    for (const act of [...(w.onPress ?? []), ...(w.onRelease ?? [])]) {
      if (act.kind === "setTag" || act.kind === "toggleTag") scan(act.target.tag);
    }
  }
  return [...seen];
}

/** One widget with its arguments substituted in. */
function fillWidget(w: Widget, args: Record<string, string>): Widget {
  const out: Widget = { ...w };

  if (w.text) out.text = substitute(w.text, args);
  if (w.name) out.name = substitute(w.name, args);

  if (w.value) {
    if (w.value.kind === "plc" || w.value.kind === "hmi") {
      out.value = { ...w.value, tag: substitute(w.value.tag, args) };
    } else if (w.value.kind === "expr") {
      out.value = { kind: "expr", source: substitute(w.value.source, args) };
    }
  }

  if (w.animations) {
    out.animations = w.animations.map((a) => {
      if (a.when.kind === "plc" || a.when.kind === "hmi") {
        return { ...a, when: { ...a.when, tag: substitute(a.when.tag, args) } };
      }
      if (a.when.kind === "expr") {
        return { ...a, when: { kind: "expr" as const, source: substitute(a.when.source, args) } };
      }
      return a;
    });
  }

  const fillActions = (list: Widget["onPress"]) =>
    list?.map((act) => {
      if (act.kind === "setTag") {
        return { ...act, target: { ...act.target, tag: substitute(act.target.tag, args) } };
      }
      if (act.kind === "toggleTag") {
        return { ...act, target: { ...act.target, tag: substitute(act.target.tag, args) } };
      }
      return act;
    });

  if (w.onPress) out.onPress = fillActions(w.onPress);
  if (w.onRelease) out.onRelease = fillActions(w.onRelease);

  if (w.pipe?.flowing) {
    const f = w.pipe.flowing;
    out.pipe = {
      ...w.pipe,
      flowing:
        f.kind === "plc" || f.kind === "hmi"
          ? { ...f, tag: substitute(f.tag, args) }
          : f.kind === "expr"
            ? { kind: "expr", source: substitute(f.source, args) }
            : f,
    };
  }

  return out;
}

export interface Expanded {
  widgets: Widget[];
  /** Why nothing was produced, when nothing was. */
  problem?: string;
}

/**
 * One instance, as widgets positioned on the screen.
 *
 * The definition is drawn at its own size and the instance has its own
 * rectangle, so the contents are scaled and offset to fit. Ids are prefixed
 * with the instance's id, because two instances of the same faceplate would
 * otherwise put the same widget id on the screen twice and selection would
 * pick whichever rendered last.
 */
export function expandInstance(instance: Widget, faceplates: Faceplate[]): Expanded {
  if (instance.kind !== "faceplate") return { widgets: [instance] };

  const ref = instance.faceplate;
  if (!ref?.id) return { widgets: [], problem: "No faceplate chosen." };

  const fp = faceplates.find((f) => f.id === ref.id);
  if (!fp) return { widgets: [], problem: `Faceplate "${ref.id}" is not in this document.` };

  if (fp.widgets.some((w) => w.kind === "faceplate")) {
    return {
      widgets: [],
      problem: `"${fp.name}" contains another faceplate, which is not expanded. Flatten it.`,
    };
  }

  const sx = fp.size.width === 0 ? 1 : instance.rect.w / fp.size.width;
  const sy = fp.size.height === 0 ? 1 : instance.rect.h / fp.size.height;

  const args: Record<string, string> = { ...ref.args };
  // Defaults fill the gaps, so an instance placed without touching anything
  // still draws something recognisable rather than a grid of {{Tag}}.
  for (const p of fp.params) {
    if ((args[p.name] === undefined || args[p.name] === "") && p.default) {
      args[p.name] = p.default;
    }
  }

  const widgets = fp.widgets.map((w, i) => {
    const filled = fillWidget(w, args);
    return {
      ...filled,
      id: `${instance.id}:${w.id || i}`,
      rect: {
        x: instance.rect.x + w.rect.x * sx,
        y: instance.rect.y + w.rect.y * sy,
        w: w.rect.w * sx,
        h: w.rect.h * sy,
      },
      // The instance's own z decides where the whole group sits, and the
      // definition's z orders within it.
      z: (instance.z ?? 0) + (w.z ?? 0) / 1000,
      // An instance can be locked as a unit; its parts never move on their own.
      locked: true,
      requiresRole: filled.requiresRole ?? instance.requiresRole,
    } satisfies Widget;
  });

  return { widgets };
}

/**
 * Every widget on a screen, with faceplates expanded.
 *
 * What the renderer and the runtime should both iterate, so an alarm bound to
 * a tag inside a faceplate behaves exactly like one bound anywhere else.
 */
export function expandAll(
  widgets: Widget[],
  faceplates: Faceplate[] | undefined,
): { widgets: Widget[]; problems: string[] } {
  if (!faceplates?.length) {
    const missing = widgets.filter((w) => w.kind === "faceplate");
    return {
      widgets: widgets.filter((w) => w.kind !== "faceplate"),
      problems: missing.map(() => "This document has no faceplates defined."),
    };
  }

  const out: Widget[] = [];
  const problems: string[] = [];
  for (const w of widgets) {
    if (w.kind !== "faceplate") {
      out.push(w);
      continue;
    }
    const { widgets: parts, problem } = expandInstance(w, faceplates);
    if (problem) problems.push(problem);
    out.push(...parts);
  }
  return { widgets: out, problems };
}
