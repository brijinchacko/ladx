"use client";

import {
  Check,
  ChevronDown,
  ChevronUp,
  Cpu,
  GripVertical,
  PanelBottom,
  PanelLeft,
  PanelRight,
  PanelTop,
  Plus,
  Sparkles,
  Square,
  Undo2,
  X,
} from "lucide-react";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { ASSISTANT } from "../../lib/assistant-brand";
import {
  type AssistantMode,
  DOCK_EDGES,
  type DockEdge,
  type Frame,
  MIN_H,
  MIN_W,
  clampFrame,
  clearDockInset,
  defaultFrame,
  hasStoredFrame,
  isDocked,
  loadFrame,
  publishDockInset,
  saveFrame,
  viewportKnown,
} from "../../lib/assistant-frame";
import { ThinkingMark } from "../brand/thinking-mark";
import { AiMark } from "./mark";
import { type AssistStep, Steps } from "./steps";

/**
 * One assistant, for every tool.
 *
 * There were three: a bar welded to the bottom of the ladder editor and CAD, a
 * column inside the HMI builder, and the project chat. They had drifted into
 * three different answers to the same questions, which is what happens when a
 * component like this is copied rather than shared: one of them showed which
 * model replied and the others did not, one could be undone and the others
 * could not, and none of them could be moved out of the way of the thing being
 * asked about.
 *
 * Three decisions worth stating.
 *
 * It floats, and it remembers where. A panel welded to the bottom is in the way
 * exactly when the work is at the bottom, which on a schematic or a panel mimic
 * is most of the time. Docked is still the default, because a floating panel is
 * a surprise on first use; moving it is one drag and it stays where it is put.
 *
 * It shows the steps rather than a spinner. On a free model the wait is long
 * enough that "busy" starts to look stuck, and when the answer is wrong the
 * step list is what says which stage got it wrong.
 *
 * It names the model and lets it be changed, in the place where the work
 * happens. Which model answered is the single biggest factor in whether the
 * result is any good, and burying that in a settings page means somebody
 * concludes the feature is bad when what they have is a bad model.
 */

export interface AssistantTurn {
  id: string;
  role: "you" | "ladx";
  text: string;
  /** Steps this turn went through, kept after it finishes. */
  steps?: AssistStep[];
  /** Warnings worth showing in their own block rather than in the prose. */
  problems?: string[];
  /** Present on a reply that changed the document, so it can be taken back. */
  undoable?: boolean;
}

export interface AssistantModelOption {
  id: string;
  label: string;
  free?: boolean;
}

export interface AssistantModels {
  /** Where the list came from, said plainly enough to put on screen. */
  source: string;
  /** What Auto does. */
  autoNote: string;
  options: AssistantModelOption[];
  /** null is Auto. */
  value: string | null;
  onChange: (id: string | null) => void;
  /** Still loading the list. */
  loading?: boolean;
}

/**
 * A question the assistant needs answered before it can do the job.
 *
 * Asking beats guessing on exactly the inputs a drawing cannot recover from: a
 * panel size, whether a stop button is normally closed, which tag is the one
 * that matters. A wrong guess there produces something that looks finished and
 * is wrong, which costs more than the question would have.
 */
export interface AssistantQuestion {
  id: string;
  text: string;
  /** Suggested answers. Free text is always allowed as well. */
  options?: string[];
}

/** Something the plus button can do: bring a file in, load an example, run the deterministic path. */
export interface AssistantAction {
  id: string;
  label: string;
  hint?: string;
  onSelect: () => void;
}

export type RunMode = "auto" | "manual";

export interface RunModeControl {
  value: RunMode;
  onChange: (m: RunMode) => void;
  /** What each one means here, since it differs by tool. */
  autoHint: string;
  manualHint: string;
}

export interface AssistantProps {
  /** Where this tool's frame is remembered. One per tool. */
  toolId: string;
  title: string;
  placeholder: string;
  suggestions?: string[];
  turns: AssistantTurn[];
  busy: boolean;
  /** Steps for the turn in progress. */
  steps?: AssistStep[];
  error?: string | null;
  models?: AssistantModels;
  question?: AssistantQuestion | null;
  onSend: (prompt: string) => void;
  onAnswer?: (answer: string) => void;
  onStop?: () => void;
  onUndo?: () => void;
  /** Tool-specific controls above the composer, e.g. add-or-replace. */
  controls?: ReactNode;
  /**
   * What the plus button offers.
   *
   * Whatever this tool can bring in or start: a file to read, an example to
   * load, the deterministic version of what the model does. A plus that opens
   * an empty menu is worse than no plus, so it is only drawn when there is
   * something in it.
   */
  actions?: AssistantAction[];
  /**
   * How much it is allowed to do on its own.
   *
   * Auto applies what it produces; Manual proposes and waits. The distinction
   * matters most where a change is hard to see: forty tasks redated across a
   * plan is not something to discover afterwards. Absent means the tool has
   * only one mode and the control is not drawn.
   */
  runMode?: RunModeControl;
  /** Shown under the composer. */
  footnote?: string;
  /** Why it cannot run, if it cannot. */
  disabledReason?: string | null;
}

/** A header control: white on the solid header, lit when it is the current one. */
const ctl =
  "flex h-5 w-5 items-center justify-center rounded text-white transition-colors hover:bg-teal-800";

export default function Assistant({
  toolId,
  title,
  placeholder,
  suggestions = [],
  turns,
  busy,
  steps = [],
  error,
  models,
  question,
  onSend,
  onAnswer,
  onStop,
  onUndo,
  controls,
  actions,
  runMode,
  footnote,
  disabledReason,
}: AssistantProps) {
  const [frame, setFrame] = useState<Frame | null>(null);
  const [input, setInput] = useState("");
  const [modelsOpen, setModelsOpen] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  /*
   * Restored on the client only. Reading the viewport or storage during the
   * server render is a hydration mismatch, and seeding state from either in the
   * initialiser is the same bug wearing a hat.
   */
  useEffect(() => {
    let done = false;
    let raf = 0;

    /*
     * Placed only once the window can say how big it is.
     *
     * Waiting rather than guessing, because a guess made against a viewport of
     * zero is unrecoverable: it puts the panel in the top left corner at its
     * minimum size, on top of the sidebar, and nothing later moves it. See
     * `viewportKnown`.
     *
     * The retry is a rAF loop, which browsers do not run while the document is
     * hidden. That is the behaviour wanted here rather than a limitation: a
     * background tab has no viewport to measure, and this picks the work back
     * up on the frame it becomes visible.
     */
    const place = (): boolean => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      if (!viewportKnown(vw, vh)) return false;

      const stored = loadFrame(toolId, vw, vh);
      /*
       * An assistant that cannot run starts put away.
       *
       * It is still there, still says why, and is one click from being read,
       * which is the point: hiding it entirely on the surfaces with no model is
       * how the same feature ends up looking like three different features. But
       * a panel that cannot do anything should not be occupying the canvas of a
       * tool somebody came to use, so it opens as a bar rather than a box.
       *
       * Only when nothing was stored. Somebody who opened it anyway gets it back
       * the way they left it.
       */
      if (disabledReason && !hasStoredFrame(toolId)) setFrame({ ...stored, mode: "minimised" });
      else setFrame(stored);
      return true;
    };

    const attempt = () => {
      if (done) return;
      if (place()) {
        done = true;
        return;
      }
      raf = requestAnimationFrame(attempt);
    };

    attempt();
    window.addEventListener("resize", attempt);
    return () => {
      done = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", attempt);
    };
  }, [toolId, disabledReason]);

  // Re-clamped on resize, not only on restore. A window dragged to a smaller
  // display, a zoom, or devtools opening all shrink the viewport under a panel
  // that was legally placed.
  useEffect(() => {
    const onResize = () =>
      setFrame((f) => (f ? clampFrame(f, window.innerWidth, window.innerHeight) : f));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const update = useCallback(
    (next: Partial<Frame>) => {
      setFrame((f) => {
        if (!f) return f;
        const merged = clampFrame({ ...f, ...next }, window.innerWidth, window.innerHeight);
        saveFrame(toolId, merged);
        return merged;
      });
    },
    [toolId],
  );

  const setMode = useCallback((mode: AssistantMode) => update({ mode }), [update]);

  /*
   * Tell the page how much room it is taking.
   *
   * Without this a docked panel simply covers the work, which on the left hid
   * the project tree. Containers that read the variables move out of the way;
   * ones that do not are no worse off than before.
   */
  useEffect(() => {
    if (!frame) return;
    publishDockInset(
      frame.mode,
      Math.max(MIN_W, Math.min(frame.w, 560)),
      Math.max(MIN_H, Math.min(frame.h, 460)),
    );
  }, [frame]);

  // Cleared on unmount, so a tool that closes the panel entirely does not leave
  // the page padded against something that is no longer there.
  useEffect(() => () => clearDockInset(), []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on every new turn or step
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [turns.length, steps.length, busy, question]);

  /*
   * Drag and resize, as a pointer delta.
   *
   * Not from the pointer's absolute position: the grab point inside the header
   * matters, and computing from absolute coordinates makes the panel jump so
   * its corner snaps under the cursor the moment you press.
   */
  const dragRef = useRef<{ px: number; py: number; f: Frame; kind: "move" | "size" } | null>(null);

  const onPointerDown = (kind: "move" | "size") => (e: React.PointerEvent) => {
    if (!frame) return;
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { px: e.clientX, py: e.clientY, f: frame, kind };
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // Dragging still works while the pointer stays over the handle.
    }
    // Moving by dragging the header implies floating; otherwise the first drag
    // of a docked panel would do nothing and read as broken.
    if (kind === "move" && frame.mode !== "floating") update({ mode: "floating" });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.px;
    const dy = e.clientY - d.py;
    if (d.kind === "move") update({ x: d.f.x + dx, y: d.f.y + dy });
    else update({ w: d.f.w + dx, h: d.f.h + dy });
  };

  const endDrag = (e: React.PointerEvent) => {
    dragRef.current = null;
    const el = e.currentTarget as HTMLElement;
    if (el.hasPointerCapture?.(e.pointerId)) el.releasePointerCapture(e.pointerId);
  };

  const send = () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    if (question && onAnswer) onAnswer(text);
    else onSend(text);
  };

  // Nothing is rendered until the frame is known, which is one paint. Rendering
  // a default first makes the panel visibly jump to its remembered place.
  if (!frame) return null;

  if (frame.mode === "minimised") {
    return (
      <div className="flex shrink-0 items-center gap-2 bg-teal-700 px-3 py-1 text-white">
        <button
          type="button"
          onClick={() => setMode("floating")}
          className="flex items-center gap-1.5 font-semibold text-[12px] text-white transition-opacity hover:opacity-80"
        >
          <AiMark size={13} />
          {title}
          <ChevronUp className="h-3 w-3 opacity-70" />
        </button>
        {turns.length > 0 && (
          <span className="font-mono text-[10.5px] text-white">
            {turns.filter((t) => t.role === "you").length} asked
          </span>
        )}
        {busy && <span className="font-mono text-[10.5px] text-white">working…</span>}
      </div>
    );
  }

  const floating = frame.mode === "floating";
  const edge: DockEdge | null = isDocked(frame.mode) ? frame.mode : null;

  /*
   * A docked panel is pinned to a viewport edge, not placed in the layout.
   *
   * The obvious alternative is to render it in the host's flex container, so
   * the content shrinks to make room. That cannot work from here: this
   * component sits wherever the tool mounted it, usually at the bottom of a
   * column, so "dock left" and "dock right" would render in exactly the same
   * place and the control would appear broken. Pinning to the edge behaves the
   * same in all five tools without any of them having to restructure.
   *
   * It overlays rather than pushes, which is the honest cost. It is small, it
   * is one keypress from minimised, and floating exists for when it is in the
   * way, which is a better trade than the panel not going where it was sent.
   *
   * The same stored size serves all four edges: the axis that matters changes
   * and the other is ignored, so a panel dragged wide on the right is not
   * suddenly a different height on the bottom.
   */
  const thickness = {
    w: Math.max(MIN_W, Math.min(frame.w, 560)),
    h: Math.max(MIN_H, Math.min(frame.h, 460)),
  };
  const dockedStyle: React.CSSProperties =
    edge === "left"
      ? { left: 0, top: 0, bottom: 0, width: thickness.w }
      : edge === "right"
        ? { right: 0, top: 0, bottom: 0, width: thickness.w }
        : edge === "top"
          ? { left: 0, right: 0, top: 0, height: thickness.h }
          : { left: 0, right: 0, bottom: 0, height: thickness.h };

  const dockedClass =
    edge === "left"
      ? "border-teal-600 border-r-2"
      : edge === "right"
        ? "border-teal-600 border-l-2"
        : edge === "top"
          ? "border-teal-600 border-b-2"
          : "border-teal-600 border-t-2";

  /** Where the next press of the dock control puts it. */
  const nextEdge: DockEdge =
    edge === null
      ? "bottom"
      : (DOCK_EDGES[(DOCK_EDGES.indexOf(edge) + 1) % DOCK_EDGES.length] ?? "bottom");
  const EdgeIcon =
    nextEdge === "bottom"
      ? PanelBottom
      : nextEdge === "right"
        ? PanelRight
        : nextEdge === "left"
          ? PanelLeft
          : PanelTop;

  return (
    <div
      /*
       * Marked as ours, wherever it is.
       *
       * A floating panel with the same grey chrome as everything else reads as
       * a stray dialog. The teal edge and header are the brand's, and they are
       * doing a job rather than decorating: this thing moves, so it has to be
       * recognisable at a glance in the corner of a drawing it is sitting on.
       */
      className={
        floating
          ? "fixed z-40 flex flex-col overflow-hidden rounded-md border-2 border-teal-600 bg-white shadow-[0_16px_44px_-18px_rgba(15,26,36,0.5)]"
          : `fixed z-40 flex min-h-0 flex-col bg-white shadow-[0_0_36px_-12px_rgba(15,26,36,0.4)] ${dockedClass}`
      }
      style={
        floating ? { left: frame.x, top: frame.y, width: frame.w, height: frame.h } : dockedStyle
      }
    >
      {/* header, and the drag handle */}
      <div
        onPointerDown={onPointerDown("move")}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        // teal-700 rather than 600: white on 600 measured 4.44 to 1, which is
        // under AA by a hair and had been since this bar was drawn.
        className={`flex shrink-0 items-center gap-1.5 bg-teal-700 px-1.5 py-1 text-white ${
          floating ? "cursor-grab active:cursor-grabbing" : "cursor-grab"
        }`}
      >
        <GripVertical className="h-3 w-3 shrink-0 text-white/50" />
        <AiMark size={14} className="shrink-0 text-white" />
        <span className="truncate font-semibold text-[12px] text-white">{title}</span>

        {models && (
          <div className="relative" onPointerDown={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setModelsOpen((v) => !v)}
              title={`${models.source}. Click to change the model.`}
              className="flex max-w-[150px] items-center gap-1 rounded-sm bg-teal-800 px-1.5 py-0.5 text-white transition-colors hover:bg-teal-900"
            >
              <Cpu className="h-2.5 w-2.5 shrink-0" />
              <span className="truncate font-mono text-[10px]">
                {models.loading
                  ? "loading…"
                  : (models.options.find((o) => o.id === models.value)?.label ??
                    models.value ??
                    "Auto")}
              </span>
              <ChevronDown className="h-2.5 w-2.5 shrink-0 opacity-70" />
            </button>

            {modelsOpen && (
              <div className="absolute top-full left-0 z-50 mt-1 max-h-72 w-72 overflow-y-auto rounded-md border border-ink-200 bg-white py-1 shadow-lg">
                <p className="px-2.5 py-1 text-[11px] text-ink-400">{models.source}</p>
                <button
                  type="button"
                  onClick={() => {
                    models.onChange(null);
                    setModelsOpen(false);
                  }}
                  className={`block w-full px-2.5 py-1.5 text-left transition-colors hover:bg-ink-50 ${
                    models.value === null ? "bg-ink-50" : ""
                  }`}
                >
                  <span className="font-medium text-[12.5px] text-ink-900">Auto</span>
                  <span className="block text-[11px] text-ink-400 leading-snug">
                    {models.autoNote}
                  </span>
                </button>
                {models.options.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => {
                      models.onChange(o.id);
                      setModelsOpen(false);
                    }}
                    className={`flex w-full items-baseline gap-2 px-2.5 py-1.5 text-left transition-colors hover:bg-ink-50 ${
                      models.value === o.id ? "bg-ink-50" : ""
                    }`}
                  >
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-800">
                      {o.label}
                    </span>
                    {o.free && (
                      <span className="shrink-0 font-mono text-[9.5px] text-teal-700 uppercase tracking-[0.08em]">
                        free
                      </span>
                    )}
                  </button>
                ))}
                {models.options.length === 0 && !models.loading && (
                  <p className="px-2.5 py-2 text-[11.5px] text-ink-500 leading-snug">
                    No models available. Connect a provider key in Settings.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          {onUndo && turns.some((t) => t.undoable) && (
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={onUndo}
              title="Take back the last thing it produced."
              className="flex items-center gap-1 px-1 text-[11px] text-white transition-colors hover:text-white"
            >
              <Undo2 className="h-3 w-3" />
              Undo
            </button>
          )}
          {/* Cycles bottom, right, left, top, so all four edges are reachable
              without a menu, and floating is the separate control beside it. */}
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setMode(nextEdge)}
            title={`Dock it to the ${nextEdge}.`}
            className={ctl}
          >
            <EdgeIcon className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setMode("floating")}
            title="Float it, and drag it anywhere."
            className={`${ctl} ${floating ? "bg-teal-800" : ""}`}
          >
            <Square className="h-3 w-3" />
          </button>
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setMode("minimised")}
            title="Put it away. It comes back from the bar."
            className={ctl}
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* the conversation */}
      <div ref={logRef} className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-2.5 py-2">
        {turns.length === 0 && !busy && (
          <div>
            <p className="text-[12.5px] text-ink-500 leading-relaxed">
              Describe what you want. Everything it produces is an ordinary edit, so undo takes it
              straight back out.
            </p>
            {suggestions.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setInput(s)}
                    className="rounded-full border border-ink-200 px-2.5 py-1 text-[11.5px] text-ink-600 transition-colors hover:border-ink-400 hover:text-ink-900"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {turns.map((t) => (
          <div key={t.id}>
            <div className={t.role === "you" ? "flex justify-end" : ""}>
              <p
                className={`max-w-[88%] whitespace-pre-wrap rounded-lg px-2.5 py-1.5 text-[12.5px] leading-relaxed ${
                  t.role === "you"
                    ? "bg-ink-900 text-white"
                    : "border border-ink-200 bg-ink-50 text-ink-700"
                }`}
              >
                {t.text}
              </p>
            </div>
            {t.steps && t.steps.length > 0 && (
              <div className="mt-1.5 pl-1">
                <Steps steps={t.steps} />
              </div>
            )}
            {t.problems && t.problems.length > 0 && (
              <ul className="mt-1.5 space-y-1 rounded-md border border-warning-border bg-warning-bg p-2">
                {t.problems.map((p) => (
                  <li key={p} className="text-[11.5px] text-warning leading-snug">
                    {p}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}

        {busy && steps.length > 0 && (
          <div className="pl-1">
            <Steps steps={steps} />
          </div>
        )}
        {busy && steps.length === 0 && (
          <p className="flex items-center gap-2 text-[12px] text-ink-500">
            <ThinkingMark size={14} className="text-teal-600" />
            Working. On the free tier this takes a moment.
          </p>
        )}

        {question && (
          <div className="rounded-md border border-teal-600 bg-teal-50 p-2.5">
            <p className="text-[12.5px] text-ink-800 leading-relaxed">{question.text}</p>
            {question.options && question.options.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {question.options.map((o) => (
                  <button
                    key={o}
                    type="button"
                    onClick={() => onAnswer?.(o)}
                    className="rounded-full border border-teal-600 bg-white px-2.5 py-1 text-[11.5px] text-teal-800 transition-colors hover:border-teal-700 hover:bg-teal-50"
                  >
                    {o}
                  </button>
                ))}
              </div>
            )}
            <p className="mt-2 text-[11px] text-ink-400">Or answer in your own words below.</p>
          </div>
        )}

        {error && (
          <p className="rounded-md border border-danger-border bg-danger-bg px-2.5 py-1.5 text-[12px] text-danger leading-snug">
            {error}
          </p>
        )}
      </div>

      {/* composer */}
      <div className="shrink-0 px-2 pb-1.5">
        {controls && <div className="mb-2">{controls}</div>}
        <div className="rounded-md border border-ink-200 bg-white focus-within:border-teal-600">
          <div className="flex items-end gap-1 p-1">
            {/*
              The plus, for what this tool can bring in: a file, an example, the
              deterministic version of what the model does. Drawn only when
              there is something in it, because a plus that opens an empty menu
              is worse than no plus.
            */}
            {actions && actions.length > 0 && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setPlusOpen((v) => !v)}
                  title="Bring something in"
                  aria-expanded={plusOpen}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-900"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
                {plusOpen && (
                  <div className="absolute bottom-full left-0 z-50 mb-1 w-60 overflow-hidden rounded-md border border-ink-200 bg-white py-1 shadow-lg">
                    {actions.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => {
                          setPlusOpen(false);
                          a.onSelect();
                        }}
                        className="block w-full px-2.5 py-1.5 text-left transition-colors hover:bg-ink-50"
                      >
                        <span className="block text-[12.5px] text-ink-800">{a.label}</span>
                        {a.hint && (
                          <span className="block text-[11px] text-ink-400 leading-snug">
                            {a.hint}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
                // The tools underneath bind almost every single key to a command,
                // so a keystroke meant for this box must not also draw a contact.
                e.stopPropagation();
              }}
              placeholder={disabledReason ?? (question ? "Your answer" : placeholder)}
              rows={1}
              disabled={busy || Boolean(disabledReason)}
              className="max-h-24 min-h-[24px] flex-1 resize-none border-0 bg-transparent px-1 py-0.5 text-[12.5px] outline-none placeholder:text-ink-400 disabled:opacity-60"
            />
            {busy && onStop ? (
              <button
                type="button"
                onClick={onStop}
                className="flex h-6 shrink-0 items-center gap-1 rounded px-2 font-medium text-[11.5px] text-ink-700 ring-1 ring-ink-300"
              >
                <X className="h-3 w-3" />
                Stop
              </button>
            ) : (
              <button
                type="button"
                onClick={send}
                disabled={!input.trim() || busy || Boolean(disabledReason)}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-teal-700 text-white transition-opacity hover:opacity-90 disabled:opacity-25"
                title={question ? "Answer" : "Send"}
              >
                <Sparkles className="h-3 w-3" />
              </button>
            )}
          </div>

          {/*
            The mode strip, along the bottom of the composer.

            Arranged the way a terminal assistant does it: inside the box, small,
            always visible, so what it is about to be allowed to do is readable
            without opening anything. Auto applies what it produces; Manual
            proposes and waits. That distinction matters most where a change is
            hard to see afterwards.
          */}
          {runMode && (
            <div className="flex items-center gap-1 border-ink-100 border-t px-1 py-0.5">
              {[
                { id: "auto" as const, label: "Auto", hint: runMode.autoHint },
                { id: "manual" as const, label: "Manual", hint: runMode.manualHint },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => runMode.onChange(m.id)}
                  title={m.hint}
                  className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] transition-colors ${
                    runMode.value === m.id
                      ? "bg-teal-700 font-medium text-white"
                      : "text-ink-500 hover:bg-ink-100"
                  }`}
                >
                  {runMode.value === m.id && <Check className="h-2.5 w-2.5" />}
                  {m.label}
                </button>
              ))}
              <span className="ml-auto truncate pr-1 text-[10px] text-ink-400">
                {runMode.value === "auto" ? runMode.autoHint : runMode.manualHint}
              </span>
            </div>
          )}
        </div>
        <p className="mt-1 text-center text-[10px] text-ink-400 leading-tight">
          {footnote ??
            `${ASSISTANT.name} can make mistakes, and how good the result is depends heavily on the model. Check everything before it reaches a panel.`}
        </p>
      </div>

      {floating && (
        // The resize grip. Bottom right, which is where every window in every
        // operating system puts it.
        <div
          onPointerDown={onPointerDown("size")}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          title={`Resize. Smallest is ${MIN_W} by ${MIN_H}.`}
          className="absolute right-0 bottom-0 h-4 w-4 cursor-nwse-resize"
        >
          <svg viewBox="0 0 16 16" className="h-4 w-4 text-ink-400" aria-hidden="true">
            <path
              d="M15 6 6 15M15 11l-4 4"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
              fill="none"
            />
          </svg>
        </div>
      )}
    </div>
  );
}

export { defaultFrame };
