import { ScanCycle } from "./schematics";

/**
 * Article artwork.
 *
 * One drawing per article, each of the thing the article is actually about — a
 * timing diagram for the timers piece, a scaling line for the analog piece.
 * Nothing decorative, and nothing generic: a picture that could sit on any
 * article is a picture that belongs on none of them.
 */

const INK = "currentColor";
const TEAL = "rgb(var(--ladx-teal, 53 182 186))";

/** Two rungs, one reading a bit the other writes later — the one-scan lag. */
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

/** TON / TOF / RTO against the same input — the differences are all on the falling edge. */
export function TimersFigure({ className }: { className?: string }) {
  // Preset is two divisions. Read the falling edges — that is where the three
  // differ, and the article says so.
  //
  //   TON  done two divisions after the rung goes true; resets the moment it
  //        goes false. The second pulse is too short to ever finish, which is
  //        worth showing rather than hiding.
  //   TOF  done while true, and stays done for two divisions AFTER false —
  //        then drops. An off-delay that never dropped would not be a timer.
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

/** The 4–20 mA scaling line, with the underrange region called out. */
export function AnalogFigure({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 480 220"
      className={className}
      role="img"
      aria-label="A straight line mapping 4 to 20 milliamps onto zero to ten bar, with the region below 4 milliamps marked as a broken loop"
    >
      <title>4–20 mA scaled to engineering units</title>
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

const MAP = {
  scan: ScanCycle,
  outputImage: OutputImageFigure,
  timers: TimersFigure,
  analog: AnalogFigure,
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
