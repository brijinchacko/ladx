"use client";

import { type LadxProgram, type Tag, resetTags, scan, seedPresets } from "@ladx/studio";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The hero, running for real.
 *
 * This is not an animation of a ladder program. It is the same scan engine the
 * Studio editor uses, imported from the same package, solving the same rungs on
 * a timer. Press Stop and the seal-in drops out because the logic says so, not
 * because a designer drew that frame.
 *
 * Which is the entire argument the page is making, so making the page make it
 * is worth more than any screenshot: a visitor can disprove the claim in about
 * four seconds, and finds instead that it holds.
 *
 * Element ids here match the ids the engine reports power against, so the wire
 * colouring is read out of the solver rather than inferred.
 */

const SCAN_MS = 120;

/** Two rungs: the seal-in, and the lamp it drives. */
function buildProgram(): LadxProgram {
  return {
    name: "Conveyor start/stop",
    scanMs: SCAN_MS,
    tags: [
      {
        name: "Start_PB",
        type: "BOOL",
        value: 0,
        isInput: true,
        device: "PUSHBUTTON_NO",
        address: "I0.0",
      },
      {
        name: "Stop_PB",
        type: "BOOL",
        value: 1,
        isInput: true,
        device: "PUSHBUTTON_NC",
        address: "I0.1",
      },
      {
        name: "Guard_OK",
        type: "BOOL",
        value: 1,
        isInput: true,
        device: "SENSOR",
        address: "I0.2",
      },
      {
        name: "Conveyor",
        type: "BOOL",
        value: 0,
        isOutput: true,
        device: "MOTOR",
        address: "Q0.0",
      },
      { name: "Run_Lamp", type: "BOOL", value: 0, isOutput: true, device: "LAMP", address: "Q0.1" },
    ] as Tag[],
    rungs: [
      {
        id: "rung1",
        branches: [[]],
        logic: {
          kind: "series",
          id: "s1",
          children: [
            {
              kind: "parallel",
              id: "p1",
              children: [
                {
                  kind: "series",
                  id: "s2",
                  children: [{ kind: "el", id: "e_start", type: "XIC", tag: "Start_PB" }],
                },
                {
                  kind: "series",
                  id: "s3",
                  children: [{ kind: "el", id: "e_seal", type: "XIC", tag: "Conveyor" }],
                },
              ],
            },
            { kind: "el", id: "e_stop", type: "XIC", tag: "Stop_PB" },
            { kind: "el", id: "e_guard", type: "XIC", tag: "Guard_OK" },
          ],
          // biome-ignore lint/suspicious/noExplicitAny: the tree type lives in the studio package
        } as any,
        outputs: [{ id: "e_coil", type: "OTE", tag: "Conveyor" }],
      },
      {
        id: "rung2",
        branches: [[]],
        logic: {
          kind: "series",
          id: "s4",
          children: [{ kind: "el", id: "e_conv", type: "XIC", tag: "Conveyor" }],
          // biome-ignore lint/suspicious/noExplicitAny: as above
        } as any,
        outputs: [{ id: "e_lamp", type: "OTE", tag: "Run_Lamp" }],
      },
    ],
    // biome-ignore lint/suspicious/noExplicitAny: rung shape is the studio package's
  } as any;
}

/** The three switches a visitor can operate. */
const INPUTS = [
  { tag: "Start_PB", label: "Start", hint: "momentary", momentary: true },
  { tag: "Stop_PB", label: "Stop", hint: "wired NC", momentary: false },
  { tag: "Guard_OK", label: "Guard", hint: "closed = 1", momentary: false },
];

export function LiveRung() {
  const [program] = useState(buildProgram);

  /**
   * The tag values live in a ref, not in state.
   *
   * This looks backwards for React and is the only arrangement that works. The
   * scan loop both reads and writes tags every 120 ms, and a click also writes
   * them. With tags in state and a ref mirrored during render, a click landing
   * between a scan and its re-render was computed from stale values and then
   * overwritten by the scan already in flight, so every press appeared to take
   * effect one action late. The engine was right; the plumbing was losing input.
   *
   * With the ref authoritative there is one writer of record, and state exists
   * only to trigger a repaint.
   */
  const tagsRef = useRef<Tag[]>(
    (() => {
      const p = buildProgram();
      return resetTags(seedPresets(p, p.tags));
    })(),
  );
  const edgesRef = useRef<Record<string, boolean>>({});

  const [view, setView] = useState<{
    tags: Tag[];
    power: Record<string, boolean>;
    rungPower: Record<string, boolean>;
    scans: number;
  }>({ tags: tagsRef.current, power: {}, rungPower: {}, scans: 0 });

  /** Solve one sweep and publish it. */
  const step = useCallback(() => {
    const result = scan(program, tagsRef.current, edgesRef.current, SCAN_MS);
    tagsRef.current = result.tags;
    edgesRef.current = result.edges;
    setView((v) => ({
      tags: result.tags,
      power: result.elementPower,
      rungPower: result.rungPower,
      scans: v.scans + 1,
    }));
  }, [program]);

  useEffect(() => {
    const id = setInterval(step, SCAN_MS);
    return () => clearInterval(id);
  }, [step]);

  const value = useCallback(
    (name: string) => view.tags.find((t) => t.name === name)?.value ?? 0,
    [view.tags],
  );

  /**
   * Apply an input and solve immediately, rather than waiting for the next tick.
   *
   * A real controller would see the change on its next sweep, which at 120 ms is
   * imperceptible. A browser tab is not so reliable: background and unfocused
   * tabs get their timers throttled hard, and a press that appears to do nothing
   * for half a second reads as broken rather than as slow. Solving on the press
   * costs one extra scan and makes the panel feel like a machine.
   */
  const set = useCallback(
    (name: string, next: number) => {
      tagsRef.current = tagsRef.current.map((t) => (t.name === name ? { ...t, value: next } : t));
      step();
    },
    [step],
  );

  const toggle = useCallback(
    (name: string) => {
      const current = tagsRef.current.find((t) => t.name === name)?.value ?? 0;
      set(name, current ? 0 : 1);
    },
    [set],
  );

  /** A momentary button: held while pressed, released on pointer up. */
  const press = useCallback((name: string) => set(name, 1), [set]);
  const release = useCallback((name: string) => set(name, 0), [set]);

  const { power, rungPower, scans } = view;

  const running = value("Conveyor") === 1;

  return (
    <div className="border border-ink-200 bg-white">
      {/* Title strip, so the thing reads as an instrument rather than a picture */}
      <div className="flex items-center gap-2.5 border-b border-ink-100 px-4 py-2.5">
        <span aria-hidden="true" className={`h-2 w-2 ${running ? "bg-teal-500" : "bg-ink-200"}`} />
        <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-500">
          Live
        </span>
        <span className="font-mono text-[11px] text-ink-300">|</span>
        <span className="font-mono text-[11px] text-ink-400">conveyor start/stop</span>
        <span className="ml-auto font-mono text-[11px] tabular-nums text-ink-400">
          {scans} scans
        </span>
      </div>

      <div className="px-4 pt-4">
        <LadderSvg power={power} rungPower={rungPower} />
      </div>

      {/* The controls. This is the part that makes the claim testable.
          Laid out on a fixed grid rather than a wrapping flex row, so the
          labels line up in columns and nothing reflows as values change. */}
      <div className="border-t border-ink-100">
        <div className="grid gap-px bg-ink-100 sm:grid-cols-2">
          <div className="bg-white p-4">
            <span className="mb-3 block font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-400">
              Inputs
            </span>
            <div className="grid gap-2">
              {INPUTS.map((input) => {
                const on = value(input.tag) === 1;
                return (
                  <button
                    key={input.tag}
                    type="button"
                    onPointerDown={input.momentary ? () => press(input.tag) : undefined}
                    onPointerUp={input.momentary ? () => release(input.tag) : undefined}
                    onPointerLeave={input.momentary ? () => release(input.tag) : undefined}
                    onClick={input.momentary ? undefined : () => toggle(input.tag)}
                    aria-pressed={on}
                    className={`grid grid-cols-[auto_1fr_auto] items-center gap-2.5 border px-2.5 py-2 text-left transition-colors ${
                      on
                        ? "border-teal-500 bg-teal-50"
                        : "border-ink-200 bg-white hover:border-ink-400"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`h-3 w-3 border ${on ? "border-teal-600 bg-teal-500" : "border-ink-300 bg-white"}`}
                    />
                    <span
                      className={`font-mono text-[12.5px] font-semibold ${on ? "text-ink-900" : "text-ink-600"}`}
                    >
                      {input.label}
                    </span>
                    <span className="font-mono text-[10px] text-ink-400">{input.hint}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="bg-white p-4">
            <span className="mb-3 block font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-400">
              Outputs
            </span>
            <div className="grid gap-2">
              {[
                { tag: "Conveyor", label: "Conveyor", addr: "Q0.0" },
                { tag: "Run_Lamp", label: "Run lamp", addr: "Q0.1" },
              ].map((out) => {
                const on = value(out.tag) === 1;
                return (
                  <div
                    key={out.tag}
                    className={`grid grid-cols-[auto_1fr_auto] items-center gap-2.5 border px-2.5 py-2 ${
                      on ? "border-teal-500 bg-teal-50" : "border-ink-100 bg-ink-50/50"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`h-3 w-3 border ${on ? "border-teal-600 bg-teal-500" : "border-ink-200 bg-white"}`}
                    />
                    <span
                      className={`font-mono text-[12.5px] ${on ? "font-semibold text-ink-900" : "text-ink-400"}`}
                    >
                      {out.label}
                    </span>
                    <span className="font-mono text-[10px] text-ink-400">{out.addr}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <p className="border-t border-ink-100 px-4 py-3 text-[12.5px] leading-relaxed text-ink-500">
          Hold <span className="font-mono text-ink-800">Start</span>. The conveyor latches through
          its own contact and stays on when you let go. Now press{" "}
          <span className="font-mono text-ink-800">Stop</span>, or open the guard.
        </p>
      </div>
    </div>
  );
}

/* ─────────────────────────── the drawing ─────────────────────────── */

const INK = "currentColor";
const LIVE = "rgb(var(--ladx-teal, 53 182 186))";

function Contact({ x, y, label, on }: { x: number; y: number; label: string; on: boolean }) {
  const stroke = on ? LIVE : INK;
  return (
    <g>
      <line x1={x - 8} y1={y - 10} x2={x - 8} y2={y + 10} stroke={stroke} strokeWidth="2" />
      <line x1={x + 8} y1={y - 10} x2={x + 8} y2={y + 10} stroke={stroke} strokeWidth="2" />
      <text
        x={x}
        y={y - 17}
        textAnchor="middle"
        fontSize="9.5"
        fontFamily="var(--font-mono, monospace)"
        fill={INK}
        opacity={on ? 0.95 : 0.6}
      >
        {label}
      </text>
    </g>
  );
}

function Coil({ x, y, label, on }: { x: number; y: number; label: string; on: boolean }) {
  const stroke = on ? LIVE : INK;
  return (
    <g>
      <path
        d={`M ${x - 9} ${y - 10} A 12 12 0 0 0 ${x - 9} ${y + 10}`}
        stroke={stroke}
        strokeWidth="2"
        fill="none"
      />
      <path
        d={`M ${x + 9} ${y - 10} A 12 12 0 0 1 ${x + 9} ${y + 10}`}
        stroke={stroke}
        strokeWidth="2"
        fill="none"
      />
      <text
        x={x}
        y={y - 17}
        textAnchor="middle"
        fontSize="9.5"
        fontFamily="var(--font-mono, monospace)"
        fill={INK}
        opacity={on ? 0.95 : 0.6}
      >
        {label}
      </text>
    </g>
  );
}

function LadderSvg({
  power,
  rungPower,
}: { power: Record<string, boolean>; rungPower: Record<string, boolean> }) {
  const lit = (id: string) => Boolean(power[id]);
  const wire = (on: boolean) => (on ? LIVE : INK);
  const w = (on: boolean) => (on ? 2 : 1.4);
  const dim = (on: boolean) => (on ? 1 : 0.45);

  // Power leaving each stage, read out of the solver.
  const startOn = lit("e_start");
  const sealOn = lit("e_seal");
  const junction = startOn || sealOn;
  const stopOn = lit("e_stop");
  const guardOn = lit("e_guard");
  const rung1 = Boolean(rungPower.rung1);
  const conv = lit("e_conv");
  const rung2 = Boolean(rungPower.rung2);

  return (
    <svg
      viewBox="0 0 440 210"
      className="w-full text-ink-800"
      role="img"
      aria-label="A live two rung ladder program. Rung one latches the conveyor; rung two drives the run lamp."
    >
      {/* Rails */}
      <line x1="18" y1="22" x2="18" y2="192" stroke={INK} strokeWidth="2.5" opacity="0.45" />
      <line x1="422" y1="22" x2="422" y2="192" stroke={INK} strokeWidth="2.5" opacity="0.45" />

      {/* ── Rung 1 ── */}
      <text
        x="18"
        y="36"
        fontSize="8.5"
        fontFamily="var(--font-mono, monospace)"
        fill={INK}
        opacity="0.35"
      >
        RUNG 1
      </text>

      {/* rail to the branch split */}
      <line x1="18" y1="70" x2="62" y2="70" stroke={LIVE} strokeWidth="2" />
      {/* upper leg: Start */}
      <line x1="62" y1="70" x2="84" y2="70" stroke={LIVE} strokeWidth="2" />
      <Contact x={92} y={70} label="Start_PB" on={startOn} />
      <line
        x1="100"
        y1="70"
        x2="158"
        y2="70"
        stroke={wire(startOn)}
        strokeWidth={w(startOn)}
        opacity={dim(startOn)}
      />
      {/* lower leg: the seal-in */}
      <line x1="62" y1="70" x2="62" y2="112" stroke={LIVE} strokeWidth="2" />
      <line x1="62" y1="112" x2="84" y2="112" stroke={LIVE} strokeWidth="2" />
      <Contact x={92} y={112} label="Conveyor" on={sealOn} />
      <line
        x1="100"
        y1="112"
        x2="158"
        y2="112"
        stroke={wire(sealOn)}
        strokeWidth={w(sealOn)}
        opacity={dim(sealOn)}
      />
      <line
        x1="158"
        y1="112"
        x2="158"
        y2="70"
        stroke={wire(sealOn)}
        strokeWidth={w(sealOn)}
        opacity={dim(sealOn)}
      />

      {/* series conditions */}
      <line
        x1="158"
        y1="70"
        x2="200"
        y2="70"
        stroke={wire(junction)}
        strokeWidth={w(junction)}
        opacity={dim(junction)}
      />
      <Contact x={208} y={70} label="Stop_PB" on={stopOn} />
      <line
        x1="216"
        y1="70"
        x2="272"
        y2="70"
        stroke={wire(stopOn)}
        strokeWidth={w(stopOn)}
        opacity={dim(stopOn)}
      />
      <Contact x={280} y={70} label="Guard_OK" on={guardOn} />
      <line
        x1="288"
        y1="70"
        x2="350"
        y2="70"
        stroke={wire(guardOn)}
        strokeWidth={w(guardOn)}
        opacity={dim(guardOn)}
      />

      <Coil x={371} y={70} label="Conveyor" on={rung1} />
      <line
        x1="380"
        y1="70"
        x2="422"
        y2="70"
        stroke={wire(rung1)}
        strokeWidth={w(rung1)}
        opacity={dim(rung1)}
      />

      <circle cx="62" cy="70" r="3" fill={LIVE} />
      <circle cx="158" cy="70" r="3" fill={wire(junction)} opacity={dim(junction)} />

      {/* divider */}
      <line x1="18" y1="140" x2="422" y2="140" stroke={INK} strokeWidth="1" opacity="0.1" />

      {/* ── Rung 2 ── */}
      <text
        x="18"
        y="156"
        fontSize="8.5"
        fontFamily="var(--font-mono, monospace)"
        fill={INK}
        opacity="0.35"
      >
        RUNG 2
      </text>
      <line x1="18" y1="182" x2="84" y2="182" stroke={LIVE} strokeWidth="2" />
      <Contact x={92} y={182} label="Conveyor" on={conv} />
      <line
        x1="100"
        y1="182"
        x2="350"
        y2="182"
        stroke={wire(conv)}
        strokeWidth={w(conv)}
        opacity={dim(conv)}
      />
      <Coil x={371} y={182} label="Run_Lamp" on={rung2} />
      <line
        x1="380"
        y1="182"
        x2="422"
        y2="182"
        stroke={wire(rung2)}
        strokeWidth={w(rung2)}
        opacity={dim(rung2)}
      />
    </svg>
  );
}
