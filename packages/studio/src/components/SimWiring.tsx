"use client";

import { CPU, terminalFor, terminalLabel } from "../lib/addressing";
import { DEVICE_LABEL, type DeviceKind, type Tag, defaultDevice } from "../lib/types";

/**
 * The control circuit, drawn as one loop.
 *
 * The panel view tells a student what a tag is doing. It does not tell them
 * where the 24 volts comes from, why a normally-closed stop button reads 1
 * when nobody is touching it, or what the M terminal is for — and those are
 * the three things that confuse everybody in the first week.
 *
 * ── Why it looks like a ladder ────────────────────────────────────
 *
 * L+ down the left, M down the right, and every circuit drawn as a rung
 * between them. That is how DC control wiring is drawn on a real schematic,
 * and it is the reason ladder logic looks the way it does: the program is a
 * picture of the wiring. A student who sees the two side by side stops
 * treating the rung as an abstraction.
 *
 * ── One controller, not two ──────────────────────────────────────
 *
 * The CPU here is the same CPU as the panel view, with the same terminal
 * numbers, because a wiring diagram that shows a different-looking box is a
 * wiring diagram of something else. Devices land on the terminal their tag is
 * actually addressed to — move a tag from I0.2 to I0.5 and the wire moves.
 *
 * Live: current in a conducting wire is drawn green, so pressing a button
 * shows the loop complete from L+ through the contact into the terminal.
 */

const LIVE = "#16a34a";
const DEAD = "#94a3b8";
const RAIL_POS = "#dc2626";
const RAIL_NEG = "#1e293b";
const CASE = "#2b3440";
const CASE_EDGE = "#55606c";
const SCREW = "#c7ccd1";
const LABEL = "#475569";

const on = (t: Tag) => (t.type === "INT" ? (t.value ?? 0) !== 0 : (t.value ?? 0) === 1);
const deviceOf = (t: Tag): DeviceKind => t.device ?? defaultDevice(t);

/* ── Geometry ───────────────────────────────────────────────────────
 *
 * Every band has its own vertical space and nothing shares a y with
 * anything else. The nameplate used to be drawn at the top of the CPU body,
 * which is exactly where the first terminal row sits — so "VCX CPU 1212C"
 * ran straight through the I0.0 and Q0.0 labels. Terminals now start below
 * a reserved nameplate band, and the device captions sit in the gap between
 * rows rather than on top of the next one.
 */
const W = 400;
const RAIL_L = 30; // the L+ rail
const RAIL_R = W - 30; // the M rail
const CPU_L = 158;
const CPU_R = 262;
const ROW = 52; // tall enough for a symbol AND its two caption lines
const HEAD = 40; // the rail labels
const PLATE = 30; // the CPU nameplate band — no terminals in it
const FOOT = 44; // the CPU's own supply, on its own line

/**
 * A field device, drawn to IEC 60617 so it is the symbol on the real drawing.
 *
 * The pushbuttons were wrong: the actuator was drawn as a free-floating stem
 * and bar above the contact, joined to nothing, which read as a stray T
 * hanging over the wire. On a proper symbol the actuator sits ON the moving
 * contact and is linked to it by a dashed mechanical line — that dashed line
 * is the whole point, because it says "this is operated by hand" rather than
 * "this is energised by a coil".
 *
 * Everything is drawn inside a fixed 30 x 26 box centred on (x, y), so no
 * symbol can spill into its neighbour or across a caption.
 */
function Device({ kind, x, y, live }: { kind: DeviceKind; x: number; y: number; live: boolean }) {
  const c = live ? LIVE : DEAD;
  const s = { stroke: c, strokeWidth: 1.7, fill: "none", strokeLinecap: "round" as const };
  const mech = { stroke: c, strokeWidth: 1, strokeDasharray: "2 2", fill: "none" };

  /** Lead-in and lead-out, identical on every symbol so the wire is unbroken. */
  const leads = (gap: number) => (
    <>
      <line x1={x - 15} y1={y} x2={x - gap} y2={y} {...s} />
      <line x1={x + gap} y1={y} x2={x + 15} y2={y} {...s} />
    </>
  );

  switch (kind) {
    /* Normally open: the bridge is lifted clear until pressed. */
    case "PUSHBUTTON_NO": {
      const bridgeY = live ? y : y - 6;
      return (
        <g>
          {leads(7)}
          <circle cx={x - 7} cy={y} r={1.7} fill={c} stroke="none" />
          <circle cx={x + 7} cy={y} r={1.7} fill={c} stroke="none" />
          <line x1={x - 7} y1={bridgeY} x2={x + 7} y2={bridgeY} {...s} />
          {/* The actuator, mechanically linked to the bridge it moves. */}
          <line x1={x} y1={bridgeY} x2={x} y2={y - 12} {...mech} />
          <line x1={x - 4.5} y1={y - 12} x2={x + 4.5} y2={y - 12} {...s} />
        </g>
      );
    }

    /* Normally closed: made at rest, which is why it reads 1 untouched. */
    case "PUSHBUTTON_NC": {
      const bridgeY = live ? y : y - 6;
      return (
        <g>
          {leads(7)}
          <circle cx={x - 7} cy={y} r={1.7} fill={c} stroke="none" />
          <circle cx={x + 7} cy={y} r={1.7} fill={c} stroke="none" />
          {/* At rest the bridge is DOWN on the contacts; pressing lifts it. */}
          <line x1={x - 7} y1={live ? y : y - 6} x2={x + 7} y2={live ? y : y - 6} {...s} />
          {/* The bar through the contact is what marks it normally closed. */}
          <line x1={x + 7} y1={y - 4} x2={x + 7} y2={y + 4} {...s} />
          <line x1={x} y1={live ? y : y - 6} x2={x} y2={y - 12} {...mech} />
          <line x1={x - 4.5} y1={y - 12} x2={x + 4.5} y2={y - 12} {...s} />
        </g>
      );
    }

    /* A maintained switch: it stays where you put it. */
    case "SELECTOR":
      return (
        <g>
          {leads(7)}
          <circle cx={x - 7} cy={y} r={1.7} fill={c} stroke="none" />
          <circle cx={x + 7} cy={y} r={1.7} fill={c} stroke="none" />
          <line x1={x - 7} y1={y} x2={live ? x + 7 : x + 5} y2={live ? y : y - 7} {...s} />
          {/* The stub that says "maintained", not momentary. */}
          <line x1={x - 2} y1={y - 10} x2={x + 3} y2={y - 10} {...s} />
          <line x1={x + 0.5} y1={y - 10} x2={x + 0.5} y2={live ? y - 4 : y - 8} {...mech} />
        </g>
      );

    /* A proximity sensor: the IEC diamond. */
    case "SENSOR":
      return (
        <g>
          {leads(9)}
          <path
            d={`M ${x - 9} ${y} L ${x} ${y - 7} L ${x + 9} ${y} L ${x} ${y + 7} Z`}
            {...s}
            fill={live ? "rgba(22,163,74,0.18)" : "none"}
          />
          <line x1={x - 3.5} y1={y} x2={x + 3.5} y2={y} stroke={c} strokeWidth={1.2} />
        </g>
      );

    /* An indicator lamp: circle with a cross. */
    case "LAMP":
      return (
        <g>
          {leads(8)}
          <circle cx={x} cy={y} r={8} {...s} fill={live ? "rgba(22,163,74,0.22)" : "none"} />
          <line x1={x - 5.6} y1={y - 5.6} x2={x + 5.6} y2={y + 5.6} stroke={c} strokeWidth={1.3} />
          <line x1={x + 5.6} y1={y - 5.6} x2={x - 5.6} y2={y + 5.6} stroke={c} strokeWidth={1.3} />
        </g>
      );

    /* A motor: circle with M. */
    case "MOTOR":
      return (
        <g>
          {leads(9)}
          <circle cx={x} cy={y} r={9} {...s} fill={live ? "rgba(22,163,74,0.22)" : "none"} />
          <text x={x} y={y + 3.5} textAnchor="middle" fontSize={9.5} fontWeight={700} fill={c}>
            M
          </text>
        </g>
      );

    /* An analog transducer: a box with the signal it produces. */
    case "VALUE":
      return (
        <g>
          {leads(9)}
          <rect
            x={x - 9}
            y={y - 7}
            width={18}
            height={14}
            rx={2}
            {...s}
            fill={live ? "rgba(22,163,74,0.18)" : "none"}
          />
          <path
            d={`M ${x - 5} ${y + 3} L ${x - 1} ${y - 3} L ${x + 2} ${y + 1} L ${x + 5} ${y - 4}`}
            fill="none"
            stroke={c}
            strokeWidth={1.3}
          />
        </g>
      );

    default:
      return (
        <g>
          {leads(8)}
          <rect
            x={x - 8}
            y={y - 7}
            width={16}
            height={14}
            rx={2}
            {...s}
            fill={live ? "rgba(22,163,74,0.22)" : "none"}
          />
        </g>
      );
  }
}

/** A screw terminal on the controller's edge. */
function Terminal({
  x,
  y,
  label,
  live,
  side,
}: {
  x: number;
  y: number;
  label: string;
  live: boolean;
  side: "left" | "right";
}) {
  return (
    <g>
      <rect
        x={x - 5}
        y={y - 5}
        width={10}
        height={10}
        rx={1.5}
        fill={SCREW}
        stroke={CASE_EDGE}
        strokeWidth={1}
      />
      <line x1={x - 3} y1={y} x2={x + 3} y2={y} stroke="#7b8794" strokeWidth={1.2} />
      {live && <circle cx={x} cy={y - 9} r={2.2} fill={LIVE} />}
      <text
        x={side === "left" ? x + 9 : x - 9}
        y={y + 3}
        textAnchor={side === "left" ? "start" : "end"}
        fontSize={8}
        fontWeight={700}
        fontFamily="ui-monospace, monospace"
        fill="#cbd5e1"
      >
        {label}
      </text>
    </g>
  );
}

export default function SimWiring({
  tags,
  powered,
  zoom = 1,
  onHold,
  onToggle,
}: {
  tags: Tag[];
  powered: boolean;
  /** Scales the drawing only. The caption stays readable at one size — it is
      prose, and prose does not need magnifying because a terminal number
      does. */
  zoom?: number;
  onHold?: (name: string, down: boolean) => void;
  onToggle?: (name: string) => void;
}) {
  // Only what is actually wired to a terminal appears here. An internal M
  // bit has no screw and no wire; drawing one would be a lie.
  const ins = tags
    .filter((t) => t.isInput && terminalFor(t.address))
    .map((t) => ({ t, term: terminalFor(t.address)! }))
    .sort((a, b) => a.term.index - b.term.index);

  const outs = tags
    .filter((t) => t.isOutput && terminalFor(t.address))
    .map((t) => ({ t, term: terminalFor(t.address)! }))
    .sort((a, b) => a.term.index - b.term.index);

  const rows = Math.max(ins.length, outs.length, 1);
  const railTop = HEAD - 10;
  const H = railTop + PLATE + rows * ROW + FOOT;
  const railBottom = H - 14;

  // Terminals begin below the nameplate band, and each row is centred in its
  // own slot so the caption under a device never reaches the row beneath.
  const rowY = (i: number) => railTop + PLATE + 18 + i * ROW;

  const unwired = tags.filter((t) => (t.isInput || t.isOutput) && !terminalFor(t.address));

  return (
    <div className="p-2">
      {/* Scaled by widening the viewBox target rather than transforming it:
          an SVG re-drawn larger stays crisp, where a transform would blur the
          hairlines that make a wiring diagram readable. */}
      <svg
        width="100%"
        viewBox={`0 0 ${W} ${H}`}
        style={{ maxWidth: W * zoom, display: "block", margin: "0 auto" }}
        role="img"
        aria-label="How each device is wired to the controller"
      >
        {/* ── The supply ────────────────────────────────────────────
            Every circuit on the drawing runs from L+ on the left to M on the
            right. This is the shape ladder logic is a picture of. */}
        <line
          x1={RAIL_L}
          y1={railTop}
          x2={RAIL_L}
          y2={railBottom}
          stroke={powered ? RAIL_POS : DEAD}
          strokeWidth={2.4}
        />
        <line
          x1={RAIL_R}
          y1={railTop}
          x2={RAIL_R}
          y2={railBottom}
          stroke={powered ? RAIL_NEG : DEAD}
          strokeWidth={2.4}
        />

        <text
          x={RAIL_L}
          y={18}
          textAnchor="middle"
          fontSize={10}
          fontWeight={800}
          fill={powered ? RAIL_POS : DEAD}
        >
          L+
        </text>
        <text x={RAIL_L} y={29} textAnchor="middle" fontSize={7.5} fill={LABEL}>
          24 V
        </text>
        <text
          x={RAIL_R}
          y={18}
          textAnchor="middle"
          fontSize={10}
          fontWeight={800}
          fill={powered ? RAIL_NEG : DEAD}
        >
          M
        </text>
        <text x={RAIL_R} y={29} textAnchor="middle" fontSize={7.5} fill={LABEL}>
          0 V
        </text>

        {/* ── The controller ────────────────────────────────────────
            The same CPU as the panel view, with the same terminal numbers. */}
        <rect
          x={CPU_L}
          y={railTop + 2}
          width={CPU_R - CPU_L}
          height={railBottom - railTop - 4}
          rx={4}
          fill={CASE}
          stroke={CASE_EDGE}
          strokeWidth={1.4}
        />
        <text
          x={(CPU_L + CPU_R) / 2}
          y={railTop + 14}
          textAnchor="middle"
          fontSize={8.5}
          fontWeight={900}
          fill="#e2e8f0"
          letterSpacing={1}
        >
          WARTENS
        </text>
        <text
          x={(CPU_L + CPU_R) / 2}
          y={railTop + 24}
          textAnchor="middle"
          fontSize={7}
          fontWeight={700}
          fill="#93c5fd"
        >
          {CPU.model}
        </text>
        <line
          x1={CPU_L + 6}
          y1={railTop + PLATE - 2}
          x2={CPU_R - 6}
          y2={railTop + PLATE - 2}
          stroke="#475569"
          strokeWidth={0.8}
        />

        {/* The controller's own supply — it needs power before anything else
            works, which is the step students skip. */}
        {(() => {
          const y = railBottom - 12;
          return (
            <g>
              <line
                x1={RAIL_L}
                y1={y}
                x2={CPU_L - 5}
                y2={y}
                stroke={powered ? RAIL_POS : DEAD}
                strokeWidth={1.6}
                strokeDasharray="4 3"
              />
              <line
                x1={CPU_R + 5}
                y1={y}
                x2={RAIL_R}
                y2={y}
                stroke={powered ? RAIL_NEG : DEAD}
                strokeWidth={1.6}
                strokeDasharray="4 3"
              />
              <Terminal x={CPU_L} y={y} label="L+" live={powered} side="left" />
              <Terminal x={CPU_R} y={y} label="M" live={powered} side="right" />
              <text
                x={(CPU_L + CPU_R) / 2}
                y={y + 3}
                textAnchor="middle"
                fontSize={6.5}
                fill="#94a3b8"
              >
                supply
              </text>
            </g>
          );
        })()}

        {/* ── Input circuits: L+ → device → input terminal ─────────── */}
        {ins.map(({ t, term }, i) => {
          const y = rowY(i);
          const live = powered && on(t);
          const c = live ? LIVE : DEAD;
          return (
            <g
              key={t.name}
              style={{ cursor: onHold || onToggle ? "pointer" : "default" }}
              onMouseDown={() => {
                if (deviceOf(t).startsWith("PUSHBUTTON")) onHold?.(t.name, true);
                else onToggle?.(t.name);
              }}
              onMouseUp={() => {
                if (deviceOf(t).startsWith("PUSHBUTTON")) onHold?.(t.name, false);
              }}
              onMouseLeave={() => {
                if (deviceOf(t).startsWith("PUSHBUTTON")) onHold?.(t.name, false);
              }}
            >
              <line x1={RAIL_L} y1={y} x2={CPU_L - 5} y2={y} stroke={c} strokeWidth={1.7} />
              <Device kind={deviceOf(t)} x={(RAIL_L + CPU_L) / 2} y={y} live={live} />
              <Terminal
                x={CPU_L}
                y={y}
                label={terminalLabel("in", term.index)}
                live={live}
                side="left"
              />
              <text
                x={(RAIL_L + CPU_L) / 2}
                y={y + 21}
                textAnchor="middle"
                fontSize={8.5}
                fontWeight={600}
                fill="#0f172a"
              >
                {t.name}
              </text>
              <text
                x={(RAIL_L + CPU_L) / 2}
                y={y + 30}
                textAnchor="middle"
                fontSize={6.5}
                fill={LABEL}
              >
                {DEVICE_LABEL[deviceOf(t)]}
              </text>
            </g>
          );
        })}

        {/* ── Output circuits: output terminal → load → M ──────────── */}
        {outs.map(({ t, term }, i) => {
          const y = rowY(i);
          const live = powered && on(t);
          const c = live ? LIVE : DEAD;
          return (
            <g key={t.name}>
              <line x1={CPU_R + 5} y1={y} x2={RAIL_R} y2={y} stroke={c} strokeWidth={1.7} />
              <Terminal
                x={CPU_R}
                y={y}
                label={terminalLabel("out", term.index)}
                live={live}
                side="right"
              />
              <Device kind={deviceOf(t)} x={(CPU_R + RAIL_R) / 2} y={y} live={live} />
              <text
                x={(CPU_R + RAIL_R) / 2}
                y={y + 21}
                textAnchor="middle"
                fontSize={8.5}
                fontWeight={600}
                fill="#0f172a"
              >
                {t.name}
              </text>
              <text
                x={(CPU_R + RAIL_R) / 2}
                y={y + 30}
                textAnchor="middle"
                fontSize={6.5}
                fill={LABEL}
              >
                {DEVICE_LABEL[deviceOf(t)]}
              </text>
            </g>
          );
        })}

        {ins.length === 0 && outs.length === 0 && (
          <text x={W / 2} y={HEAD + 30} textAnchor="middle" fontSize={10} fill={LABEL}>
            Give a tag an address to see it wired here.
          </text>
        )}
      </svg>

      <p className="mt-1.5 text-[10px] leading-relaxed" style={{ color: LABEL }}>
        Every circuit runs from <b style={{ color: RAIL_POS }}>L+</b> on the left to{" "}
        <b style={{ color: "#0f172a" }}>M</b> on the right — which is exactly the shape of a rung.
        An input completes its circuit through the field device into the terminal; an output is
        completed by the controller closing its own contact.
      </p>

      {unwired.length > 0 && (
        <p className="mt-1.5 text-[9.5px] leading-relaxed" style={{ color: "#B45309" }}>
          Not shown: {unwired.map((t) => t.name).join(", ")} —{" "}
          {unwired.length === 1 ? "it has" : "they have"} no terminal address, so{" "}
          {unwired.length === 1 ? "it lives" : "they live"} in memory rather than on a screw.
        </p>
      )}
    </div>
  );
}
