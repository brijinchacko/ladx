"use client";

import LadderAi from "@/components/studio/ladder-ai";
import { CONSENT_EVENT, type ConsentState, hasConsent } from "@/lib/consent/consent";
import {
  type FocusMode,
  type LadxProgram,
  LadxStudio,
  type StudioProject,
  type StudioStorage,
  localStorageStorage,
  useFocusMode,
} from "@ladx/studio";
import { useCallback, useEffect, useMemo, useState } from "react";

/** A fixed id, so a reload reopens the same scratch project. */
const SCRATCH_PROJECT = "scratch";
const MODE_KEY = "ladx.studio.mode";

/**
 * How much of the screen Studio gets.
 *
 * `docked` keeps the site header and footer, which is what a first-time visitor
 * arriving from a link should see: the editor in context, with a way back out.
 * `focus` hides the site chrome and gives the editor the whole viewport, which
 * is what somebody actually drawing a rung wants. `full` additionally asks the
 * browser for real fullscreen, hiding the tab strip and the OS chrome too.
 *
 * These are ordered by how much furniture disappears, and the control cycles
 * through them in that order.
 */
/** Kept as an alias so existing imports still resolve. The truth is in @ladx/studio. */
export type StudioMode = FocusMode;

/**
 * Storage that keeps the project only for this page view.
 *
 * Used when functional storage has not been consented to. Studio still works
 * completely, and undo, the simulator and export all behave normally: the only
 * thing missing is that the project does not survive a reload. That is the
 * honest consequence of refusing storage, and it is better than either writing
 * anyway or refusing to open the editor.
 */
function memoryStorage(): StudioStorage {
  let held: StudioProject | null = null;
  return {
    load: async () => held,
    save: async (_id, project) => {
      held = project;
    },
    retentionNote: "Not saved. This project is lost when you close the tab.",
  };
}

/**
 * The ladder workbench, mounted inside the site.
 *
 * Studio used to be its own full-bleed route outside the site layout, which
 * meant a visitor who opened it had no header, no way back to the rest of the
 * site, and no indication they were still on ladx.ai. Now it lives in the site
 * shell like every other page, and hides that shell on request instead.
 *
 * The chrome is hidden by a data attribute on <html> rather than by lifting
 * state into the layout: the layout is a server component, and threading a
 * client-side mode through it would turn the whole site shell into a client
 * tree for the sake of one page.
 */
export default function StudioShell() {
  // undefined until read on the client, so we never guess on the first paint.
  const [mayPersist, setMayPersist] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    setMayPersist(hasConsent("functional"));
    const onConsent = (e: Event) =>
      setMayPersist((e as CustomEvent<ConsentState>).detail.functional);
    window.addEventListener(CONSENT_EVENT, onConsent);
    return () => window.removeEventListener(CONSENT_EVENT, onConsent);
  }, []);

  // Rebuilt only when the permission changes, not on every render: a new
  // storage object would restart Studio's load effect and discard the project.
  const storage = useMemo(
    () => (mayPersist ? localStorageStorage() : memoryStorage()),
    [mayPersist],
  );

  /*
   * Focus and fullscreen, from the shared hook.
   *
   * This implementation used to live here and nowhere else, which is why the
   * other four tools each had a worse version or none. It moved to
   * @ladx/studio; what stays here is the one thing specific to this page,
   * which is hiding the site header and footer.
   */
  const onModeChange = useCallback((next: FocusMode) => {
    const root = document.documentElement;
    if (next === "docked") root.removeAttribute("data-studio-immersive");
    else root.setAttribute("data-studio-immersive", "");
  }, []);

  // The mode is not remembered any more, so consent no longer comes into it:
  // the key is passed only so an older build's stored value gets cleared.
  const screen_ = useFocusMode({ key: MODE_KEY, onChange: onModeChange });
  const { mode, cycle, collapse, immersive } = screen_;

  // Cleaned up on unmount, so navigating away never leaves the site headerless.
  useEffect(() => {
    return () => document.documentElement.removeAttribute("data-studio-immersive");
  }, []);

  return (
    <div
      ref={screen_.ref}
      className={
        immersive
          ? "fixed inset-0 z-50 bg-white"
          : "relative mx-auto w-full max-w-[1600px] px-0 sm:px-5"
      }
    >
      <div
        className={
          immersive
            ? "flex h-full w-full flex-col"
            : "flex h-[clamp(560px,calc(100vh-8rem),1000px)] w-full flex-col overflow-hidden border border-ink-200 sm:rounded-sm"
        }
      >
        <StudioBar mode={mode} onCycle={cycle} onCollapse={collapse} mayPersist={mayPersist} />
        <div className="min-h-0 flex-1">
          <LadxStudio
            projectId={SCRATCH_PROJECT}
            storage={storage}
            /*
             * The assistant, present and disabled.
             *
             * Writing a rung from a description needs a provider key, which
             * belongs to an account, so it cannot run here. It is still shown,
             * because hiding it on one surface and showing it on another made
             * the same feature look like several. It opens as a bar and costs
             * no rung space.
             */
            bottomDock={({ program, load }) => (
              <LadderAi
                getProgram={() => program}
                onProgram={(next: LadxProgram) => load(next)}
                disabledReason="Writing a rung from a description needs a provider key, which belongs to an account. Sign up and connect one in Settings."
              />
            )}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * The strip above the editor.
 *
 * Deliberately thin. It exists to say where you are and to hand back the screen
 * space, and every pixel it takes is a pixel of rung the user does not get.
 */
function StudioBar({
  mode,
  onCycle,
  onCollapse,
  mayPersist,
}: {
  mode: StudioMode;
  onCycle: () => void;
  onCollapse: () => void;
  mayPersist: boolean | undefined;
}) {
  const next =
    mode === "docked" ? "Focus mode" : mode === "focus" ? "Fullscreen" : "Exit fullscreen";

  return (
    <div className="flex h-9 shrink-0 items-center gap-3 border-b border-ink-200 bg-ink-50/70 px-3">
      <span
        aria-hidden="true"
        className="h-[7px] w-[7px] shrink-0 bg-teal-600"
        style={{ backgroundColor: "rgb(var(--ladx-teal))" }}
      />
      <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-500">
        Ladder
      </span>
      {mayPersist === false ? (
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event("ladx:open-consent"))}
          className="hidden font-mono text-[11px] text-amber-700 underline-offset-2 hover:underline sm:inline"
          title="Ladder is not saving your work because functional storage is turned off"
        >
          not saving, click to allow
        </button>
      ) : (
        <span className="hidden font-mono text-[11px] text-ink-400 sm:inline">
          saves to this browser
        </span>
      )}

      <div className="ml-auto flex items-center gap-1.5">
        {mode !== "docked" && (
          <button
            type="button"
            onClick={onCollapse}
            className="rounded-sm border border-ink-200 bg-white px-2.5 py-1 font-mono text-[11px] text-ink-600 transition-colors hover:border-ink-400 hover:text-ink-900"
          >
            {mode === "full" ? "Leave fullscreen" : "Back to site"}
            <kbd className="ml-1.5 hidden font-sans text-[10px] text-ink-400 sm:inline">Esc</kbd>
          </button>
        )}
        <button
          type="button"
          onClick={onCycle}
          className="rounded-sm border border-ink-200 bg-white px-2.5 py-1 font-mono text-[11px] text-ink-600 transition-colors hover:border-ink-400 hover:text-ink-900"
        >
          {next}
          <kbd className="ml-1.5 hidden font-sans text-[10px] text-ink-400 sm:inline">F</kbd>
        </button>
      </div>
    </div>
  );
}
