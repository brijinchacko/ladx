"use client";

import { ArrowDownToLine, ArrowUpFromLine, CheckCircle2 } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * The transfer between the editor and the controller, shown as it happens.
 *
 * Downloading used to be instantaneous: a state assignment and a toast: and
 * students read that as nothing having happened. On real hardware a download
 * is a sequence you watch: the processor is put in program mode, the project
 * is compiled and sent, the memory is verified, and only then does it run
 * again. That sequence is the thing worth teaching, so it is shown, and it
 * takes long enough to read.
 *
 * The steps are real in the sense that each one names something a controller
 * actually does. The timing is staged, and honestly so: it is a simulator, and
 * a progress bar that lies about what it is doing would teach the wrong thing
 * twice over.
 */

export type TransferKind = "download" | "upload" | null;

/**
 * The two ends of the cable, drawn.
 *
 * A generic processor glyph did not say which way anything was going, and
 * "download" is the single most misread word in a PLC editor, half of
 * students expect it to fetch. A picture of a computer, a cable and the
 * controller settles it before the words are read: the packets move from the
 * machine you are sitting at towards the box on the wall, or back.
 *
 * The controller is drawn the same way as the one in the simulator, same
 * case, same nameplate, same terminal strips, because a transfer dialog
 * showing a different-looking box is a dialog about a different controller.
 */
function TransferScene({
  kind,
  progress,
  finished,
}: {
  kind: "download" | "upload";
  progress: number;
  finished: boolean;
}) {
  const W = 356,
    H = 104;
  const PC_X = 6,
    PLC_X = 232;
  const CABLE_Y = 58;
  const CABLE_FROM = PC_X + 104;
  const CABLE_TO = PLC_X - 6;
  const live = !finished;
  const wire = finished ? "#15803D" : "#2891FF";

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${W} ${H}`}
      style={{ maxWidth: W, display: "block" }}
      role="img"
      aria-label={
        kind === "download"
          ? "Sending the program from this computer to the controller"
          : "Reading the program from the controller into this computer"
      }
    >
      {/* ── This computer ──────────────────────────────────────── */}
      <g>
        <rect
          x={PC_X + 10}
          y={16}
          width={84}
          height={54}
          rx={4}
          fill="#1E293B"
          stroke="#334155"
          strokeWidth={1.4}
        />
        <rect x={PC_X + 15} y={21} width={74} height={44} rx={2} fill="#0F172A" />
        {/* A rung on the screen, so it is plainly the editor. */}
        <g stroke="#35B6BB" strokeWidth={1.4} fill="none" opacity={0.95}>
          <line x1={PC_X + 21} y1={30} x2={PC_X + 21} y2={56} />
          <line x1={PC_X + 83} y1={30} x2={PC_X + 83} y2={56} />
          <line x1={PC_X + 21} y1={37} x2={PC_X + 40} y2={37} />
          <line x1={PC_X + 40} y1={32} x2={PC_X + 40} y2={42} />
          <line x1={PC_X + 46} y1={32} x2={PC_X + 46} y2={42} />
          <line x1={PC_X + 46} y1={37} x2={PC_X + 83} y2={37} />
          <line x1={PC_X + 21} y1={49} x2={PC_X + 55} y2={49} />
          <circle cx={PC_X + 62} cy={49} r={5} />
          <line x1={PC_X + 69} y1={49} x2={PC_X + 83} y2={49} />
        </g>
        {/* Base */}
        <path
          d={`M ${PC_X + 2} 76 L ${PC_X + 102} 76 L ${PC_X + 96} 70 L ${PC_X + 8} 70 Z`}
          fill="#334155"
        />
        <text x={PC_X + 52} y={90} textAnchor="middle" fontSize={8} fontWeight={700} fill="#5A6B7B">
          THIS COMPUTER
        </text>
      </g>

      {/* ── The cable ──────────────────────────────────────────── */}
      <line
        x1={CABLE_FROM}
        y1={CABLE_Y}
        x2={CABLE_TO}
        y2={CABLE_Y}
        stroke="#C9D2DC"
        strokeWidth={3}
        strokeLinecap="round"
      />
      <line
        x1={CABLE_FROM}
        y1={CABLE_Y}
        x2={CABLE_FROM + (CABLE_TO - CABLE_FROM) * progress}
        y2={CABLE_Y}
        stroke={wire}
        strokeWidth={3}
        strokeLinecap="round"
      />

      {/* Packets, moving the way the transfer goes. */}
      {live &&
        [0, 1, 2].map((i) => (
          <circle key={i} r={3} fill={wire}>
            <animate
              attributeName="cx"
              values={
                kind === "download" ? `${CABLE_FROM};${CABLE_TO}` : `${CABLE_TO};${CABLE_FROM}`
              }
              dur="1.15s"
              begin={`${i * 0.38}s`}
              repeatCount="indefinite"
            />
            <animate
              attributeName="cy"
              values={`${CABLE_Y};${CABLE_Y}`}
              dur="1.15s"
              repeatCount="indefinite"
            />
            <animate
              attributeName="opacity"
              values="0;1;1;0"
              dur="1.15s"
              begin={`${i * 0.38}s`}
              repeatCount="indefinite"
            />
          </circle>
        ))}

      <text
        x={(CABLE_FROM + CABLE_TO) / 2}
        y={CABLE_Y - 10}
        textAnchor="middle"
        fontSize={8}
        fontWeight={700}
        fill={wire}
        letterSpacing={0.4}
      >
        {kind === "download" ? "PC → PLC" : "PLC → PC"}
      </text>

      {/* ── The controller, as it looks in the simulator ────────── */}
      <g>
        <rect
          x={PLC_X}
          y={14}
          width={118}
          height={58}
          rx={4}
          fill="#2b3440"
          stroke="#55606c"
          strokeWidth={1.4}
        />
        {/* Terminal strips */}
        {Array.from({ length: 7 }).map((_, i) => (
          <rect
            key={`t${i}`}
            x={PLC_X + 8 + i * 15}
            y={17}
            width={9}
            height={7}
            rx={1}
            fill="#c7ccd1"
          />
        ))}
        {Array.from({ length: 7 }).map((_, i) => (
          <rect
            key={`b${i}`}
            x={PLC_X + 8 + i * 15}
            y={62}
            width={9}
            height={7}
            rx={1}
            fill="#c7ccd1"
          />
        ))}
        {/* Nameplate */}
        <text
          x={PLC_X + 59}
          y={40}
          textAnchor="middle"
          fontSize={8.5}
          fontWeight={900}
          fill="#e2e8f0"
          letterSpacing={1}
        >
          WARTENS
        </text>
        <text
          x={PLC_X + 59}
          y={50}
          textAnchor="middle"
          fontSize={6.5}
          fontWeight={700}
          fill="#93c5fd"
        >
          VCX CPU 1212C
        </text>
        {/* The mode lamps, which is what a download actually changes. */}
        <circle cx={PLC_X + 10} cy={40} r={2.6} fill={finished ? "#22c55e" : "#f59e0b"} />
        <text x={PLC_X + 15} y={42.5} fontSize={5.5} fontWeight={700} fill="#94a3b8">
          {finished ? "RUN" : "PROG"}
        </text>
        <text
          x={PLC_X + 59}
          y={90}
          textAnchor="middle"
          fontSize={8}
          fontWeight={700}
          fill="#5A6B7B"
        >
          CONTROLLER
        </text>
      </g>
    </svg>
  );
}

const DOWNLOAD_STEPS = [
  "Connecting to the controller",
  "Switching the processor to PROGRAM",
  "Compiling the project",
  "Transferring logic and tags",
  "Verifying controller memory",
  "Switching to RUN",
];

const UPLOAD_STEPS = [
  "Connecting to the controller",
  "Reading controller memory",
  "Rebuilding the project",
  "Checking tags against the I/O list",
];

export default function TransferOverlay({
  kind,
  projectName,
  onDone,
}: {
  kind: TransferKind;
  projectName: string;
  onDone: () => void;
}) {
  const [step, setStep] = useState(0);
  const [finished, setFinished] = useState(false);

  const steps = kind === "upload" ? UPLOAD_STEPS : DOWNLOAD_STEPS;

  useEffect(() => {
    if (!kind) {
      setStep(0);
      setFinished(false);
      return;
    }

    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    // Uneven on purpose. A real download does not spend equal time on each
    // stage, and an evenly ticking bar is the thing that reads as fake.
    const gaps = kind === "upload" ? [420, 700, 620, 500] : [380, 520, 900, 1100, 760, 440];

    let elapsed = 0;
    steps.forEach((_, i) => {
      elapsed += gaps[i] ?? 500;
      timers.push(
        setTimeout(() => {
          if (!cancelled) setStep(i + 1);
        }, elapsed),
      );
    });

    timers.push(
      setTimeout(() => {
        if (!cancelled) setFinished(true);
      }, elapsed + 260),
    );
    timers.push(
      setTimeout(() => {
        if (!cancelled) onDone();
      }, elapsed + 1000),
    );

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  if (!kind) return null;

  const pct = Math.round((step / steps.length) * 100);
  const Icon = kind === "upload" ? ArrowUpFromLine : ArrowDownToLine;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9998,
        background: "rgba(15,32,48,0.55)",
        display: "grid",
        placeItems: "center",
        backdropFilter: "blur(2px)",
      }}
    >
      <div
        style={{
          width: 420,
          maxWidth: "92vw",
          background: "#FFFFFF",
          border: "1px solid #C9D2DC",
          borderRadius: 8,
          boxShadow: "0 24px 60px rgba(15,32,48,0.35)",
          padding: "20px 22px 18px",
          fontFamily: "inherit",
        }}
      >
        <div style={{ marginBottom: 12 }}>
          <TransferScene kind={kind} progress={step / steps.length} finished={finished} />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
          <span
            style={{
              display: "grid",
              placeItems: "center",
              width: 32,
              height: 32,
              borderRadius: 6,
              background: finished ? "#DCFCE7" : "#EAF3FC",
              color: finished ? "#15803D" : "#2891FF",
            }}
          >
            <Icon size={16} />
          </span>
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#0F2030" }}>
              {finished
                ? kind === "upload"
                  ? "Uploaded from the controller"
                  : "Download complete"
                : kind === "upload"
                  ? "Uploading from the controller"
                  : "Downloading to the controller"}
            </p>
            <p
              style={{
                margin: "2px 0 0",
                fontSize: 11.5,
                color: "#5A6B7B",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {projectName || "Untitled"}
            </p>
          </div>
          {finished && <CheckCircle2 size={20} style={{ marginLeft: "auto", color: "#15803D" }} />}
        </div>

        <div
          style={{
            height: 4,
            borderRadius: 2,
            background: "#E4E9EE",
            overflow: "hidden",
            margin: "14px 0 12px",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${finished ? 100 : pct}%`,
              background: finished ? "#15803D" : "#2891FF",
              transition: "width 320ms ease",
            }}
          />
        </div>

        <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 5 }}>
          {steps.map((label, i) => {
            const done = i < step || finished;
            const active = i === step && !finished;
            return (
              <li
                key={label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 12,
                  color: done ? "#0F2030" : active ? "#2891FF" : "#9AA7B4",
                  fontWeight: active ? 600 : 400,
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    flexShrink: 0,
                    background: done ? "#15803D" : active ? "#2891FF" : "#C9D2DC",
                  }}
                />
                {label}
              </li>
            );
          })}
        </ol>
      </div>

      <style>{`
        @keyframes ladx-download {
          0%, 100% { transform: translateY(-2px); opacity: 0.6; }
          50%      { transform: translateY(2px);  opacity: 1; }
        }
        @keyframes ladx-upload {
          0%, 100% { transform: translateY(2px);  opacity: 0.6; }
          50%      { transform: translateY(-2px); opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes ladx-download { 0%, 100% { transform: none; opacity: 1; } }
          @keyframes ladx-upload   { 0%, 100% { transform: none; opacity: 1; } }
        }
      `}</style>
    </div>
  );
}
