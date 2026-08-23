/**
 * The site's illustrations.
 *
 * Every picture here is a drawing of the thing it describes: a real rung, a
 * real scan cycle, a real conversion path. That is deliberate. The audience
 * spends its working life reading schematics, and a stock photograph of a
 * robot arm — or a generic gradient blob — tells them immediately that whoever
 * made the page has never opened a PLC.
 *
 * SVG rather than screenshots: crisp at any size, a few kilobytes, and able to
 * follow the page's own colours in both themes. `currentColor` does most of the
 * work; the teal accent is passed explicitly where a live wire needs to read as
 * live.
 */

const INK = "currentColor";

/**
 * The accent, as an actual colour.
 *
 * `--ladx-teal` holds a bare "R G B" triplet because Tailwind needs that form
 * to compose opacities. Handing that string straight to `stroke` is invalid
 * CSS, and the failure is silent: the line simply does not paint. Wrapping it
 * in rgb() is the whole fix, and the hex fallback covers the case where the
 * variable has not loaded yet.
 */
const TEAL = "rgb(var(--ladx-teal, 53 182 186))";

/* ─────────────────────────── ladder primitives ─────────────────────────── */

function Contact({
  x,
  y,
  label,
  negated = false,
}: { x: number; y: number; label?: string; negated?: boolean }) {
  return (
    <g>
      <line x1={x - 18} y1={y} x2={x - 7} y2={y} stroke={INK} strokeWidth="1.5" />
      <line x1={x - 7} y1={y - 9} x2={x - 7} y2={y + 9} stroke={INK} strokeWidth="1.8" />
      <line x1={x + 7} y1={y - 9} x2={x + 7} y2={y + 9} stroke={INK} strokeWidth="1.8" />
      {negated && (
        <line x1={x - 8} y1={y + 9} x2={x + 8} y2={y - 9} stroke={INK} strokeWidth="1.5" />
      )}
      <line x1={x + 7} y1={y} x2={x + 18} y2={y} stroke={INK} strokeWidth="1.5" />
      {label && (
        <text
          x={x}
          y={y - 15}
          textAnchor="middle"
          fontSize="9"
          fontFamily="var(--font-mono, monospace)"
          fill={INK}
          opacity="0.75"
        >
          {label}
        </text>
      )}
    </g>
  );
}

function Coil({ x, y, label }: { x: number; y: number; label?: string }) {
  return (
    <g>
      <line x1={x - 20} y1={y} x2={x - 10} y2={y} stroke={INK} strokeWidth="1.5" />
      <path
        d={`M ${x - 10} ${y - 9} A 11 11 0 0 0 ${x - 10} ${y + 9}`}
        stroke={INK}
        strokeWidth="1.8"
        fill="none"
      />
      <path
        d={`M ${x + 10} ${y - 9} A 11 11 0 0 1 ${x + 10} ${y + 9}`}
        stroke={INK}
        strokeWidth="1.8"
        fill="none"
      />
      <line x1={x + 10} y1={y} x2={x + 20} y2={y} stroke={INK} strokeWidth="1.5" />
      {label && (
        <text
          x={x}
          y={y - 15}
          textAnchor="middle"
          fontSize="9"
          fontFamily="var(--font-mono, monospace)"
          fill={INK}
          opacity="0.75"
        >
          {label}
        </text>
      )}
    </g>
  );
}

/**
 * The seal-in circuit, drawn properly.
 *
 * The first rung anybody learns and the one that proves a ladder editor is
 * real: Start latches through its own output, Stop and the guard break it.
 * Anything that cannot draw the parallel branch cannot draw ladder.
 */
export function SealInRung({ className, live = false }: { className?: string; live?: boolean }) {
  const wire = live ? TEAL : INK;
  return (
    <svg
      viewBox="0 0 420 130"
      className={className}
      role="img"
      aria-label="A ladder rung: Start or Conveyor, in series with Stop and Guard, driving the Conveyor coil"
    >
      <title>Motor seal-in rung</title>
      {/* Power rails */}
      <line x1="14" y1="18" x2="14" y2="112" stroke={INK} strokeWidth="2" opacity="0.5" />
      <line x1="406" y1="18" x2="406" y2="112" stroke={INK} strokeWidth="2" opacity="0.5" />

      {/* Top branch: Start */}
      <line x1="14" y1="48" x2="52" y2="48" stroke={wire} strokeWidth="1.5" />
      <Contact x={70} y={48} label="Start_PB" />
      <line x1="88" y1="48" x2="140" y2="48" stroke={wire} strokeWidth="1.5" />

      {/* Parallel leg: the seal-in */}
      <line x1="52" y1="48" x2="52" y2="88" stroke={wire} strokeWidth="1.5" />
      <line x1="52" y1="88" x2="52" y2="88" stroke={wire} strokeWidth="1.5" />
      <Contact x={70} y={88} label="Conveyor" />
      <line x1="88" y1="88" x2="140" y2="88" stroke={wire} strokeWidth="1.5" />
      <line x1="140" y1="88" x2="140" y2="48" stroke={wire} strokeWidth="1.5" />

      {/* Series conditions */}
      <line x1="140" y1="48" x2="172" y2="48" stroke={wire} strokeWidth="1.5" />
      <Contact x={190} y={48} label="Stop_PB" />
      <line x1="208" y1="48" x2="252" y2="48" stroke={wire} strokeWidth="1.5" />
      <Contact x={270} y={48} label="Guard_OK" />
      <line x1="288" y1="48" x2="340" y2="48" stroke={wire} strokeWidth="1.5" />

      {/* Output */}
      <Coil x={362} y={48} label="Conveyor" />
      <line x1="382" y1="48" x2="406" y2="48" stroke={wire} strokeWidth="1.5" />

      {/* Junction dots */}
      <circle cx="52" cy="48" r="2.5" fill={wire} />
      <circle cx="140" cy="48" r="2.5" fill={wire} />
    </svg>
  );
}

/**
 * The scan cycle.
 *
 * Drawn as a loop because that is what it is, and because the single most
 * common misunderstanding — that a coil takes effect the instant it is written
 * — comes from imagining the program as a list rather than a cycle.
 */
export function ScanCycle({ className }: { className?: string }) {
  const teal = TEAL;
  const steps = [
    { a: -90, label: "Read inputs" },
    { a: -18, label: "Solve logic" },
    { a: 54, label: "Write outputs" },
    { a: 126, label: "Housekeeping" },
    { a: 198, label: "Repeat" },
  ];
  const R = 58;
  const cx = 158;
  const cy = 112;

  return (
    <svg
      viewBox="0 0 316 224"
      className={className}
      role="img"
      aria-label="The PLC scan cycle: read inputs, solve logic, write outputs, repeat"
    >
      <title>PLC scan cycle</title>
      <circle
        cx={cx}
        cy={cy}
        r={R}
        fill="none"
        stroke={INK}
        strokeWidth="1.25"
        opacity="0.28"
        strokeDasharray="3 4"
      />
      {steps.map((s) => {
        const rad = (s.a * Math.PI) / 180;
        const x = cx + R * Math.cos(rad);
        const y = cy + R * Math.sin(rad);
        const isRepeat = s.label === "Repeat";
        return (
          <g key={s.label}>
            <circle
              cx={x}
              cy={y}
              r="5"
              fill={isRepeat ? "none" : teal}
              stroke={isRepeat ? INK : "none"}
              strokeWidth="1.25"
              opacity={isRepeat ? 0.4 : 1}
            />
            <text
              x={x + Math.cos(rad) * 16}
              y={y + Math.sin(rad) * 16 + 3}
              textAnchor={Math.cos(rad) > 0.3 ? "start" : Math.cos(rad) < -0.3 ? "end" : "middle"}
              fontSize="9.5"
              fill={INK}
              opacity="0.8"
            >
              {s.label}
            </text>
          </g>
        );
      })}
      <text
        x={cx}
        y={cy - 4}
        textAnchor="middle"
        fontSize="19"
        fontFamily="var(--font-display, sans-serif)"
        fontWeight="800"
        fill={INK}
      >
        1–20
      </text>
      <text
        x={cx}
        y={cy + 12}
        textAnchor="middle"
        fontSize="9"
        fill={INK}
        opacity="0.6"
        letterSpacing="1.5"
      >
        MILLISECONDS
      </text>
    </svg>
  );
}

/**
 * The IR as a hub.
 *
 * The whole architectural argument in one picture: every format meets in the
 * middle, so N importers and M exporters give N×M paths for N+M of work. Drawn
 * as spokes because a reader should be able to count them.
 */
export function IrHub({ className }: { className?: string }) {
  const teal = TEAL;
  const left = ["Rockwell .L5X", "Siemens SCL", "Beckhoff .TcPOU", "CODESYS XML"];
  const right = ["Siemens SimaticML", "Rockwell .L5X", "Structured Text", "OpenPLC"];

  return (
    <svg
      viewBox="0 0 560 240"
      className={className}
      role="img"
      aria-label="Import formats converge on the LADX intermediate representation, which exports to any target format"
    >
      <title>Every format meets in the middle</title>
      {left.map((l, i) => {
        const y = 42 + i * 52;
        return (
          <g key={l}>
            <rect
              x="8"
              y={y - 14}
              width="132"
              height="28"
              rx="2"
              fill="none"
              stroke={INK}
              strokeWidth="1"
              opacity="0.35"
            />
            <text
              x="74"
              y={y + 4}
              textAnchor="middle"
              fontSize="10.5"
              fontFamily="var(--font-mono, monospace)"
              fill={INK}
              opacity="0.85"
            >
              {l}
            </text>
            <path
              d={`M 140 ${y} C 190 ${y}, 200 120, 236 120`}
              stroke={teal}
              strokeWidth="1.25"
              fill="none"
              opacity="0.55"
            />
          </g>
        );
      })}

      <rect
        x="236"
        y="92"
        width="88"
        height="56"
        rx="2"
        fill={teal}
        opacity="0.1"
        stroke={teal}
        strokeWidth="1.5"
      />
      <text
        x="280"
        y="116"
        textAnchor="middle"
        fontSize="13"
        fontFamily="var(--font-display, sans-serif)"
        fontWeight="800"
        fill={INK}
      >
        LADX IR
      </text>
      <text
        x="280"
        y="132"
        textAnchor="middle"
        fontSize="8.5"
        fill={INK}
        opacity="0.7"
        letterSpacing="0.6"
      >
        PLCopen TC6
      </text>

      {right.map((r, i) => {
        const y = 42 + i * 52;
        return (
          <g key={`${r}-out`}>
            <path
              d={`M 324 120 C 360 120, 370 ${y}, 420 ${y}`}
              stroke={INK}
              strokeWidth="1.25"
              fill="none"
              opacity="0.3"
            />
            <rect
              x="420"
              y={y - 14}
              width="132"
              height="28"
              rx="2"
              fill="none"
              stroke={INK}
              strokeWidth="1"
              opacity="0.35"
            />
            <text
              x="486"
              y={y + 4}
              textAnchor="middle"
              fontSize="10.5"
              fontFamily="var(--font-mono, monospace)"
              fill={INK}
              opacity="0.85"
            >
              {r}
            </text>
          </g>
        );
      })}

      <text
        x="74"
        y="228"
        textAnchor="middle"
        fontSize="9"
        fill={INK}
        opacity="0.5"
        letterSpacing="1.4"
      >
        READ
      </text>
      <text
        x="486"
        y="228"
        textAnchor="middle"
        fontSize="9"
        fill={INK}
        opacity="0.5"
        letterSpacing="1.4"
      >
        WRITE
      </text>
    </svg>
  );
}

/**
 * The validation loop.
 *
 * What separates LADX from a chatbot that happens to know the word "rung":
 * nothing reaches the engineer until a compiler has agreed it exists.
 */
export function ValidationLoop({ className }: { className?: string }) {
  const teal = TEAL;
  const box = (x: number, y: number, w: number, label: string, sub?: string, accent = false) => (
    <g key={label}>
      <rect
        x={x}
        y={y}
        width={w}
        height="46"
        rx="2"
        fill={accent ? teal : "none"}
        fillOpacity={accent ? 0.1 : 0}
        stroke={accent ? teal : INK}
        strokeWidth={accent ? 1.5 : 1}
        opacity={accent ? 1 : 0.4}
      />
      <text
        x={x + w / 2}
        y={y + (sub ? 20 : 28)}
        textAnchor="middle"
        fontSize="11"
        fontWeight="600"
        fill={INK}
      >
        {label}
      </text>
      {sub && (
        <text
          x={x + w / 2}
          y={y + 34}
          textAnchor="middle"
          fontSize="8.5"
          fontFamily="var(--font-mono, monospace)"
          fill={INK}
          opacity="0.6"
        >
          {sub}
        </text>
      )}
    </g>
  );

  return (
    <svg
      viewBox="0 0 560 150"
      className={className}
      role="img"
      aria-label="Generated code is compiled and checked; failures feed the errors back for a retry, and only validated code reaches the engineer"
    >
      <title>Generate, compile, check, repair</title>
      {box(8, 30, 104, "Generate", "any model")}
      <path
        d="M 112 53 L 140 53"
        stroke={INK}
        strokeWidth="1.25"
        opacity="0.4"
        markerEnd="url(#arw)"
      />
      {box(140, 30, 104, "Compile", "matiec")}
      <path
        d="M 244 53 L 272 53"
        stroke={INK}
        strokeWidth="1.25"
        opacity="0.4"
        markerEnd="url(#arw)"
      />
      {box(272, 30, 104, "Check", "iec-checker")}
      <path
        d="M 376 53 L 404 53"
        stroke={INK}
        strokeWidth="1.25"
        opacity="0.4"
        markerEnd="url(#arw)"
      />
      {box(404, 30, 148, "Shown to you", "only if it passes", true)}

      {/* The repair path — the part that makes weak models useful. */}
      <path
        d="M 324 76 L 324 104 L 60 104 L 60 76"
        stroke={teal}
        strokeWidth="1.25"
        fill="none"
        strokeDasharray="4 3"
        markerEnd="url(#arwT)"
      />
      <text x="192" y="118" textAnchor="middle" fontSize="9.5" fill={teal} fontWeight="600">
        errors go back · it tries again
      </text>

      <defs>
        <marker id="arw" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6" fill="none" stroke={INK} strokeWidth="1.2" opacity="0.5" />
        </marker>
        <marker id="arwT" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6" fill="none" stroke={teal} strokeWidth="1.2" />
        </marker>
      </defs>
    </svg>
  );
}

/** A short run of rungs, used as a section divider. Quieter than a rule. */
export function RungDivider({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 300 16" className={className} aria-hidden="true" preserveAspectRatio="none">
      <line x1="0" y1="8" x2="118" y2="8" stroke={INK} strokeWidth="1" opacity="0.18" />
      <line x1="132" y1="2" x2="132" y2="14" stroke={INK} strokeWidth="1.4" opacity="0.45" />
      <line x1="146" y1="2" x2="146" y2="14" stroke={INK} strokeWidth="1.4" opacity="0.45" />
      <line x1="160" y1="8" x2="300" y2="8" stroke={INK} strokeWidth="1" opacity="0.18" />
    </svg>
  );
}
