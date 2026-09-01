"use client";

import { parseTagList } from "@/lib/ladder/tag-list";
import { ladxProgramToIr } from "@ladx/studio";
import type {
  Block,
  Change,
  Deviation,
  Drift,
  HardwareFinding,
  HardwareModule,
  NarrativeSection,
  Pack,
  ProposedScreen,
  Sequence,
  TestGroup,
} from "@ladx/types";
import {
  AlertTriangle,
  BookOpen,
  ClipboardCheck,
  Cpu,
  Download,
  GitCompare,
  Layers,
  MonitorCog,
  Package,
  Route,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type What =
  | "narrative"
  | "sequence"
  | "tests"
  | "deviations"
  | "screens"
  | "hardware"
  | "compare"
  | "drift"
  | "handover";

interface NarrativeOut {
  title: string;
  sections: NarrativeSection[];
  /** Statements the program could not answer, counted. */
  gaps: number;
  markdown: string;
}
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
interface ScreensOut {
  screens: ProposedScreen[];
  notes: string[];
}
interface HardwareOut {
  modules: HardwareModule[];
  notes: string[];
  findings: HardwareFinding[];
  breaking: number;
  table: string;
}
interface CompareOut {
  changes: Change[];
  notCompared: string[];
  worst: string | null;
}
interface DriftOut {
  drifts: Drift[];
  notes: string[];
  breaking: number;
  text: string;
}

const TABS: { what: What; label: string; icon: React.ReactNode; blurb: string }[] = [
  {
    what: "narrative",
    label: "Narrative",
    icon: <BookOpen className="h-4 w-4" />,
    blurb:
      "What the program does, in sentences, for somebody who cannot read ladder. Written from the logic, so it cannot disagree with it.",
  },
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
    what: "screens",
    label: "Screens",
    icon: <MonitorCog className="h-4 w-4" />,
    blurb:
      "A first cut of the operator interface, read from the program rather than asked of a model. A safety tag comes back as an indicator and never as a button.",
  },
  {
    what: "hardware",
    label: "Hardware",
    icon: <Cpu className="h-4 w-4" />,
    blurb:
      "The racks, from a full controller export, against what the program addresses. A card moved one slot leaves every address past it compiling and reading the wrong terminal.",
  },
  {
    what: "compare",
    label: "Compare",
    icon: <GitCompare className="h-4 w-4" />,
    blurb:
      "This program against an export pulled off the controller. What is on the machine that is not here, ranked by what it would do.",
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
  openOn,
}: {
  programs: { id: string; name: string; program: unknown }[];
  /**
   * The program to open on, when this was reached from a project.
   *
   * Null means it was reached from the sidebar, where there is no project and
   * the most recently touched program is the reasonable default.
   */
  openOn?: string | null;
}) {
  const [chosen, setChosen] = useState<string>(openOn ?? programs[0]?.id ?? "");
  const [what, setWhat] = useState<What>("narrative");
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
    // Two tabs wait for something the user has to supply. Running them on
    // arrival would answer a question nobody asked, with an error.
    if (what === "drift" && !pasted.trim()) {
      setData(null);
      setError(null);
      return;
    }
    // Hardware reads an uploaded export, not the program on screen: the module
    // list is not in a program.
    if (what === "hardware" || what === "compare") {
      setError(null);
      return;
    }
    void load(chosen, what);
  }, [chosen, what, load, pasted]);

  const compareWith = useCallback(
    async (file: File) => {
      const found = programs.find((p) => p.id === chosen);
      if (!found) return;
      setBusy(true);
      setError(null);
      setData(null);
      try {
        const body = new FormData();
        body.append("file", file);
        body.append(
          "project",
          JSON.stringify(ladxProgramToIr(found.program as Parameters<typeof ladxProgramToIr>[0])),
        );
        const res = await fetch("/api/ladder/compare", { method: "POST", body });
        const out = await res.json();
        if (!res.ok) throw new Error(out.error ?? "That file could not be compared.");
        setData(out);
      } catch (e) {
        setError(e instanceof Error ? e.message : "That file could not be compared.");
      } finally {
        setBusy(false);
      }
    },
    [programs, chosen],
  );

  const uploadHardware = useCallback(async (file: File) => {
    setBusy(true);
    setError(null);
    setData(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/ladder/hardware", { method: "POST", body });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error ?? "That file could not be read.");
      setData(out);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That file could not be read.");
    } finally {
      setBusy(false);
    }
  }, []);

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
      <div
        className={`mb-4 flex flex-wrap items-center gap-3 ${what === "hardware" ? "hidden" : ""}`}
      >
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

      {what === "compare" && (
        <div className="mb-5 rounded-md border border-ink-200 bg-ink-50/40 p-3">
          <label htmlFor="cmp" className="mb-1.5 block text-[12.5px] font-medium text-ink-700">
            The export from the controller
          </label>
          <p className="mb-2 text-[12px] leading-relaxed text-ink-500">
            An L5X pulled off the machine. It is compared against the program selected above, and
            the wording reads as what the machine has that this does not.
          </p>
          <input
            id="cmp"
            type="file"
            accept=".L5X,.l5x,.xml"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void compareWith(file);
            }}
            className="block w-full text-[12.5px] text-ink-700 file:mr-3 file:rounded-sm file:border file:border-ink-200 file:bg-white file:px-3 file:py-1.5 file:text-[12.5px] file:text-ink-700"
          />
        </div>
      )}

      {what === "hardware" && (
        <div className="mb-5 rounded-md border border-ink-200 bg-ink-50/40 p-3">
          <label htmlFor="l5x" className="mb-1.5 block text-[12.5px] font-medium text-ink-700">
            A full controller export
          </label>
          <p className="mb-2 text-[12px] leading-relaxed text-ink-500">
            An L5X exported from the controller, not from a single routine. Only a controller export
            carries the module list, and without it no address can be checked against a card.
          </p>
          <input
            id="l5x"
            type="file"
            accept=".L5X,.l5x,.xml"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void uploadHardware(file);
            }}
            className="block w-full text-[12.5px] text-ink-700 file:mr-3 file:rounded-sm file:border file:border-ink-200 file:bg-white file:px-3 file:py-1.5 file:text-[12.5px] file:text-ink-700"
          />
        </div>
      )}

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

      {what === "narrative" && data != null && (
        <NarrativeView out={data as NarrativeOut} onDownload={download} />
      )}
      {what === "sequence" && data != null && <SequenceView out={data as SequenceOut} />}
      {what === "tests" && data != null && (
        <TestsView out={data as TestsOut} onDownload={download} />
      )}
      {what === "deviations" && data != null && <DeviationsView out={data as DeviationsOut} />}
      {what === "screens" && data != null && <ScreensView out={data as ScreensOut} />}
      {what === "hardware" && data != null && <HardwareView out={data as HardwareOut} />}
      {what === "hardware" && data == null && !busy && !error && (
        <Empty>
          Choose a controller export above and its racks are checked against the program in it.
        </Empty>
      )}
      {what === "compare" && data != null && <CompareView out={data as CompareOut} />}
      {what === "compare" && data == null && !busy && !error && (
        <Empty>Choose an export from the controller and it is compared against this program.</Empty>
      )}
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

function NarrativeView({
  out,
  onDownload,
}: {
  out: NarrativeOut;
  onDownload: (t: string, n: string) => void;
}) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[12.5px] text-ink-500">
          {out.sections.length} section{out.sections.length === 1 ? "" : "s"}
          {out.gaps > 0 && `, ${out.gaps} needing an engineer`}
        </p>
        <button
          type="button"
          onClick={() => onDownload(out.markdown, "control-narrative.md")}
          className="flex items-center gap-1.5 rounded-md border border-ink-200 px-2 py-1 text-[12px] text-ink-700 hover:border-ink-400"
        >
          <Download className="h-3.5 w-3.5" />
          Download
        </button>
      </div>
      {out.sections.map((s) => (
        <div key={s.heading} className="mb-3 rounded-md border border-ink-200 bg-white p-4">
          <h3 className="mb-1.5 text-[13.5px] font-medium text-ink-900">{s.heading}</h3>
          {s.paragraphs.length === 0 && s.needs_engineer.length === 0 ? (
            <p className="text-[12.5px] text-ink-500">Nothing in the program to write here.</p>
          ) : (
            <ul className="space-y-1.5">
              {s.paragraphs.map((line) => (
                <li key={line.text} className="text-[13px] leading-relaxed text-ink-700">
                  {line.text}
                  {line.from.length > 0 && (
                    <span className="ml-2 font-mono text-[11.5px] text-ink-400">
                      {line.from.join(", ")}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {/* Written into the document rather than left out, so a gap is
              visible to whoever has to fill it. */}
          {s.needs_engineer.length > 0 && (
            <ul className="mt-2 space-y-1 border-t border-ink-100 pt-2">
              {s.needs_engineer.map((q) => (
                <li key={q} className="text-[12.5px] leading-relaxed text-amber-800">
                  Needs an engineer: {q}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
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

function ScreensView({ out }: { out: ScreensOut }) {
  if (out.screens.length === 0) {
    return (
      <div>
        <Empty>
          Nothing in this program is wired to the plant, so there is nothing to show an operator.
        </Empty>
        <Notes notes={out.notes} />
      </div>
    );
  }
  return (
    <div>
      {out.screens.map((screen) => (
        <div key={screen.name} className="mb-4 rounded-md border border-ink-200 bg-white p-4">
          <h3 className="text-[13.5px] font-medium text-ink-900">{screen.name}</h3>
          <p className="mb-3 text-[12.5px] text-ink-500">{screen.purpose}</p>
          <ul className="space-y-2">
            {screen.bindings.map((b) => (
              <li key={b.tag} className="text-[13px] text-ink-700">
                <span className="font-mono text-[12px] text-ink-900">{b.tag}</span>
                <span className="ml-2 rounded bg-ink-100 px-1.5 py-0.5 text-[11px] text-ink-700">
                  {b.control}
                </span>
                {b.label && <span className="ml-2 text-ink-600">{b.label}</span>}
                <p className="mt-0.5 text-[12px] leading-relaxed text-ink-500">{b.because}</p>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <Notes notes={out.notes} />
    </div>
  );
}

function HardwareView({ out }: { out: HardwareOut }) {
  if (out.modules.length === 0) {
    return (
      <div>
        <Empty>No module list in that file.</Empty>
        <Notes notes={out.notes} />
      </div>
    );
  }
  return (
    <div>
      <p className="mb-3 text-[12.5px] text-ink-500">
        {out.modules.length} module{out.modules.length === 1 ? "" : "s"}
        {out.breaking > 0
          ? `, and ${out.breaking} address${out.breaking === 1 ? "" : "es"} that read the wrong terminal`
          : ". Every address lands on a card that is in the racks."}
      </p>

      <div className="mb-4 overflow-x-auto rounded-md border border-ink-200 bg-white">
        <table className="w-full text-[12.5px]">
          <thead className="border-b border-ink-100 text-left text-ink-500">
            <tr>
              <th className="px-3 py-2 font-medium">Slot</th>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Catalogue</th>
              <th className="px-3 py-2 font-medium">Type</th>
              <th className="px-3 py-2 font-medium">Points</th>
              <th className="px-3 py-2 font-medium">Revision</th>
            </tr>
          </thead>
          <tbody>
            {[...out.modules]
              .sort((a, b) => (a.slot ?? 999) - (b.slot ?? 999))
              .map((m) => (
                <tr key={m.name} className="border-b border-ink-50 last:border-0">
                  <td className="px-3 py-1.5 font-mono tabular-nums text-ink-900">
                    {m.slot ?? "-"}
                  </td>
                  <td className="px-3 py-1.5 text-ink-900">
                    {m.name}
                    {m.inhibited && (
                      <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-900">
                        inhibited
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 font-mono text-ink-600">{m.catalog ?? "-"}</td>
                  <td className="px-3 py-1.5 text-ink-600">{m.kind}</td>
                  <td className="px-3 py-1.5 tabular-nums text-ink-600">{m.points ?? "-"}</td>
                  <td className="px-3 py-1.5 tabular-nums text-ink-600">{m.revision ?? "-"}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {out.findings.map((f) => (
        <div
          key={f.detail}
          className={`mb-2 rounded-md border px-3 py-2 ${
            f.issue === "moduleUnused" ? "border-ink-200 bg-white" : "border-amber-200 bg-amber-50"
          }`}
        >
          <p className="text-[13px] leading-relaxed text-ink-800">{f.detail}</p>
        </div>
      ))}
      <Notes notes={out.notes} />
    </div>
  );
}

function CompareView({ out }: { out: CompareOut }) {
  if (out.changes.length === 0) {
    return (
      <div>
        <Empty>Nothing differs. The machine is running this program.</Empty>
        <Notes notes={out.notCompared} />
      </div>
    );
  }
  // Safety first, then by how much it would do, because a list sorted by file
  // order buries the one thing somebody needed to see.
  const rank: Record<string, number> = { safety: 0, high: 1, medium: 2, low: 3 };
  const sorted = [...out.changes].sort((a, b) => (rank[a.risk] ?? 9) - (rank[b.risk] ?? 9));
  return (
    <div>
      <p className="mb-3 text-[12.5px] text-ink-500">
        {out.changes.length} difference{out.changes.length === 1 ? "" : "s"}
        {out.worst && `, the most serious ranked ${out.worst}`}.
      </p>
      {sorted.map((c) => (
        <div
          key={c.summary}
          className={`mb-2 rounded-md border px-3 py-2 ${
            c.risk === "safety"
              ? "border-red-200 bg-red-50"
              : c.risk === "high"
                ? "border-amber-200 bg-amber-50"
                : "border-ink-200 bg-white"
          }`}
        >
          <span
            className={`mr-2 rounded px-1.5 py-0.5 text-[11px] font-medium ${
              c.risk === "safety" ? "bg-red-200 text-red-900" : "bg-ink-100 text-ink-700"
            }`}
          >
            {c.risk}
          </span>
          <span className="text-[13px] leading-relaxed text-ink-800">{c.summary}</span>
          {c.at.length > 0 && (
            <span className="ml-2 font-mono text-[11.5px] text-ink-400">{c.at.join(", ")}</span>
          )}
        </div>
      ))}
      <Notes notes={out.notCompared} />
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
