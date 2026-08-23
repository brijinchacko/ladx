"use client";

import { Play, RotateCcw, Square, Zap, ZoomIn, ZoomOut } from "lucide-react";
import { useState } from "react";
import { DEVICE_LABEL, type DeviceKind, type Tag, defaultDevice } from "../lib/types";
import SimWiring from "./SimWiring";
import css from "./ladx.module.css";

/**
 * The simulator's front panel.
 *
 * Every control behaves like the device it represents, because a simulator that
 * shows every input as the same toggle teaches the wrong reflex:
 *
 *   A PUSHBUTTON is momentary. Press and hold energises it, letting go drops
 *   it. That is the whole reason a seal-in exists, and a student who has only
 *   ever used latching toggles never feels why.
 *
 *   An NC pushbutton reads 1 at rest and 0 while pressed — a healthy stop
 *   circuit. Pressing it BREAKS the rung, which is what a real STOP does and
 *   what makes fail-safe wiring click.
 *
 *   A SELECTOR stays where it is put.
 *
 *   A SENSOR toggles like a selector but is drawn as a process device, because
 *   nobody presses a proximity switch — the part arrives.
 *
 * Outputs are lamps: read-only, lit when the coil is energised.
 */

const ON = "#22c55e";
const OFF = "#94a3b8";
const NC_REST = "#0ea5e9";

export type PlcState = {
  /** Powered on — the simulator window is open and the rack is live. */
  powered: boolean;
  /** A program has been transferred into the controller. */
  downloaded: boolean;
  /** Solving logic. A real PLC only runs what was downloaded to it. */
  running: boolean;
  /** Compile problems block a download, the way they block one on hardware. */
  faulted: boolean;
};

export type SimHandlers = {
  /** Momentary: held while the pointer is down. */
  hold: (tag: string, down: boolean) => void;
  /** Maintained: flips and stays. */
  toggle: (tag: string) => void;
  setValue: (tag: string, v: number) => void;
};

function deviceOf(t: Tag): DeviceKind {
  return t.device ?? defaultDevice(t);
}

/**
 * The controller's front face.
 *
 * A real PLC tells you its state from across the room with four LEDs, and a
 * student who has watched those four learns to diagnose before they learn to
 * program: POWER says the rack is live, RUN says it is solving logic, STOP says
 * it is not, FAULT says it will not. Reproducing them costs nothing and means
 * the words on the panel match the words on the hardware in the lab.
 *
 * The I/O LEDs are addressed the way terminals are: I0.0 upwards for inputs,
 * Q0.0 for outputs. Students wire to those numbers, not to tag names.
 */
function Led({ on, label, colour }: { on: boolean; label: string; colour: string }) {
  return (
    <span className="flex flex-col items-center gap-0.5" style={{ width: 30 }}>
      <span
        className="rounded-full"
        style={{
          width: 9,
          height: 9,
          background: on ? colour : "#334155",
          boxShadow: on ? `0 0 7px ${colour}` : "none",
        }}
      />
      <span
        className="text-[7.5px] font-bold tracking-wide"
        style={{ color: on ? colour : "#64748b" }}
      >
        {label}
      </span>
    </span>
  );
}

/**
 * The controller, drawn as hardware.
 *
 * Modelled on the compact CPUs these students will actually meet — a DIN-rail
 * brick with a terminal strip along the top for supply and inputs, one along
 * the bottom for outputs and analogue, status lamps and a mode switch behind
 * the door, and a PROFINET socket in the bottom corner.
 *
 * The markings are the ones that matter on site: the order code you quote when
 * ordering a spare, the firmware you check against a compatibility list, the
 * supply voltage you must not get wrong, and the I/O count that tells you at a
 * glance whether the machine will fit on it. A student who has read this
 * faceplate can read a real one.
 *
 * Terminals are addressed I0.0 upward and Q0.0 upward because that is what is
 * printed beside the screws, and what a wiring drawing calls them. Tag names
 * belong in the software; the hardware only knows terminal numbers.
 */

const CASE = "#3f4a56";
const CASE_DARK = "#2b333c";
const STRIP = "#d8dde3";
const SCREW = "#9aa5b1";

function Screw({ label, on, colour }: { label: string; on: boolean; colour: string }) {
  return (
    <span className="flex flex-col items-center" style={{ width: 17 }}>
      <span
        className="rounded-full"
        style={{
          width: 5,
          height: 5,
          marginBottom: 1,
          background: on ? colour : "#7b8794",
          boxShadow: on ? `0 0 5px ${colour}` : "none",
        }}
      />
      <span
        className="rounded-sm grid place-items-center"
        style={{ width: 13, height: 11, background: SCREW, border: "1px solid #7b8794" }}
      >
        <span style={{ width: 7, height: 1.5, background: "#5b6570" }} />
      </span>
      <span className="mt-0.5" style={{ fontSize: 5.5, color: "#4b5563", letterSpacing: -0.2 }}>
        {label}
      </span>
    </span>
  );
}

function StatusLamp({ on, label, colour }: { on: boolean; label: string; colour: string }) {
  return (
    <span className="flex items-center gap-1">
      <span
        className="rounded-sm shrink-0"
        style={{
          width: 7,
          height: 7,
          background: on ? colour : "#1b2027",
          boxShadow: on ? `0 0 6px ${colour}` : "inset 0 0 0 1px #55606c",
        }}
      />
      <span
        style={{
          fontSize: 6.5,
          color: on ? colour : "#8a949f",
          fontWeight: 700,
          letterSpacing: 0.3,
        }}
      >
        {label}
      </span>
    </span>
  );
}

function Rack({ plc, inputs, outputs }: { plc: PlcState; inputs: Tag[]; outputs: Tag[] }) {
  const digitalIn = inputs.filter((t) => t.type !== "INT");
  const analogIn = inputs.filter((t) => t.type === "INT");
  const digitalOut = outputs.filter((t) => t.type !== "INT");

  return (
    <div
      className="rounded"
      style={{ background: CASE, padding: 3, boxShadow: "0 1px 3px rgba(0,0,0,0.35)" }}
    >
      {/* ── Top terminal strip: supply and inputs ────────────────── */}
      <div
        className="rounded-sm flex items-end gap-0.5 px-1 pt-1 pb-0.5 overflow-x-auto"
        style={{ background: STRIP }}
      >
        <Screw label="L+" on={plc.powered} colour="#ef4444" />
        <Screw label="M" on={plc.powered} colour="#64748b" />
        <span style={{ width: 4 }} />
        {Array.from({ length: 8 }).map((_, i) => {
          const t = digitalIn[i];
          return (
            <Screw
              key={`i${i}`}
              label={`I0.${i}`}
              on={!!t && plc.powered && t.value !== 0}
              colour="#22c55e"
            />
          );
        })}
      </div>

      {/* ── Body ─────────────────────────────────────────────────── */}
      <div className="flex gap-2 px-1.5 py-1.5">
        {/* Status lamps, behind the door on real hardware */}
        <div className="flex flex-col gap-1 shrink-0 pt-0.5">
          <StatusLamp on={plc.running} label="RUN" colour="#22c55e" />
          <StatusLamp on={plc.powered && !plc.running} label="STOP" colour="#f59e0b" />
          <StatusLamp on={plc.faulted} label="ERROR" colour="#ef4444" />
          <StatusLamp on={plc.powered && !plc.downloaded} label="MAINT" colour="#eab308" />
        </div>

        {/* Nameplate */}
        <div className="min-w-0 flex-1 rounded-sm px-1.5 py-1" style={{ background: CASE_DARK }}>
          <p
            style={{
              fontSize: 9,
              fontWeight: 900,
              color: "#e2e8f0",
              letterSpacing: 1.4,
              lineHeight: 1.1,
            }}
          >
            WARTENS
          </p>
          <p style={{ fontSize: 7.5, fontWeight: 700, color: "#93c5fd", letterSpacing: 0.4 }}>
            VCX CPU 1212C
          </p>
          <p style={{ fontSize: 6, color: "#94a3b8", lineHeight: 1.5 }}>
            DC/DC/DC · 24 V DC
            <br />
            Order WVX-212-1AE40-0XB0
            <br />
            FW V4.2.1 · DI 8 · DQ 6 · AI 2
            <br />
            MAC 00-1B-WA-{plc.downloaded ? "0C" : "00"}-11-92
          </p>
        </div>

        {/* Mode switch */}
        <div className="shrink-0 flex flex-col items-center justify-center gap-0.5">
          <span style={{ fontSize: 5.5, color: "#8a949f", fontWeight: 700 }}>MODE</span>
          <span
            className="rounded-sm flex flex-col items-stretch overflow-hidden"
            style={{ width: 26, border: "1px solid #55606c" }}
          >
            {(["RUN", "STOP"] as const).map((m) => {
              const active = m === "RUN" ? plc.running : !plc.running;
              return (
                <span
                  key={m}
                  className="text-center"
                  style={{
                    fontSize: 5.5,
                    fontWeight: 800,
                    padding: "1.5px 0",
                    background: active ? (m === "RUN" ? "#22c55e" : "#f59e0b") : "transparent",
                    color: active ? "#0f172a" : "#8a949f",
                  }}
                >
                  {m}
                </span>
              );
            })}
          </span>
        </div>
      </div>

      {/* ── Ports ────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 px-1.5 pb-1">
        {/* RJ45, drawn as one — the notch is what makes it read as Ethernet */}
        <span className="flex items-center gap-1 shrink-0">
          <span
            className="relative rounded-sm"
            style={{ width: 20, height: 15, background: "#1b2027", border: "1px solid #55606c" }}
          >
            <span
              className="absolute"
              style={{
                left: 6,
                bottom: -1,
                width: 7,
                height: 4,
                background: "#1b2027",
                border: "1px solid #55606c",
                borderTop: "none",
              }}
            />
            <span
              className="absolute rounded-full"
              style={{
                left: 2,
                top: 2,
                width: 4,
                height: 4,
                background: plc.powered ? "#22c55e" : "#39414b",
                boxShadow: plc.powered ? "0 0 4px #22c55e" : "none",
              }}
            />
            <span
              className="absolute rounded-full"
              style={{
                right: 2,
                top: 2,
                width: 4,
                height: 4,
                background: plc.running ? "#f59e0b" : "#39414b",
                boxShadow: plc.running ? "0 0 4px #f59e0b" : "none",
              }}
            />
          </span>
          <span style={{ fontSize: 5.5, color: "#8a949f", lineHeight: 1.3 }}>
            X1 PROFINET
            <br />
            LINK · RX/TX
          </span>
        </span>

        <span
          className="ml-auto text-right"
          style={{ fontSize: 5.5, color: "#8a949f", lineHeight: 1.3 }}
        >
          IP 192.168.0.1 / 24
          <br />
          X10 PROG · virtual
        </span>
      </div>

      {/* ── Bottom terminal strip: outputs and analogue ──────────── */}
      <div
        className="rounded-sm flex items-start gap-0.5 px-1 pt-0.5 pb-1 overflow-x-auto"
        style={{ background: STRIP }}
      >
        {Array.from({ length: 6 }).map((_, i) => {
          const t = digitalOut[i];
          return (
            <Screw
              key={`q${i}`}
              label={`Q0.${i}`}
              on={!!t && plc.powered && t.value !== 0}
              colour="#f59e0b"
            />
          );
        })}
        <span style={{ width: 4 }} />
        {Array.from({ length: 2 }).map((_, i) => {
          const t = analogIn[i];
          return (
            <Screw
              key={`ai${i}`}
              label={`AI${i}`}
              on={!!t && plc.powered && t.value !== 0}
              colour="#38bdf8"
            />
          );
        })}
      </div>
    </div>
  );
}

/**
 * Output devices are drawn as the schematic symbols they are: a lamp is a
 * circle with a cross, a motor a circle with an M — the symbols on the drawing
 * a student will be handed on site.
 */
function LampSymbol({ on }: { on: boolean }) {
  const c = on ? ON : "#cbd5e1";
  return (
    <span className="relative block shrink-0" style={{ width: 22, height: 22 }}>
      <span
        className="absolute inset-0 rounded-full"
        style={{
          border: `2px solid ${c}`,
          background: on ? "rgba(34,197,94,0.18)" : "transparent",
          boxShadow: on ? `0 0 9px ${ON}` : "none",
        }}
      />
      {(["45deg", "-45deg"] as const).map((r) => (
        <span
          key={r}
          className="absolute"
          style={{
            left: 3,
            right: 3,
            top: 10,
            height: 2,
            background: c,
            transform: `rotate(${r})`,
          }}
        />
      ))}
    </span>
  );
}

function MotorSymbol({ on }: { on: boolean }) {
  const c = on ? ON : "#cbd5e1";
  return (
    <span
      className="grid place-items-center rounded-full shrink-0 text-[11px] font-bold"
      style={{
        width: 22,
        height: 22,
        border: `2px solid ${c}`,
        color: c,
        background: on ? "rgba(34,197,94,0.18)" : "transparent",
        boxShadow: on ? `0 0 9px ${ON}` : "none",
      }}
    >
      M
    </span>
  );
}

function OutputRow({ tag, on }: { tag: Tag; on: boolean }) {
  const kind = deviceOf(tag);
  const sub = DEVICE_LABEL[kind];

  // An analog output is a reading, not a lamp: the number and a bar.
  if (kind === "VALUE" || tag.type === "INT") {
    const pct = Math.max(0, Math.min(100, tag.value));
    return (
      <div className="py-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[12.5px] font-medium text-[#0f172a] truncate">{tag.name}</span>
          <span className="text-[13px] font-mono font-bold" style={{ color: "#15803d" }}>
            {tag.value}
          </span>
        </div>
        <div className="h-1.5 rounded bg-[#e2e8f0] overflow-hidden mt-1">
          <div className="h-full rounded" style={{ width: `${pct}%`, background: "#2891FF" }} />
        </div>
        <span className="text-[10px] text-[#64748b]">{sub} · read-only</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2.5 py-1.5">
      {kind === "MOTOR" ? <MotorSymbol on={on} /> : <LampSymbol on={on} />}
      <span className="min-w-0">
        <span className="block text-[12.5px] font-medium text-[#0f172a] truncate">{tag.name}</span>
        <span className="block text-[10px] text-[#64748b]">{sub}</span>
      </span>
      <span
        className="ml-auto text-[11px] font-mono font-bold"
        style={{ color: on ? "#15803d" : OFF }}
      >
        {on ? "1" : "0"}
      </span>
    </div>
  );
}

function InputControl({ tag, on, h }: { tag: Tag; on: boolean; h: SimHandlers }) {
  const kind = deviceOf(tag);
  const sub = DEVICE_LABEL[kind];

  if (kind === "VALUE") {
    return (
      <div className="py-1.5">
        <div className="flex items-baseline justify-between">
          <span className="text-[12.5px] font-medium text-[#0f172a]">{tag.name}</span>
          <span className="text-[11px] font-mono font-bold text-[#15803d]">{tag.value}</span>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <input
            type="range"
            min={0}
            max={100}
            value={tag.value}
            onChange={(e) => h.setValue(tag.name, Number(e.target.value))}
            className="flex-1"
          />
          {/* A slider cannot hit 47 reliably, and a setpoint is usually an
              exact number, so the field is there to type it. */}
          <input
            type="number"
            min={0}
            max={100}
            value={tag.value}
            onChange={(e) => h.setValue(tag.name, Number(e.target.value))}
            className="w-14 h-6 px-1 rounded border border-[#C9D2DC] bg-white text-[11.5px] font-mono text-[#0f172a] text-right"
          />
        </div>
        <span className="text-[10px] text-[#64748b]">{sub}</span>
      </div>
    );
  }

  const momentary = kind === "PUSHBUTTON_NO" || kind === "PUSHBUTTON_NC";
  const nc = kind === "PUSHBUTTON_NC";
  // An NC button reads 1 at rest. Pressed means the circuit is broken, so the
  // lamp beside it should read what the PLC sees, not what the finger did.
  const pressed = nc ? !on : on;

  return (
    <div className="flex items-center gap-2.5 py-1.5">
      {momentary ? (
        <button
          type="button"
          onPointerDown={(e) => {
            e.preventDefault();
            h.hold(tag.name, true);
          }}
          onPointerUp={() => h.hold(tag.name, false)}
          onPointerLeave={() => h.hold(tag.name, false)}
          onKeyDown={(e) => {
            if (e.key === " " || e.key === "Enter") {
              e.preventDefault();
              h.hold(tag.name, true);
            }
          }}
          onKeyUp={(e) => {
            if (e.key === " " || e.key === "Enter") h.hold(tag.name, false);
          }}
          title={`${sub} — press and hold`}
          className="rounded-full shrink-0 transition-transform active:scale-95"
          style={{
            width: 26,
            height: 26,
            border: `2px solid ${pressed ? ON : nc ? NC_REST : "#94a3b8"}`,
            background: pressed ? ON : "#fff",
            boxShadow: pressed ? `0 0 8px ${ON}` : "inset 0 1px 2px rgba(0,0,0,0.12)",
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => h.toggle(tag.name)}
          title={`${sub} — click to change position`}
          className="shrink-0 rounded"
          style={{
            width: 34,
            height: 20,
            background: on ? ON : "#cbd5e1",
            position: "relative",
            transition: "background 120ms",
          }}
        >
          <span
            className="absolute rounded bg-white"
            style={{ width: 14, height: 14, top: 3, left: on ? 17 : 3, transition: "left 120ms" }}
          />
        </button>
      )}

      <span className="min-w-0">
        <span className="block text-[12.5px] font-medium text-[#0f172a] truncate">{tag.name}</span>
        <span className="block text-[10px] text-[#64748b]">
          {sub}
          {nc && <span className="text-[#0ea5e9]"> · 1 at rest</span>}
        </span>
      </span>

      <span
        className="ml-auto text-[11px] font-mono font-bold"
        style={{ color: on ? "#15803d" : OFF }}
      >
        {on ? "1" : "0"}
      </span>
    </div>
  );
}

export default function SimPanel({
  tags,
  running,
  scanCount,
  errors,
  handlers,
  onStart,
  onStop,
  onReset,
  plc,
}: {
  tags: Tag[];
  running: boolean;
  scanCount: number;
  errors: string[];
  handlers: SimHandlers;
  onStart: () => void;
  onStop: () => void;
  onReset: () => void;
  plc: PlcState;
}) {
  const inputs = tags.filter((t) => t.isInput);
  const outputs = tags.filter((t) => t.isOutput);
  const timers = tags.filter((t) => t.type === "TIMER" || t.type === "COUNTER");

  /*
   * Two ways to look at the same machine.
   *
   * PANEL is the working view: the controls as they sit on a real enclosure,
   * quiet, no animation, the way somebody who already knows the plant wants to
   * see it.
   *
   * WIRING is the teaching view: the loop drawn out — supply, device, terminal,
   * controller — with current animated in the wires. It answers the questions a
   * first-week student actually has, which the panel view assumes you already
   * know: where the 24V comes from, what the common is for, and why a stop
   * button reads 1 when nobody is pressing it.
   */
  const [view, setView] = useState<"panel" | "wiring">("panel");

  /**
   * Zoom.
   *
   * The controller graphic is dense — eight terminals, a nameplate, four
   * status lamps — and in a 272px panel the terminal numbers are at the edge
   * of legible. Rather than make the drawing coarser for everybody, it can be
   * scaled. Steps rather than a slider: there are only about four sizes
   * anybody wants, and a slider is another thing to fiddle with.
   */
  const [zoom, setZoom] = useState(1);
  const ZOOMS = [0.75, 0.9, 1, 1.25, 1.5, 2];
  const zoomBy = (dir: 1 | -1) => {
    const i = ZOOMS.indexOf(zoom);
    const next = ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, (i < 0 ? 2 : i) + dir))];
    // The index is clamped to the array, so `next` is only ever missing in
    // types, never at runtime — staying at the current zoom is the safe read.
    setZoom(next ?? zoom);
  };

  return (
    <div className="h-full flex flex-col bg-[#F7F9FB] text-[#0f172a] min-w-0">
      {/* View switch */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-[#C9D2DC] bg-white">
        {(
          [
            ["panel", "Panel", "Controls as they sit on the enclosure"],
            ["wiring", "Wiring", "How each device is connected to the PLC"],
          ] as const
        ).map(([key, label, help]) => (
          <button
            type="button"
            key={key}
            onClick={() => setView(key)}
            title={help}
            className="px-2.5 h-6 rounded text-[11px] font-bold transition-colors"
            style={{
              background: view === key ? "#2891FF" : "transparent",
              color: view === key ? "#fff" : "#475569",
            }}
          >
            {label}
          </button>
        ))}
        <span className="ml-auto flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => zoomBy(-1)}
            disabled={zoom === ZOOMS[0]}
            title="Zoom out"
            aria-label="Zoom out"
            className={css.iconBtn}
          >
            <ZoomOut size={12} />
          </button>
          <button
            type="button"
            onClick={() => setZoom(1)}
            title="Back to 100%"
            aria-label="Reset zoom"
            className="px-1 text-[9.5px] font-semibold tabular-nums"
            style={{ color: zoom === 1 ? "#94a3b8" : "#1B7F84", minWidth: 30 }}
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            type="button"
            onClick={() => zoomBy(1)}
            disabled={zoom === ZOOMS[ZOOMS.length - 1]}
            title="Zoom in"
            aria-label="Zoom in"
            className={css.iconBtn}
          >
            <ZoomIn size={12} />
          </button>
        </span>
      </div>

      {/* The controller itself.
          Panel view only: the wiring view draws its own CPU with the wires
          landing on its terminals, and two controllers on one screen is one
          controller too many. */}
      {view === "panel" && (
        <div className="p-2 border-b border-[#C9D2DC] bg-white overflow-auto">
          <div
            style={{
              width: `${100 / zoom}%`,
              transform: `scale(${zoom})`,
              transformOrigin: "top left",
            }}
          >
            <Rack
              plc={plc}
              inputs={tags.filter((t) => t.isInput)}
              outputs={tags.filter((t) => t.isOutput)}
            />
          </div>
        </div>
      )}

      {/* Controller status strip.
          Wraps, because it did not: in a narrow panel the Reset button ran
          off the right edge and was simply unreachable — the panel can be
          dragged down to 240px and the strip has to survive that. */}
      <div className="flex items-center flex-wrap gap-x-2 gap-y-1.5 px-3 py-2 border-b border-[#C9D2DC] bg-white">
        <span
          className="inline-flex items-center gap-1.5 px-2 h-6 rounded text-[11px] font-bold"
          style={{
            background: running ? "rgba(34,197,94,0.12)" : "#f1f5f9",
            color: running ? "#15803d" : "#64748b",
          }}
        >
          <Zap size={11} /> {running ? "RUN" : "STOP"}
        </span>
        <span className="text-[11px] text-[#64748b] font-mono">{scanCount} scans</span>

        <span className="ml-auto flex items-center gap-1.5 shrink-0">
          {running ? (
            <button
              type="button"
              onClick={onStop}
              className="inline-flex items-center gap-1 px-2.5 h-7 rounded border border-[#C2CCD6] bg-white text-[11.5px] font-bold text-[#b91c1c]"
            >
              <Square size={11} /> Stop
            </button>
          ) : (
            <button
              type="button"
              onClick={onStart}
              disabled={!plc.downloaded}
              title={
                plc.downloaded ? "Solve logic" : "Download the program to the controller first"
              }
              className="inline-flex items-center gap-1 px-2.5 h-7 rounded text-[11.5px] font-bold text-white disabled:opacity-40"
              style={{ background: "#16a34a" }}
            >
              <Play size={11} /> Run
            </button>
          )}
          <button
            type="button"
            onClick={onReset}
            title="Reset every tag, timer and counter"
            className="inline-flex items-center gap-1 px-2.5 h-7 rounded border border-[#C2CCD6] bg-white text-[11.5px] font-semibold text-[#334155]"
          >
            <RotateCcw size={11} /> Reset
          </button>
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-3">
        {!plc.downloaded && (
          <p className="rounded border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[11.5px] text-amber-800">
            The controller is empty. Press Download on the toolbar to transfer your program into it,
            then Run.
          </p>
        )}

        {errors.length > 0 && (
          <ul className="rounded border border-amber-300 bg-amber-50 px-2.5 py-1.5 space-y-0.5">
            {errors.slice(0, 4).map((e) => (
              <li key={e} className="text-[11px] text-amber-800">
                {e}
              </li>
            ))}
          </ul>
        )}

        {view === "wiring" ? (
          <SimWiring
            zoom={zoom}
            tags={tags}
            powered={plc.powered}
            // Held and released, so a pushbutton on the diagram behaves the
            // same as the one on the panel — the two views must never
            // disagree about what a device does.
            onHold={handlers.hold}
            onToggle={handlers.toggle}
          />
        ) : (
          <>
            <section>
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#64748b] mb-0.5">
                Inputs
              </p>
              {inputs.length === 0 ? (
                <p className="text-[11.5px] text-[#64748b] py-1">
                  Tick &ldquo;input&rdquo; on a tag, then choose what it is wired to.
                </p>
              ) : (
                <div className="divide-y divide-[#E2E8F0]">
                  {inputs.map((t) => (
                    <InputControl key={t.name} tag={t} on={t.value !== 0} h={handlers} />
                  ))}
                </div>
              )}
            </section>

            <section>
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#64748b] mb-0.5">
                Outputs
              </p>
              {outputs.length === 0 ? (
                <p className="text-[11.5px] text-[#64748b] py-1">No outputs yet.</p>
              ) : (
                <div className="divide-y divide-[#E2E8F0]">
                  {outputs.map((t) => (
                    <OutputRow key={t.name} tag={t} on={t.value !== 0} />
                  ))}
                </div>
              )}
            </section>

            {timers.length > 0 && (
              <section>
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#64748b] mb-0.5">
                  Timers &amp; counters
                </p>
                <div className="divide-y divide-[#E2E8F0]">
                  {timers.map((t) => {
                    const preset = t.preset ?? 0;
                    const acc = t.acc ?? 0;
                    const pctRaw = preset > 0 ? (acc / preset) * 100 : 0;
                    const pct = Math.max(0, Math.min(100, pctRaw));
                    return (
                      <div key={t.name} className="py-1.5">
                        <div className="flex items-baseline justify-between">
                          <span className="text-[12.5px] font-medium truncate">{t.name}</span>
                          <span className="text-[10.5px] font-mono text-[#64748b]">
                            {t.type === "TIMER"
                              ? `${(acc / 1000).toFixed(1)} / ${(preset / 1000).toFixed(1)} s`
                              : `${acc} / ${preset}`}
                          </span>
                        </div>
                        <div className="h-1.5 rounded bg-[#e2e8f0] overflow-hidden mt-1">
                          <div
                            className="h-full rounded"
                            style={{ width: `${pct}%`, background: t.dn ? ON : "#2891FF" }}
                          />
                        </div>
                        <div className="flex gap-2 mt-0.5">
                          {(["EN", "TT", "DN"] as const).map((b) => (
                            <span
                              key={b}
                              className="text-[9.5px] font-bold"
                              style={{
                                color: t[b.toLowerCase() as "en" | "tt" | "dn"]
                                  ? "#15803d"
                                  : "#cbd5e1",
                              }}
                            >
                              {b}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
