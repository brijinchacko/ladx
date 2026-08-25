"use client";

import GanttChart from "@/components/studio/gantt-chart";
import { ACTIVE_PHASES } from "@/lib/platform/lifecycle";
import {
  CalendarDays,
  Check,
  CircleDashed,
  CirclePlay,
  Loader2,
  OctagonAlert,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

export type TaskStatus = "todo" | "doing" | "blocked" | "done";

export interface PlannerTask {
  id: string;
  title: string;
  detail: string | null;
  phase: string;
  status: TaskStatus;
  owner: string | null;
  startsOn: string | null;
  dueOn: string | null;
  dependsOn: string | null;
  templateSlug: string | null;
  position: number;
}

const STATUS: Record<TaskStatus, { label: string; icon: typeof Check; className: string }> = {
  todo: { label: "To do", icon: CircleDashed, className: "text-ink-400" },
  doing: { label: "Doing", icon: CirclePlay, className: "text-teal-600" },
  blocked: { label: "Blocked", icon: OctagonAlert, className: "text-[#B4531A]" },
  done: { label: "Done", icon: Check, className: "text-teal-700" },
};

const ORDER: TaskStatus[] = ["todo", "doing", "blocked", "done"];

/**
 * The plan for one project.
 *
 * The lifecycle already says what a project has to produce. This says when, by
 * whom, and whether it happened, which is the part that decides whether a
 * handover date is real.
 *
 * Grouped by lifecycle phase rather than by date, because that is how the work
 * is actually shaped: everything in design blocks everything in factory test,
 * and a flat list by due date hides that. Started deliverables are marked from
 * the documents that exist, so the plan and the pack cannot quietly disagree
 * about whether the FDS was written, but nothing is forced: a task can be
 * ticked by hand whether or not a document exists, because plenty of the work
 * on a real job produces no document at all.
 */
/**
 * Past its date, decided on calendar days.
 *
 * yyyy-mm-dd strings compare correctly with `<`, and doing it that way avoids
 * routing a calendar date through a Date, which parses it as UTC midnight. A
 * task due today would otherwise turn red at 01:00 BST on the morning it is
 * due, which is not what "overdue" means to anybody.
 */
function isOverdue(dueOn: string | null, status: string): boolean {
  if (!dueOn || status === "done") return false;
  const n = new Date();
  const today = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
  return dueOn.slice(0, 10) < today;
}

export default function ProjectPlanner({
  projectId,
  tasks,
  startedSlugs,
  clientName,
}: {
  projectId: string;
  tasks: PlannerTask[];
  /** Deliverables that already have a document, from the project itself. */
  startedSlugs: string[];
  clientName: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "timeline">("list");
  const [scheduling, setScheduling] = useState(false);

  const undatedCount = tasks.filter((t) => !t.startsOn && !t.dueOn).length;

  /**
   * Put the undated part of an existing plan on the calendar.
   *
   * Seeding refuses once a plan exists, so a plan made before the seed started
   * dating its work had no way onto the timeline except typing two dates per
   * task. This lays the same working-day draft over only the tasks that have
   * none, so hand-set dates survive.
   */
  async function scheduleUndated() {
    setScheduling(true);
    try {
      await fetch(`/api/projects/${projectId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schedule: true }),
      });
      router.refresh();
    } finally {
      setScheduling(false);
    }
  }
  const [draft, setDraft] = useState("");

  const started = useMemo(() => new Set(startedSlugs), [startedSlugs]);

  const byPhase = useMemo(() => {
    const map = new Map<string, PlannerTask[]>();
    for (const t of tasks) {
      const list = map.get(t.phase) ?? [];
      list.push(t);
      map.set(t.phase, list);
    }
    return map;
  }, [tasks]);

  const done = tasks.filter((t) => t.status === "done").length;
  const overdue = tasks.filter((t) => isOverdue(t.dueOn, t.status)).length;

  async function patch(id: string, body: Record<string, unknown>) {
    setBusy(id);
    try {
      await fetch(`/api/projects/${projectId}/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function add(phase: string) {
    const title = draft.trim();
    if (!title) {
      setAdding(null);
      return;
    }
    setBusy(`add-${phase}`);
    try {
      await fetch(`/api/projects/${projectId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, phase }),
      });
      setDraft("");
      setAdding(null);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function seed() {
    setBusy("seed");
    try {
      await fetch(`/api/projects/${projectId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seed: true }),
      });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string, title: string) {
    if (!window.confirm(`Remove "${title}" from the plan?`)) return;
    setBusy(id);
    try {
      await fetch(`/api/projects/${projectId}/tasks/${id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  if (tasks.length === 0) {
    return (
      <section className="rounded-md border border-dashed border-ink-200 px-6 py-10 text-center">
        <CalendarDays className="mx-auto mb-3 h-6 w-6 text-ink-300" />
        <h2 className="font-display text-[15px] font-bold text-ink-900">No plan yet</h2>
        <p className="mx-auto mt-1.5 max-w-md text-[13.5px] leading-relaxed text-ink-500">
          The lifecycle already knows what this project has to produce. Building the plan from it
          gives you a task for every deliverable, in phase order, which you can then own, date and
          add to.
        </p>
        <button
          type="button"
          onClick={seed}
          disabled={busy === "seed"}
          className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-ink-900 px-4 py-2 text-[13.5px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {busy === "seed" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          Build the plan from the lifecycle
        </button>
      </section>
    );
  }

  const ganttGroups = ACTIVE_PHASES.map((phase) => ({
    key: phase.id,
    label: phase.name,
    tasks: (byPhase.get(phase.id) ?? []).map((t) => ({
      id: t.id,
      title: t.title,
      phase: t.phase,
      status: t.status,
      startsOn: t.startsOn,
      dueOn: t.dueOn,
      dependsOn: t.dependsOn,
      owner: t.owner,
    })),
  })).filter((g) => g.tasks.length > 0);

  return (
    <section className="rounded-md border border-ink-200 bg-white">
      <header className="flex flex-wrap items-center gap-4 border-b border-ink-100 bg-ink-50/60 px-5 py-3.5">
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-[15px] font-bold text-ink-900">Plan</h2>
          <p className="mt-0.5 text-[12.5px] leading-snug text-ink-500">
            {clientName ? `For ${clientName}. ` : ""}
            {done} of {tasks.length} done
            {overdue > 0 ? `, ${overdue} past its date` : ""}.
          </p>
        </div>

        {/* Two readings of one plan: the list is what is left, the timeline is
            when it happens. Both edit the same rows. */}
        <div className="flex shrink-0 overflow-hidden rounded-md border border-ink-200">
          {(["list", "timeline"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`px-2.5 py-1 text-[12px] capitalize transition-colors ${
                view === v ? "bg-ink-900 text-white" : "bg-white text-ink-600 hover:bg-ink-50"
              }`}
            >
              {v}
            </button>
          ))}
        </div>

        <div className="h-1 w-32 shrink-0 overflow-hidden rounded-full bg-ink-200">
          <div
            className="h-full rounded-full bg-teal-600 transition-all"
            style={{ width: `${Math.round((done / tasks.length) * 100)}%` }}
          />
        </div>
      </header>

      {view === "timeline" && undatedCount > 0 && (
        <div className="flex flex-wrap items-center gap-3 border-b border-amber-200 bg-amber-50 px-5 py-2">
          <span className="text-[12.5px] text-amber-900">
            {undatedCount} task{undatedCount === 1 ? " has" : "s have"} no dates, so{" "}
            {undatedCount === 1 ? "it is" : "they are"} not on the timeline.
          </span>
          <button
            type="button"
            disabled={scheduling}
            onClick={scheduleUndated}
            className="rounded-md bg-ink-900 px-3 py-1 text-[12.5px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {scheduling ? "Scheduling…" : "Lay them out on working days"}
          </button>
          <span className="text-[11.5px] text-amber-800/70">
            A draft to drag into shape. Anything already dated is left alone.
          </span>
        </div>
      )}

      {view === "timeline" && (
        <div className="border-b border-ink-100">
          {ganttGroups.length > 0 ? (
            <GanttChart
              groups={ganttGroups}
              zoom="week"
              onReschedule={(id, startsOn, dueOn) => patch(id, { startsOn, dueOn })}
              onLink={(id, dependsOn) => patch(id, { dependsOn })}
            />
          ) : (
            <p className="px-5 py-6 text-[13px] text-ink-500">Nothing to draw yet.</p>
          )}
        </div>
      )}

      <div className={view === "timeline" ? "hidden" : "divide-y divide-ink-100"}>
        {ACTIVE_PHASES.map((phase) => {
          const items = (byPhase.get(phase.id) ?? []).slice().sort((a, b) => {
            const s = ORDER.indexOf(a.status) - ORDER.indexOf(b.status);
            return s !== 0 ? s : a.position - b.position;
          });
          if (items.length === 0 && adding !== phase.id) {
            return (
              <div key={phase.id} className="flex items-center gap-2 px-5 py-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-300">
                  {phase.name}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setAdding(phase.id);
                    setDraft("");
                  }}
                  className="text-[11.5px] text-ink-400 transition-colors hover:text-ink-900"
                >
                  add a task
                </button>
              </div>
            );
          }

          return (
            <div key={phase.id} className="px-5 py-3">
              <div className="mb-1.5 flex items-center gap-2">
                <h3 className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-400">
                  {phase.name}
                </h3>
                <span className="font-mono text-[9.5px] tabular-nums text-ink-300">
                  {items.filter((t) => t.status === "done").length}/{items.length}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setAdding(phase.id);
                    setDraft("");
                  }}
                  aria-label={`Add a task to ${phase.name}`}
                  className="ml-auto flex h-5 w-5 items-center justify-center rounded text-ink-300 transition-colors hover:bg-ink-100 hover:text-ink-900"
                >
                  <Plus className="h-3 w-3" />
                </button>
              </div>

              <ul className="space-y-px">
                {items.map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    projectId={projectId}
                    hasDocument={Boolean(t.templateSlug && started.has(t.templateSlug))}
                    busy={busy === t.id}
                    onStatus={(status) => patch(t.id, { status })}
                    onOwner={(owner) => patch(t.id, { owner })}
                    onDue={(dueOn) => patch(t.id, { dueOn })}
                    onRemove={() => remove(t.id, t.title)}
                  />
                ))}
              </ul>

              {adding === phase.id && (
                <div className="mt-1.5 flex gap-1.5">
                  <input
                    ref={(el) => el?.focus()}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void add(phase.id);
                      if (e.key === "Escape") setAdding(null);
                    }}
                    onBlur={() => void add(phase.id)}
                    placeholder="Order the panel, book the FAT witness, chase the P&ID…"
                    className="flex-1 rounded-md border border-ink-300 px-2.5 py-1.5 text-[13px] outline-none placeholder:text-ink-300 focus:border-ink-500"
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function TaskRow({
  task,
  projectId,
  hasDocument,
  busy,
  onStatus,
  onOwner,
  onDue,
  onRemove,
}: {
  task: PlannerTask;
  projectId: string;
  hasDocument: boolean;
  busy: boolean;
  onStatus: (s: TaskStatus) => void;
  onOwner: (owner: string) => void;
  onDue: (dueOn: string | null) => void;
  onRemove: () => void;
}) {
  const [owner, setOwner] = useState(task.owner ?? "");
  const spec = STATUS[task.status];
  const Icon = spec.icon;
  const overdue = isOverdue(task.dueOn, task.status);

  return (
    <li className="group flex flex-wrap items-center gap-2 rounded-md px-1.5 py-1 hover:bg-ink-50">
      {/* Status cycles on click, which is the gesture for a four-state field
          that is nearly always moving one step forwards. */}
      <button
        type="button"
        disabled={busy}
        onClick={() =>
          onStatus(ORDER[(ORDER.indexOf(task.status) + 1) % ORDER.length] as TaskStatus)
        }
        title={`${spec.label}. Click to move it on.`}
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors hover:bg-ink-200 ${spec.className}`}
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
      </button>

      <span className="min-w-0 flex-1">
        <span
          className={`block truncate text-[13px] ${
            task.status === "done" ? "text-ink-400 line-through" : "text-ink-800"
          }`}
        >
          {task.title}
        </span>
      </span>

      {/* A deliverable that already has a document says so, and links to it. */}
      {task.templateSlug && (
        <Link
          href={
            hasDocument
              ? `/studio/projects/${projectId}#documents`
              : `/studio/documents/t/${task.templateSlug}`
          }
          className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-wide transition-colors ${
            hasDocument
              ? "bg-teal-50 text-teal-700 hover:bg-teal-100"
              : "text-ink-300 hover:text-ink-700"
          }`}
        >
          {hasDocument ? "written" : "not started"}
        </Link>
      )}

      <input
        value={owner}
        onChange={(e) => setOwner(e.target.value)}
        onBlur={() => owner !== (task.owner ?? "") && onOwner(owner)}
        placeholder="owner"
        className="w-24 shrink-0 rounded border border-transparent bg-transparent px-1.5 py-0.5 text-[11.5px] text-ink-600 outline-none placeholder:text-ink-300 hover:border-ink-200 focus:border-ink-400 focus:bg-white"
      />

      <input
        type="date"
        value={task.dueOn ? task.dueOn.slice(0, 10) : ""}
        onChange={(e) =>
          onDue(e.target.value ? new Date(`${e.target.value}T12:00:00Z`).toISOString() : null)
        }
        className={`w-[7.5rem] shrink-0 rounded border border-transparent bg-transparent px-1 py-0.5 font-mono text-[11px] outline-none hover:border-ink-200 focus:border-ink-400 focus:bg-white ${
          overdue ? "text-[#B4531A]" : "text-ink-500"
        }`}
      />

      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${task.title}`}
        className="shrink-0 opacity-0 transition-opacity hover:text-red-700 group-hover:opacity-100"
      >
        <Trash2 className="h-3 w-3 text-ink-300" />
      </button>
    </li>
  );
}
