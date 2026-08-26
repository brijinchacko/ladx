"use client";

import CadEditor from "@/components/cad/cad-editor";
import { type Drawing, emptyDrawing } from "@/lib/cad/types";
import { CONSENT_EVENT, hasConsent } from "@/lib/consent/consent";
import { useCallback, useEffect, useState } from "react";

/** A fixed id, so a reload reopens the same drawing. */
const KEY = "ladx.cad.scratch.v1";

/**
 * CAD without an account.
 *
 * The drafting is all client side already, so the only thing an account was
 * ever buying here is somewhere to put the drawing. That goes to the browser
 * instead, which makes the tool genuinely usable by somebody who arrived from
 * a search result and has no intention of signing up for anything yet.
 *
 * Storage respects the consent choice. Somebody who declined optional storage
 * gets a working editor that cannot remember anything between visits, and is
 * told so rather than left to discover it.
 */
export default function CadShell() {
  const [initial, setInitial] = useState<Drawing | null>(null);
  const [allowed, setAllowed] = useState(true);

  // Read on the client only. Touching localStorage while the server renders is
  // a hydration mismatch, and seeding state from it in the initialiser is the
  // same bug wearing a hat.
  useEffect(() => {
    const read = () => {
      const ok = hasConsent("functional");
      setAllowed(ok);
      if (!ok) {
        setInitial(emptyDrawing());
        return;
      }
      try {
        const raw = window.localStorage.getItem(KEY);
        const parsed = raw ? (JSON.parse(raw) as Drawing) : null;
        setInitial(parsed && Array.isArray(parsed.entities) ? parsed : emptyDrawing());
      } catch {
        // A drawing from an older build, or a partial write. An empty sheet is
        // a better answer than a blank screen.
        setInitial(emptyDrawing());
      }
    };
    read();
    window.addEventListener(CONSENT_EVENT, read);
    return () => window.removeEventListener(CONSENT_EVENT, read);
  }, []);

  const save = useCallback(async ({ data }: { id: string; name: string; data: Drawing }) => {
    if (!hasConsent("functional")) return false;
    try {
      window.localStorage.setItem(KEY, JSON.stringify(data));
      return true;
    } catch {
      // Private browsing, or a full quota.
      return false;
    }
  }, []);

  if (!initial) {
    return <p className="p-8 text-[13px] text-ink-500">Loading the drawing board…</p>;
  }

  return (
    <>
      {!allowed && (
        <p className="mx-auto mb-3 max-w-6xl rounded-sm border border-[#E4C9A8] bg-[#FDF6EC] px-4 py-2.5 text-[12.5px] leading-relaxed text-[#7A4A12]">
          Optional storage is switched off, so this drawing cannot be kept between visits. Export it
          as DXF or SVG before you close the tab, or allow functional storage on the cookies page.
        </p>
      )}
      <CadEditor
        drawingId="scratch"
        initial={initial}
        name="Untitled drawing"
        onSave={save}
        canGenerate={false}
      />
    </>
  );
}
