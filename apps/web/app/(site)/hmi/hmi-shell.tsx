"use client";

import { CONSENT_EVENT, hasConsent } from "@/lib/consent/consent";
import { type HmiDoc, HmiEditor, emptyDoc } from "@ladx/hmi";
import { PROJECT_KEY_PREFIX, type StudioProject } from "@ladx/studio";
import type { LadxProgram } from "@ladx/studio";
import { useCallback, useEffect, useState } from "react";

const DOC_KEY = "ladx.hmi.scratch.v1";
/**
 * The public ladder editor's own scratch program, so the tags line up.
 *
 * The prefix comes from @ladx/studio rather than being written out again here.
 * Two copies of a storage key in two packages is one rename away from the two
 * tools quietly disagreeing about where the program lives.
 */
const LADDER_KEY = `${PROJECT_KEY_PREFIX}scratch`;

/**
 * The HMI builder, without an account.
 *
 * The editor already took its persistence as a prop, because the desktop build
 * writes to local SQLite and must not make an HTTP call. That same seam is what
 * lets this one write to the browser.
 *
 * The interesting part is where the PLC tags come from. Signed in, they come
 * from the project's ladder program. Here they come from the scratch program in
 * the public ladder editor, read out of the same browser storage it saves to.
 * So somebody can draw a rung at /ladder, come here, and bind a lamp to it,
 * which is the whole argument for the two tools sharing one tag table, working
 * with no account at all.
 */
export default function HmiShell() {
  const [doc, setDoc] = useState<HmiDoc | null>(null);
  const [program, setProgram] = useState<LadxProgram | null>(null);
  const [allowed, setAllowed] = useState(true);

  useEffect(() => {
    const read = () => {
      const ok = hasConsent("functional");
      setAllowed(ok);
      if (!ok) {
        setDoc(emptyDoc("Untitled HMI"));
        setProgram(null);
        return;
      }
      try {
        const raw = window.localStorage.getItem(DOC_KEY);
        const parsed = raw ? (JSON.parse(raw) as HmiDoc) : null;
        setDoc(
          parsed && Array.isArray(parsed.screens) && parsed.screens.length
            ? parsed
            : emptyDoc("Untitled HMI"),
        );
      } catch {
        setDoc(emptyDoc("Untitled HMI"));
      }
      try {
        const raw = window.localStorage.getItem(LADDER_KEY);
        const stored = raw ? (JSON.parse(raw) as StudioProject) : null;
        const prog = stored?.program ?? null;
        setProgram(prog && Array.isArray(prog.tags) && prog.tags.length > 0 ? prog : null);
      } catch {
        setProgram(null);
      }
    };
    read();
    window.addEventListener(CONSENT_EVENT, read);
    return () => window.removeEventListener(CONSENT_EVENT, read);
  }, []);

  const save = useCallback(async ({ doc: next }: { id: string; name: string; doc: HmiDoc }) => {
    if (!hasConsent("functional")) return false;
    try {
      window.localStorage.setItem(DOC_KEY, JSON.stringify(next));
      return true;
    } catch {
      return false;
    }
  }, []);

  if (!doc) return <p className="p-8 text-[13px] text-ink-500">Loading the panel…</p>;

  return (
    <div className="flex min-h-[70vh] flex-col">
      {!allowed && (
        <p className="mb-2 rounded-sm border border-[#E4C9A8] bg-[#FDF6EC] px-4 py-2.5 text-[12.5px] leading-relaxed text-[#7A4A12]">
          Optional storage is switched off, so this application cannot be kept between visits.
          Export it as JSON before you close the tab, or allow functional storage on the cookies
          page.
        </p>
      )}
      {!program && (
        <p className="mb-2 rounded-sm border border-ink-200 bg-ink-50/60 px-4 py-2.5 text-[12.5px] leading-relaxed text-ink-600">
          No ladder program yet, so there are no PLC tags to bind to and nothing to run against.
          Draw a rung in the{" "}
          <a href="/ladder" className="font-medium text-teal-700 underline">
            free ladder editor
          </a>{" "}
          first and its tags appear here.
        </p>
      )}
      <HmiEditor
        id="scratch"
        initialDoc={doc}
        initialName={doc.name}
        program={program}
        projectName={program ? "Scratch program" : null}
        onSave={save}
        closeHref="/products/hmi"
        ladderHref="/ladder"
        generateDisabledReason="Screen generation needs a model, which needs an account. Everything else here works without one."
      />
    </div>
  );
}
