"use client";

import { CONSENT_EVENT, type ConsentState, readConsent } from "@/lib/consent/consent";
import { useEffect, useState } from "react";

/**
 * Reopens the preferences dialog, and shows the current decision.
 *
 * A separate tiny client component so the cookie page itself stays a server
 * component. It talks to the banner through a window event rather than shared
 * state, which is what lets the two live in different parts of the tree.
 */
export default function ReopenConsent() {
  const [state, setState] = useState<ConsentState | null | undefined>(undefined);

  useEffect(() => {
    setState(readConsent());
    const onChange = (e: Event) => setState((e as CustomEvent<ConsentState>).detail);
    window.addEventListener(CONSENT_EVENT, onChange);
    return () => window.removeEventListener(CONSENT_EVENT, onChange);
  }, []);

  return (
    <div className="flex flex-wrap items-center gap-4">
      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event("ladx:open-consent"))}
        className="rounded-sm bg-ink-900 px-4 py-2 text-[13.5px] font-medium text-white transition-opacity hover:opacity-90"
      >
        Change what we store
      </button>

      {/* undefined means not read yet, so nothing is claimed either way. */}
      {state !== undefined && (
        <p className="font-mono text-[11.5px] text-ink-400">
          {state === null ? (
            "No choice recorded yet"
          ) : (
            <>
              Functional {state.functional ? "on" : "off"} · Analytics{" "}
              {state.analytics ? "on" : "off"} · decided{" "}
              {new Date(state.decidedAt).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </>
          )}
        </p>
      )}
    </div>
  );
}
