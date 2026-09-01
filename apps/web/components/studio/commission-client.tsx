"use client";

import { parseTagList } from "@/lib/ladder/tag-list";
import { ladxProgramToIr } from "@ladx/studio";
import type { Block, Deviation, Drift, Pack, Sequence, TestGroup } from "@ladx/types";
import {
  AlertTriangle,
  ClipboardCheck,
  Download,
  GitCompare,
  Layers,
  Package,
  Route,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type What = "sequence" | "tests" | "deviations" | "drift" | "handover";

interface SequenceOut {
  sequences: Sequence[];
  notes: string[];
  text: string;
}
interface TestsOut {
  groups: TestGroup[];
  notCovered: string[];
  safetySteps: number;
  markdown: string;
}
interface DeviationsOut {
  deviations: Deviation[];
  blocks: Block[];
}
interface DriftOut {
  drifts: Drift[];
  notes: string[];
  breaking: number;
  text: string;
}

const TABS: { what: What; label: string; icon: React.ReactNode; blurb: string }[] = [
  {
    what: "sequence",
    label: "Sequence",
    icon: <Route className="h-4 w-4" />,
    blurb:
      "The steps the machine moves through and what has to be true to move between them, read out of the step register.",
  },
  {
    what: "tests",
    label: "Acceptance tests",
    icon: <ClipboardCheck className="h-4 w-4" />,
    blurb:
      "Test steps written from the logic, including the negative half: proving each permissive actually blocks is what finds a wire on the wrong terminal.",
  },
  {
    what: "deviations",
    label: "House standard",
    icon: <Layers className="h-4 w-4" />,
    blurb:
      "Where this program departs from the standard blocks. Roles are judged by tag name, which is all a PLC file carries, so each of these is a question rather than a fault.",
  },
  {
    what: "drift",
    label: "Tag lists",
    icon: <GitCompare className="h-4 w-4" />,
    blurb:
      "The program against the HMI export or the I/O schedule. A rename nobody carried through is the one worth finding.",
  },
  {
    what: "handover",
    label: "Handover pack",
    icon: <Package className="h-4 w-4" />,
    blurb:
      "Everything above, assembled, with checksums and a manifest that says what a real handover needs that cannot come out of a PLC file.",
  },
];

export function CommissionClient({
  programs,
}: {
  programs: { id: string; name: string; program: unknown }[];
}) {
  const [chosen, setChosen] = useState<string>(programs[0]?.id ?? "");
  const [what, setWhat] = useState<What>("sequence");
  const [data, setData] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Pasted HMI or schedule export, one tag per line. */
  const [pasted, setPasted] = useState("");

  // Parsed in lib rather than here, because it is the one piece of real logic
  // on this screen and a component is the one place it could not be tested.
  const sources = useCallback(() => {
    const parsed = parseTagList(pasted);
    return parsed.length > 0 ? parsed : undefined;
  }, [pasted]);

  const load = useCallback(
    async (id: string, which: What) => {
      if (!id) return;
      const found = programs.find((p) => p.id === id);
      if (!found) return;
      setBusy(true);
      setError(null);
      setData(null);
      try {
        const res = await fetch("/api/ladder/commission", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            // Converted here, the same way the editor does it, so this never
            // disagrees with the screen about what a rung means.
            project: ladxProgramToIr(found.program as Parameters<typeof ladxProgramToIr>[0]),
            what: which,
            sources: sources(),
          }),
        });
        const out = await res.json();
        if (!res.ok) throw new Error(out.error ?? "That did not run.");
        setData(out);
      } catch (e) {
        setError(e instanceof Error ? e.message : "That did not run.");
      } finally {
        setBusy(false);
      }
    },
    [programs, sources],
  );

  useEffect(() => {
    // Drift is the one thing that needs a list pasted first, so it does not
    // run on its own and come back with an error the user did not ask for.
    if (what === "drift" && !pasted.trim()) {
      setData(null);
      setError(null);
      return;
    }
    void load(chosen, what);
  }, [chosen, what, load, pasted]);

  const download = (text: string, name: string, type = "text/markdown") => {
    const blob = new Blob([text], { type: `${type};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (programs.length === 0) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-10 text-center">
        <ClipboardCheck className="mx-auto mb-3 h-5 w-5 text-ink-300" />
        <p className="text-[13.5px] text-ink-600">No programs yet.</p>
        <p className="mt-1 text-[12.5px] text-ink-500">
          Write one in Ladder, or open an L5X in Convert, and it can be commissioned here.
        </p>
      </div>
    );
  }

  const tab = TABS.find((t) => t.what === what);

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select
          value={chosen}
          onChange={(e) => setChosen(e.target.value)}
          className="rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-[13px] outline-none focus:border-ink-500"
        >
          {programs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        {busy && <span className="text-[12.5px] text-ink-500">Reading…</span>}
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.what}
            type="button"
            onClick={() => setWhat(t.what)}
            className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12.5px] ${
              what === t.what
                ? "border-ink-900 bg-ink-900 text-white"
                : "border-ink-200 bg-white text-ink-700 hover:border-ink-400"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {tab && <p className="mb-4 text-[12.5px] leading-relaxed text-ink-500">{tab.blurb}</p>}

      {(what === "drift" || what === "handover") && (
        <div className="mb-5 rounded-md border border-ink-200 bg-ink-50/40 p-3">
          <label htmlFor="taglist" className="mb-1.5 block text-[12.5px] font-medium text-ink-700">
            The other tag list
          </label>
          <p className="mb-2 text-[12px] leading-relaxed text-ink-500">
            One tag per line, from the HMI export or the I/O schedule. Add a description and an
            address after commas if you have them. Without this, nothing is compared, and the pack
            says so.
          </p>
          <textarea
            id="taglist"
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            rows={4}
            spellCheck={false}
            placeholder={"Start_PB, Start button, I0.0\nMotor_Run, Motor contactor, Q0.0"}
            className="w-full rounded-md border border-ink-200 bg-white px-2.5 py-2 font-mono text-[12px] outline-none focus:border-ink-500"
          />
        </div>
      )}

      {error && (
        <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800">
          {error}
        </p>
      )}

      {what === "sequence" && data != null && <SequenceView out={data as SequenceOut} />}
      {what === "tests" && data != null && (
        <TestsView out={data as TestsOut} onDownload={download} />
      )}
      {what === "deviations" && data != null && <DeviationsView out={data as DeviationsOut} />}
      {what === "drift" && data != null && <DriftView out={data as DriftOut} />}
      {what === "drift" && data == null && !busy && !error && (
        <Empty>Paste a tag list above and it is compared against the program.</Empty>
      )}
      {what === "handover" && data != null && <PackView out={data as Pack} onDownload={download} />}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-1 py-3 text-[13px] text-ink-500">{children}</p>;
}

function Notes({ notes }: { notes: string[] }) {
  if (notes.length === 0) return null;
  return (
    <ul className="mt-3 space-y-1.5 border-t border-ink-100 pt-3">
      {notes.map((n) => (
        <li key={n} className="text-[12px] leading-relaxed text-ink-500">
          {n}
        </li>
      ))}
    </ul>
  );
}

function SequenceView({ out }: { out: SequenceOut }) {
  if (out.sequences.length === 0) {
    return (
      <div>
        <Empty>Nothing in this program was written in a shape this recognises.</Empty>
        <Notes notes={out.notes} />
      </div>
    );
  }
  return (
    <div className="space-y-5">
      {out.sequences.map((s) => (
        <div key={s.register} className="rounded-md border border-ink-200 bg-white p-4">
          <h3 className="mb-2 text-[13.5px] font-medium text-ink-900">
            {s.register} steps through {s.steps.join(", ")}
          </h3>
          <ul className="space-y-1.5">
            {s.transitions.map((t) => (
              <li key={`${t.pou}-${t.rung}-${t.to}`} className="text-[13px] text-ink-700">
                <span className="font-mono text-[12px] text-ink-900">
                  {t.from === null ? "anywhere" : t.from} → {t.to}
                </span>{" "}
                when {t.when.join(" and ")}
                <span className="ml-2 font-mono text-[11.5px] text-ink-400">
                  {t.pou}/{t.rung}
                </span>
              </li>
            ))}
          </ul>
          {s.terminal.length > 0 && (
            <p className="mt-3 text-[12px] text-ink-500">
              Nothing leaves step {s.terminal.join(", ")}. That is where the machine stops.
            </p>
          )}
          {s.unreachable.length > 0 && (
            <p className="mt-1 text-[12px] text-ink-500">
              Nothing reaches step {s.unreachable.join(", ")}.
            </p>
          )}
        </div>
      ))}
      <Notes notes={out.notes} />
    </div>
  );
}

function TestsView({
  out,
  onDownload,
}: {
  out: TestsOut;
  onDownload: (t: string, n: string) => void;
}) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[12.5px] text-ink-500">
          {out.groups.length} outputs, {out.safetySteps} safety steps
        </p>
        <button
          type="button"
          onClick={() => onDownload(out.markdown, "acceptance-tests.md")}
          className="flex items-center gap-1.5 rounded-md border border-ink-200 px-2 py-1 text-[12px] text-ink-700 hover:border-ink-400"
        >
          <Download className="h-3.5 w-3.5" />
          Download
        </button>
      </div>
      {out.groups.map((g) => (
        <div key={g.subject} className="mb-4 rounded-md border border-ink-200 bg-white p-4">
          <h3 className="mb-2 text-[13.5px] font-medium text-ink-900">{g.subject}</h3>
          <ol className="space-y-2">
            {g.steps.map((s) => (
              <li key={`${s.action}-${s.expect}`} className="text-[13px] text-ink-700">
                {s.kind === "safety" && (
                  <span className="mr-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-900">
                    SAFETY
                  </span>
                )}
                {s.action}. <span className="text-ink-900">{s.expect}</span>
                <span className="ml-2 font-mono text-[11.5px] text-ink-400">{s.from}</span>
              </li>
            ))}
          </ol>
        </div>
      ))}
      <Notes notes={out.notCovered} />
    </div>
  );
}

function DeviationsView({ out }: { out: DeviationsOut }) {
  return (
    <div>
      {out.deviations.length === 0 ? (
        <Empty>
          Nothing in this program departs from the standard blocks in a way this recognises.
        </Empty>
      ) : (
        out.deviations.map((d) => (
          <div
            key={`${d.pou}-${d.rung}`}
            className="mb-3 rounded-md border border-ink-200 bg-white p-4"
          >
            <div className="mb-1 flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
              <span className="font-mono text-[12px] text-ink-900">
                {d.pou}/{d.rung}
              </span>
            </div>
            <p className="text-[13px] leading-relaxed text-ink-700">{d.detail}</p>
          </div>
        ))
      )}
      <div className="mt-5 border-t border-ink-100 pt-4">
        <h3 className="mb-2 text-[12.5px] font-medium text-ink-700">The blocks</h3>
        {out.blocks.map((b) => (
          <div key={b.name} className="mb-3">
            <p className="font-mono text-[12px] text-ink-900">{b.name}</p>
            <p className="text-[12px] leading-relaxed text-ink-600">{b.about}</p>
            <ul className="mt-1 space-y-0.5">
              {b.limits.map((l) => (
                <li key={l} className="text-[11.5px] leading-relaxed text-ink-500">
                  {l}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

function DriftView({ out }: { out: DriftOut }) {
  return (
    <div>
      {out.drifts.length === 0 ? (
        <Empty>The lists agree.</Empty>
      ) : (
        <>
          <p className="mb-3 text-[12.5px] text-ink-500">
            {out.drifts.length} disagreement{out.drifts.length === 1 ? "" : "s"}
            {out.breaking > 0 && `, ${out.breaking} of which break at runtime`}.
          </p>
          {out.drifts.map((d) => (
            <div
              key={`${d.kind}-${d.tag}`}
              className="mb-2 rounded-md border border-ink-200 bg-white px-3 py-2"
            >
              <p className="text-[13px] leading-relaxed text-ink-700">{d.detail}</p>
            </div>
          ))}
        </>
      )}
      <Notes notes={out.notes} />
    </div>
  );
}

function PackView({
  out,
  onDownload,
}: {
  out: Pack;
  onDownload: (t: string, n: string, type?: string) => void;
}) {
  return (
    <div>
      {out.concerns.length > 0 && (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3">
          <p className="mb-1.5 text-[12.5px] font-medium text-amber-900">Before this is sent</p>
          <ul className="space-y-1">
            {out.concerns.map((c) => (
              <li key={c} className="text-[12.5px] leading-relaxed text-amber-900">
                {c}
              </li>
            ))}
          </ul>
        </div>
      )}

      {out.files.map((f) => (
        <div
          key={f.path}
          className="mb-2 flex items-start justify-between gap-3 rounded-md border border-ink-200 bg-white px-3 py-2.5"
        >
          <div className="min-w-0">
            <p className="font-mono text-[12.5px] text-ink-900">{f.path}</p>
            <p className="mt-0.5 text-[12px] leading-relaxed text-ink-600">{f.purpose}</p>
            <p className="mt-1 font-mono text-[11px] text-ink-400">
              sha256 {f.sha256.slice(0, 16)}
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              onDownload(f.content, f.path, f.path.endsWith(".csv") ? "text/csv" : "text/markdown")
            }
            className="shrink-0 rounded-md border border-ink-200 px-2 py-1 text-[12px] text-ink-700 hover:border-ink-400"
          >
            <Download className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}

      <div className="mt-5 border-t border-ink-100 pt-4">
        <h3 className="mb-2 text-[12.5px] font-medium text-ink-700">Not in this pack</h3>
        <ul className="space-y-1">
          {out.notIncluded.map((n) => (
            <li key={n} className="text-[12px] leading-relaxed text-ink-500">
              {n}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
