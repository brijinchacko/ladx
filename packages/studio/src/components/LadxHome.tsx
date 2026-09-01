"use client";

import { ClipboardList, FileCode2, Loader2, Plus, Sparkles, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { LadxFrame, LadxMark } from "./LadxLogo";
import LadxStudio from "./LadxStudio";

/** Project list and worked examples, the way into the studio. */

const LIVE = "#35B6BB";
/** How many recent programs the home screen shows before "All". */
const RECENT = 6;

type Project = {
  id: string;
  name: string;
  description: string | null;
  updatedAt: string;
  /** What is in it, so a tile is worth reading. */
  networks?: number;
  tags?: number;
  routines?: number;
};
type Starter = { key: string; name: string; description: string };
type Exercise = {
  id: string;
  title: string;
  brief: string;
  marks: number;
  passPercent: number;
  platformLabel: string | null;
  phaseNumber: number | null;
  awaitingMarking: boolean;
  marksAwarded: number | null;
  passed: boolean;
  feedback: string | null;
  markedBy: string | null;
  attempts: number;
};

export default function LadxHome() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [starters, setStarters] = useState<Starter[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  async function reallyRemove(id: string) {
    setPendingDelete(null);
    await fetch(`/api/student/ladx/${id}`, { method: "DELETE" });
    await load();
  }
  /**
   * Which project is open, kept in the URL rather than in state alone.
   *
   * It was state only, so a refresh, or a restored tab, or a link to your own
   * work, dropped you back at the project list with no way to tell which one
   * you had been in. A student mid-exercise who reloads should land back in
   * their program, not at the front door.
   *
   * Initialised from the query string during the first render, so the studio
   * mounts straight away instead of flashing the list first.
   */
  const [openId, setOpenIdState] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get("project");
  });

  /** Open or close a project, keeping the address bar in step. */
  const setOpenId = useCallback((id: string | null) => {
    setOpenIdState(id);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("project", id);
    else url.searchParams.delete("project");
    // pushState, not replaceState: Back should leave the project the same way
    // the Projects button does, which is what the browser button now means.
    window.history.pushState({ ladxProject: id }, "", url.toString());
  }, []);

  // The browser's Back and Forward buttons move between the list and a
  // project, because the URL says which one is open.
  useEffect(() => {
    function onPop() {
      const id = new URLSearchParams(window.location.search).get("project");
      setOpenIdState(id);
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const load = useCallback(async () => {
    try {
      const [res, exRes] = await Promise.all([
        fetch("/api/student/ladx"),
        fetch("/api/student/ladx-exercises"),
      ]);
      if (res.ok) {
        const d = await res.json();
        setProjects(
          [...(d.projects ?? [])].sort(
            (a: Project, b: Project) =>
              new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
          ),
        );
        setStarters(d.starters ?? []);
      }
      if (exRes.ok) {
        const e = await exRes.json();
        setExercises(e.exercises ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function create(starter?: string) {
    setBusy(starter ?? "blank");
    try {
      const res = await fetch("/api/student/ladx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(starter ? { starter } : { name: "Untitled" }),
      });
      const d = await res.json();
      if (res.ok) setOpenId(d.id);
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    // Not window.confirm: it drops the page out of fullscreen in Chrome,
    // because the browser will not paint its own dialog over a fullscreen
    // element. Deleting a project should not close the editor.
    setPendingDelete(id);
  }

  // ONE frame, mounted once and never swapped. Home and the studio used to
  // render a frame each, so opening a project unmounted one and mounted
  // another: and an element that leaves the DOM takes fullscreen with it.
  // That is exactly why fullscreen dropped on "New program" and on "Projects".
  return (
    <LadxFrame>
      {openId ? (
        <LadxStudio
          projectId={openId}
          exercises={exercises.filter((e) => !e.passed)}
          onBack={() => {
            setOpenId(null);
            load();
          }}
        />
      ) : loading ? (
        <p className="flex items-center gap-2 p-10 text-sm text-ink-500">
          <Loader2 size={14} className="animate-spin" /> Loading…
        </p>
      ) : (
        <div className="space-y-6 p-4">
          {exercises.length > 0 && (
            <section>
              <h2 className="flex items-center gap-1.5 text-sm font-bold text-ink-900 mb-1">
                <ClipboardList size={14} style={{ color: LIVE }} /> Set by your trainer
              </h2>
              <p className="text-[12px] text-ink-500 mb-2.5 max-w-[68ch]">
                Build the answer in a project, then submit it from inside the editor. Your trainer
                marks it by hand.
              </p>
              <div className="space-y-2">
                {exercises.map((e) => (
                  <div key={e.id} className="rounded-xl border border-ink-100 bg-white p-3.5">
                    <div className="flex items-start gap-3 flex-wrap">
                      <div className="min-w-0 flex-1">
                        <p className="text-[13.5px] font-semibold text-ink-900">{e.title}</p>
                        <p className="text-[11px] text-ink-500 mt-0.5">
                          {e.marks} marks · pass {e.passPercent}%
                          {e.phaseNumber != null && ` · Phase ${e.phaseNumber}`}
                          {e.platformLabel && ` · ${e.platformLabel}`}
                        </p>
                        <p className="text-[12px] text-ink-700 mt-1.5 leading-relaxed max-w-[70ch] whitespace-pre-wrap">
                          {e.brief}
                        </p>
                        {e.feedback && (
                          <p
                            className="mt-2 text-[12px] text-ink-700 border-l-2 pl-2.5"
                            style={{ borderColor: LIVE }}
                          >
                            {e.feedback}
                            {e.markedBy && (
                              <span className="block text-[10.5px] text-ink-500 mt-0.5">
                                , {e.markedBy}
                              </span>
                            )}
                          </p>
                        )}
                      </div>
                      <span className="shrink-0">
                        {e.passed ? (
                          <span className="text-[11.5px] font-bold px-2.5 py-1 rounded-full bg-success/12 text-success">
                            Passed {e.marksAwarded}/{e.marks}
                          </span>
                        ) : e.awaitingMarking ? (
                          <span className="text-[11.5px] font-semibold px-2.5 py-1 rounded-full bg-warning/15 text-warning">
                            Being marked
                          </span>
                        ) : e.marksAwarded != null ? (
                          <span className="text-[11.5px] font-semibold px-2.5 py-1 rounded-full bg-danger/12 text-danger">
                            {e.marksAwarded}/{e.marks}, try again
                          </span>
                        ) : (
                          <span className="text-[11.5px] text-ink-500">Not attempted</span>
                        )}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section>
            <div className="flex items-center justify-between mb-2.5">
              <h2 className="text-sm font-bold text-ink-900">Recent</h2>
              <div className="flex items-center gap-2">
                {projects.length > RECENT && (
                  <button
                    type="button"
                    onClick={() => setShowAll((v) => !v)}
                    className="text-[11.5px] text-ink-500 hover:text-ink-900"
                  >
                    {showAll ? "Show recent" : `All ${projects.length}`}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => create()}
                  disabled={busy !== null}
                  className="flex items-center gap-1.5 px-3 h-8 rounded-lg text-[12.5px] font-bold text-on-accent disabled:opacity-50"
                  style={{ background: LIVE }}
                >
                  {busy === "blank" ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Plus size={12} />
                  )}
                  New program
                </button>
              </div>
            </div>

            {projects.length === 0 ? (
              <div className="rounded-xl border border-ink-100 bg-white px-5 py-8 text-center">
                <FileCode2 size={22} className="mx-auto mb-2 text-ink-500/50" />
                <p className="text-[13px] text-ink-700">Nothing saved yet.</p>
                <p className="text-[11.5px] text-ink-500 mt-1">
                  Start from a worked example below, it is quicker than an empty grid.
                </p>
              </div>
            ) : (
              /* Tiles, most recent first, capped at six. A student who has been
             experimenting has thirty "Untitled" programs, and a wall of them
             buries the one they actually want. */
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {(showAll ? projects : projects.slice(0, RECENT)).map((p) => (
                  <div
                    key={p.id}
                    className="group relative rounded-lg border border-ink-100 bg-white hover:border-teal-500/50 transition-colors"
                  >
                    <button
                      type="button"
                      onClick={() => setOpenId(p.id)}
                      className="w-full text-left px-3 py-2.5"
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <LadxMark size={22} />
                        <span className="min-w-0">
                          <span className="block text-[12.5px] font-semibold text-ink-900 truncate">
                            {p.name || "Untitled"}
                          </span>
                          <span className="block text-[10.5px] text-ink-500">
                            {/*
                          What is in it, then when it was touched. Thirty tiles
                          reading "Untitled" and a date are thirty tiles you
                          have to open to tell apart.
                        */}
                            {p.networks != null
                              ? `${p.networks} network${p.networks === 1 ? "" : "s"} · ${p.tags ?? 0} tag${p.tags === 1 ? "" : "s"}`
                              : "-"}
                          </span>
                          <span className="block text-[10px] text-ink-400">
                            {new Date(p.updatedAt).toLocaleDateString(undefined, {
                              day: "numeric",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(p.id)}
                      className="absolute top-1 right-1 hidden group-hover:block text-ink-500 hover:text-danger p-1"
                      aria-label={`Delete ${p.name || "Untitled"}`}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="flex items-center gap-1.5 text-sm font-bold text-ink-900 mb-1">
              <Sparkles size={14} style={{ color: LIVE }} /> Worked examples
            </h2>
            <p className="text-[12px] text-ink-500 mb-2.5 max-w-[68ch]">
              Complete, running programs from the course. Open one, press Run, then take it apart,
              you get your own copy, so nothing you do here affects the original.
            </p>
            <div className="grid sm:grid-cols-2 gap-2">
              {starters.map((s) => (
                <button
                  type="button"
                  key={s.key}
                  onClick={() => create(s.key)}
                  disabled={busy !== null}
                  className="text-left rounded-xl border border-ink-100 bg-white p-3.5 hover:border-teal-500/40 transition-colors disabled:opacity-50"
                >
                  <span className="flex items-center gap-1.5">
                    {busy === s.key && <Loader2 size={11} className="animate-spin" />}
                    <span className="text-[13px] font-semibold text-ink-900">{s.name}</span>
                  </span>
                  <span className="block text-[11.5px] text-ink-500 mt-1 leading-relaxed">
                    {s.description}
                  </span>
                </button>
              ))}
            </div>
          </section>
        </div>
      )}

      {pendingDelete && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl border border-ink-100 bg-white p-4">
            <p className="text-[14px] font-bold text-ink-900">Delete this project?</p>
            <p className="text-[12.5px] text-ink-700 mt-1">This cannot be undone.</p>
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                className="px-3 h-9 rounded-lg border border-ink-100 text-[12.5px] font-semibold text-ink-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => reallyRemove(pendingDelete)}
                className="px-3 h-9 rounded-lg text-[12.5px] font-bold text-white"
                style={{ background: "#B3382C" }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </LadxFrame>
  );
}
