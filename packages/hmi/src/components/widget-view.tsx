"use client";

import type { ReactNode } from "react";
import type { EvalContext } from "../lib/expression";
import { resolveBool, resolveNumber } from "../lib/runtime";
import { fitSvg } from "../lib/svg-import";
import { SymbolView } from "../lib/symbols";
import type { Widget } from "../lib/types";

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
}

export interface WidgetViewProps {
  widget: Widget;
  ctx: EvalContext;
  live: boolean;
  data?: LiveData;
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
  defaultStyle = "schematic",
  onPress,
  onRelease,
}: WidgetViewProps) {
  const { fill, stroke, opacity, hidden } = appearance(w, ctx, live);
  if (hidden) return null;

  const sw = w.strokeWidth ?? 1.5;
  const { w: width, h: height } = w.rect;
  const font = w.fontSize ?? 14;

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
            disabled={!live}
            onPointerDown={live ? onPress : undefined}
            onPointerUp={live ? onRelease : undefined}
            onPointerLeave={live ? onRelease : undefined}
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
                const pts = samples
                  .map((s, i) => {
                    const v = s.v[pi];
                    if (v === null || v === undefined) return null;
                    const x = samples.length < 2 ? 0 : (i / (samples.length - 1)) * width;
                    const y = height - ((v - lo) / (hi - lo || 1)) * height;
                    return `${x.toFixed(1)},${Math.max(0, Math.min(height, y)).toFixed(1)}`;
                  })
                  .filter(Boolean)
                  .join(" ");
                if (!pts) return null;
                return (
                  <polyline
                    key={pen.label ?? pi}
                    points={pts}
                    fill="none"
                    stroke={pen.colour ?? "#3FBFB5"}
                    strokeWidth="1.6"
                    strokeLinejoin="round"
                  />
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
