"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * Docked, focus, or real fullscreen.
 *
 * Ordered by how much furniture disappears, and the control cycles through them
 * in that order.
 *
 * `docked` keeps whatever chrome is around the tool, which is what a first-time
 * visitor arriving from a link should see: the editor in context, with a way
 * back out. `focus` fills the viewport and hides that chrome. `full`
 * additionally asks the browser for real fullscreen, which also takes the tab
 * strip and the operating system's own furniture.
 */
export type FocusMode = "docked" | "focus" | "full";

export interface FocusModeApi {
  mode: FocusMode;
  /** Attach to the element that should fill the screen. */
  ref: React.RefObject<HTMLDivElement | null>;
  /** docked to focus to full to focus. What the expand control does. */
  cycle: () => void;
  /** One step back towards docked. What Escape and the collapse control do. */
  collapse: () => void;
  /** True in focus or full. Usually all a layout needs to know. */
  immersive: boolean;
  /** Whether the browser will grant real fullscreen at all. */
  canFullscreen: boolean;
}

/**
 * Focus and fullscreen, once, for every tool.
 *
 * This began as one implementation inside the public ladder editor and was
 * absent, partial or differently wrong in the other four. That is the usual
 * way a mode like this rots: each tool grows its own boolean, none of them
 * listen for the browser leaving fullscreen behind their back, and the button
 * ends up describing a state the page is not in.
 *
 * Everything awkward about the Fullscreen API is handled here rather than five
 * times:
 *
 *   Fullscreen needs a user gesture, so a remembered `full` is never restored;
 *   the stored value is clamped to `focus`. Restoring it would leave the UI
 *   claiming a state the browser had refused.
 *
 *   Esc, F11 and the window controls all leave fullscreen without telling the
 *   page. Without the `fullscreenchange` listener, a control still reading
 *   "exit fullscreen" is a control that does nothing when pressed.
 *
 *   requestFullscreen is refused by permissions policy in some embeds, and on
 *   iOS Safari it does not exist for arbitrary elements. Falling back to focus
 *   gets most of the benefit rather than failing silently.
 *
 * @param key       Where to remember the mode. Omit to not remember it.
 * @param mayPersist Whether storing a preference is allowed at all. Undefined
 *                   while the answer is still being read on the client.
 */
export function useFocusMode(options?: {
  key?: string;
  mayPersist?: boolean;
  /**
   * Called when the mode changes, for a host that needs to hide site chrome.
   * The ladder page uses it to set an attribute on the document element.
   */
  onChange?: (mode: FocusMode) => void;
}): FocusModeApi {
  const { key, mayPersist, onChange } = options ?? {};
  const [mode, setMode] = useState<FocusMode>("docked");
  const [ready, setReady] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  const canFullscreen = useMemo(() => {
    if (typeof document === "undefined") return false;
    return typeof document.documentElement.requestFullscreen === "function";
  }, []);

  // Restored on the client only, and never to `full`. Reading storage during
  // the server render is a hydration mismatch; seeding state from it in the
  // initialiser is the same bug wearing a hat.
  useEffect(() => {
    if (key && mayPersist !== false) {
      try {
        if (window.localStorage.getItem(key) === "focus") setMode("focus");
      } catch {
        // Storage unavailable. The default is a fine answer.
      }
    }
    setReady(true);
  }, [key, mayPersist]);

  useEffect(() => {
    if (!ready || !key || mayPersist === false) return;
    try {
      window.localStorage.setItem(key, mode === "full" ? "focus" : mode);
    } catch {
      // The mode still applies for this visit.
    }
  }, [mode, ready, key, mayPersist]);

  useEffect(() => {
    onChange?.(mode);
  }, [mode, onChange]);

  useEffect(() => {
    const onFsChange = () => {
      if (!document.fullscreenElement) setMode((m) => (m === "full" ? "focus" : m));
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  const enterFull = useCallback(async () => {
    const el = ref.current;
    if (!el) return;
    try {
      await el.requestFullscreen();
      setMode("full");
    } catch {
      setMode("focus");
    }
  }, []);

  const exitFull = useCallback(async () => {
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
    setMode("focus");
  }, []);

  const cycle = useCallback(() => {
    if (mode === "docked") setMode("focus");
    else if (mode === "focus") {
      if (canFullscreen) void enterFull();
      else setMode("docked");
    } else void exitFull();
  }, [mode, enterFull, exitFull, canFullscreen]);

  const collapse = useCallback(() => {
    if (mode === "full") void exitFull();
    else setMode("docked");
  }, [mode, exitFull]);

  /**
   * Escape steps back, F cycles.
   *
   * Suppressed while typing, because every one of these tools has a tag name,
   * a rung comment or a text object in it, and a bare "f" binding would make
   * the letter f impossible to type.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing =
        !!t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT" ||
          t.isContentEditable);
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "Escape" && mode !== "docked") {
        e.preventDefault();
        collapse();
      } else if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        cycle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, cycle, collapse]);

  return { mode, ref, cycle, collapse, immersive: mode !== "docked", canFullscreen };
}

/** What the expand control should say, given the mode. */
export function focusModeLabel(mode: FocusMode, canFullscreen: boolean): string {
  if (mode === "docked") return "Focus mode";
  if (mode === "focus") return canFullscreen ? "Full screen" : "Leave focus mode";
  return "Leave full screen";
}
