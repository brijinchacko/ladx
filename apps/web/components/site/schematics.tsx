/**
 * The site's illustrations.
 *
 * Every picture here is a drawing of the thing it describes: a real rung, a
 * real scan cycle, a real conversion path. That is deliberate. The audience
 * spends its working life reading schematics, and a stock photograph of a
 * robot arm, or a generic gradient blob, tells them immediately that whoever
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
      viewBox="0 0 420 214"
      className={className}
      role="img"
      aria-label="Two ladder rungs. The first latches the conveyor through its own contact with Stop and Guard in series; the second drives a running lamp from the conveyor."
    >
      <title>Motor seal-in, and the rung it feeds</title>

      {/* Power rails, spanning both rungs. */}
      <line x1="14" y1="20" x2="14" y2="196" stroke={INK} strokeWidth="2" opacity="0.5" />
      <line x1="406" y1="20" x2="406" y2="196" stroke={INK} strokeWidth="2" opacity="0.5" />

      {/* ── Rung 1: the seal-in ── */}
      <text
        x="24"
        y="34"
        fontSize="8.5"
        fontFamily="var(--font-mono, monospace)"
        fill={INK}
        opacity="0.4"
      >
        RUNG 1
      </text>

      {/* Main path */}
      <line x1="14" y1="62" x2="52" y2="62" stroke={wire} strokeWidth="1.5" />
      <Contact x={70} y={62} label="Start_PB" />
      <line x1="88" y1="62" x2="140" y2="62" stroke={wire} strokeWidth="1.5" />

      {/* Parallel leg: the latch that makes it a seal-in */}
      <line x1="52" y1="62" x2="52" y2="102" stroke={wire} strokeWidth="1.5" />
      <Contact x={70} y={102} label="Conveyor" />
      <line x1="88" y1="102" x2="140" y2="102" stroke={wire} strokeWidth="1.5" />
      <line x1="140" y1="102" x2="140" y2="62" stroke={wire} strokeWidth="1.5" />

      {/* Series conditions */}
      <line x1="140" y1="62" x2="172" y2="62" stroke={wire} strokeWidth="1.5" />
      <Contact x={190} y={62} label="Stop_PB" />
      <line x1="208" y1="62" x2="252" y2="62" stroke={wire} strokeWidth="1.5" />
      <Contact x={270} y={62} label="Guard_OK" />
      <line x1="288" y1="62" x2="340" y2="62" stroke={wire} strokeWidth="1.5" />

      <Coil x={362} y={62} label="Conveyor" />
      <line x1="382" y1="62" x2="406" y2="62" stroke={wire} strokeWidth="1.5" />

      <circle cx="52" cy="62" r="2.5" fill={wire} />
      <circle cx="140" cy="62" r="2.5" fill={wire} />

      {/* Divider between rungs */}
      <line x1="14" y1="132" x2="406" y2="132" stroke={INK} strokeWidth="0.75" opacity="0.12" />

      {/* ── Rung 2: what the first one drives ── */}
      <text
        x="24"
        y="149"
        fontSize="8.5"
        fontFamily="var(--font-mono, monospace)"
        fill={INK}
        opacity="0.4"
      >
        RUNG 2
      </text>
      <line x1="14" y1="178" x2="52" y2="178" stroke={wire} strokeWidth="1.5" />
      <Contact x={70} y={178} label="Conveyor" />
      <line x1="88" y1="178" x2="340" y2="178" stroke={wire} strokeWidth="1.5" />
      <Coil x={362} y={178} label="Run_Lamp" />
      <line x1="382" y1="178" x2="406" y2="178" stroke={wire} strokeWidth="1.5" />
    </svg>
  );
}

/**
 * The scan cycle.
 *
 * Drawn as a loop because that is what it is, and because the single most
 * common misunderstanding, that a coil takes effect the instant it is written
 *, comes from imagining the program as a list rather than a cycle.
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
        1-20
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

      {/* The repair path, the part that makes weak models useful. */}
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

/**
 * The lifecycle, and what each phase owes.
 *
 * Drawn as a single track with the deliverable count under each stop, because
 * that is the honest shape of it: the phases are not equal in weight, and the
 * one that carries eight documents should look heavier than the one that
 * carries one. Summary sits off the numbering because it produces nothing.
 */
export function LifecycleFigure({ className }: { className?: string }) {
  const stops = [
    { n: "·", label: "Summary", owes: 0 },
    { n: "1", label: "Requirements", owes: 1 },
    { n: "2", label: "Design", owes: 8 },
    { n: "3", label: "Development", owes: 2 },
    { n: "4", label: "Factory test", owes: 1 },
    { n: "5", label: "Commissioning", owes: 2 },
    { n: "6", label: "Handover", owes: 2 },
    { n: "7", label: "Support", owes: 1 },
  ];
  const x0 = 40;
  const gap = 66;

  return (
    <svg
      viewBox="0 0 560 150"
      className={className}
      role="img"
      aria-label="The eight project phases on one track, each showing how many deliverables it owes"
    >
      <title>The lifecycle, and what each phase owes</title>

      <line
        x1={x0}
        y1="58"
        x2={x0 + gap * (stops.length - 1)}
        y2="58"
        stroke={INK}
        strokeWidth="1.2"
        opacity="0.3"
      />

      {stops.map((s, i) => {
        const x = x0 + gap * i;
        const here = i === 2; // the phase the project is in, for the filled marker
        return (
          <g key={s.label}>
            {/* the bar above the track is the weight of the phase */}
            {s.owes > 0 && (
              <rect
                x={x - 5}
                y={46 - s.owes * 3.4}
                width="10"
                height={s.owes * 3.4}
                fill={here ? TEAL : INK}
                opacity={here ? "0.85" : "0.22"}
                rx="1"
              />
            )}
            <circle
              cx={x}
              cy="58"
              r={here ? 5 : 3.5}
              fill={here ? TEAL : "var(--ladx-paper, #fff)"}
              stroke={here ? TEAL : INK}
              strokeWidth="1.4"
              opacity={here ? 1 : 0.55}
            />
            <text
              x={x}
              y="80"
              textAnchor="middle"
              fontSize="9.5"
              fontFamily="ui-monospace, monospace"
              fill={INK}
              opacity="0.45"
            >
              {s.n}
            </text>
            <text
              x={x}
              y="96"
              textAnchor="middle"
              fontSize="9.5"
              fill={INK}
              opacity={here ? "0.95" : "0.6"}
              fontWeight={here ? 600 : 400}
            >
              {s.label}
            </text>
            <text
              x={x}
              y="112"
              textAnchor="middle"
              fontSize="9"
              fontFamily="ui-monospace, monospace"
              fill={INK}
              opacity="0.32"
            >
              {s.owes === 0 ? "—" : `${s.owes} doc${s.owes === 1 ? "" : "s"}`}
            </text>
          </g>
        );
      })}

      <text
        x={x0}
        y="134"
        fontSize="9"
        fontFamily="ui-monospace, monospace"
        fill={INK}
        opacity="0.3"
      >
        bar height = deliverables the phase owes · filled = where the project is
      </text>
    </svg>
  );
}

/**
 * An answer with the page it came from.
 *
 * The point of the picture is the line joining the two: the claim on the left
 * is only worth anything because it is tied to a specific page of a specific
 * document on the right, and that tie is the product.
 */
export function CitationFigure({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 560 200"
      className={className}
      role="img"
      aria-label="An answer on the left is joined by a line to the manual page it was taken from on the right"
    >
      <title>Every answer carries the page behind it</title>

      {/* the question */}
      <text
        x="20"
        y="26"
        fontSize="10"
        fontFamily="ui-monospace, monospace"
        fill={INK}
        opacity="0.4"
      >
        “What is the maximum torque limit on the drive?”
      </text>

      {/* the answer card */}
      <rect
        x="20"
        y="40"
        width="250"
        height="96"
        rx="3"
        fill="none"
        stroke={INK}
        strokeWidth="1.2"
        opacity="0.45"
      />
      {[62, 78, 94].map((y, i) => (
        <line
          key={y}
          x1="34"
          y1={y}
          x2={i === 2 ? 196 : 256}
          y2={y}
          stroke={INK}
          strokeWidth="4"
          opacity="0.14"
          strokeLinecap="round"
        />
      ))}
      <rect x="34" y="108" width="86" height="15" rx="2" fill={TEAL} opacity="0.16" />
      <text x="41" y="119" fontSize="9" fontFamily="ui-monospace, monospace" fill={TEAL}>
        VLT-FC302 p.184
      </text>

      {/* the tie */}
      <path
        d="M120 130 C 120 168, 330 168, 330 140"
        fill="none"
        stroke={TEAL}
        strokeWidth="1.4"
        strokeDasharray="3 3"
      />

      {/* the source page */}
      <rect
        x="300"
        y="40"
        width="120"
        height="100"
        rx="2"
        fill="none"
        stroke={INK}
        strokeWidth="1.2"
        opacity="0.45"
      />
      {[56, 66, 76, 96, 106, 116].map((y) => (
        <line
          key={y}
          x1="310"
          y1={y}
          x2={y === 76 || y === 116 ? 380 : 410}
          y2={y}
          stroke={INK}
          strokeWidth="2.4"
          opacity="0.12"
          strokeLinecap="round"
        />
      ))}
      <rect x="310" y="83" width="100" height="9" fill={TEAL} opacity="0.22" />
      <text
        x="360"
        y="156"
        textAnchor="middle"
        fontSize="9"
        fontFamily="ui-monospace, monospace"
        fill={INK}
        opacity="0.35"
      >
        page 184
      </text>

      {/* the stack behind it, to say there are four hundred of these */}
      <rect
        x="440"
        y="48"
        width="94"
        height="84"
        rx="2"
        fill="none"
        stroke={INK}
        strokeWidth="1"
        opacity="0.16"
      />
      <rect
        x="446"
        y="54"
        width="94"
        height="84"
        rx="2"
        fill="none"
        stroke={INK}
        strokeWidth="1"
        opacity="0.11"
      />
      <text
        x="487"
        y="156"
        textAnchor="middle"
        fontSize="9"
        fontFamily="ui-monospace, monospace"
        fill={INK}
        opacity="0.3"
      >
        the other 400
      </text>
    </svg>
  );
}

/**
 * One tag table, two things reading it.
 *
 * The whole argument for building the HMI here rather than in the vendor's
 * tool, drawn rather than asserted: the ladder writes a tag, the screen reads
 * the same tag by name, and there is no second table between them to fall out
 * of step. The dashed box is what every other toolchain has and this one does
 * not.
 */
export function TagBindingFigure({ className }: { className?: string }) {
  const rows = [
    { name: "Start", kind: "BOOL", used: "button" },
    { name: "Motor", kind: "BOOL", used: "lamp" },
    { name: "Level", kind: "INT", used: "bar" },
    { name: "T1.ACC", kind: "TIMER", used: "trend" },
  ];

  return (
    <svg
      viewBox="0 0 560 210"
      className={className}
      role="img"
      aria-label="A ladder program and an operator screen both reading one tag table, with no second table between them"
    >
      <title>One tag table, read from both sides</title>

      <text
        x="14"
        y="16"
        fontSize="9.5"
        fill={INK}
        opacity="0.5"
        fontFamily="ui-monospace, monospace"
      >
        LADDER
      </text>
      <text x="228" y="16" fontSize="9.5" fill={TEAL} fontFamily="ui-monospace, monospace">
        ONE TAG TABLE
      </text>
      <text
        x="450"
        y="16"
        fontSize="9.5"
        fill={INK}
        opacity="0.5"
        fontFamily="ui-monospace, monospace"
      >
        HMI SCREEN
      </text>

      {/* the controller side */}
      <rect
        x="14"
        y="26"
        width="150"
        height="150"
        rx="3"
        fill="none"
        stroke={INK}
        strokeWidth="1"
        opacity="0.3"
      />
      {rows.map((r, i) => (
        <g key={`l-${r.name}`}>
          <line
            x1="30"
            y1={54 + i * 32}
            x2="52"
            y2={54 + i * 32}
            stroke={INK}
            strokeWidth="1.2"
            opacity="0.55"
          />
          <line
            x1="40"
            y1={47 + i * 32}
            x2="40"
            y2={61 + i * 32}
            stroke={INK}
            strokeWidth="1.2"
            opacity="0.55"
          />
          <line
            x1="46"
            y1={47 + i * 32}
            x2="46"
            y2={61 + i * 32}
            stroke={INK}
            strokeWidth="1.2"
            opacity="0.55"
          />
          <line
            x1="52"
            y1={54 + i * 32}
            x2="120"
            y2={54 + i * 32}
            stroke={INK}
            strokeWidth="1.2"
            opacity="0.55"
          />
          <circle
            cx="132"
            cy={54 + i * 32}
            r="7"
            fill="none"
            stroke={INK}
            strokeWidth="1.2"
            opacity="0.55"
          />
        </g>
      ))}

      {/* the shared table */}
      <rect
        x="204"
        y="26"
        width="152"
        height="150"
        rx="3"
        fill="none"
        stroke={TEAL}
        strokeWidth="1.4"
      />
      {rows.map((r, i) => (
        <g key={`t-${r.name}`}>
          <text
            x="216"
            y={50 + i * 32}
            fontSize="11"
            fill={INK}
            fontFamily="ui-monospace, monospace"
            opacity="0.85"
          >
            {r.name}
          </text>
          <text
            x="216"
            y={62 + i * 32}
            fontSize="8.5"
            fill={INK}
            opacity="0.4"
            fontFamily="ui-monospace, monospace"
          >
            {r.kind}
          </text>
          <line
            x1="164"
            y1={54 + i * 32}
            x2="204"
            y2={54 + i * 32}
            stroke={TEAL}
            strokeWidth="1.2"
          />
          <line
            x1="356"
            y1={54 + i * 32}
            x2="396"
            y2={54 + i * 32}
            stroke={TEAL}
            strokeWidth="1.2"
          />
        </g>
      ))}

      {/* the operator side */}
      <rect
        x="396"
        y="26"
        width="150"
        height="150"
        rx="3"
        fill="none"
        stroke={INK}
        strokeWidth="1"
        opacity="0.3"
      />
      {rows.map((r, i) => (
        <g key={`h-${r.name}`}>
          {r.used === "button" && (
            <rect x="414" y={44 + i * 32} width="48" height="20" rx="3" fill={INK} opacity="0.14" />
          )}
          {r.used === "lamp" && (
            <circle cx="424" cy={54 + i * 32} r="9" fill={TEAL} opacity="0.75" />
          )}
          {r.used === "bar" && (
            <>
              <rect
                x="414"
                y={46 + i * 32}
                width="70"
                height="16"
                rx="2"
                fill={INK}
                opacity="0.12"
              />
              <rect
                x="414"
                y={46 + i * 32}
                width="44"
                height="16"
                rx="2"
                fill={TEAL}
                opacity="0.7"
              />
            </>
          )}
          {r.used === "trend" && (
            <polyline
              points={`414,${62 + i * 32} 428,${52 + i * 32} 442,${58 + i * 32} 456,${46 + i * 32} 484,${50 + i * 32}`}
              fill="none"
              stroke={TEAL}
              strokeWidth="1.6"
            />
          )}
          <text
            x="492"
            y={58 + i * 32}
            fontSize="8.5"
            fill={INK}
            opacity="0.4"
            fontFamily="ui-monospace, monospace"
          >
            {r.used}
          </text>
        </g>
      ))}

      <text x="14" y="198" fontSize="9" fill={INK} opacity="0.45">
        No import step, no second table, and no way to bind to a tag the controller does not have.
      </text>
    </svg>
  );
}

/**
 * A plan as bars against dates.
 *
 * The point of the figure is the arrow: a dependency is a fact the chart
 * enforces, not a note somebody wrote in a cell. The vertical rule is today,
 * which is the only reason a Gantt chart is worth looking at at all.
 */
export function GanttFigure({ className }: { className?: string }) {
  const bars = [
    { label: "URS", x: 30, w: 70, done: true },
    { label: "FDS", x: 104, w: 96, done: true },
    { label: "Software", x: 204, w: 130, done: false },
    { label: "FAT", x: 338, w: 62, done: false },
    { label: "SAT", x: 404, w: 78, late: true },
  ];
  const today = 300;

  return (
    <svg
      viewBox="0 0 560 190"
      className={className}
      role="img"
      aria-label="Five project tasks drawn as bars against a timeline, with dependency arrows and a marker for today"
    >
      <title>The plan, as bars against real dates</title>

      <defs>
        <marker
          id="gantt-arrow"
          viewBox="0 0 8 8"
          refX="7"
          refY="4"
          markerWidth="5"
          markerHeight="5"
          orient="auto"
        >
          <path d="M 0 1 L 7 4 L 0 7 z" fill={INK} opacity="0.4" />
        </marker>
      </defs>

      {[0, 1, 2, 3].map((m) => (
        <g key={m}>
          <line
            x1={30 + m * 128}
            y1="22"
            x2={30 + m * 128}
            y2="164"
            stroke={INK}
            strokeWidth="0.8"
            opacity="0.14"
          />
          <text
            x={34 + m * 128}
            y="18"
            fontSize="9"
            fill={INK}
            opacity="0.45"
            fontFamily="ui-monospace, monospace"
          >
            {["MAR", "APR", "MAY", "JUN"][m]}
          </text>
        </g>
      ))}

      {bars.map((b, i) => {
        const y = 36 + i * 26;
        return (
          <g key={b.label}>
            <text x="0" y={y + 11} fontSize="10" fill={INK} opacity="0.7">
              {b.label}
            </text>
            <rect
              x={b.x}
              y={y}
              width={b.w}
              height="14"
              rx="2"
              fill={b.late ? "#B4531A" : b.done ? INK : TEAL}
              opacity={b.done ? 0.28 : b.late ? 0.8 : 0.8}
            />
            {/* Finish to start, drawn because the chart enforces it rather
                than leaving it as a note in a cell. */}
            {i > 0 &&
              (() => {
                const prev = bars[i - 1];
                if (!prev) return null;
                const fromX = prev.x + prev.w;
                const fromY = y - 26 + 7;
                return (
                  <path
                    d={`M ${fromX} ${fromY} L ${fromX + 6} ${fromY} L ${fromX + 6} ${y + 7} L ${b.x - 3} ${y + 7}`}
                    fill="none"
                    stroke={INK}
                    strokeWidth="0.9"
                    opacity="0.35"
                    markerEnd="url(#gantt-arrow)"
                  />
                );
              })()}
          </g>
        );
      })}

      <line x1={today} y1="22" x2={today} y2="168" stroke={TEAL} strokeWidth="1.4" />
      <text x={today + 4} y="176" fontSize="9" fill={TEAL} fontFamily="ui-monospace, monospace">
        TODAY
      </text>

      <text x="0" y="186" fontSize="9" fill={INK} opacity="0.45">
        Drag a bar to move it. A task that depends on another cannot start before it ends.
      </text>
    </svg>
  );
}
