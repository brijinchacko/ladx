"use client";

import { brand, ink, line, state, surface } from "../lib/theme";
import { type ElementType, INSTRUCTIONS } from "../lib/types";

/**
 * What each instruction actually does, drawn.
 *
 * A paragraph can say "TOF times on the falling edge" and a student can read
 * it twice and still not picture it. A timing chart shows it once. These are
 * the diagrams a PLC manual carries, because for this material they are not
 * decoration, they are the explanation, and the prose is the caption.
 *
 * Drawn as inline SVG rather than shipped as images so they stay sharp at any
 * size, carry no download, and take their colours from the same tokens as the
 * rest of the editor: a red on a chart here is the same red as a fault in
 * the message log, which is the whole point of having tokens.
 */

/* ══ The rung symbol ═══════════════════════════════════════════════ */

/**
 * The instruction as it is drawn on a rung, at a size you can actually study.
 * The palette's version of this is 24px wide and meant to be recognised, not
 * read.
 */
export function InstructionSymbol({ type, scale = 1 }: { type: ElementType; scale?: number }) {
  const meta = INSTRUCTIONS.find((i) => i.type === type);
  const W = 108 * scale;
  const H = 52 * scale;
  const cy = H / 2;
  const stroke = ink.strong;
  const sw = 1.9 * scale;

  const wire = (x1: number, x2: number) => (
    <line x1={x1} y1={cy} x2={x2} y2={cy} stroke={stroke} strokeWidth={sw} strokeLinecap="square" />
  );

  // Contacts, two verticals with a gap, the IEC drawing.
  if (type === "XIC" || type === "XIO" || type === "ONS") {
    const gap = 15 * scale;
    const l = W / 2 - gap;
    const r = W / 2 + gap;
    const h = 15 * scale;
    return (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${type} symbol`}>
        {wire(0, l)}
        {wire(r, W)}
        <line x1={l} y1={cy - h} x2={l} y2={cy + h} stroke={stroke} strokeWidth={sw} />
        <line x1={r} y1={cy - h} x2={r} y2={cy + h} stroke={stroke} strokeWidth={sw} />
        {type === "XIO" && (
          // The slash that makes it normally closed.
          <line
            x1={l - 3 * scale}
            y1={cy + h}
            x2={r + 3 * scale}
            y2={cy - h}
            stroke={stroke}
            strokeWidth={sw}
          />
        )}
        {type === "ONS" && (
          <text
            x={W / 2}
            y={cy + 5 * scale}
            textAnchor="middle"
            fontSize={15 * scale}
            fontWeight={700}
            fill={stroke}
          >
            P
          </text>
        )}
      </svg>
    );
  }

  // Coils, two facing arcs.
  if (meta && meta.side === "output" && meta.group === "Bit") {
    const gap = 15 * scale;
    const l = W / 2 - gap;
    const r = W / 2 + gap;
    const rad = 15 * scale;
    return (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${type} symbol`}>
        {wire(0, l)}
        {wire(r, W)}
        <path
          d={`M ${l} ${cy - rad} A ${rad} ${rad} 0 0 0 ${l} ${cy + rad}`}
          fill="none"
          stroke={stroke}
          strokeWidth={sw}
        />
        <path
          d={`M ${r} ${cy - rad} A ${rad} ${rad} 0 0 1 ${r} ${cy + rad}`}
          fill="none"
          stroke={stroke}
          strokeWidth={sw}
        />
        {(type === "OTL" || type === "OTU") && (
          <text
            x={W / 2}
            y={cy + 5 * scale}
            textAnchor="middle"
            fontSize={15 * scale}
            fontWeight={700}
            fill={stroke}
          >
            {type === "OTL" ? "L" : "U"}
          </text>
        )}
      </svg>
    );
  }

  // Everything else is a box with the mnemonic in it.
  const bw = 74 * scale;
  const bh = 38 * scale;
  const bx = (W - bw) / 2;
  const by = (H - bh) / 2;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${type} symbol`}>
      {wire(0, bx)}
      {wire(bx + bw, W)}
      <rect
        x={bx}
        y={by}
        width={bw}
        height={bh}
        rx={2.5 * scale}
        fill={surface.raised}
        stroke={stroke}
        strokeWidth={sw}
      />
      <text
        x={W / 2}
        y={cy + 5 * scale}
        textAnchor="middle"
        fontSize={14 * scale}
        fontWeight={700}
        fill={stroke}
        fontFamily="ui-monospace, monospace"
      >
        {type}
      </text>
    </svg>
  );
}

/* ══ Timing charts ═════════════════════════════════════════════════ */

const SLOT = 21;
const ROW = 30;
const LABEL_W = 62;

type BitTrace = {
  kind: "bit";
  label: string;
  /** One character per time slot: "1" high, "0" low. */
  bits: string;
  tone: "input" | "power" | "output";
};

type RampTrace = {
  kind: "ramp";
  label: string;
  /** 0..1 per slot. */
  values: number[];
  /** A dashed line across, e.g. the preset. */
  threshold?: { at: number; label: string };
};

type Marker = { slot: number; label: string; tone?: "note" | "live" };
type Trace = BitTrace | RampTrace;

const TONE: Record<BitTrace["tone"], string> = {
  input: ink.base,
  power: state.live,
  output: brand.blueInk,
};

function Timing({
  traces,
  markers,
  caption,
}: { traces: Trace[]; markers?: Marker[]; caption?: string }) {
  const slots = Math.max(
    ...traces.map((t) => (t.kind === "bit" ? t.bits.length : t.values.length)),
  );
  const chartW = slots * SLOT;
  const W = LABEL_W + chartW + 10;
  const markerH = markers?.length ? 16 : 0;
  const H = markerH + traces.length * ROW + 8;

  return (
    <figure style={{ margin: 0, display: "grid", justifyItems: "center" }}>
      <svg
        width="100%"
        viewBox={`0 0 ${W} ${H}`}
        style={{ maxWidth: W }}
        role="img"
        aria-label={caption ?? "Timing diagram"}
      >
        {/* Slot grid, faint, so the eye can line events up across rows. */}
        {Array.from({ length: slots + 1 }, (_, i) => (
          <line
            key={i}
            x1={LABEL_W + i * SLOT}
            y1={markerH}
            x2={LABEL_W + i * SLOT}
            y2={H - 8}
            stroke={line.hairline}
            strokeWidth={1}
          />
        ))}

        {markers?.map((m, i) => {
          const x = LABEL_W + m.slot * SLOT;
          const c = m.tone === "live" ? state.live : ink.faint;
          return (
            <g key={i}>
              <line
                x1={x}
                y1={markerH - 4}
                x2={x}
                y2={H - 8}
                stroke={c}
                strokeWidth={1}
                strokeDasharray="2 3"
              />
              <text x={x + 3} y={9} fontSize={8.5} fill={c} fontWeight={600}>
                {m.label}
              </text>
            </g>
          );
        })}

        {traces.map((t, r) => {
          const top = markerH + r * ROW;
          const hi = top + 7;
          const lo = top + 22;
          return (
            <g key={r}>
              <text
                x={LABEL_W - 7}
                y={lo - 3}
                textAnchor="end"
                fontSize={9.5}
                fill={ink.muted}
                fontWeight={600}
              >
                {t.label}
              </text>
              {t.kind === "bit" ? (
                <BitWave bits={t.bits} hi={hi} lo={lo} colour={TONE[t.tone]} />
              ) : (
                <RampWave t={t} hi={hi} lo={lo} slots={slots} />
              )}
            </g>
          );
        })}
      </svg>
      {caption && (
        <figcaption style={{ fontSize: 10.5, color: ink.muted, marginTop: 3, lineHeight: 1.45 }}>
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

/** A square wave, with the vertical edges drawn, that is where the eye looks. */
function BitWave({
  bits,
  hi,
  lo,
  colour,
}: { bits: string; hi: number; lo: number; colour: string }) {
  const pts: string[] = [];
  let prev: string | null = null;
  bits.split("").forEach((b, i) => {
    const x = LABEL_W + i * SLOT;
    const y = b === "1" ? hi : lo;
    if (prev !== null && prev !== b)
      pts.push(`L ${x} ${y}`); // the edge
    else if (prev === null) pts.push(`M ${x} ${y}`);
    pts.push(`L ${x + SLOT} ${y}`);
    prev = b;
  });
  return (
    <>
      {/* A wash under the high sections, so "on" reads at a glance. */}
      {bits
        .split("")
        .map((b, i) =>
          b === "1" ? (
            <rect
              key={i}
              x={LABEL_W + i * SLOT}
              y={hi}
              width={SLOT}
              height={lo - hi}
              fill={colour}
              opacity={0.09}
            />
          ) : null,
        )}
      <path
        d={pts.join(" ")}
        fill="none"
        stroke={colour}
        strokeWidth={1.9}
        strokeLinejoin="miter"
        strokeLinecap="square"
      />
    </>
  );
}

/** The accumulator: a ramp that resets, with the preset marked across it. */
function RampWave({ t, hi, lo, slots }: { t: RampTrace; hi: number; lo: number; slots: number }) {
  const y = (v: number) => lo - v * (lo - hi);
  const d = t.values
    .map((v, i) => `${i === 0 ? "M" : "L"} ${LABEL_W + i * SLOT} ${y(v)}`)
    .join(" ");
  return (
    <>
      {t.threshold && (
        <>
          <line
            x1={LABEL_W}
            y1={y(t.threshold.at)}
            x2={LABEL_W + slots * SLOT}
            y2={y(t.threshold.at)}
            stroke={state.warn}
            strokeWidth={1}
            strokeDasharray="3 3"
          />
          <text
            x={LABEL_W + slots * SLOT}
            y={y(t.threshold.at) - 3}
            textAnchor="end"
            fontSize={8}
            fill={state.warn}
            fontWeight={700}
          >
            {t.threshold.label}
          </text>
        </>
      )}
      <path d={d} fill="none" stroke={brand.tealInk} strokeWidth={1.9} strokeLinejoin="round" />
    </>
  );
}

/* ══ Data-flow diagrams ════════════════════════════════════════════ */

/** Source → operation → destination, for MOV and the maths instructions. */
function DataFlow({
  inputs,
  op,
  out,
  note,
}: { inputs: string[]; op: string; out: string; note?: string }) {
  const boxW = 74,
    boxH = 26,
    gap = 34;
  const rows = inputs.length;
  const H = Math.max(rows * (boxH + 8), boxH) + 26;
  const midY = (H - 26) / 2;
  const opX = boxW + gap;
  const outX = opX + 52 + gap;
  const W = outX + boxW + 4;

  return (
    <figure style={{ margin: 0, display: "grid", justifyItems: "center" }}>
      <svg
        width="100%"
        viewBox={`0 0 ${W} ${H}`}
        style={{ maxWidth: W }}
        role="img"
        aria-label={`${op} data flow`}
      >
        <defs>
          <marker id="dfArrow" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 z" fill={ink.muted} />
          </marker>
        </defs>

        {inputs.map((label, i) => {
          const y = rows === 1 ? midY : i * (boxH + 8);
          return (
            <g key={i}>
              <rect
                x={0}
                y={y}
                width={boxW}
                height={boxH}
                rx={4}
                fill={surface.subtle}
                stroke={line.base}
              />
              <text
                x={boxW / 2}
                y={y + boxH / 2 + 3.5}
                textAnchor="middle"
                fontSize={10.5}
                fill={ink.base}
                fontFamily="ui-monospace, monospace"
              >
                {label}
              </text>
              <path
                d={`M ${boxW} ${y + boxH / 2} L ${opX - 6} ${midY + boxH / 2}`}
                stroke={ink.muted}
                strokeWidth={1.3}
                fill="none"
                markerEnd="url(#dfArrow)"
              />
            </g>
          );
        })}

        <rect
          x={opX}
          y={midY}
          width={52}
          height={boxH}
          rx={4}
          fill={brand.tealWash}
          stroke={brand.teal}
          strokeWidth={1.4}
        />
        <text
          x={opX + 26}
          y={midY + boxH / 2 + 3.5}
          textAnchor="middle"
          fontSize={11}
          fontWeight={700}
          fill={brand.tealInk}
          fontFamily="ui-monospace, monospace"
        >
          {op}
        </text>

        <path
          d={`M ${opX + 52} ${midY + boxH / 2} L ${outX - 6} ${midY + boxH / 2}`}
          stroke={ink.muted}
          strokeWidth={1.3}
          markerEnd="url(#dfArrow)"
        />

        <rect
          x={outX}
          y={midY}
          width={boxW}
          height={boxH}
          rx={4}
          fill={brand.blueWash}
          stroke={brand.blue}
          strokeWidth={1.4}
        />
        <text
          x={outX + boxW / 2}
          y={midY + boxH / 2 + 3.5}
          textAnchor="middle"
          fontSize={10.5}
          fill={brand.blueInk}
          fontFamily="ui-monospace, monospace"
        >
          {out}
        </text>

        <text x={0} y={H - 5} fontSize={8.5} fill={ink.faint}>
          source
        </text>
        <text x={outX} y={H - 5} fontSize={8.5} fill={ink.faint}>
          destination, overwritten
        </text>
      </svg>
      {note && (
        <figcaption style={{ fontSize: 10.5, color: ink.muted, marginTop: 3 }}>{note}</figcaption>
      )}
    </figure>
  );
}

/** A number line showing exactly where a comparison flips. */
function CompareLine({
  op,
  pivot,
  passes,
}: { op: string; pivot: number; passes: (v: number) => boolean }) {
  const vals = [pivot - 2, pivot - 1, pivot, pivot + 1, pivot + 2];
  const step = 62,
    W = vals.length * step + 10,
    H = 60;
  return (
    <figure style={{ margin: 0, display: "grid", justifyItems: "center" }}>
      <svg
        width="100%"
        viewBox={`0 0 ${W} ${H}`}
        style={{ maxWidth: W }}
        role="img"
        aria-label={`${op} comparison`}
      >
        <line x1={6} y1={30} x2={W - 6} y2={30} stroke={line.base} strokeWidth={1.4} />
        {vals.map((v, i) => {
          const x = 6 + i * step + step / 2;
          const on = passes(v);
          return (
            <g key={v}>
              <line x1={x} y1={25} x2={x} y2={35} stroke={line.base} strokeWidth={1.2} />
              <text
                x={x}
                y={20}
                textAnchor="middle"
                fontSize={10.5}
                fill={ink.base}
                fontFamily="ui-monospace, monospace"
                fontWeight={v === pivot ? 700 : 400}
              >
                {v}
              </text>
              <rect
                x={x - 26}
                y={40}
                width={52}
                height={16}
                rx={8}
                fill={on ? state.liveWash : state.idleWash}
                stroke={on ? state.live : state.idle}
                strokeWidth={1}
              />
              <text
                x={x}
                y={51.5}
                textAnchor="middle"
                fontSize={8.5}
                fontWeight={700}
                fill={on ? state.live : state.idle}
              >
                {on ? "PASSES" : "BLOCKS"}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption style={{ fontSize: 10.5, color: ink.muted, marginTop: 3 }}>
        {`A is the value on the left of the instruction, B is ${pivot}. Green is power through.`}
      </figcaption>
    </figure>
  );
}

/** Main calls a routine and carries on where it left off. */
function CallFlow() {
  const W = 330,
    H = 104;
  const box = (
    x: number,
    y: number,
    w: number,
    h: number,
    label: string,
    sub: string,
    accent: boolean,
  ) => (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={4}
        fill={accent ? brand.tealWash : surface.subtle}
        stroke={accent ? brand.teal : line.base}
        strokeWidth={1.3}
      />
      <text
        x={x + w / 2}
        y={y + 15}
        textAnchor="middle"
        fontSize={10.5}
        fontWeight={700}
        fill={accent ? brand.tealInk : ink.base}
      >
        {label}
      </text>
      <text x={x + w / 2} y={y + 28} textAnchor="middle" fontSize={8.5} fill={ink.muted}>
        {sub}
      </text>
    </g>
  );
  return (
    <figure style={{ margin: 0, display: "grid", justifyItems: "center" }}>
      <svg
        width="100%"
        viewBox={`0 0 ${W} ${H}`}
        style={{ maxWidth: W }}
        role="img"
        aria-label="JSR call flow"
      >
        <defs>
          <marker id="cfArrow" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 z" fill={brand.tealInk} />
          </marker>
        </defs>
        {box(4, 8, 96, 36, "Main", "network 1", false)}
        {box(4, 60, 96, 36, "Main", "network 3", false)}
        {box(190, 34, 136, 36, "Conveyor", "the whole routine", true)}
        <path
          d="M 100 26 L 184 46"
          stroke={brand.tealInk}
          strokeWidth={1.4}
          fill="none"
          markerEnd="url(#cfArrow)"
        />
        <path
          d="M 190 62 L 106 78"
          stroke={brand.tealInk}
          strokeWidth={1.4}
          fill="none"
          markerEnd="url(#cfArrow)"
        />
        <text x={112} y={34} fontSize={8.5} fill={brand.tealInk} fontWeight={600}>
          JSR Conveyor
        </text>
        <text x={116} y={90} fontSize={8.5} fill={ink.muted}>
          then carries on
        </text>
      </svg>
      <figcaption style={{ fontSize: 10.5, color: ink.muted, marginTop: 3 }}>
        Network 2 is the JSR. Everything in Conveyor runs before network 3 does.
      </figcaption>
    </figure>
  );
}

/* ══ The per-instruction diagram ═══════════════════════════════════ */

/** Twelve slots of "scan time". Long enough to show a delay, short enough to read. */
const OFF_ON = "000111111111";

export function InstructionDiagram({ type }: { type: ElementType }) {
  switch (type) {
    case "XIC":
      return (
        <Timing
          caption="Power passes while the bit is 1. The contact follows the bit exactly."
          traces={[
            { kind: "bit", label: "Tag", bits: "001111000111", tone: "input" },
            { kind: "bit", label: "Power", bits: "001111000111", tone: "power" },
          ]}
        />
      );

    case "XIO":
      return (
        <Timing
          caption="The inverse: power passes while the bit is 0."
          traces={[
            { kind: "bit", label: "Tag", bits: "001111000111", tone: "input" },
            { kind: "bit", label: "Power", bits: "110000111000", tone: "power" },
          ]}
        />
      );

    case "ONS":
      return (
        <Timing
          markers={[{ slot: 3, label: "rising edge", tone: "live" }]}
          caption="One scan only. Holding the button down changes nothing, the pulse has already been and gone."
          traces={[
            { kind: "bit", label: "Rung", bits: OFF_ON, tone: "input" },
            { kind: "bit", label: "Passes", bits: "000100000000", tone: "power" },
          ]}
        />
      );

    case "OTE":
      return (
        <Timing
          caption="The output is rewritten every scan, so it drops the moment the rung does. It holds no memory."
          traces={[
            { kind: "bit", label: "Rung", bits: "001111000110", tone: "input" },
            { kind: "bit", label: "Tag", bits: "001111000110", tone: "output" },
          ]}
        />
      );

    case "OTL":
      return (
        <Timing
          markers={[{ slot: 2, label: "set", tone: "live" }]}
          caption="Set and left. The rung going false does not clear it, only an OTU on the same tag will."
          traces={[
            { kind: "bit", label: "Rung", bits: "001100000000", tone: "input" },
            { kind: "bit", label: "Tag", bits: "001111111111", tone: "output" },
          ]}
        />
      );

    case "OTU":
      return (
        <Timing
          markers={[
            { slot: 1, label: "OTL" },
            { slot: 7, label: "OTU" },
          ]}
          caption="The partner to OTL. Between the two the bit stays set, whatever else happens."
          traces={[
            { kind: "bit", label: "OTL rung", bits: "010000000000", tone: "input" },
            { kind: "bit", label: "OTU rung", bits: "000000010000", tone: "input" },
            { kind: "bit", label: "Tag", bits: "011111100000", tone: "output" },
          ]}
        />
      );

    case "TON":
      return (
        <Timing
          markers={[
            { slot: 3, label: "rung true" },
            { slot: 8, label: "done", tone: "live" },
          ]}
          caption="ACC counts up while the rung is true. DN goes true when it reaches the preset: and the rung going false resets ACC to zero at once."
          traces={[
            { kind: "bit", label: "Rung", bits: "000111111100", tone: "input" },
            {
              kind: "ramp",
              label: "ACC",
              values: [0, 0, 0, 0, 0.2, 0.4, 0.6, 0.8, 1, 1, 0, 0],
              threshold: { at: 1, label: "PRE" },
            },
            { kind: "bit", label: "DN", bits: "000000000110", tone: "output" },
          ]}
        />
      );

    case "TOF":
      return (
        <Timing
          markers={[
            { slot: 2, label: "rung true" },
            { slot: 6, label: "rung false" },
          ]}
          caption="The mirror of TON. DN comes on immediately and the timing starts when the rung goes false, this is how a fan runs on after the process stops."
          traces={[
            { kind: "bit", label: "Rung", bits: "001111000000", tone: "input" },
            {
              kind: "ramp",
              label: "ACC",
              values: [0, 0, 0, 0, 0, 0, 0.25, 0.5, 0.75, 1, 1, 1],
              threshold: { at: 1, label: "PRE" },
            },
            { kind: "bit", label: "DN", bits: "001111111000", tone: "output" },
          ]}
        />
      );

    case "CTU":
      return (
        <Timing
          markers={[{ slot: 9, label: "PRE reached", tone: "live" }]}
          caption="One count per false-to-true transition, not once per scan while true. ACC keeps counting past the preset, only a RES clears it."
          traces={[
            { kind: "bit", label: "Rung", bits: "010101010101", tone: "input" },
            {
              kind: "ramp",
              label: "ACC",
              values: [0, 0.2, 0.2, 0.4, 0.4, 0.6, 0.6, 0.8, 0.8, 1, 1, 1],
              threshold: { at: 1, label: "PRE" },
            },
            { kind: "bit", label: "DN", bits: "000000000111", tone: "output" },
          ]}
        />
      );

    case "CTD":
      return (
        <Timing
          caption="The same edges, counting the other way. Paired with a CTU on one tag it tracks how many are currently inside."
          traces={[
            { kind: "bit", label: "Rung", bits: "010101010000", tone: "input" },
            {
              kind: "ramp",
              label: "ACC",
              values: [1, 0.8, 0.8, 0.6, 0.6, 0.4, 0.4, 0.2, 0.2, 0.2, 0.2, 0.2],
            },
          ]}
        />
      );

    case "RES":
      return (
        <Timing
          markers={[{ slot: 6, label: "RES" }]}
          caption="Clears ACC and drops the status bits. Note that while its rung stays true, the timer can never accumulate anything at all."
          traces={[
            { kind: "bit", label: "RES rung", bits: "000000110000", tone: "input" },
            {
              kind: "ramp",
              label: "ACC",
              values: [0.3, 0.5, 0.7, 0.9, 1, 1, 0, 0, 0.2, 0.4, 0.6, 0.8],
              threshold: { at: 1, label: "PRE" },
            },
            { kind: "bit", label: "DN", bits: "000011000000", tone: "output" },
          ]}
        />
      );

    case "EQU":
      return <CompareLine op="EQU" pivot={50} passes={(v) => v === 50} />;
    case "NEQ":
      return <CompareLine op="NEQ" pivot={50} passes={(v) => v !== 50} />;
    case "GRT":
      return <CompareLine op="GRT" pivot={50} passes={(v) => v > 50} />;
    case "LES":
      return <CompareLine op="LES" pivot={50} passes={(v) => v < 50} />;
    case "GEQ":
      return <CompareLine op="GEQ" pivot={50} passes={(v) => v >= 50} />;
    case "LEQ":
      return <CompareLine op="LEQ" pivot={50} passes={(v) => v <= 50} />;

    case "MOV":
      return (
        <DataFlow
          inputs={["5000"]}
          op="MOV"
          out="T1.PRE"
          note="The source is unchanged. This is how a recipe changes a dwell time while the machine runs."
        />
      );
    case "ADD":
      return (
        <DataFlow
          inputs={["Total", "1"]}
          op="ADD"
          out="Total"
          note="Runs every scan the rung is true, thousands of times a second. Put a ONS in front if you meant to count."
        />
      );
    case "SUB":
      return <DataFlow inputs={["Target", "Actual"]} op="SUB" out="Error" />;
    case "MUL":
      return <DataFlow inputs={["Parts", "Weight"]} op="MUL" out="Total_kg" />;
    case "DIV":
      return (
        <DataFlow
          inputs={["7", "2"]}
          op="DIV"
          out="Result = 3"
          note="Integer division, the remainder is discarded. Dividing by zero raises a fault and leaves the destination untouched."
        />
      );

    case "JSR":
      return <CallFlow />;
  }

  /*
   * No default branch, deliberately.
   *
   * Every ElementType is listed above, so adding an instruction to the
   * simulator without drawing it here is a compile error rather than a blank
   * space in the manual that nobody notices for six months. If this line
   * starts failing, the fix is a new case, not a cast.
   */
  const unreachable: never = type;
  return unreachable;
}
