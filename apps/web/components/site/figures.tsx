import { ScanCycle } from "./schematics";

/**
 * Article artwork.
 *
 * One drawing per article, each of the thing the article is actually about: a
 * timing diagram for the timers piece, a scaling line for the analog piece.
 * Nothing decorative, and nothing generic: a picture that could sit on any
 * article is a picture that belongs on none of them.
 */

const INK = "currentColor";
const TEAL = "rgb(var(--ladx-teal, 53 182 186))";

/** Two rungs, one reading a bit the other writes later, the one-scan lag. */
export function OutputImageFigure({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 480 200"
      className={className}
      role="img"
      aria-label="Two rungs showing that a bit written on rung two is only seen by rung one on the following scan"
    >
      <title>The one-scan lag</title>
      {[0, 1].map((i) => {
        const y = 52 + i * 82;
        return (
          <g key={i}>
            <text
              x="16"
              y={y - 22}
              fontSize="9.5"
              fontFamily="var(--font-mono, monospace)"
              fill={INK}
              opacity="0.5"
            >
              RUNG {i + 1}
            </text>
            <line
              x1="16"
              y1={y - 12}
              x2="16"
              y2={y + 12}
              stroke={INK}
              strokeWidth="1.75"
              opacity="0.45"
            />
            <line x1="16" y1={y} x2="92" y2={y} stroke={INK} strokeWidth="1.3" />
            <line x1="92" y1={y - 9} x2="92" y2={y + 9} stroke={INK} strokeWidth="1.8" />
            <line x1="106" y1={y - 9} x2="106" y2={y + 9} stroke={INK} strokeWidth="1.8" />
            <text
              x="99"
              y={y - 15}
              textAnchor="middle"
              fontSize="9"
              fontFamily="var(--font-mono, monospace)"
              fill={INK}
              opacity="0.8"
            >
              {i === 0 ? "Late" : "Start"}
            </text>
            <line x1="106" y1={y} x2="188" y2={y} stroke={INK} strokeWidth="1.3" />
            <path
              d={`M 188 ${y - 9} A 11 11 0 0 0 188 ${y + 9}`}
              stroke={INK}
              strokeWidth="1.8"
              fill="none"
            />
            <path
              d={`M 208 ${y - 9} A 11 11 0 0 1 208 ${y + 9}`}
              stroke={INK}
              strokeWidth="1.8"
              fill="none"
            />
            <text
              x="198"
              y={y - 15}
              textAnchor="middle"
              fontSize="9"
              fontFamily="var(--font-mono, monospace)"
              fill={INK}
              opacity="0.8"
            >
              {i === 0 ? "Early" : "Late"}
            </text>
            <line x1="208" y1={y} x2="250" y2={y} stroke={INK} strokeWidth="1.3" />
            <line
              x1="250"
              y1={y - 12}
              x2="250"
              y2={y + 12}
              stroke={INK}
              strokeWidth="1.75"
              opacity="0.45"
            />
          </g>
        );
      })}

      {/* The lag itself */}
      <path
        d="M 262 134 C 330 134, 330 52, 396 52"
        stroke={TEAL}
        strokeWidth="1.4"
        fill="none"
        strokeDasharray="4 3"
      />
      <circle cx="396" cy="52" r="3" fill={TEAL} />
      <text x="330" y="98" textAnchor="middle" fontSize="10" fontWeight="600" fill={TEAL}>
        one scan later
      </text>
      <text x="330" y="112" textAnchor="middle" fontSize="9" fill={INK} opacity="0.55">
        rung 1 already ran
      </text>
    </svg>
  );
}

/** TON / TOF / RTO against the same input, the differences are all on the falling edge. */
export function TimersFigure({ className }: { className?: string }) {
  // Preset is two divisions. Read the falling edges, that is where the three
  // differ, and the article says so.
  //
  //   TON  done two divisions after the rung goes true; resets the moment it
  //        goes false. The second pulse is too short to ever finish, which is
  //        worth showing rather than hiding.
  //   TOF  done while true, and stays done for two divisions AFTER false, //        then drops. An off-delay that never dropped would not be a timer.
  //   RTO  accumulates, reaches preset, and keeps it. Nothing here resets it,
  //        which is exactly the trap the article warns about.
  const rows = [
    { name: "Input", segs: [0, 0, 1, 1, 1, 0, 0, 1, 1, 0], accent: false },
    { name: "TON.DN", segs: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0], accent: true },
    { name: "TOF.DN", segs: [0, 0, 1, 1, 1, 1, 1, 0, 1, 1], accent: true },
    { name: "RTO.DN", segs: [0, 0, 0, 0, 1, 1, 1, 1, 1, 1], accent: true },
  ];
  const x0 = 74;
  const w = 38;

  return (
    <svg
      viewBox="0 0 480 190"
      className={className}
      role="img"
      aria-label="Timing diagram comparing TON, TOF and RTO done bits against the same input signal"
    >
      <title>How the three timers differ</title>
      {rows.map((row, ri) => {
        const yTop = 26 + ri * 40;
        const yBot = yTop + 20;
        let d = `M ${x0} ${row.segs[0] ? yTop : yBot}`;
        row.segs.forEach((v, i) => {
          const x = x0 + i * w;
          const prev = i === 0 ? v : row.segs[i - 1];
          if (v !== prev) d += ` L ${x} ${v ? yTop : yBot}`;
          d += ` L ${x + w} ${v ? yTop : yBot}`;
        });
        return (
          <g key={row.name}>
            <text
              x="66"
              y={yBot - 4}
              textAnchor="end"
              fontSize="10"
              fontFamily="var(--font-mono, monospace)"
              fill={INK}
              opacity={row.accent ? 0.9 : 0.6}
            >
              {row.name}
            </text>
            <line
              x1={x0}
              y1={yBot}
              x2={x0 + 10 * w}
              y2={yBot}
              stroke={INK}
              strokeWidth="0.75"
              opacity="0.15"
            />
            <path
              d={d}
              stroke={row.accent ? TEAL : INK}
              strokeWidth="1.6"
              fill="none"
              opacity={row.accent ? 1 : 0.65}
            />
          </g>
        );
      })}
      <text x={x0} y="182" fontSize="9" fill={INK} opacity="0.5">
        preset = 2 divisions
      </text>
      <text x={x0 + 10 * w} y="182" textAnchor="end" fontSize="9" fill={INK} opacity="0.5">
        RTO keeps its accumulator
      </text>
    </svg>
  );
}

/** The 4-20 mA scaling line, with the underrange region called out. */
export function AnalogFigure({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 480 220"
      className={className}
      role="img"
      aria-label="A straight line mapping 4 to 20 milliamps onto zero to ten bar, with the region below 4 milliamps marked as a broken loop"
    >
      <title>4-20 mA scaled to engineering units</title>
      {/* Axes */}
      <line x1="70" y1="170" x2="440" y2="170" stroke={INK} strokeWidth="1.2" opacity="0.45" />
      <line x1="70" y1="30" x2="70" y2="170" stroke={INK} strokeWidth="1.2" opacity="0.45" />

      {/* Underrange */}
      <rect x="70" y="30" width="52" height="140" fill={INK} opacity="0.05" />
      <line
        x1="122"
        y1="30"
        x2="122"
        y2="170"
        stroke={INK}
        strokeWidth="1"
        strokeDasharray="3 3"
        opacity="0.35"
      />
      <text x="96" y="192" textAnchor="middle" fontSize="9" fill={INK} opacity="0.6">
        broken loop
      </text>

      {/* The line */}
      <line x1="122" y1="170" x2="410" y2="46" stroke={TEAL} strokeWidth="2" />
      <circle cx="122" cy="170" r="3.5" fill={TEAL} />
      <circle cx="410" cy="46" r="3.5" fill={TEAL} />

      {/* Labels */}
      <text
        x="122"
        y="192"
        textAnchor="middle"
        fontSize="10"
        fontFamily="var(--font-mono, monospace)"
        fill={INK}
        opacity="0.8"
      >
        4 mA
      </text>
      <text
        x="410"
        y="192"
        textAnchor="middle"
        fontSize="10"
        fontFamily="var(--font-mono, monospace)"
        fill={INK}
        opacity="0.8"
      >
        20 mA
      </text>
      <text
        x="60"
        y="174"
        textAnchor="end"
        fontSize="10"
        fontFamily="var(--font-mono, monospace)"
        fill={INK}
        opacity="0.8"
      >
        0 bar
      </text>
      <text
        x="60"
        y="50"
        textAnchor="end"
        fontSize="10"
        fontFamily="var(--font-mono, monospace)"
        fill={INK}
        opacity="0.8"
      >
        10 bar
      </text>

      {/* Raw counts, the bit that varies by platform */}
      <text x="122" y="207" textAnchor="middle" fontSize="8.5" fill={INK} opacity="0.45">
        3277 / 5530
      </text>
      <text x="410" y="207" textAnchor="middle" fontSize="8.5" fill={INK} opacity="0.45">
        16384 / 27648
      </text>
      <text x="266" y="207" textAnchor="middle" fontSize="8.5" fill={INK} opacity="0.45">
        raw counts: AB / Siemens
      </text>
    </svg>
  );
}

/** What survives a platform migration, and what does not. */
export function MigrationFigure({ className }: { className?: string }) {
  const rows = [
    { label: "Bit logic", pct: 96 },
    { label: "Timers & counters", pct: 82 },
    { label: "Maths", pct: 78 },
    { label: "Addressing", pct: 40 },
    { label: "Block transfers", pct: 8 },
    { label: "PID tuning", pct: 5 },
  ];
  return (
    <svg
      viewBox="0 0 480 230"
      className={className}
      role="img"
      aria-label="Bar chart: bit logic converts almost entirely, while addressing, block transfers and PID tuning largely do not"
    >
      <title>What converts, and what doesn't</title>
      {rows.map((r, i) => {
        const y = 24 + i * 33;
        const w = (r.pct / 100) * 268;
        const weak = r.pct < 50;
        return (
          <g key={r.label}>
            <text x="152" y={y + 12} textAnchor="end" fontSize="10.5" fill={INK} opacity="0.8">
              {r.label}
            </text>
            <rect x="162" y={y} width="268" height="17" fill={INK} opacity="0.06" />
            <rect
              x="162"
              y={y}
              width={w}
              height="17"
              fill={weak ? INK : TEAL}
              opacity={weak ? 0.28 : 1}
            />
            <text
              x={162 + w + 8}
              y={y + 12}
              fontSize="9.5"
              fontFamily="var(--font-mono, monospace)"
              fill={INK}
              opacity="0.6"
            >
              {r.pct}%
            </text>
          </g>
        );
      })}
      <text x="162" y="222" fontSize="9" fill={INK} opacity="0.5">
        Roughly what an automated PLC-5 → ControlLogix pass gets through untouched
      </text>
    </svg>
  );
}

/** Generate → check → repair, drawn as a cycle rather than a pipeline. */
export function AiLoopFigure({ className }: { className?: string }) {
  const nodes = [
    { x: 78, label: "Model writes", sub: "any provider" },
    { x: 228, label: "Compiler answers", sub: "pass / fail" },
    { x: 378, label: "You read it", sub: "only if it passed" },
  ];
  return (
    <svg
      viewBox="0 0 480 180"
      className={className}
      role="img"
      aria-label="A loop: the model writes code, a compiler judges it, failures return to the model, and only passing code reaches the engineer"
    >
      <title>The loop that makes it usable</title>
      {nodes.map((n, i) => (
        <g key={n.label}>
          <rect
            x={n.x - 62}
            y="44"
            width="124"
            height="50"
            rx="2"
            fill={i === 2 ? TEAL : "none"}
            fillOpacity={i === 2 ? 0.1 : 0}
            stroke={i === 2 ? TEAL : INK}
            strokeWidth={i === 2 ? 1.5 : 1}
            opacity={i === 2 ? 1 : 0.4}
          />
          <text x={n.x} y="68" textAnchor="middle" fontSize="11.5" fontWeight="600" fill={INK}>
            {n.label}
          </text>
          <text
            x={n.x}
            y="83"
            textAnchor="middle"
            fontSize="8.5"
            fontFamily="var(--font-mono, monospace)"
            fill={INK}
            opacity="0.6"
          >
            {n.sub}
          </text>
        </g>
      ))}
      <path
        d="M 142 69 L 164 69"
        stroke={INK}
        strokeWidth="1.2"
        opacity="0.4"
        markerEnd="url(#f-arw)"
      />
      <path
        d="M 292 69 L 314 69"
        stroke={INK}
        strokeWidth="1.2"
        opacity="0.4"
        markerEnd="url(#f-arw)"
      />
      <path
        d="M 228 96 L 228 128 L 78 128 L 78 96"
        stroke={TEAL}
        strokeWidth="1.3"
        fill="none"
        strokeDasharray="4 3"
        markerEnd="url(#f-arwT)"
      />
      <text x="153" y="146" textAnchor="middle" fontSize="10" fontWeight="600" fill={TEAL}>
        failures go back, with the errors
      </text>
      <text x="153" y="160" textAnchor="middle" fontSize="9" fill={INK} opacity="0.55">
        this is what makes a free model good enough
      </text>
      <defs>
        <marker id="f-arw" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6" fill="none" stroke={INK} strokeWidth="1.2" opacity="0.5" />
        </marker>
        <marker id="f-arwT" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6" fill="none" stroke={TEAL} strokeWidth="1.2" />
        </marker>
      </defs>
    </svg>
  );
}

/* ── Counters: CU pulses accumulating to a preset ── */
export function CountersFigure({ className }: { className?: string }) {
  const pulses = [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 0];
  const x0 = 78;
  const w = 28;
  let acc = 0;
  const accs = pulses.map((v, i) => {
    if (v === 1 && pulses[i - 1] !== 1) acc += 1;
    return acc;
  });
  const preset = 4;
  return (
    <svg
      viewBox="0 0 480 190"
      className={className}
      role="img"
      aria-label="A counter accumulating one per rising edge until it reaches its preset of four, then latching its done bit"
    >
      <title>How a counter accumulates</title>
      <text
        x="70"
        y="42"
        textAnchor="end"
        fontSize="10"
        fontFamily="var(--font-mono, monospace)"
        fill={INK}
        opacity="0.7"
      >
        CU
      </text>
      {pulses.map((v, i) => (
        <rect
          key={`p-${i}-${v}`}
          x={x0 + i * w}
          y={v ? 28 : 42}
          width={w - 4}
          height={v ? 16 : 2}
          fill={v ? TEAL : INK}
          opacity={v ? 0.9 : 0.25}
        />
      ))}
      <text
        x="70"
        y="96"
        textAnchor="end"
        fontSize="10"
        fontFamily="var(--font-mono, monospace)"
        fill={INK}
        opacity="0.7"
      >
        ACC
      </text>
      {accs.map((a, i) => (
        <text
          key={`a-${i}-${a}`}
          x={x0 + i * w + (w - 4) / 2}
          y="96"
          textAnchor="middle"
          fontSize="11"
          fontFamily="var(--font-mono, monospace)"
          fill={INK}
          opacity={a >= preset ? 1 : 0.6}
          fontWeight={a >= preset ? 600 : 400}
        >
          {a}
        </text>
      ))}
      <text
        x="70"
        y="140"
        textAnchor="end"
        fontSize="10"
        fontFamily="var(--font-mono, monospace)"
        fill={INK}
        opacity="0.7"
      >
        DN
      </text>
      {accs.map((a, i) => (
        <rect
          key={`d-${i}-${a}`}
          x={x0 + i * w}
          y={a >= preset ? 126 : 140}
          width={w - 4}
          height={a >= preset ? 16 : 2}
          fill={a >= preset ? TEAL : INK}
          opacity={a >= preset ? 0.9 : 0.25}
        />
      ))}
      <text x={x0} y="176" fontSize="9" fill={INK} opacity="0.55">
        one count per rising edge, not per scan
      </text>
      <text x={x0 + 12 * w} y="176" textAnchor="end" fontSize="9" fill={INK} opacity="0.55">
        PRE = {preset}
      </text>
    </svg>
  );
}

/* ── One shot: a held input yields exactly one scan of output ── */
export function OneShotFigure({ className }: { className?: string }) {
  const x0 = 86;
  const w = 30;
  const input = [0, 0, 1, 1, 1, 1, 1, 0, 0, 1, 1, 0];
  const out = input.map((v, i) => (v === 1 && input[i - 1] !== 1 ? 1 : 0));
  const row = (label: string, data: number[], y: number, accent: boolean) => (
    <g>
      <text
        x="78"
        y={y + 14}
        textAnchor="end"
        fontSize="10"
        fontFamily="var(--font-mono, monospace)"
        fill={INK}
        opacity="0.75"
      >
        {label}
      </text>
      {data.map((v, i) => (
        <rect
          key={`${label}-${i}-${v}`}
          x={x0 + i * w}
          y={v ? y : y + 14}
          width={w - 3}
          height={v ? 18 : 2}
          fill={v ? (accent ? TEAL : INK) : INK}
          opacity={v ? (accent ? 1 : 0.7) : 0.2}
        />
      ))}
    </g>
  );
  return (
    <svg
      viewBox="0 0 480 150"
      className={className}
      role="img"
      aria-label="A held input produces exactly one scan of output from a one shot instruction"
    >
      <title>A one shot fires once per transition</title>
      {row("Input", input, 30, false)}
      {row("ONS", out, 82, true)}
      <text x={x0} y="136" fontSize="9" fill={INK} opacity="0.55">
        held for five scans, fires on one
      </text>
    </svg>
  );
}

/* ── Addressing: the anatomy of an I/O address, both dialects ── */
export function AddressingFigure({ className }: { className?: string }) {
  const part = (x: number, w: number, label: string, note: string, y: number, accent = false) => (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height="30"
        fill={accent ? TEAL : "none"}
        fillOpacity={accent ? 0.12 : 0}
        stroke={accent ? TEAL : INK}
        strokeWidth={accent ? 1.5 : 1}
        opacity={accent ? 1 : 0.4}
      />
      <text
        x={x + w / 2}
        y={y + 20}
        textAnchor="middle"
        fontSize="13"
        fontFamily="var(--font-mono, monospace)"
        fill={INK}
      >
        {label}
      </text>
      <text x={x + w / 2} y={y + 46} textAnchor="middle" fontSize="8.5" fill={INK} opacity="0.55">
        {note}
      </text>
    </g>
  );
  return (
    <svg
      viewBox="0 0 480 190"
      className={className}
      role="img"
      aria-label="The parts of a Siemens address and an Allen-Bradley address compared"
    >
      <title>Reading an I/O address</title>
      <text
        x="20"
        y="22"
        fontSize="9"
        fontFamily="var(--font-mono, monospace)"
        fill={INK}
        opacity="0.5"
      >
        SIEMENS
      </text>
      {part(20, 34, "%I", "area", 30, true)}
      {part(56, 44, "0", "byte", 30)}
      {part(102, 20, ".", "", 30)}
      {part(124, 34, "0", "bit", 30, true)}
      <text
        x="20"
        y="118"
        fontSize="9"
        fontFamily="var(--font-mono, monospace)"
        fill={INK}
        opacity="0.5"
      >
        ALLEN-BRADLEY (SLC)
      </text>
      {part(20, 34, "I", "file", 126, true)}
      {part(56, 20, ":", "", 126)}
      {part(78, 34, "1", "slot", 126)}
      {part(114, 20, "/", "", 126)}
      {part(136, 34, "0", "bit", 126, true)}
      <line x1="200" y1="24" x2="200" y2="172" stroke={INK} strokeWidth="1" opacity="0.15" />
      <text x="218" y="48" fontSize="10.5" fill={INK} opacity="0.8">
        Same terminal. Different vocabulary.
      </text>
      <text x="218" y="70" fontSize="9.5" fill={INK} opacity="0.6">
        Siemens addresses memory areas;
      </text>
      <text x="218" y="86" fontSize="9.5" fill={INK} opacity="0.6">
        Allen-Bradley addressed files and slots.
      </text>
      <text x="218" y="112" fontSize="9.5" fill={INK} opacity="0.6">
        ControlLogix dropped both for tags,
      </text>
      <text x="218" y="128" fontSize="9.5" fill={INK} opacity="0.6">
        which is why migration loses the map.
      </text>
    </svg>
  );
}

/* ── Data types: bit widths to scale ── */
export function DataTypesFigure({ className }: { className?: string }) {
  const rows = [
    { name: "BOOL", bits: 1, note: "one bit" },
    { name: "INT", bits: 16, note: "-32,768 to 32,767" },
    { name: "DINT", bits: 32, note: "±2.1 billion" },
    { name: "REAL", bits: 32, note: "floating point" },
  ];
  const unit = 9.5;
  return (
    <svg
      viewBox="0 0 480 180"
      className={className}
      role="img"
      aria-label="Bit widths of BOOL, INT, DINT and REAL drawn to scale"
    >
      <title>How wide each type is</title>
      {rows.map((r, i) => {
        const y = 26 + i * 36;
        return (
          <g key={r.name}>
            <text
              x="66"
              y={y + 15}
              textAnchor="end"
              fontSize="11"
              fontFamily="var(--font-mono, monospace)"
              fill={INK}
              opacity="0.85"
            >
              {r.name}
            </text>
            {Array.from({ length: Math.min(r.bits, 32) }, (_, b) => (
              <rect
                key={`${r.name}-b${b}`}
                x={76 + b * unit}
                y={y}
                width={unit - 1.5}
                height="20"
                fill={b < r.bits ? TEAL : INK}
                opacity={r.bits === 1 ? 1 : 0.75}
              />
            ))}
            <text x={76 + 32 * unit + 10} y={y + 15} fontSize="9.5" fill={INK} opacity="0.55">
              {r.note}
            </text>
          </g>
        );
      })}
      <text x="76" y="170" fontSize="9" fill={INK} opacity="0.5">
        A DINT holding a BOOL wastes 31 bits, and nobody notices until the tag count does.
      </text>
    </svg>
  );
}

/* ── Sinking vs sourcing, drawn as current direction ── */
export function WiringFigure({ className }: { className?: string }) {
  const block = (x: number, title: string, arrow: "in" | "out") => (
    <g>
      <text x={x + 70} y="26" textAnchor="middle" fontSize="10.5" fontWeight="600" fill={INK}>
        {title}
      </text>
      <rect
        x={x}
        y={40}
        width="140"
        height="58"
        fill="none"
        stroke={INK}
        strokeWidth="1.2"
        opacity="0.45"
      />
      <text
        x={x + 70}
        y={74}
        textAnchor="middle"
        fontSize="9.5"
        fontFamily="var(--font-mono, monospace)"
        fill={INK}
        opacity="0.7"
      >
        INPUT CARD
      </text>
      <line
        x1={x + 70}
        y1="98"
        x2={x + 70}
        y2="140"
        stroke={TEAL}
        strokeWidth="1.8"
        markerEnd={arrow === "in" ? undefined : "url(#w-arw)"}
        markerStart={arrow === "in" ? "url(#w-arw)" : undefined}
      />
      <circle cx={x + 70} cy="150" r="8" fill="none" stroke={INK} strokeWidth="1.2" opacity="0.5" />
      <text x={x + 70} y="154" textAnchor="middle" fontSize="9" fill={INK} opacity="0.7">
        {arrow === "in" ? "+" : "0V"}
      </text>
      <text x={x + 70} y="178" textAnchor="middle" fontSize="9" fill={INK} opacity="0.55">
        {arrow === "in" ? "current flows in" : "current flows out"}
      </text>
    </g>
  );
  return (
    <svg
      viewBox="0 0 480 195"
      className={className}
      role="img"
      aria-label="Sinking and sourcing input cards compared by the direction current flows"
    >
      <title>Sinking and sourcing</title>
      {block(50, "SINKING (NPN)", "in")}
      {block(280, "SOURCING (PNP)", "out")}
      <line x1="240" y1="20" x2="240" y2="185" stroke={INK} strokeWidth="1" opacity="0.12" />
      <defs>
        <marker id="w-arw" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
          <path d="M1,1 L7,4 L1,7 Z" fill={TEAL} />
        </marker>
      </defs>
    </svg>
  );
}

/* ── The five IEC languages as a stack ── */
export function LanguagesFigure({ className }: { className?: string }) {
  const rows = [
    { code: "LD", name: "Ladder Diagram", note: "graphical, relay heritage" },
    { code: "FBD", name: "Function Block Diagram", note: "graphical, signal flow" },
    { code: "SFC", name: "Sequential Function Chart", note: "steps and transitions" },
    { code: "ST", name: "Structured Text", note: "textual, Pascal-like" },
    { code: "IL", name: "Instruction List", note: "textual, deprecated" },
  ];
  return (
    <svg
      viewBox="0 0 480 200"
      className={className}
      role="img"
      aria-label="The five languages defined by IEC 61131-3"
    >
      <title>The five IEC 61131-3 languages</title>
      {rows.map((r, i) => {
        const y = 20 + i * 34;
        const faded = r.code === "IL";
        return (
          <g key={r.code}>
            <rect
              x="20"
              y={y}
              width="52"
              height="26"
              fill={faded ? "none" : TEAL}
              fillOpacity={faded ? 0 : 0.12}
              stroke={faded ? INK : TEAL}
              strokeWidth="1.3"
              opacity={faded ? 0.35 : 1}
            />
            <text
              x="46"
              y={y + 18}
              textAnchor="middle"
              fontSize="11.5"
              fontWeight="600"
              fontFamily="var(--font-mono, monospace)"
              fill={INK}
              opacity={faded ? 0.45 : 1}
            >
              {r.code}
            </text>
            <text x="86" y={y + 12} fontSize="11.5" fill={INK} opacity={faded ? 0.45 : 0.9}>
              {r.name}
            </text>
            <text x="86" y={y + 24} fontSize="9" fill={INK} opacity="0.5">
              {r.note}
            </text>
          </g>
        );
      })}
      <text x="20" y="196" fontSize="9" fill={INK} opacity="0.5">
        One standard, five notations. Most projects use two.
      </text>
    </svg>
  );
}

/* ── Protocol landscape by layer ── */
export function NetworkFigure({ className }: { className?: string }) {
  const groups = [
    { label: "ENTERPRISE", items: ["OPC UA", "MQTT"] },
    { label: "CONTROL", items: ["EtherNet/IP", "PROFINET", "Modbus TCP"] },
    { label: "DEVICE", items: ["IO-Link", "PROFIBUS DP", "Modbus RTU"] },
  ];
  return (
    <svg
      viewBox="0 0 480 200"
      className={className}
      role="img"
      aria-label="Industrial protocols grouped by the layer they usually operate at"
    >
      <title>Which protocol sits where</title>
      {groups.map((g, gi) => {
        const y = 24 + gi * 58;
        return (
          <g key={g.label}>
            <text
              x="20"
              y={y + 16}
              fontSize="9"
              fontFamily="var(--font-mono, monospace)"
              fill={INK}
              opacity="0.45"
            >
              {g.label}
            </text>
            {g.items.map((item, i) => (
              <g key={item}>
                <rect
                  x={110 + i * 118}
                  y={y}
                  width="106"
                  height="30"
                  fill={gi === 1 ? TEAL : INK}
                  fillOpacity={gi === 1 ? 0.12 : 0.04}
                  stroke={gi === 1 ? TEAL : INK}
                  strokeWidth="1.2"
                  opacity={gi === 1 ? 1 : 0.4}
                />
                <text
                  x={110 + i * 118 + 53}
                  y={y + 20}
                  textAnchor="middle"
                  fontSize="10.5"
                  fontFamily="var(--font-mono, monospace)"
                  fill={INK}
                  opacity="0.85"
                >
                  {item}
                </text>
              </g>
            ))}
          </g>
        );
      })}
      <text x="20" y="192" fontSize="9" fill={INK} opacity="0.5">
        Ethernet carries most of it now, which is why the layers blur.
      </text>
    </svg>
  );
}

/* ── A PID loop ── */
export function PidFigure({ className }: { className?: string }) {
  const box = (x: number, label: string, accent = false) => (
    <g>
      <rect
        x={x}
        y="62"
        width="86"
        height="40"
        fill={accent ? TEAL : "none"}
        fillOpacity={accent ? 0.12 : 0}
        stroke={accent ? TEAL : INK}
        strokeWidth={accent ? 1.5 : 1.1}
        opacity={accent ? 1 : 0.45}
      />
      <text x={x + 43} y="86" textAnchor="middle" fontSize="11" fontWeight="600" fill={INK}>
        {label}
      </text>
    </g>
  );
  return (
    <svg
      viewBox="0 0 480 170"
      className={className}
      role="img"
      aria-label="A closed control loop: setpoint, error, PID, process, measurement, feeding back"
    >
      <title>The closed loop</title>
      <text
        x="20"
        y="86"
        fontSize="10.5"
        fontFamily="var(--font-mono, monospace)"
        fill={INK}
        opacity="0.7"
      >
        SP
      </text>
      <line
        x1="42"
        y1="82"
        x2="66"
        y2="82"
        stroke={INK}
        strokeWidth="1.2"
        opacity="0.45"
        markerEnd="url(#p-arw)"
      />
      <circle cx="78" cy="82" r="12" fill="none" stroke={INK} strokeWidth="1.2" opacity="0.5" />
      <text x="78" y="86" textAnchor="middle" fontSize="12" fill={INK} opacity="0.7">
        -
      </text>
      <line
        x1="90"
        y1="82"
        x2="116"
        y2="82"
        stroke={INK}
        strokeWidth="1.2"
        opacity="0.45"
        markerEnd="url(#p-arw)"
      />
      {box(118, "PID", true)}
      <line
        x1="204"
        y1="82"
        x2="230"
        y2="82"
        stroke={INK}
        strokeWidth="1.2"
        opacity="0.45"
        markerEnd="url(#p-arw)"
      />
      {box(232, "Valve")}
      <line
        x1="318"
        y1="82"
        x2="344"
        y2="82"
        stroke={INK}
        strokeWidth="1.2"
        opacity="0.45"
        markerEnd="url(#p-arw)"
      />
      {box(346, "Process")}
      <line x1="432" y1="82" x2="452" y2="82" stroke={INK} strokeWidth="1.2" opacity="0.45" />
      <path
        d="M 452 82 L 452 138 L 78 138 L 78 96"
        stroke={TEAL}
        strokeWidth="1.4"
        fill="none"
        markerEnd="url(#p-arwT)"
      />
      <text x="265" y="154" textAnchor="middle" fontSize="9.5" fill={TEAL} fontWeight="600">
        measurement closes the loop
      </text>
      <defs>
        <marker id="p-arw" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6" fill="none" stroke={INK} strokeWidth="1.2" opacity="0.5" />
        </marker>
        <marker id="p-arwT" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6" fill="none" stroke={TEAL} strokeWidth="1.2" />
        </marker>
      </defs>
    </svg>
  );
}

/* ── Safety architecture: the parallel path a safety relay takes ── */
export function SafetyFigure({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 480 190"
      className={className}
      role="img"
      aria-label="A safety circuit running in parallel with the standard PLC rather than through it"
    >
      <title>Safety does not run through the PLC</title>
      <rect
        x="30"
        y="30"
        width="120"
        height="44"
        fill="none"
        stroke={INK}
        strokeWidth="1.2"
        opacity="0.5"
      />
      <text x="90" y="57" textAnchor="middle" fontSize="10.5" fill={INK} opacity="0.85">
        E-Stop
      </text>
      <rect
        x="30"
        y="112"
        width="120"
        height="44"
        fill="none"
        stroke={INK}
        strokeWidth="1.2"
        opacity="0.5"
      />
      <text x="90" y="139" textAnchor="middle" fontSize="10.5" fill={INK} opacity="0.85">
        Start / Stop
      </text>
      <rect
        x="200"
        y="30"
        width="120"
        height="44"
        fill={TEAL}
        fillOpacity="0.14"
        stroke={TEAL}
        strokeWidth="1.6"
      />
      <text x="260" y="51" textAnchor="middle" fontSize="10.5" fontWeight="600" fill={INK}>
        Safety relay
      </text>
      <text x="260" y="65" textAnchor="middle" fontSize="8.5" fill={INK} opacity="0.6">
        rated, redundant
      </text>
      <rect
        x="200"
        y="112"
        width="120"
        height="44"
        fill="none"
        stroke={INK}
        strokeWidth="1.2"
        opacity="0.5"
      />
      <text x="260" y="133" textAnchor="middle" fontSize="10.5" fill={INK} opacity="0.85">
        Standard PLC
      </text>
      <text x="260" y="147" textAnchor="middle" fontSize="8.5" fill={INK} opacity="0.6">
        not rated
      </text>
      <rect
        x="372"
        y="70"
        width="90"
        height="46"
        fill="none"
        stroke={INK}
        strokeWidth="1.2"
        opacity="0.5"
      />
      <text x="417" y="98" textAnchor="middle" fontSize="10.5" fill={INK} opacity="0.85">
        Contactor
      </text>
      <line x1="150" y1="52" x2="196" y2="52" stroke={TEAL} strokeWidth="1.8" />
      <line x1="150" y1="134" x2="196" y2="134" stroke={INK} strokeWidth="1.2" opacity="0.45" />
      <path d="M 320 52 L 348 52 L 348 88 L 368 88" stroke={TEAL} strokeWidth="1.8" fill="none" />
      <path
        d="M 320 134 L 348 134 L 348 100 L 368 100"
        stroke={INK}
        strokeWidth="1.2"
        fill="none"
        opacity="0.45"
      />
      <text x="240" y="182" textAnchor="middle" fontSize="9.5" fill={INK} opacity="0.55">
        The safety path can drop the contactor on its own. The PLC cannot override it.
      </text>
    </svg>
  );
}

/* ── Alarm lifecycle ── */
export function AlarmFigure({ className }: { className?: string }) {
  const states = [
    { name: "Normal", x: 26 },
    { name: "Active\nUnacked", x: 140 },
    { name: "Active\nAcked", x: 254 },
    { name: "Cleared\nUnacked", x: 368 },
  ];
  return (
    <svg
      viewBox="0 0 480 170"
      className={className}
      role="img"
      aria-label="The four states an alarm moves through, and why an operator must acknowledge"
    >
      <title>An alarm has four states, not two</title>
      {states.map((s, i) => (
        <g key={s.name}>
          <rect
            x={s.x}
            y="46"
            width="86"
            height="46"
            fill={i === 0 ? "none" : TEAL}
            fillOpacity={i === 0 ? 0 : 0.12}
            stroke={i === 0 ? INK : TEAL}
            strokeWidth={i === 0 ? 1.1 : 1.5}
            opacity={i === 0 ? 0.45 : 1}
          />
          {s.name.split("\n").map((line, li) => (
            <text
              key={line}
              x={s.x + 43}
              y={66 + li * 14}
              textAnchor="middle"
              fontSize="10.5"
              fill={INK}
            >
              {line}
            </text>
          ))}
          {i < states.length - 1 && (
            <line
              x1={s.x + 86}
              y1="69"
              x2={s.x + 110}
              y2="69"
              stroke={INK}
              strokeWidth="1.2"
              opacity="0.4"
              markerEnd="url(#al-arw)"
            />
          )}
        </g>
      ))}
      <path
        d="M 411 92 L 411 124 L 69 124 L 69 92"
        stroke={INK}
        strokeWidth="1.2"
        fill="none"
        opacity="0.4"
        markerEnd="url(#al-arw)"
      />
      <text x="240" y="142" textAnchor="middle" fontSize="9.5" fill={INK} opacity="0.55">
        acknowledged and gone
      </text>
      <text x="240" y="160" textAnchor="middle" fontSize="9" fill={INK} opacity="0.45">
        A condition that clears itself before anyone looks still needs recording.
      </text>
      <defs>
        <marker id="al-arw" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6" fill="none" stroke={INK} strokeWidth="1.2" opacity="0.5" />
        </marker>
      </defs>
    </svg>
  );
}

const MAP = {
  scan: ScanCycle,
  outputImage: OutputImageFigure,
  timers: TimersFigure,
  counters: CountersFigure,
  oneShot: OneShotFigure,
  analog: AnalogFigure,
  addressing: AddressingFigure,
  dataTypes: DataTypesFigure,
  wiring: WiringFigure,
  languages: LanguagesFigure,
  network: NetworkFigure,
  pid: PidFigure,
  safety: SafetyFigure,
  alarm: AlarmFigure,
  migration: MigrationFigure,
  aiLoop: AiLoopFigure,
} as const;

export type FigureKey = keyof typeof MAP;

/** Figures that are near-square need a ceiling, or they dominate a wide slot. */
const NARROW: ReadonlySet<FigureKey> = new Set(["scan"]);

export function ArticleFigure({ name, className }: { name: FigureKey; className?: string }) {
  const Component = MAP[name];
  if (NARROW.has(name)) {
    return (
      <div className="flex justify-center">
        <Component className={`w-full max-w-sm ${className ?? ""}`} />
      </div>
    );
  }
  return <Component className={className} />;
}
