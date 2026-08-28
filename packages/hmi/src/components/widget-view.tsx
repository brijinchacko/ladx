"use client";

import type { ReactNode } from "react";
import type { EvalContext } from "../lib/expression";
import { resolveBool, resolveNumber } from "../lib/runtime";
import { fitSvg } from "../lib/svg-import";
import { SymbolView } from "../lib/symbols";
import { roleAllows } from "../lib/types";
import type { Binding, Role, Widget } from "../lib/types";

/**
 * One widget, drawn.
 *
 * The same component paints the editor canvas and the running screen. That is
 * deliberate: a builder where design and runtime are two renderers is a
 * builder where the screen looks different on the panel than it did on the
 * desk, and the difference is always found late. Here the only thing that
 * changes between modes is whether bindings resolve against live tags or
 * against their design-time defaults.
 *
 * ISA-101 lands here as a rule about ordering: the base appearance is drawn
 * first and animations are applied over it, last match wins, so a screen with
 * no active condition is the quiet grey one the standard asks for.
 */

/** What the running screen knows that a static drawing does not. */
export interface LiveData {
  /** Oldest first. Each sample carries one value per pen. */
  samples?: { t: number; v: (number | null)[] }[];
  alarms?: {
    id: string;
    message: string;
    priority: string;
    state: string;
    needsAck: boolean;
    raisedAt?: number;
  }[];
  /** Oldest first, for the XY chart. One point per sample of the two tags. */
  xy?: { x: number; y: number }[];
  /**
   * The wall clock, passed in rather than read here.
   *
   * A component calling Date() during render disagrees with the server on the
   * first paint, and React reports that as a hydration mismatch and throws the
   * tree away. The editor already ticks once per scan, so it has the time.
   */
  now?: number;
}

export interface WidgetViewProps {
  widget: Widget;
  ctx: EvalContext;
  live: boolean;
  data?: LiveData;
  /** The role the runtime is acting as. Decides what is greyed out. */
  role?: Role;
  /** The document's style. A widget can override it for one object. */
  defaultStyle?: "schematic" | "realistic";
  onPress?: () => void;
  onRelease?: () => void;
  /** Reported so the editor can show which widget has a bad binding. */
  onError?: (message: string | null) => void;
}

const INK = "#3A4550";

/**
 * How a priority looks.
 *
 * A glyph as well as a colour, because ISA-101 says not to rely on colour
 * alone and roughly one operator in twelve cannot separate red from green.
 */
export const PRIORITY_TONE: Record<
  string,
  { bg: string; line: string; ink: string; glyph: string }
> = {
  critical: { bg: "#F6D3CB", line: "#8E2A12", ink: "#4A1408", glyph: "\u25B2\u25B2" },
  high: { bg: "#F7DFC9", line: "#B4531A", ink: "#5A2A0D", glyph: "\u25B2" },
  medium: { bg: "#F6EBCB", line: "#9A7B1A", ink: "#4C3C0A", glyph: "\u25C6" },
  low: { bg: "#E4EAF0", line: "#4A6480", ink: "#26374A", glyph: "\u25CF" },
  journal: { bg: "#EDEFF1", line: "#7A8894", ink: "#4A5A68", glyph: "\u00b7" },
};

/** Base appearance with every matching animation applied over it, in order. */
function appearance(w: Widget, ctx: EvalContext, live: boolean) {
  let fill = w.fill ?? "#D8DCDF";
  let stroke = w.stroke ?? INK;
  let opacity = 1;
  let hidden = false;

  if (live) {
    for (const a of w.animations ?? []) {
      if (!resolveBool(a.when, ctx)) continue;
      if (a.fill) fill = a.fill;
      if (a.stroke) stroke = a.stroke;
      if (a.opacity !== undefined) opacity = a.opacity;
      if (a.hidden !== undefined) hidden = a.hidden;
    }
  }
  return { fill, stroke, opacity, hidden };
}

/** Border, corners, shadow and gradient, shared by every box-like widget. */
function boxStyle(w: Widget, fill: string, stroke: string, sw: number): React.CSSProperties {
  const dash = w.lineStyle === "dashed" ? "dashed" : w.lineStyle === "dotted" ? "dotted" : "solid";
  return {
    background: w.fillTo
      ? `linear-gradient(${w.gradientAngle ?? 180}deg, ${fill}, ${w.fillTo})`
      : fill,
    border: sw > 0 ? `${sw}px ${dash} ${stroke}` : undefined,
    borderRadius: w.radius ?? 2,
    boxShadow: w.shadow ? "0 2px 6px rgba(15,26,36,0.28)" : undefined,
    boxSizing: "border-box",
  };
}

/**
 * Type, as a panel sets it.
 *
 * A stack rather than one face: a graphic drawn against a font the panel does
 * not have falls back to something, and choosing what it falls back to is
 * better than letting the browser pick.
 */
function textStyle(w: Widget, colour: string): React.CSSProperties {
  const t = w.text_ ?? {};
  return {
    color: colour,
    fontFamily: t.fontFamily ?? "ui-sans-serif, system-ui, sans-serif",
    fontSize: t.fontSize ?? w.fontSize ?? 14,
    fontWeight: t.fontWeight ?? 400,
    fontStyle: t.italic ? "italic" : "normal",
    textDecoration: t.underline ? "underline" : "none",
    letterSpacing: t.letterSpacing ? `${t.letterSpacing}px` : undefined,
    lineHeight: t.lineHeight ?? 1.2,
    textTransform: t.transform ?? "none",
    textAlign: t.align ?? "left",
    whiteSpace: t.wrap === false ? "nowrap" : "pre-wrap",
    display: "flex",
    justifyContent:
      t.align === "center" ? "center" : t.align === "right" ? "flex-end" : "flex-start",
    alignItems: t.valign === "top" ? "flex-start" : t.valign === "bottom" ? "flex-end" : "center",
    overflow: "hidden",
  };
}

/** A number formatted the way a panel shows it, or dashes when it cannot be read. */
export function formatValue(n: number | null, decimals = 0, units?: string): string {
  // Dashes rather than 0 or NaN. An operator reading a blank field knows the
  // value is missing; one reading 0 believes the tank is empty.
  if (n === null || !Number.isFinite(n)) return units ? `--- ${units}` : "---";
  const text = n.toFixed(Math.max(0, Math.min(6, decimals)));
  return units ? `${text} ${units}` : text;
}

export default function WidgetView({
  widget: w,
  ctx,
  live,
  data,
  role = "engineer",
  defaultStyle = "schematic",
  onPress,
  onRelease,
}: WidgetViewProps) {
  const { fill, stroke, opacity, hidden } = appearance(w, ctx, live);
  if (hidden) return null;

  const sw = w.strokeWidth ?? 1.5;
  const { w: width, h: height } = w.rect;
  const font = w.fontSize ?? 14;

  /*
   * Whether the current role may operate this control.
   *
   * Reading is never gated. Hiding a reading from somebody not allowed to
   * change it helps nobody and is how an operator ends up unable to say what
   * the plant is doing. Only the press and release handlers are withheld.
   */
  const allowed = roleAllows(role, w.requiresRole);
  const deniedNote = w.requiresRole ? `Needs the ${w.requiresRole} role` : undefined;

  const box: ReactNode = (() => {
    switch (w.kind) {
      case "rect":
        return <div style={{ width, height, ...boxStyle(w, fill, stroke, sw) }} />;

      case "ellipse":
        return (
          <div style={{ width, height, ...boxStyle(w, fill, stroke, sw), borderRadius: "50%" }} />
        );

      case "line":
      case "polyline": {
        const pts = w.points?.length
          ? w.points
          : [
              { x: 0, y: height / 2 },
              { x: width, y: height / 2 },
            ];
        return (
          <svg width={width} height={height} role="img" aria-label={w.name ?? "line"}>
            <title>{w.name ?? "Line"}</title>
            <polyline
              points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="none"
              stroke={stroke}
              strokeWidth={sw}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        );
      }

      case "text":
        return <span style={{ width, height, ...textStyle(w, stroke) }}>{w.text ?? "Text"}</span>;

      case "numeric": {
        const n = live ? resolveNumber(w.value, ctx) : 0;
        return (
          <span
            style={{
              width,
              height,
              ...boxStyle(w, fill, stroke, sw),
              ...textStyle(w, stroke),
              fontFamily: w.text_?.fontFamily ?? "ui-monospace, monospace",
              justifyContent:
                w.text_?.align === "left"
                  ? "flex-start"
                  : w.text_?.align === "center"
                    ? "center"
                    : "flex-end",
              padding: "0 6px",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {formatValue(n, w.decimals ?? 0, w.units)}
          </span>
        );
      }

      case "lamp": {
        const on = live ? resolveBool(w.value, ctx) : false;
        // Off is the base fill, on is the animation colour. A lamp with no
        // animation still reads: it gets a ring when energised.
        return (
          <div
            style={{
              width,
              height,
              borderRadius: "50%",
              background: on ? (w.animations?.[0]?.fill ?? "#3FBFB5") : fill,
              border: `${sw + (on ? 1 : 0)}px solid ${stroke}`,
              boxSizing: "border-box",
            }}
          />
        );
      }

      case "bar": {
        const n = live ? resolveNumber(w.value, ctx) : (w.max ?? 100) * 0.6;
        const lo = w.min ?? 0;
        const hi = w.max ?? 100;
        const pct = n === null ? 0 : Math.max(0, Math.min(1, (n - lo) / (hi - lo || 1)));
        const vertical = height >= width;
        return (
          <div
            style={{
              width,
              height,
              background: fill,
              border: `${sw}px solid ${stroke}`,
              position: "relative",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                position: "absolute",
                background: w.animations?.[0]?.fill ?? stroke,
                opacity: 0.55,
                ...(vertical
                  ? { left: 0, right: 0, bottom: 0, height: `${pct * 100}%` }
                  : { top: 0, bottom: 0, left: 0, width: `${pct * 100}%` }),
              }}
            />
          </div>
        );
      }

      case "gauge": {
        const n = live ? resolveNumber(w.value, ctx) : (w.max ?? 100) * 0.6;
        const lo = w.min ?? 0;
        const hi = w.max ?? 100;
        const pct = n === null ? 0 : Math.max(0, Math.min(1, (n - lo) / (hi - lo || 1)));
        // 240 degrees of sweep, the convention on a process gauge: the gap at
        // the bottom is where the pointer parks when the instrument is dead.
        const start = 150;
        const sweep = 240;
        const angle = start + pct * sweep;
        const r = Math.min(width, height) / 2 - sw - 2;
        const cx = width / 2;
        const cy = height / 2;
        const arc = (from: number, to: number) => {
          const p = (deg: number) => [
            cx + r * Math.cos((deg * Math.PI) / 180),
            cy + r * Math.sin((deg * Math.PI) / 180),
          ];
          const [x1, y1] = p(from);
          const [x2, y2] = p(to);
          return `M ${x1} ${y1} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x2} ${y2}`;
        };
        return (
          <svg width={width} height={height} role="img" aria-label={w.name ?? "gauge"}>
            <title>{w.name ?? "Gauge"}</title>
            <path
              d={arc(start, start + sweep)}
              fill="none"
              stroke={fill}
              strokeWidth={sw * 3}
              strokeLinecap="round"
            />
            <path
              d={arc(start, angle)}
              fill="none"
              stroke={w.animations?.[0]?.fill ?? stroke}
              strokeWidth={sw * 3}
              strokeLinecap="round"
            />
            <text
              x={cx}
              y={cy + font / 3}
              textAnchor="middle"
              fontSize={font}
              fill={stroke}
              fontFamily="ui-monospace, monospace"
            >
              {formatValue(n, w.decimals ?? 0)}
            </text>
          </svg>
        );
      }

      case "multistate": {
        const n = live ? resolveNumber(w.value, ctx) : 0;
        const states = (w.config?.states as { value: number; text: string; fill?: string }[]) ?? [];
        const hit = states.find((s) => s.value === (n ?? 0));
        return (
          <span
            style={{
              width,
              height,
              background: hit?.fill ?? fill,
              border: `${sw}px solid ${stroke}`,
              color: stroke,
              fontSize: font,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {hit?.text ?? states[0]?.text ?? "—"}
          </span>
        );
      }

      case "button":
      case "toggle": {
        const on = live && w.kind === "toggle" ? resolveBool(w.value, ctx) : false;
        return (
          <button
            type="button"
            disabled={!live || !allowed}
            title={allowed ? undefined : deniedNote}
            onPointerDown={live && allowed ? onPress : undefined}
            onPointerUp={live && allowed ? onRelease : undefined}
            onPointerLeave={live && allowed ? onRelease : undefined}
            style={{
              width,
              height,
              background: on ? (w.animations?.[0]?.fill ?? "#3FBFB5") : fill,
              border: `${sw}px solid ${stroke}`,
              color: stroke,
              fontSize: font,
              borderRadius: 3,
              cursor: live ? "pointer" : "default",
            }}
          >
            {w.text ?? "Button"}
          </button>
        );
      }

      case "symbol": {
        // A picture the user supplied wins over everything: it is the actual
        // machine rather than a drawing of its category.
        if (w.image?.kind === "raster") {
          return (
            <img
              src={w.image.src}
              alt={w.image.alt ?? w.name ?? "symbol"}
              width={width}
              height={height}
              style={{ width, height, objectFit: "fill", borderRadius: w.radius ?? 0 }}
            />
          );
        }
        if (w.image?.kind === "svg") {
          return (
            <div
              style={{ width, height, overflow: "hidden" }}
              // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitised on import by lib/hmi/svg-import against an allow-list, with 24 tests over hostile files; painting an arbitrary vector drawing has no other route.
              dangerouslySetInnerHTML={{ __html: fitSvg(w.image.svg, width, height) }}
            />
          );
        }
        // An imported drawing wins over a library id: it is this widget's own
        // artwork, carried in the document so it survives moving machines.
        const custom = w.config?.svg as string | undefined;
        if (custom) {
          return (
            <div
              style={{ width, height, overflow: "hidden" }}
              // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitised on import by lib/hmi/svg-import against an allow-list, with 24 tests over hostile files; painting an arbitrary vector drawing has no other route.
              dangerouslySetInnerHTML={{ __html: fitSvg(custom, width, height) }}
            />
          );
        }
        const lv = live ? resolveNumber(w.value, ctx) : 0.6;
        const lo = w.min ?? 0;
        const hi = w.max ?? 100;
        const level = lv === null ? 0 : Math.max(0, Math.min(1, (lv - lo) / (hi - lo || 1)));
        return (
          <SymbolView
            id={w.symbol ?? "tank"}
            style={(w.config?.style as "schematic" | "realistic") ?? defaultStyle}
            width={width}
            height={height}
            fill={fill}
            stroke={stroke}
            strokeWidth={sw}
            level={level}
            label={w.text}
          />
        );
      }

      case "trend": {
        const pens = (w.config?.pens as { colour?: string; label?: string }[]) ?? [
          { colour: "#3FBFB5" },
        ];
        const samples = data?.samples ?? [];
        const lo = w.min ?? 0;
        const hi = w.max ?? 100;
        return (
          <div
            style={{
              width,
              height,
              background: fill,
              border: `${sw}px solid ${stroke}`,
              position: "relative",
            }}
          >
            <svg width={width} height={height} role="img" aria-label={w.name ?? "trend"}>
              <title>{w.name ?? "Trend"}</title>
              {/* Gridlines at the quarters. A trend without a scale is a
                  squiggle: the operator needs to know 60 from 90. */}
              {[0.25, 0.5, 0.75].map((f) => (
                <line
                  key={f}
                  x1={0}
                  y1={height * f}
                  x2={width}
                  y2={height * f}
                  stroke={stroke}
                  strokeWidth="0.5"
                  opacity="0.25"
                />
              ))}
              {pens.map((pen, pi) => {
                /*
                 * Broken into segments at every unreadable sample rather than
                 * having the nulls filtered out. Filtering them joins the line
                 * across the gap, which draws a confident straight run through
                 * the one stretch where nothing was known, and reads as steady.
                 */
                const segments: string[][] = [];
                let current: string[] = [];
                samples.forEach((s, i) => {
                  const v = s.v[pi];
                  if (v === null || v === undefined || !Number.isFinite(v)) {
                    if (current.length > 0) segments.push(current);
                    current = [];
                    return;
                  }
                  const x = samples.length < 2 ? 0 : (i / (samples.length - 1)) * width;
                  const y = height - ((v - lo) / (hi - lo || 1)) * height;
                  current.push(`${x.toFixed(1)},${Math.max(0, Math.min(height, y)).toFixed(1)}`);
                });
                if (current.length > 0) segments.push(current);

                return (
                  <g key={pen.label ?? pi}>
                    {segments.map((seg) => (
                      <polyline
                        key={seg[0]}
                        points={seg.length === 1 ? `${seg[0]} ${seg[0]}` : seg.join(" ")}
                        fill="none"
                        stroke={pen.colour ?? "#3FBFB5"}
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    ))}
                  </g>
                );
              })}
            </svg>
            <span
              style={{
                position: "absolute",
                left: 4,
                top: 2,
                fontSize: 10,
                color: stroke,
                fontFamily: "ui-monospace, monospace",
                opacity: 0.7,
              }}
            >
              {hi}
            </span>
            <span
              style={{
                position: "absolute",
                left: 4,
                bottom: 2,
                fontSize: 10,
                color: stroke,
                fontFamily: "ui-monospace, monospace",
                opacity: 0.7,
              }}
            >
              {lo}
            </span>
            {!live && (
              <span
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 11,
                  color: stroke,
                  opacity: 0.5,
                }}
              >
                Trend
              </span>
            )}
          </div>
        );
      }

      case "alarmBanner": {
        /**
         * The banner.
         *
         * One alarm: the highest-priority unacknowledged one, which is what
         * the standard asks for and what an operator can actually read while
         * doing something else. The summary is where several go. Quiet and
         * grey when nothing is outstanding, because a banner that always looks
         * urgent is a banner people stop seeing.
         */
        const rows = data?.alarms ?? [];
        const top = rows.find((a) => a.needsAck) ?? rows[0];
        const tone = top ? (PRIORITY_TONE[top.priority] ?? PRIORITY_TONE.medium) : null;
        return (
          <div
            style={{
              width,
              height,
              ...boxStyle(w, top && tone ? tone.bg : fill, top && tone ? tone.line : stroke, sw),
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "0 10px",
              color: top && tone ? tone.ink : stroke,
              fontSize: w.text_?.fontSize ?? font,
              fontFamily: w.text_?.fontFamily ?? "ui-sans-serif, system-ui",
            }}
          >
            {top ? (
              <>
                {/* Shape as well as colour: ISA-101 does not rely on colour
                    alone, and about one operator in twelve cannot separate
                    red from green. */}
                <span style={{ fontFamily: "ui-monospace, monospace", fontWeight: 700 }}>
                  {tone?.glyph}
                </span>
                <span style={{ fontFamily: "ui-monospace, monospace", opacity: 0.75 }}>
                  {top.raisedAt ? new Date(top.raisedAt).toLocaleTimeString("en-GB") : "--:--:--"}
                </span>
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", whiteSpace: "nowrap" }}>
                  {top.message}
                </span>
                <span
                  style={{
                    fontFamily: "ui-monospace, monospace",
                    fontSize: Math.max(9, font - 3),
                    textTransform: "uppercase",
                  }}
                >
                  {top.needsAck ? "UNACK" : top.state}
                </span>
                {rows.length > 1 && (
                  <span style={{ fontFamily: "ui-monospace, monospace", opacity: 0.7 }}>
                    +{rows.length - 1}
                  </span>
                )}
              </>
            ) : (
              <span style={{ opacity: 0.55 }}>{live ? "No alarms" : "Alarm banner"}</span>
            )}
          </div>
        );
      }

      case "alarmBadge": {
        const rows = data?.alarms ?? [];
        const unacked = rows.filter((a) => a.needsAck).length;
        const tone = unacked > 0 ? PRIORITY_TONE.critical : null;
        return (
          <div
            style={{
              width,
              height,
              ...boxStyle(w, tone ? tone.bg : fill, tone ? tone.line : stroke, sw),
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              color: tone ? tone.ink : stroke,
            }}
          >
            <span style={{ fontSize: Math.max(14, font * 1.6), fontWeight: 700, lineHeight: 1 }}>
              {live ? rows.length : 0}
            </span>
            <span
              style={{ fontSize: Math.max(8, font - 5), opacity: 0.75, letterSpacing: "0.08em" }}
            >
              {unacked > 0 ? `${unacked} UNACK` : "ALARMS"}
            </span>
          </div>
        );
      }

      case "alarmMarquee": {
        const rows = data?.alarms ?? [];
        const text = rows.length
          ? rows.map((a) => `${a.needsAck ? "!" : "\u00b7"} ${a.message}`).join("     ")
          : live
            ? "No alarms"
            : "Alarm ticker";
        return (
          <div
            style={{
              width,
              height,
              ...boxStyle(w, fill, stroke, sw),
              display: "flex",
              alignItems: "center",
              overflow: "hidden",
              color: stroke,
              fontSize: w.text_?.fontSize ?? font,
            }}
          >
            {/* Scrolled by CSS rather than a timer: a ticker driven from the
                scan loop would re-render the whole screen every frame. */}
            <span
              style={{
                whiteSpace: "nowrap",
                paddingLeft: "100%",
                animation: live && rows.length ? "ladx-marquee 18s linear infinite" : undefined,
              }}
            >
              {text}
            </span>
          </div>
        );
      }

      case "alarmSummary":
      case "alarmHistory": {
        const rows = data?.alarms ?? [];
        return (
          <div
            style={{
              width,
              height,
              background: fill,
              border: `${sw}px solid ${stroke}`,
              overflow: "hidden",
              fontSize: Math.max(9, font - 3),
            }}
          >
            {rows.length === 0 ? (
              <span
                style={{
                  display: "flex",
                  height: "100%",
                  alignItems: "center",
                  justifyContent: "center",
                  color: stroke,
                  opacity: 0.55,
                }}
              >
                {live ? "No alarms" : "Alarm summary"}
              </span>
            ) : (
              rows.slice(0, Math.floor(height / 20)).map((a) => (
                <div
                  key={a.id}
                  style={{
                    display: "flex",
                    gap: 6,
                    padding: "2px 5px",
                    alignItems: "baseline",
                    // Unacknowledged is the only thing that gets colour here.
                    // ISA-101: the list is quiet until something needs you.
                    background: a.needsAck ? "rgba(180,83,26,0.14)" : "transparent",
                    color: stroke,
                    borderBottom: `0.5px solid ${stroke}22`,
                  }}
                >
                  <span style={{ fontFamily: "ui-monospace, monospace", opacity: 0.6 }}>
                    {a.raisedAt ? new Date(a.raisedAt).toLocaleTimeString("en-GB") : "--:--:--"}
                  </span>
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", whiteSpace: "nowrap" }}>
                    {a.message}
                  </span>
                  <span style={{ fontFamily: "ui-monospace, monospace", opacity: 0.6 }}>
                    {a.needsAck ? "UNACK" : a.state}
                  </span>
                </div>
              ))
            )}
          </div>
        );
      }

      /* ─────────────────── process graphics ─────────────────── */

      case "pipe": {
        /*
         * A pipe, not a line.
         *
         * Two strokes: the bore in the pipe colour, and a dashed overlay that
         * animates while the flow binding is true. The animation is CSS rather
         * than a timer, because a pipe redrawn from the scan loop would
         * re-render the screen every frame for decoration.
         *
         * A stopped line looks stopped, which is the entire point: an operator
         * glancing at a mimic wants to know what is moving, and a static arrow
         * cannot tell them.
         */
        const bore = Math.max(2, w.pipe?.bore ?? 10);
        const pts = w.points?.length
          ? w.points
          : [
              { x: 0, y: height / 2 },
              { x: width, y: height / 2 },
            ];
        const d = pts.map((pt) => `${pt.x},${pt.y}`).join(" ");
        const flowing = live && w.pipe?.flowing ? resolveBool(w.pipe.flowing, ctx) : false;
        const speed = w.pipe?.speed ?? 1;
        return (
          <svg width={width} height={height} role="img" aria-label={w.name ?? "pipe"}>
            <title>{w.name ?? "Pipe"}</title>
            <polyline
              points={d}
              fill="none"
              stroke={stroke}
              strokeWidth={bore + 2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <polyline
              points={d}
              fill="none"
              stroke={fill}
              strokeWidth={bore}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {flowing && (
              <polyline
                points={d}
                fill="none"
                stroke={stroke}
                strokeWidth={Math.max(2, bore * 0.4)}
                strokeLinecap="butt"
                strokeDasharray={`${bore * 0.8} ${bore * 1.6}`}
                opacity={0.55}
                style={{
                  animation: `ladx-flow ${Math.max(0.3, 2 / Math.abs(speed || 1))}s linear infinite`,
                  animationDirection: speed < 0 ? "reverse" : "normal",
                }}
              />
            )}
          </svg>
        );
      }

      case "tank": {
        /*
         * A vessel with a level in it.
         *
         * A bar rotated ninety degrees is not this: a tank has a shape, the
         * level sits inside that shape, and the scale beside it is what turns
         * a coloured area into a reading. Drawn flat, because a shaded
         * three-dimensional tank spends contrast on looking like a tank.
         */
        const min = w.min ?? 0;
        const max = w.max ?? 100;
        const v = live ? resolveNumber(w.value, ctx) : (min + max) / 2;
        const frac =
          v === null || max === min ? 0 : Math.max(0, Math.min(1, (v - min) / (max - min)));
        const lipH = Math.min(10, height * 0.08);
        const bodyH = height - lipH;
        return (
          <div style={{ width, height, position: "relative" }}>
            <div
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                width,
                height: lipH,
                background: stroke,
                opacity: 0.35,
                borderRadius: `${lipH / 2}px ${lipH / 2}px 0 0`,
              }}
            />
            <div
              style={{
                position: "absolute",
                left: 0,
                top: lipH,
                width,
                height: bodyH,
                border: `${sw}px solid ${stroke}`,
                borderRadius: `0 0 ${Math.min(14, width / 4)}px ${Math.min(14, width / 4)}px`,
                overflow: "hidden",
                background: "transparent",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  bottom: 0,
                  height: `${frac * 100}%`,
                  background: fill,
                  transition: "height 220ms linear",
                }}
              />
            </div>
            {/* Quarter marks, so the fill is a measurement rather than a mood. */}
            {[0.25, 0.5, 0.75].map((t) => (
              <div
                key={t}
                style={{
                  position: "absolute",
                  right: 0,
                  top: lipH + bodyH * (1 - t),
                  width: Math.min(8, width * 0.22),
                  height: 1,
                  background: stroke,
                  opacity: 0.4,
                }}
              />
            ))}
            {live && (
              <span
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  bottom: 3,
                  textAlign: "center",
                  fontSize: Math.max(9, font - 3),
                  fontFamily: "ui-monospace, monospace",
                  color: stroke,
                }}
              >
                {formatValue(v, w.decimals ?? 0, w.units)}
              </span>
            )}
          </div>
        );
      }

      case "thermometer": {
        const min = w.min ?? 0;
        const max = w.max ?? 100;
        const v = live ? resolveNumber(w.value, ctx) : (min + max) / 2;
        const frac =
          v === null || max === min ? 0 : Math.max(0, Math.min(1, (v - min) / (max - min)));
        const bulb = Math.min(width, height * 0.22);
        const colW = Math.max(4, bulb * 0.45);
        const colH = height - bulb;
        return (
          <div style={{ width, height, position: "relative" }}>
            <div
              style={{
                position: "absolute",
                left: (width - colW) / 2,
                top: 0,
                width: colW,
                height: colH,
                border: `${sw}px solid ${stroke}`,
                borderRadius: colW / 2,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  bottom: 0,
                  height: `${frac * 100}%`,
                  background: fill,
                  transition: "height 220ms linear",
                }}
              />
            </div>
            <div
              style={{
                position: "absolute",
                left: (width - bulb) / 2,
                bottom: 0,
                width: bulb,
                height: bulb,
                borderRadius: "50%",
                background: fill,
                border: `${sw}px solid ${stroke}`,
              }}
            />
          </div>
        );
      }

      case "statusStack": {
        /*
         * The tower light on the corner of the machine, on the screen.
         *
         * Each lamp takes its own binding out of config.lamps, so it maps onto
         * the real beacon rather than onto a single state value. An operator
         * who knows the machine reads this without reading anything.
         */
        const lamps = (w.config?.lamps as
          | { colour: string; when?: Binding; label?: string }[]
          | undefined) ?? [
          { colour: "#B4531A", label: "Fault" },
          { colour: "#C8A63C", label: "Warning" },
          { colour: "#3F9E5A", label: "Running" },
        ];
        const each = height / Math.max(1, lamps.length);
        return (
          <div
            style={{
              width,
              height,
              display: "flex",
              flexDirection: "column",
              border: `${sw}px solid ${stroke}`,
              borderRadius: Math.min(8, width / 3),
              overflow: "hidden",
              background: fill,
            }}
          >
            {lamps.map((l, i) => {
              const on =
                live && l.when ? resolveBool(l.when, ctx) : !live && i === lamps.length - 1;
              return (
                <div
                  key={`${l.colour}-${i}`}
                  title={l.label}
                  style={{
                    height: each,
                    background: on ? l.colour : stroke,
                    opacity: on ? 1 : 0.16,
                    borderBottom: i < lamps.length - 1 ? `1px solid ${stroke}55` : undefined,
                  }}
                />
              );
            })}
          </div>
        );
      }

      /* ────────────────────────── data ────────────────────────── */

      case "table": {
        /*
         * Live tags as rows.
         *
         * The thing an operator asks for when the mimic does not have room for
         * everything, and the thing an engineer wants during commissioning.
         * Right aligned, monospaced digits, because a column of numbers that
         * shifts as the values change is a column nobody can compare down.
         */
        const rows =
          (w.config?.rows as
            | { label: string; value?: Binding; units?: string; decimals?: number }[]
            | undefined) ?? [];
        const rowH = Math.max(16, Math.min(26, font + 8));
        return (
          <div
            style={{
              width,
              height,
              background: fill,
              border: `${sw}px solid ${stroke}`,
              overflow: "hidden",
              fontSize: Math.max(9, font - 2),
              color: stroke,
            }}
          >
            {rows.length === 0 ? (
              <span
                style={{
                  display: "flex",
                  height: "100%",
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: 0.5,
                }}
              >
                Table: add rows in Properties
              </span>
            ) : (
              rows.slice(0, Math.floor(height / rowH)).map((r, i) => (
                <div
                  key={`${r.label}-${i}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    height: rowH,
                    padding: "0 6px",
                    borderBottom: `0.5px solid ${stroke}22`,
                  }}
                >
                  <span
                    style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                  >
                    {r.label}
                  </span>
                  <span
                    style={{
                      fontFamily: "ui-monospace, monospace",
                      fontVariantNumeric: "tabular-nums",
                      flexShrink: 0,
                    }}
                  >
                    {formatValue(live ? resolveNumber(r.value, ctx) : 0, r.decimals ?? 0, r.units)}
                  </span>
                </div>
              ))
            )}
          </div>
        );
      }

      case "xyChart": {
        /*
         * One value against another rather than against time.
         *
         * A trend answers "what did it do"; this answers "how do these two
         * relate", which is the question behind a pump curve, a calibration
         * check or a temperature against a setpoint. Deliberately not a trend
         * with two pens, which is a different picture of the same data.
         */
        const pts = data?.xy ?? [];
        const pad = 6;
        const xs = pts.map((p) => p.x);
        const ys = pts.map((p) => p.y);
        const xMin = w.config?.xMin !== undefined ? Number(w.config.xMin) : Math.min(0, ...xs);
        const xMax = w.config?.xMax !== undefined ? Number(w.config.xMax) : Math.max(1, ...xs);
        const yMin = w.min ?? Math.min(0, ...ys);
        const yMax = w.max ?? Math.max(1, ...ys);
        const px = (v: number) => pad + ((v - xMin) / (xMax - xMin || 1)) * (width - pad * 2);
        const py = (v: number) =>
          height - pad - ((v - yMin) / (yMax - yMin || 1)) * (height - pad * 2);
        return (
          <svg
            width={width}
            height={height}
            style={{ background: fill, border: `${sw}px solid ${stroke}` }}
            role="img"
            aria-label={w.name ?? "XY chart"}
          >
            <title>{w.name ?? "XY chart"}</title>
            {[0.25, 0.5, 0.75].map((t) => (
              <line
                key={t}
                x1={pad}
                x2={width - pad}
                y1={pad + (height - pad * 2) * t}
                y2={pad + (height - pad * 2) * t}
                stroke={stroke}
                strokeWidth="0.5"
                opacity="0.25"
              />
            ))}
            {pts.length > 1 && (
              <polyline
                points={pts.map((p) => `${px(p.x)},${py(p.y)}`).join(" ")}
                fill="none"
                stroke={stroke}
                strokeWidth="1.4"
              />
            )}
            {pts.slice(-1).map((p) => (
              <circle key="last" cx={px(p.x)} cy={py(p.y)} r="3" fill={stroke} />
            ))}
            {pts.length === 0 && (
              <text
                x={width / 2}
                y={height / 2}
                textAnchor="middle"
                fontSize="11"
                fill={stroke}
                opacity="0.5"
              >
                {live ? "Waiting for samples" : "XY chart"}
              </text>
            )}
          </svg>
        );
      }

      case "clock": {
        /*
         * The time, on the control room screen.
         *
         * Rendered from `data` rather than read here, because a component that
         * calls Date() during render disagrees with the server on the first
         * paint and React reports it as a hydration mismatch.
         */
        const now = data?.now;
        const showDate = w.config?.date !== false;
        return (
          <div
            style={{
              width,
              height,
              ...boxStyle(w, fill, stroke, sw),
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "ui-monospace, monospace",
              color: stroke,
              lineHeight: 1.1,
            }}
          >
            <span style={{ fontSize: font + 4, fontVariantNumeric: "tabular-nums" }}>
              {now ? new Date(now).toLocaleTimeString("en-GB") : "--:--:--"}
            </span>
            {showDate && (
              <span style={{ fontSize: Math.max(9, font - 4), opacity: 0.65 }}>
                {now ? new Date(now).toLocaleDateString("en-GB") : "--/--/----"}
              </span>
            )}
          </div>
        );
      }

      case "steps": {
        /*
         * Which phase the batch is in.
         *
         * Read off one integer rather than a bit per step, so two steps cannot
         * both be active, which is the state a pile of latches gets into and
         * nobody can diagnose.
         */
        const labels = (w.config?.steps as string[] | undefined) ?? [
          "Fill",
          "Heat",
          "Hold",
          "Drain",
        ];
        const at = live ? (resolveNumber(w.value, ctx) ?? 0) : 1;
        const horizontal = width >= height;
        return (
          <div
            style={{
              width,
              height,
              display: "flex",
              flexDirection: horizontal ? "row" : "column",
              gap: 2,
              fontSize: Math.max(8, font - 4),
            }}
          >
            {labels.map((label, i) => {
              const done = i + 1 < at;
              const active = i + 1 === at;
              return (
                <div
                  key={label}
                  style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "0 4px",
                    background: active ? fill : stroke,
                    opacity: active ? 1 : done ? 0.4 : 0.14,
                    color: active ? stroke : fill,
                    fontWeight: active ? 700 : 400,
                    overflow: "hidden",
                    whiteSpace: "nowrap",
                    textOverflow: "ellipsis",
                  }}
                >
                  {label}
                </div>
              );
            })}
          </div>
        );
      }

      /* ────────────────────────── input ────────────────────────── */

      case "checkbox": {
        const on = live ? resolveBool(w.value, ctx) : false;
        return (
          <button
            type="button"
            disabled={!live || !allowed}
            onPointerDown={live && allowed ? onPress : undefined}
            title={allowed ? undefined : deniedNote}
            style={{
              width,
              height,
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "0 6px",
              background: "transparent",
              border: "none",
              color: stroke,
              fontSize: font,
              cursor: live && allowed ? "pointer" : "default",
              opacity: allowed ? 1 : 0.5,
              textAlign: "left",
            }}
          >
            <span
              style={{
                width: font + 4,
                height: font + 4,
                flexShrink: 0,
                border: `${sw}px solid ${stroke}`,
                borderRadius: 3,
                background: on ? fill : "transparent",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: font,
                lineHeight: 1,
                color: stroke,
              }}
            >
              {on ? "×" : ""}
            </span>
            {w.text ?? "Enabled"}
          </button>
        );
      }

      case "radioGroup": {
        /*
         * One of several, all visible.
         *
         * A dropdown hides the options, which on a panel is exactly wrong: an
         * operator choosing a mode wants to see what the modes are and which
         * one is selected without opening anything.
         */
        const options = (w.config?.options as { label: string; value: number }[] | undefined) ?? [
          { label: "Manual", value: 0 },
          { label: "Auto", value: 1 },
        ];
        const current = live ? resolveNumber(w.value, ctx) : options[0]?.value;
        const horizontal = width >= height;
        return (
          <div
            style={{
              width,
              height,
              display: "flex",
              flexDirection: horizontal ? "row" : "column",
              gap: 2,
              opacity: allowed ? 1 : 0.5,
            }}
            title={allowed ? undefined : deniedNote}
          >
            {options.map((o) => {
              const on = current === o.value;
              return (
                <div
                  key={`${o.label}-${o.value}`}
                  data-radio-value={o.value}
                  style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: `${sw}px solid ${stroke}`,
                    background: on ? fill : "transparent",
                    color: stroke,
                    fontWeight: on ? 700 : 400,
                    fontSize: Math.max(9, font - 2),
                    cursor: live && allowed ? "pointer" : "default",
                    overflow: "hidden",
                    whiteSpace: "nowrap",
                  }}
                >
                  {o.label}
                </div>
              );
            })}
          </div>
        );
      }

      case "textEntry": {
        /*
         * Free text into an HMI tag: a batch id, an operator name, a note.
         *
         * Read only in the runtime here, because writing a string needs a tag
         * that holds one and the tag space is numeric. It draws the field so a
         * screen can be laid out and handed over with it on, and says so
         * rather than pretending to accept typing.
         */
        return (
          <div
            style={{
              width,
              height,
              ...boxStyle(w, fill, stroke, sw),
              display: "flex",
              alignItems: "center",
              padding: "0 8px",
              color: stroke,
              fontSize: font,
              opacity: 0.9,
            }}
          >
            <span style={{ opacity: w.text ? 1 : 0.45 }}>{w.text ?? "Text entry"}</span>
          </div>
        );
      }

      /* ──────────────────────── structure ──────────────────────── */

      case "faceplate": {
        /*
         * An instance, drawn by the editor rather than here.
         *
         * Expanding a faceplate means substituting its parameters into every
         * binding of every widget inside it, which needs the document. This
         * renderer is given one widget and a tag context, so what it draws is
         * the placeholder for an instance whose definition could not be found.
         * The editor resolves the normal case before it gets here.
         */
        return (
          <div
            style={{
              width,
              height,
              border: `1px dashed ${stroke}`,
              color: stroke,
              opacity: 0.6,
              fontSize: Math.max(9, font - 3),
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              padding: 4,
            }}
          >
            {w.faceplate?.id ? "Faceplate not found" : "Faceplate: pick one in Properties"}
          </div>
        );
      }

      default:
        // A widget kind the renderer does not know is drawn as a labelled box
        // rather than skipped, so a document from a newer build is visibly
        // incomplete instead of silently missing objects.
        return (
          <div
            style={{
              width,
              height,
              border: `1px dashed ${stroke}`,
              color: stroke,
              fontSize: 11,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity: 0.6,
            }}
          >
            {w.kind}
          </div>
        );
    }
  })();

  return (
    <div
      style={{
        position: "absolute",
        left: w.rect.x,
        top: w.rect.y,
        width,
        height,
        opacity: opacity * (w.opacity ?? 1),
        transform: w.rotation ? `rotate(${w.rotation}deg)` : undefined,
        transformOrigin: "center",
      }}
    >
      {box}
    </div>
  );
}
