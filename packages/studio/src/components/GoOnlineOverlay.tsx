"use client";

import { CheckCircle2, Play, Zap } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CPU } from "../lib/addressing";

/**
 * Going online, shown as it happens.
 *
 * Pressing Simulate used to flip a flag: the rungs turned green between one
 * frame and the next, and students read that as the button having done
 * nothing in particular. On real hardware going online is a sequence you
 * watch — the editor finds the controller, checks that what is in it matches
 * what is on screen, and only then does the processor go to RUN.
 *
 * That sequence is the thing worth teaching, so it is shown, it takes long
 * enough to read, and each line names something a controller actually does.
 * The timing is staged and honestly so: it is a simulator, and a progress bar
 * that lied about what it was doing would teach the wrong thing twice over.
 *
 * Every line is also sent to the message log, so when the overlay closes the
 * record is still there — the panel at the bottom is where a student is
 * taught to look, and a dialog that takes its content away with it teaches
 * them to read fast instead of to read the log.
 */

const STEPS: { text: string; detail: string }[] = [
  { text: "Connecting to the controller", detail: `${CPU.model} on the simulated backplane` },
  { text: "Checking the program in the controller", detail: "comparing it with what is on screen" },
  { text: "Mapping tags to terminals", detail: "inputs on I, outputs on Q" },
  { text: "Forcing outputs off", detail: "nothing energised until the first scan says so" },
  { text: "Processor to RUN", detail: "the scan starts now" },
];

export default function GoOnlineOverlay({
  open,
  projectName,
  scanMs,
  onLog,
  onDone,
  onCancel,
}: {
  open: boolean;
  projectName: string;
  scanMs: number;
  /** Each line, as it happens, so the log keeps the record. */
  onLog: (text: string) => void;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [step, setStep] = useState(0);
  const [finished, setFinished] = useState(false);
  const logged = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (!open) {
      setStep(0);
      setFinished(false);
      logged.current.clear();
      return;
    }

    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    // Uneven on purpose: a real handshake does not spend equal time on each
    // stage, and an evenly ticking bar is the thing that reads as fake.
    const gaps = [340, 520, 460, 380, 300];

    let elapsed = 0;
    STEPS.forEach((s, i) => {
      elapsed += gaps[i] ?? 400;
      timers.push(
        setTimeout(() => {
          if (cancelled) return;
          setStep(i + 1);
          if (!logged.current.has(i)) {
            logged.current.add(i);
            onLog(s.text);
          }
        }, elapsed),
      );
    });

    timers.push(
      setTimeout(() => {
        if (!cancelled) setFinished(true);
      }, elapsed + 220),
    );
    timers.push(
      setTimeout(() => {
        if (!cancelled) onDone();
      }, elapsed + 900),
    );

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Escape gets out, because a dialog you cannot leave is a trap even when it
  // only lasts two seconds.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onCancel]);

  if (!open) return null;

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
          width: 400,
          maxWidth: "92vw",
          background: "#FFFFFF",
          border: "1px solid #C9D2DC",
          borderRadius: 8,
          boxShadow: "0 24px 60px rgba(15,32,48,0.35)",
          padding: "18px 22px 16px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 12 }}>
          <span
            style={{
              display: "grid",
              placeItems: "center",
              width: 34,
              height: 34,
              borderRadius: 7,
              background: finished ? "#DCFCE7" : "#EAF3FC",
              color: finished ? "#15803D" : "#2891FF",
            }}
          >
            {finished ? <Zap size={17} /> : <Play size={16} />}
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#0F2030" }}>
              {finished ? "Controller running" : "Going online"}
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
              {projectName || "Untitled"} · one scan every {scanMs} ms
            </p>
          </div>
          {finished && <CheckCircle2 size={20} style={{ color: "#15803D" }} />}
        </div>

        <div
          style={{
            height: 3,
            background: "#EEF2F6",
            borderRadius: 999,
            overflow: "hidden",
            marginBottom: 12,
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${Math.round((step / STEPS.length) * 100)}%`,
              background: finished ? "#16A34A" : "#2891FF",
              borderRadius: 999,
              transition: "width 240ms cubic-bezier(0.2,0,0,1)",
            }}
          />
        </div>

        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 5 }}>
          {STEPS.map((s, i) => {
            const done = i < step;
            const now = i === step && !finished;
            return (
              <li
                key={s.text}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                  opacity: done || now ? 1 : 0.38,
                }}
              >
                <span
                  style={{
                    marginTop: 4,
                    width: 6,
                    height: 6,
                    borderRadius: 999,
                    flexShrink: 0,
                    background: done ? "#16A34A" : now ? "#2891FF" : "#C9D2DC",
                  }}
                />
                <span style={{ minWidth: 0 }}>
                  <span
                    style={{
                      display: "block",
                      fontSize: 11.5,
                      color: done ? "#334155" : "#0F2030",
                      fontWeight: now ? 700 : 500,
                    }}
                  >
                    {s.text}
                  </span>
                  <span style={{ display: "block", fontSize: 9.5, color: "#94A3B8" }}>
                    {s.detail}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>

        <p style={{ margin: "12px 0 0", fontSize: 10, color: "#94A3B8" }}>
          {finished
            ? "Every line above is in Messages. Press Escape or Stop to go offline."
            : "Escape to cancel."}
        </p>
      </div>
    </div>
  );
}
