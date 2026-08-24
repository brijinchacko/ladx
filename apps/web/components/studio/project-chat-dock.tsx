"use client";

import { streamChatFromApi } from "@/lib/chat-stream";
import { useComposer } from "@/lib/chat/use-composer";
import { type ChatTurn, ChatWindow } from "@ladx/ui";
import { GripVertical, Maximize2, MessageSquare, Minimize2, PanelRight, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

const STATE_KEY = "ladx.projectChat.v2";

const MIN_W = 320;
const MIN_H = 260;
const EDGE = 16;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface DockState {
  open: boolean;
  /** Snapped to the bottom right rather than placed by hand. */
  docked: boolean;
  maximised: boolean;
  rect: Rect;
}

const DEFAULT_RECT: Rect = { x: 0, y: 0, w: 420, h: 520 };

/** Bottom right, where a dock belongs, given the current viewport. */
function snapRect(rect: Rect): Rect {
  const w = Math.min(rect.w, window.innerWidth - EDGE * 2);
  const h = Math.min(rect.h, window.innerHeight - EDGE * 2);
  return { w, h, x: window.innerWidth - w - EDGE, y: window.innerHeight - h - EDGE };
}

/** Never off screen, never smaller than usable. */
function clampRect(rect: Rect): Rect {
  const w = Math.max(MIN_W, Math.min(rect.w, window.innerWidth - EDGE));
  const h = Math.max(MIN_H, Math.min(rect.h, window.innerHeight - EDGE));
  return {
    w,
    h,
    x: Math.max(0, Math.min(rect.x, window.innerWidth - w)),
    y: Math.max(0, Math.min(rect.y, window.innerHeight - h)),
  };
}

type Dir = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

const CURSOR: Record<Dir, string> = {
  n: "ns-resize",
  s: "ns-resize",
  e: "ew-resize",
  w: "ew-resize",
  ne: "nesw-resize",
  sw: "nesw-resize",
  nw: "nwse-resize",
  se: "nwse-resize",
};

/**
 * The project assistant.
 *
 * Always within reach while you are working on a project, because the questions
 * that come up are about *this* project: what does the FAT still need, what did
 * we say the guard does, what is left before handover. Walking to a separate
 * chat page and re-explaining the project every time is the friction this
 * removes. Every message carries the project id, so the server grounds the
 * thread in the project's own record, its design basis and its documents.
 *
 * It is a window rather than a fixed panel. A conversation about a document you
 * are reading needs to sit somewhere that is not on top of the document, and
 * where that is depends on the screen and on what is being read, so the answer
 * cannot be hard coded. Drag the title bar to put it anywhere; drag any edge or
 * corner to size it; dock it back to the bottom right when it is in the way.
 *
 * Position, size and dock state are remembered, and re-clamped on every resize,
 * so a window placed on a second monitor cannot come back unreachable.
 */
export default function ProjectChatDock({
  projectId,
  projectName,
}: {
  projectId: string;
  projectName: string;
}) {
  const [state, setState] = useState<DockState>({
    open: false,
    docked: true,
    maximised: false,
    rect: DEFAULT_RECT,
  });
  const [ready, setReady] = useState(false);
  const [dragging, setDragging] = useState(false);
  const conversationIdRef = useRef<string | undefined>(undefined);
  const [notice, setNotice] = useState<string | null>(null);
  const composer = useComposer();

  // Restored on the client: the server has no viewport to snap against.
  useEffect(() => {
    let restored: Partial<DockState> = {};
    try {
      restored = JSON.parse(window.localStorage.getItem(STATE_KEY) ?? "{}") as Partial<DockState>;
    } catch {
      restored = {};
    }
    const docked = restored.docked !== false;
    const rect = { ...DEFAULT_RECT, ...(restored.rect ?? {}) };
    setState({
      open: restored.open === true,
      docked,
      maximised: restored.maximised === true,
      rect: docked ? snapRect(rect) : clampRect(rect),
    });
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) window.localStorage.setItem(STATE_KEY, JSON.stringify(state));
  }, [state, ready]);

  // A window remembered against a larger screen would otherwise open off the
  // edge of a smaller one.
  useEffect(() => {
    if (!ready) return;
    const onResize = () =>
      setState((s) => ({ ...s, rect: s.docked ? snapRect(s.rect) : clampRect(s.rect) }));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [ready]);

  useEffect(() => {
    if (!state.open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && state.maximised) setState((s) => ({ ...s, maximised: false }));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state.open, state.maximised]);

  /* ─────────────────────────── move and size ─────────────────────────── */

  const startMove = useCallback((e: React.PointerEvent) => {
    // Buttons in the title bar must still be buttons.
    if ((e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    setDragging(true);

    let start: Rect | null = null;
    const grabX = e.clientX;
    const grabY = e.clientY;

    const move = (ev: PointerEvent) => {
      setState((s) => {
        // Dragging a docked window picks it up, from wherever it currently is.
        if (!start) start = s.rect;
        return {
          ...s,
          docked: false,
          maximised: false,
          rect: clampRect({
            ...s.rect,
            x: start.x + (ev.clientX - grabX),
            y: start.y + (ev.clientY - grabY),
          }),
        };
      });
    };
    const up = () => {
      setDragging(false);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  }, []);

  const startResize = useCallback((e: React.PointerEvent, dir: Dir) => {
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    setDragging(true);

    let start: Rect | null = null;
    const grabX = e.clientX;
    const grabY = e.clientY;

    const move = (ev: PointerEvent) => {
      setState((s) => {
        if (!start) start = s.rect;
        const dx = ev.clientX - grabX;
        const dy = ev.clientY - grabY;
        let { x, y, w, h } = start;

        // A west or north drag moves the origin as well as the size, which is
        // what makes the opposite edge stay put.
        if (dir.includes("e")) w = start.w + dx;
        if (dir.includes("s")) h = start.h + dy;
        if (dir.includes("w")) {
          w = start.w - dx;
          x = start.x + dx;
        }
        if (dir.includes("n")) {
          h = start.h - dy;
          y = start.y + dy;
        }

        // Clamping the size first, then correcting the origin, so dragging past
        // the minimum stops the edge rather than dragging the window along.
        const cw = Math.max(MIN_W, Math.min(w, window.innerWidth - EDGE));
        const ch = Math.max(MIN_H, Math.min(h, window.innerHeight - EDGE));
        if (dir.includes("w")) x = start.x + start.w - cw;
        if (dir.includes("n")) y = start.y + start.h - ch;

        return {
          ...s,
          docked: false,
          maximised: false,
          rect: clampRect({ x, y, w: cw, h: ch }),
        };
      });
    };
    const up = () => {
      setDragging(false);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  }, []);

  /* ───────────────────────────── the thread ───────────────────────────── */

  const send = useCallback(
    async (turns: ChatTurn[], signal: AbortSignal) => {
      composer.clearAttachments();
      return streamChatFromApi({
        messages: turns.map(({ role, content }) => ({ role, content })),
        conversationId: conversationIdRef.current,
        // This is what grounds the thread in the project.
        projectId,
        model: composer.model,
        signal,
        onConversationId: (id) => {
          conversationIdRef.current = id;
        },
        onNotice: (n) => setNotice(n.message),
      });
    },
    [projectId, composer.model, composer.clearAttachments],
  );

  if (!ready) return null;

  if (!state.open) {
    return (
      <button
        type="button"
        onClick={() =>
          setState((s) => ({ ...s, open: true, rect: snapRect(s.rect), docked: true }))
        }
        className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-ink-900 px-4 py-2.5 text-[13.5px] font-medium text-white shadow-lg transition-opacity hover:opacity-90"
      >
        <MessageSquare className="h-4 w-4" />
        Ask about this project
      </button>
    );
  }

  const style: React.CSSProperties = state.maximised
    ? {
        left: EDGE,
        top: EDGE,
        width: `calc(100vw - ${EDGE * 2}px)`,
        height: `calc(100vh - ${EDGE * 2}px)`,
      }
    : { left: state.rect.x, top: state.rect.y, width: state.rect.w, height: state.rect.h };

  const resizable = !state.maximised;

  return (
    <div
      style={style}
      className={`fixed z-40 flex flex-col overflow-hidden rounded-lg border border-ink-200 bg-white shadow-2xl ${
        dragging ? "select-none" : ""
      }`}
    >
      {/* title bar: the drag handle */}
      <div
        onPointerDown={startMove}
        style={{ touchAction: "none", cursor: dragging ? "grabbing" : "grab" }}
        className="flex shrink-0 items-center gap-2 border-b border-ink-100 bg-ink-50/70 px-2.5 py-2"
      >
        <GripVertical className="h-3.5 w-3.5 shrink-0 text-ink-300" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12.5px] font-semibold text-ink-900">Project assistant</p>
          <p className="truncate font-mono text-[10.5px] text-ink-400">{projectName}</p>
        </div>

        <button
          type="button"
          onClick={() =>
            setState((s) => ({ ...s, docked: true, maximised: false, rect: snapRect(s.rect) }))
          }
          aria-label="Dock to the bottom right"
          title="Dock to the bottom right"
          disabled={state.docked && !state.maximised}
          className="flex h-6 w-6 items-center justify-center rounded text-ink-400 transition-colors hover:bg-ink-200 hover:text-ink-900 disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <PanelRight className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setState((s) => ({ ...s, maximised: !s.maximised }))}
          aria-label={state.maximised ? "Restore" : "Maximise"}
          title={state.maximised ? "Restore" : "Maximise"}
          className="flex h-6 w-6 items-center justify-center rounded text-ink-400 transition-colors hover:bg-ink-200 hover:text-ink-900"
        >
          {state.maximised ? (
            <Minimize2 className="h-3.5 w-3.5" />
          ) : (
            <Maximize2 className="h-3.5 w-3.5" />
          )}
        </button>
        <button
          type="button"
          onClick={() => setState((s) => ({ ...s, open: false }))}
          aria-label="Close"
          title="Close"
          className="flex h-6 w-6 items-center justify-center rounded text-ink-400 transition-colors hover:bg-ink-200 hover:text-ink-900"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {notice && (
        <p className="shrink-0 border-b border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] leading-snug text-amber-900">
          {notice}
        </p>
      )}

      <ChatWindow
        className="min-h-0 flex-1"
        projectId={projectId}
        emptyTitle={`Ask about ${projectName}`}
        suggestions={[
          "What is left before handover?",
          "Summarise this project",
          "What should the FAT cover?",
        ]}
        placeholder="Ask about this project…"
        onAttach={composer.attach}
        attachments={composer.attachments}
        onRemoveAttachment={composer.removeAttachment}
        attachAccept={composer.accept}
        attaching={composer.attaching}
        models={composer.models}
        onSend={send}
      />

      {/* edges and corners */}
      {resizable &&
        (["n", "s", "e", "w", "ne", "nw", "se", "sw"] as Dir[]).map((dir) => (
          <button
            key={dir}
            type="button"
            aria-label={`Resize ${dir}`}
            tabIndex={-1}
            onPointerDown={(e) => startResize(e, dir)}
            style={{ touchAction: "none", cursor: CURSOR[dir] }}
            className={`absolute ${GRIP[dir]}`}
          />
        ))}
    </div>
  );
}

/**
 * Where each grip sits.
 *
 * Six pixels of edge and twelve of corner: wide enough to hit without aiming,
 * narrow enough that the chat underneath still takes the click.
 */
const GRIP: Record<Dir, string> = {
  n: "left-3 right-3 top-0 h-1.5",
  s: "left-3 right-3 bottom-0 h-1.5",
  e: "top-3 bottom-3 right-0 w-1.5",
  w: "top-3 bottom-3 left-0 w-1.5",
  ne: "right-0 top-0 h-3 w-3",
  nw: "left-0 top-0 h-3 w-3",
  se: "bottom-0 right-0 h-3 w-3",
  sw: "bottom-0 left-0 h-3 w-3",
};
