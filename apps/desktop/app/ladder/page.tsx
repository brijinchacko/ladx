"use client";

import { api } from "@/lib/api";
import { localModels } from "@/lib/ask-model";
import { desktopAssistantStore } from "@/lib/assistant-store";
import { generateLadderLocally } from "@/lib/generate-ladder";
import { featuresList, projectHealth } from "@/lib/invoke";
import { tauriStorage } from "@/lib/ladder-storage";
import { LadderAi, LadxStudio, ladxProgramToIr } from "@ladx/studio";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

/**
 * Ladder, on the desktop.
 *
 * The same editor and the same scan engine as the cloud build. Only the store
 * differs, and that is injected rather than branched on, so there is one
 * editor to fix rather than two that drift.
 */
export default function LadderPage() {
  return (
    <Suspense fallback={<p className="p-6 text-[13px] text-ink-500">Loading…</p>}>
      <Ladder />
    </Suspense>
  );
}

function Ladder() {
  // A project named in the URL, from "Open the ladder program" in the HMI
  // editor. Arriving with one skips the picker: the caller has already
  // answered the only question it asks.
  const router = useRouter();
  const wanted = useSearchParams().get("project");

  /*
   * Whether looking a program over is switched on.
   *
   * Off is the normal answer, and then no menu item appears at all rather than
   * one that has to explain itself.
   */
  const [canAnalyse, setCanAnalyse] = useState(false);
  useEffect(() => {
    featuresList()
      .then((flags) =>
        setCanAnalyse(flags.some((f) => f.id === "engineering.analysis" && f.enabled)),
      )
      .catch(() => setCanAnalyse(false));
  }, []);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [projectId, setProjectId] = useState<string>(wanted ?? "scratch");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const rows = await api.listProjects();
        setProjects(rows.map((p) => ({ id: p.id, name: p.name })));
      } finally {
        setReady(true);
      }
    })();
  }, []);

  if (!ready) return <p className="p-6 text-[13px] text-ink-500">Loading…</p>;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-ink-100 bg-ink-50/60 px-3 py-2">
        <span className="text-[13px] text-ink-700">Program for</span>
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="rounded-md border border-ink-200 bg-white px-2 py-1 text-[13px] outline-none focus:border-ink-500"
        >
          <option value="scratch">No project (scratch)</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <span className="text-[12.5px] text-ink-400">
          Saved on this machine. Monitor runs it and Convert reads it.
        </span>
      </div>

      {/* Keyed on the project so switching remounts the editor with the other
          program rather than leaving the previous one on screen. */}
      <LadxStudio
        key={projectId}
        projectId={projectId}
        storage={tauriStorage()}
        /*
         * The ladder assistant, which this app did not have.
         *
         * It lived in the web app and posted to an API route, so bringing it
         * here would have meant a second copy of the prompt, including the
         * question it asks about the stop button. It is the same component
         * now, reaching a local model instead.
         */
        bottomDock={({ program, load }) => (
          <LadderAi
            memoryKey={`ladder:${projectId}`}
            getProgram={() => program}
            onProgram={(next) => load(next)}
            generate={generateLadderLocally}
            modelsUrl={localModels}
            store={desktopAssistantStore}
          />
        )}
        /*
         * The HMI built on this program's tags. The desktop has no server to
         * resolve which application that is, so the /hmi page does it once the
         * local list is in. It saves before it navigates either way.
         */
        /*
         * Routed rather than loaded.
         *
         * This is a static export, so "/hmi" is a path with no file behind it
         * and a full page load of it ends on the 404. The router knows the
         * route and keeps the shell, which is the only way back to anything.
         */
        navigate={(href) => router.push(href)}
        /*
         * The analysis runs in Rust over the IR, so the program goes across as
         * an IR document. That conversion loses nothing: every instruction the
         * editor can draw has a place in the IR.
         */
        analyse={
          canAnalyse
            ? {
                label: "Look this program over",
                run: async (program) => {
                  const report = await projectHealth(ladxProgramToIr(program));
                  return {
                    findings: report.findings.map((f) => ({
                      severity: f.severity,
                      title: f.title,
                      detail: f.detail,
                      at: f.locations
                        .map((l) =>
                          l.rung && l.pou ? `${l.pou}/${l.rung}` : (l.pou ?? l.tag ?? ""),
                        )
                        .filter(Boolean),
                    })),
                    notChecked: report.not_checked,
                  };
                },
              }
            : undefined
        }
        crossLinks={[
          {
            label: "HMI",
            href:
              projectId === "scratch" ? "/hmi" : `/hmi?project=${encodeURIComponent(projectId)}`,
            hint: "Build the operator screens for this program. They bind to the tag table you are editing here, so this saves first.",
          },
        ]}
      />
    </div>
  );
}
