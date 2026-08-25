"use client";

import GanttChart, { type GanttGroup, type Zoom, ZOOM } from "@/components/studio/gantt-chart";
import type { GanttTask } from "@/lib/platform/gantt";
import { PHASES } from "@/lib/platform/lifecycle";
import { CalendarRange, Loader2, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

interface ProjectRow {
  id: string;
  name: string;
  code: string | null;
  clientId: string | null;
  phase: string;
}

const PHASE_LABEL = new Map(PHASES.map((p) => [p.id as string, p.name]));

/**
 * The planner as a standalone tool.
 *
 * Grouped by project when looking across the book of work, and by lifecycle
 * phase when narrowed to one, because those are the two questions people
 * actually arrive with: "what is happening this month" and "what is left on
 * this job". Filtering by client is the third, and it is one query away since
 * every project already carries its client.
 */
export default function PlannerWorkspace({
  projects,
  clients,
  tasks,
  initialProjectId,
  initialClientId,
}: {
  projects: ProjectRow[];
  clients: { id: string; name: string }[];
  tasks: (GanttTask & { projectId: string })[];
  initialProjectId?: string | null;
  initialClientId?: string | null;
}) {
  const router = useRouter();
  const [zoom, setZoom] = useState<Zoom>("week");
  const [projectId, setProjectId] = useState<string>(initialProjectId ?? "");
  const [clientId, setClientId] = useState<string>(initialClientId ?? "");
  const [hideDone, setHideDone] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const visibleProjects = useMemo(
    () => (clientId ? projects.filter((p) => p.clientId === clientId) : projects),
    [projects, clientId],
  );

  const shown = useMemo(() => {
    const ids = new Set(visibleProjects.map((p) => p.id));
    return tasks.filter(
      (t) =>
        ids.has(t.projectId) &&
        (!projectId || t.projectId === projectId) &&
        (!hideDone || t.status !== "done"),
    );
  }, [tasks, visibleProjects, projectId, hideDone]);

  // One project: group by phase, which is the shape of the job. Several: group
  // by project, because phase names repeat across them and would interleave.
  const groups: GanttGroup[] = useMemo(() => {
    if (projectId) {
      return PHASES.map((p) => ({
        key: p.id,
        label: p.name,
        tasks: shown.filter((t) => t.phase === p.id),
      })).filter((g) => g.tasks.length > 0);
    }
    return visibleProjects
      .map((p) => ({
        key: p.id,
        label: p.code ? `${p.name} · ${p.code}` : p.name,
        tasks: shown.filter((t) => t.projectId === p.id),
      }))
      .filter((g) => g.tasks.length > 0);
  }, [projectId, visibleProjects, shown]);

  const undated = shown.filter((t) => !t.startsOn && !t.dueOn).length;

  async function patch(taskId: string, body: Record<string, unknown>) {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    setBusy(true);
    try {
      await fetch(`/api/projects/${task.projectId}/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const selectedTask = selected ? tasks.find((t) => t.id === selected) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-ink-100 bg-ink-50/60 px-3 py-2">
        <CalendarRange className="h-3.5 w-3.5 shrink-0 text-teal-600" />

        <select
          value={clientId}
          onChange={(e) => {
            setClientId(e.target.value);
            setProjectId("");
          }}
          className={select}
        >
          <option value="">All clients</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className={select}>
          <option value="">
            All projects{visibleProjects.length ? ` (${visibleProjects.length})` : ""}
          </option>
          {visibleProjects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        <div className="flex overflow-hidden rounded-md border border-ink-200">
          {(Object.keys(ZOOM) as Zoom[]).map((z) => (
            <button
              key={z}
              type="button"
              onClick={() => setZoom(z)}
              className={`px-2 py-1 text-[12px] transition-colors ${
                zoom === z ? "bg-ink-900 text-white" : "bg-white text-ink-600 hover:bg-ink-50"
              }`}
            >
              {ZOOM[z].label}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-1.5 text-[12.5px] text-ink-600">
          <input
            type="checkbox"
            checked={hideDone}
            onChange={(e) => setHideDone(e.target.checked)}
            className="h-3 w-3"
          />
          Hide done
        </label>

        {undated > 0 && (
          <span className="text-[12px] text-ink-400">
            {undated} undated, so {undated === 1 ? "it is" : "they are"} not on the timeline
          </span>
        )}

        {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-ink-400" />}

        {projectId && (
          <Link
            href={`/studio/projects/${projectId}?phase=summary`}
            className="ml-auto text-[12.5px] text-ink-600 hover:text-teal-700"
          >
            Open the project →
          </Link>
        )}
      </div>

      {selectedTask && (
        <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-ink-100 px-3 py-2">
          <span className="text-[13px] font-medium text-ink-900">{selectedTask.title}</span>
          {!projectId && selectedTask.projectName && (
            <span className="font-mono text-[11px] text-ink-400">{selectedTask.projectName}</span>
          )}
          <span className="font-mono text-[11px] text-ink-400">
            {PHASE_LABEL.get(selectedTask.phase) ?? selectedTask.phase}
          </span>
          <label className="flex items-center gap-1.5 text-[12px] text-ink-500">
            Starts
            <input
              type="date"
              value={dateInput(selectedTask.startsOn)}
              onChange={(e) => patch(selectedTask.id, { startsOn: e.target.value || null })}
              className={dateBox}
            />
          </label>
          <label className="flex items-center gap-1.5 text-[12px] text-ink-500">
            Due
            <input
              type="date"
              value={dateInput(selectedTask.dueOn)}
              onChange={(e) => patch(selectedTask.id, { dueOn: e.target.value || null })}
              className={dateBox}
            />
          </label>
          <select
            value={selectedTask.status}
            onChange={(e) => patch(selectedTask.id, { status: e.target.value })}
            className={select}
          >
            <option value="todo">To do</option>
            <option value="doing">Doing</option>
            <option value="blocked">Blocked</option>
            <option value="done">Done</option>
          </select>
          <input
            defaultValue={selectedTask.owner ?? ""}
            placeholder="Owner"
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v !== (selectedTask.owner ?? "")) patch(selectedTask.id, { owner: v || null });
            }}
            className={`${dateBox} w-28`}
          />
          {(selectedTask.startsOn || selectedTask.dueOn) && (
            <button
              type="button"
              title="Take it off the timeline"
              onClick={() => patch(selectedTask.id, { startsOn: null, dueOn: null })}
              className="flex items-center gap-1 text-[12px] text-ink-400 hover:text-ink-700"
            >
              <RotateCcw className="h-3 w-3" />
              Unschedule
            </button>
          )}
          <button
            type="button"
            onClick={() => setSelected(null)}
            className="ml-auto text-[12px] text-ink-400 hover:text-ink-700"
          >
            Close
          </button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {groups.length === 0 ? (
          <div className="flex h-full items-center justify-center p-8">
            <div className="max-w-sm text-center">
              <CalendarRange className="mx-auto mb-3 h-6 w-6 text-ink-300" />
              <h2 className="font-display text-[15px] font-bold text-ink-900">
                Nothing to plan yet
              </h2>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-500">
                {projects.length === 0
                  ? "Start a project, and its plan is generated from the lifecycle."
                  : "Open a project's Summary and press Build the plan. It lays the deliverables out on working days, and you drag them from there."}
              </p>
              {projects[0] && (
                <Link
                  href={`/studio/projects/${projects[0].id}?phase=summary`}
                  className="mt-4 inline-block rounded-md bg-ink-900 px-4 py-2 text-[13.5px] font-medium text-white transition-opacity hover:opacity-90"
                >
                  Open a project
                </Link>
              )}
            </div>
          </div>
        ) : (
          <GanttChart
            groups={groups}
            zoom={zoom}
            selectedId={selected}
            onSelect={setSelected}
            onReschedule={(id, startsOn, dueOn) => patch(id, { startsOn, dueOn })}
            onLink={(id, dependsOn) => patch(id, { dependsOn })}
          />
        )}
      </div>
    </div>
  );
}

const select =
  "rounded-md border border-ink-200 bg-white px-2 py-1 text-[12.5px] outline-none focus:border-ink-500";
const dateBox =
  "rounded-md border border-ink-200 bg-white px-1.5 py-0.5 text-[12px] outline-none focus:border-ink-500";

/**
 * What a date input wants.
 *
 * These are already yyyy-mm-dd calendar dates out of the database, so this is
 * a pass-through. It exists so nothing is tempted to route them through a Date
 * on the way to the input, which is what used to move them a day.
 */
function dateInput(value: string | null): string {
  return value ?? "";
}
