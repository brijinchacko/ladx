"use client";

import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { HELP_BY_ID } from "../lib/help";
import { TOUR, type TourStep, markTourSeen } from "../lib/tour";

type Box = { left: number; top: number; width: number; height: number };

function findAnchor(step: TourStep): Box | null {
  if (!step.anchor) return null;
  const el = document.querySelector<HTMLElement>(`[data-tour="${step.anchor}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  // An element that is scrolled out of view or hidden has no useful box; treat
  // it as absent so the step centres rather than pointing at nothing.
  if (r.width < 2 || r.height < 2) return null;
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

/**
 * The guided tour.
 *
 * Spotlights each part of the editor in turn. Three things make the difference
 * between a tour people finish and one they close in irritation:
 *
 *   Skip is visible on every step, not buried at the end.
 *   A step whose target is missing is skipped rather than shown pointing at
 *   nothing, panels here can be closed, so this genuinely happens.
 *   The highlight is a cut-out, so the thing being described stays readable
 *   instead of being dimmed along with everything else.
 */
export default function Tour({
  open,
  onClose,
  onHelp,
  onEnsureVisible,
}: {
  open: boolean;
  onClose: () => void;
  onHelp: (topic: string) => void;
  /** Opens the panel a step needs, so a closed panel does not hide the step. */
  onEnsureVisible?: (anchor: string) => void;
}) {
  const [i, setI] = useState(0);
  const [box, setBox] = useState<Box | null>(null);

  const step = TOUR[Math.min(i, TOUR.length - 1)];

  const finish = useCallback(() => {
    markTourSeen();
    setI(0);
    onClose();
  }, [onClose]);

  // Reopening starts at the beginning, adjusted during render rather than in
  // an effect so the first paint is already step one: an effect would flash
  // the step the tour was closed on.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setI(0);
  }

  // Ask the studio to reopen whatever this step points at, before measuring.
  useEffect(() => {
    if (open && step.anchor) onEnsureVisible?.(step.anchor);
  }, [open, step.anchor, onEnsureVisible]);

  // Re-measure on every step, and while the window moves under us. A tour
  // bubble pinned to a stale rectangle is the usual way these break.
  useEffect(() => {
    if (!open) return;
    let raf = 0;
    const measure = () => {
      raf = requestAnimationFrame(() => setBox(findAnchor(step)));
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    // One delayed re-measure catches a panel that was just reopened and has
    // not laid out yet.
    const t = setTimeout(measure, 180);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, step]);

  const next = useCallback(() => {
    if (i >= TOUR.length - 1) finish();
    else setI(i + 1);
  }, [i, finish]);

  const back = useCallback(() => setI(Math.max(0, i - 1)), [i]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        finish();
      } else if (e.key === "ArrowRight" || e.key === "Enter") {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        back();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, next, back, finish]);

  const bubble = useMemo(() => {
    const W = 330;
    const pad = 14;
    if (!box) {
      return {
        left: Math.max(pad, window.innerWidth / 2 - W / 2),
        top: Math.max(pad, window.innerHeight / 2 - 110),
        width: W,
      };
    }
    const place = step.place ?? "bottom";
    let left = box.left + box.width / 2 - W / 2;
    let top = box.top + box.height + pad;

    if (place === "top") top = box.top - pad - 190;
    else if (place === "left") {
      left = box.left - W - pad;
      top = box.top;
    } else if (place === "right") {
      left = box.left + box.width + pad;
      top = box.top;
    }

    left = Math.max(pad, Math.min(window.innerWidth - W - pad, left));
    top = Math.max(pad, Math.min(window.innerHeight - 200 - pad, top));
    return { left, top, width: W };
  }, [box, step.place]);

  if (!open) return null;

  const topicTitle = step.topic ? HELP_BY_ID.get(step.topic)?.title : undefined;

  return (
    <div className="fixed inset-0 z-[8500]" role="dialog" aria-label="LADX Mini tour">
      {/* The dim, cut out around the anchor. Four rectangles rather than a
          box-shadow, so the hole is exact at any size. */}
      {box ? (
        <>
          <Dim style={{ left: 0, top: 0, width: "100%", height: Math.max(0, box.top - 4) }} />
          <Dim style={{ left: 0, top: box.top + box.height + 4, width: "100%", bottom: 0 }} />
          <Dim
            style={{
              left: 0,
              top: box.top - 4,
              width: Math.max(0, box.left - 4),
              height: box.height + 8,
            }}
          />
          <Dim
            style={{
              left: box.left + box.width + 4,
              top: box.top - 4,
              right: 0,
              height: box.height + 8,
            }}
          />
          <div
            className="absolute pointer-events-none rounded"
            style={{
              left: box.left - 4,
              top: box.top - 4,
              width: box.width + 8,
              height: box.height + 8,
              border: "2px solid #2891FF",
              boxShadow: "0 0 0 3px rgba(40,145,255,0.25)",
            }}
          />
        </>
      ) : (
        <Dim style={{ inset: 0 }} />
      )}

      <div
        className="absolute rounded-lg shadow-2xl bg-white overflow-hidden"
        style={{ left: bubble.left, top: bubble.top, width: bubble.width }}
      >
        <div className="px-4 pt-3.5 pb-3">
          <div className="flex items-start gap-2">
            <h3 className="text-[13.5px] font-bold text-[#0f172a] flex-1">{step.title}</h3>
            <button
              type="button"
              onClick={finish}
              aria-label="Skip the tour"
              className="text-[#94A3B8] hover:text-[#334155] -mt-0.5"
            >
              <X size={14} />
            </button>
          </div>
          <p className="mt-1.5 text-[12px] leading-relaxed text-[#334155]">{step.text}</p>
          {step.topic && topicTitle && (
            <button
              type="button"
              onClick={() => {
                finish();
                onHelp(step.topic!);
              }}
              className="mt-2 text-[11px] text-[#2891FF] hover:underline"
            >
              Read more: {topicTitle} →
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 px-3 h-9 border-t border-[#E2E8F0] bg-[#F8FAFC]">
          <div className="flex gap-1" aria-hidden>
            {TOUR.map((s, n) => (
              <span
                key={s.id}
                className="rounded-full transition-colors"
                style={{
                  width: n === i ? 14 : 5,
                  height: 5,
                  background: n === i ? "#2891FF" : n < i ? "#94A3B8" : "#C9D2DC",
                }}
              />
            ))}
          </div>
          <span className="flex-1" />
          <button
            type="button"
            onClick={finish}
            className="text-[11px] text-[#64748B] hover:text-[#334155] px-1.5"
          >
            Skip
          </button>
          {i > 0 && (
            <button
              type="button"
              onClick={back}
              className="flex items-center gap-1 text-[11px] text-[#334155] hover:text-[#0f172a] px-1.5"
            >
              <ArrowLeft size={11} /> Back
            </button>
          )}
          <button
            type="button"
            onClick={next}
            className="flex items-center gap-1 px-2.5 h-6 rounded text-[11px] font-semibold text-white"
            style={{ background: "#2891FF" }}
          >
            {i >= TOUR.length - 1 ? (
              "Done"
            ) : (
              <>
                Next <ArrowRight size={11} />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function Dim({ style }: { style: React.CSSProperties }) {
  return <div className="absolute" style={{ background: "rgba(15,23,42,0.5)", ...style }} />;
}
