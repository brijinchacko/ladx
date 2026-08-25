/**
 * The HMI application model.
 *
 * One document per project, the way a ladder program is one document per
 * project: screens, the tags the HMI owns, the alarms defined on tags, the
 * trends, and the connection that says which controller this would talk to.
 *
 * The single most important decision here is that the HMI does not keep its
 * own copy of the PLC tag table. It binds to the ladder program's tags by
 * name. In every real toolchain the HMI browses the controller's tags rather
 * than redeclaring them, and the alternative, two tables that must be kept in
 * step by hand, is the classic way an HMI ends up driving a tag the program
 * renamed three weeks ago.
 */

import type { TagType } from "@ladx/studio";

/* ─────────────────────────────── screens ─────────────────────────────── */

/**
 * A panel is a fixed number of pixels, so a screen is too.
 *
 * Real HMI hardware does not reflow. A 7" panel is 800x480 and a graphic drawn
 * for it is drawn at that size, which is why every builder asks for the panel
 * before the first object is placed. Designing on a stretchy canvas and finding
 * out on site that the trend is off the edge is the thing this prevents.
 */
export interface ScreenSize {
  width: number;
  height: number;
}

export interface Screen {
  id: string;
  name: string;
  /** Shown in the navigation, and what a "go to screen" action names. */
  slug: string;
  size: ScreenSize;
  /** ISA-101 wants a quiet ground. Overridable, because not every plant agrees. */
  background: string;
  widgets: Widget[];
  /** Runs whenever this screen is opened, before the first paint. */
  onOpen?: Action[];
}

/* ─────────────────────────────── bindings ─────────────────────────────── */

/**
 * Where a widget property gets its value.
 *
 * `plc` reads the ladder program's tag table, `hmi` reads a tag this document
 * owns, `const` is a literal, and `expr` is a small expression over both tag
 * sets. Expressions are deliberately not JavaScript: see lib/hmi/expression.ts
 * for why a builder that evals user text into the page is a mistake nobody
 * needs to make twice.
 */
export type Binding =
  | { kind: "const"; value: string | number | boolean }
  | { kind: "plc"; tag: string }
  | { kind: "hmi"; tag: string }
  | { kind: "expr"; source: string };

/** A tag the HMI owns: screen state, entry buffers, recipe selection. */
export interface HmiTag {
  name: string;
  type: TagType;
  value: number;
  comment?: string;
  /** Kept across sessions rather than reset on open. Setpoints usually are. */
  retentive?: boolean;
}

/* ─────────────────────────────── widgets ─────────────────────────────── */

export type WidgetKind =
  // shapes
  | "rect"
  | "ellipse"
  | "line"
  | "polyline"
  | "text"
  | "image"
  // display
  | "numeric"
  | "lamp"
  | "bar"
  | "gauge"
  | "multistate"
  // input
  | "button"
  | "toggle"
  | "numericEntry"
  | "slider"
  | "selector"
  // data
  | "trend"
  | "alarmSummary"
  | "alarmHistory"
  // library
  | "symbol";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * A rule that changes how a widget looks when a condition holds.
 *
 * This is where ISA-101 actually lands in the model: the base drawing is grey
 * and quiet, and animation is what makes a deviation visible. Evaluated in
 * order, last match wins, so a hi-hi rule written after a hi rule takes
 * precedence the way the operator expects.
 */
export interface Animation {
  id: string;
  when: Binding;
  /** Any of these may be omitted; omitted means "leave the base value alone". */
  fill?: string;
  stroke?: string;
  /** 0..1. Blinking is deliberately not a property: see the note in render.ts. */
  opacity?: number;
  hidden?: boolean;
}

export interface Widget {
  id: string;
  kind: WidgetKind;
  rect: Rect;
  /** Degrees clockwise about the centre of `rect`. */
  rotation?: number;
  /** Higher draws later. Explicit rather than array order so grouping is safe. */
  z?: number;
  name?: string;

  /* appearance, all optional and kind-dependent */
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  fontSize?: number;
  /** Symbol id from lib/hmi/symbols.ts, for kind "symbol". */
  symbol?: string;
  /** Fixed caption, or the format for a numeric. */
  text?: string;
  /** Decimal places for a numeric or a gauge readout. */
  decimals?: number;
  units?: string;
  /** Engineering range for bar, gauge, slider. */
  min?: number;
  max?: number;
  /** Points for line and polyline, relative to rect. */
  points?: { x: number; y: number }[];

  /* behaviour */
  /** The main value: what a numeric shows, what a lamp lights on. */
  value?: Binding;
  animations?: Animation[];
  onPress?: Action[];
  onRelease?: Action[];
  /** Trend pens, alarm filters, selector options. */
  config?: Record<string, unknown>;
}

/* ─────────────────────────────── actions ─────────────────────────────── */

/**
 * What a control does.
 *
 * A closed list rather than a script, because these are what buttons on a
 * panel actually do, and a list can be validated, exported and reasoned about.
 * `setTag` covers momentary and maintained buttons; the difference is whether
 * the release handler writes back.
 */
export type Action =
  | { kind: "setTag"; target: TagRef; value: Binding }
  | { kind: "toggleTag"; target: TagRef }
  | { kind: "ackAlarm"; alarm?: string }
  | { kind: "ackAll" }
  | { kind: "shelveAlarm"; alarm: string; minutes: number }
  | { kind: "goToScreen"; slug: string }
  | { kind: "runScript"; script: string };

export interface TagRef {
  source: "plc" | "hmi";
  tag: string;
}

/* ─────────────────────────────── alarms ─────────────────────────────── */

/**
 * Alarm conditions, per ISA-18.2.
 *
 * Defined on a tag rather than in a separate list, which is how Ignition and
 * FactoryTalk both do it and for the same reason: an alarm list maintained
 * beside the tag table drifts from it. A digital alarm trips on a bit; the
 * analogue ones trip on a limit with a deadband.
 */
export type AlarmCondition = "digital" | "hi" | "hihi" | "lo" | "lolo" | "deviation" | "roc";

/**
 * Priority.
 *
 * Four levels, because EEMUA 191 and ISA-18.2 both warn that more than about
 * four is a distinction operators cannot make under load. `journal` is the
 * honest name for "recorded but not an alarm", which is where most of the
 * things people want to alarm on actually belong.
 */
export type AlarmPriority = "critical" | "high" | "medium" | "low" | "journal";

export interface AlarmDef {
  id: string;
  /** The tag this watches. PLC tags are the normal case. */
  target: TagRef;
  condition: AlarmCondition;
  /** Limit for the analogue conditions. Ignored for digital. */
  setpoint?: number;
  /**
   * How far back the value must come before the alarm clears.
   *
   * Without this a value sitting on the limit produces an alarm per scan, and
   * a chattering alarm is worse than no alarm: it is the mechanism by which
   * operators learn to ignore the list.
   */
  deadband?: number;
  /** Seconds the condition must hold before it is an alarm. */
  onDelay?: number;
  /** For "digital": does 0 or 1 mean bad? A healthy NC contact reads 1. */
  trueIsAlarm?: boolean;
  priority: AlarmPriority;
  message: string;
  /** Free text: what to actually do about it. ISA-18.2 asks for this. */
  response?: string;
  enabled: boolean;
}

/* ─────────────────────────────── trends ─────────────────────────────── */

export interface TrendPen {
  id: string;
  target: TagRef;
  label?: string;
  colour: string;
  min?: number;
  max?: number;
}

export interface TrendDef {
  id: string;
  name: string;
  pens: TrendPen[];
  /** Seconds of history held. */
  span: number;
  /** Milliseconds between samples. */
  interval: number;
}

/* ──────────────────────────── communication ──────────────────────────── */

/**
 * How this HMI would reach its controller.
 *
 * Configured and exported, never dialled. LADX does not open sockets to plant
 * equipment and is not going to: the runtime here is driven by the same scan
 * engine the ladder simulator uses, which is what makes a screen testable at a
 * desk. The driver settings exist because the design has to be recorded and
 * handed over, and because a screen built against the wrong word order is a
 * commissioning day nobody enjoys.
 */
export type Protocol = "simulated" | "opcua" | "modbus-tcp" | "ethernet-ip" | "s7";

export interface Connection {
  protocol: Protocol;
  /** Host or endpoint URL. */
  endpoint?: string;
  port?: number;
  /** S7: rack and slot. EtherNet/IP: the CIP path. Modbus: the unit id. */
  rack?: number;
  slot?: number;
  unitId?: number;
  path?: string;
  /** Milliseconds between polls. */
  pollMs: number;
  timeoutMs: number;
  /** Modbus holds no types, so word order has to be stated rather than guessed. */
  wordOrder?: "big" | "little";
}

/* ──────────────────────────── the document ──────────────────────────── */

export interface HmiDoc {
  version: 1;
  name: string;
  /** The panel this was drawn for, so a new screen inherits it. */
  defaultSize: ScreenSize;
  screens: Screen[];
  /** The screen shown on start. Falls back to the first. */
  homeSlug?: string;
  /** Tags the HMI owns. PLC tags come from the ladder program. */
  tags: HmiTag[];
  alarms: AlarmDef[];
  trends: TrendDef[];
  connection: Connection;
}

export function emptyDoc(
  name = "Untitled HMI",
  size: ScreenSize = { width: 800, height: 480 },
): HmiDoc {
  return {
    version: 1,
    name,
    defaultSize: size,
    screens: [
      {
        id: "s1",
        name: "Overview",
        slug: "overview",
        size: size,
        background: "#E8EAEC",
        widgets: [],
      },
    ],
    homeSlug: "overview",
    tags: [],
    alarms: [],
    trends: [],
    connection: { protocol: "simulated", pollMs: 250, timeoutMs: 3000 },
  };
}
