"use client";

import GanttChart, { type GanttGroup, type Zoom, ZOOM } from "@/components/studio/gantt-chart";
import type { GanttTask } from "@/lib/platform/gantt";
import { PHASES } from "@/lib/platform/lifecycle";
import { csvToPlan, planToCsv } from "@/lib/platform/plan-csv";
import {
  type PlanOp,
  type PlanTask,
  applyOp,
  checkOps,
  describeOp,
  health,
  inverseOf,
  patchFor,
  todayIso,
} from "@/lib/platform/plan-ops";
import { type AssistRunContext, Assistant, RELAY_TITLES, useAssistant } from "@ladx/ui";
import {
  CalendarRange,
  Download,
  Loader2,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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

  /**
   * A local copy of the plan, edited in place.
   *
   * Every change used to go to the server and then refresh the whole page,
   * which on a drag meant the bar snapped back, the page re-rendered, and the
   * bar reappeared where it now belonged. On a plan of any size that is a
   * visible stutter per drag, and dragging is the main thing this tool is for.
   *
   * Now the change lands here first and the request follows. If the request
   * fails the local copy is put back, because a plan that looks changed and is
   * not is worse than one that refused.
   */
  const [plan, setPlan] = useState<(PlanTask & { projectName?: string | null })[]>(tasks);
  // Reset when the server sends a new set: a navigation, or a refresh after an
  // operation this screen does not model, like adding a task.
  useEffect(() => setPlan(tasks), [tasks]);

  const [zoom, setZoom] = useState<Zoom>("week");
  const [projectId, setProjectId] = useState<string>(initialProjectId ?? "");
  const [clientId, setClientId] = useState<string>(initialClientId ?? "");
  const [hideDone, setHideDone] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  /** Multi-select, for doing the same thing to many tasks at once. */
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  /** Narrowed to what is late, or due this week, or has no dates. */
  const [lens, setLens] = useState<"all" | "late" | "soon" | "unscheduled">("all");
  const [today] = useState(todayIso);
  /** The inverse of the last batch, so any change is one click from undone. */
  const [undoStack, setUndoStack] = useState<PlanOp[]>([]);
  /**
   * Whether a proposed change is applied or held for review.
   *
   * Real here in a way it is not in the other tools. A generated rung is on
   * screen and can be read; forty tasks silently redated across three projects
   * is not something to discover afterwards, and the person who has to explain
   * the new dates is whoever pressed the button. Auto is the default because
   * most requests are small and obvious, and Manual is one click away for the
   * ones that are not.
   */
  const [runMode, setRunMode] = useState<"auto" | "manual">("auto");
  /** What was proposed and is waiting, in Manual. */
  const [proposed, setProposed] = useState<{ ops: PlanOp[]; summary: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [importNote, setImportNote] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const visibleProjects = useMemo(
    () => (clientId ? projects.filter((p) => p.clientId === clientId) : projects),
    [projects, clientId],
  );

  /** What is late, due within the week, or has no dates at all. */
  const state = useMemo(() => health(plan, today), [plan, today]);

  const shown = useMemo(() => {
    const ids = new Set(visibleProjects.map((p) => p.id));
    const q = query.trim().toLowerCase();
    const lensIds =
      lens === "all"
        ? null
        : new Set(
            (lens === "late" ? state.late : lens === "soon" ? state.soon : state.unscheduled).map(
              (t) => t.id,
            ),
          );
    return plan.filter(
      (t) =>
        ids.has(t.projectId) &&
        (!projectId || t.projectId === projectId) &&
        (!hideDone || t.status !== "done") &&
        (!lensIds || lensIds.has(t.id)) &&
        (!q ||
          t.title.toLowerCase().includes(q) ||
          (t.owner ?? "").toLowerCase().includes(q) ||
          (t.projectName ?? "").toLowerCase().includes(q)),
    );
  }, [plan, visibleProjects, projectId, hideDone, query, lens, state]);

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
  const selectedIds = useMemo(() => shown.filter((t) => checked.has(t.id)), [shown, checked]);

  /**
   * Lay a working-day draft over undated tasks.
   *
   * Scoped to the projects on screen, so scheduling from a filtered view does
   * not silently redate work the user cannot see. Additive: anything already
   * dated is left alone, and a second run schedules nothing, so it cannot
   * reshuffle a plan somebody has been dragging.
   */
  async function scheduleUndated() {
    const ids = projectId
      ? [projectId]
      : [...new Set(shown.filter((t) => !t.startsOn && !t.dueOn).map((t) => t.projectId))];
    if (ids.length === 0) return;
    setBusy(true);
    try {
      for (const id of ids) {
        await fetch(`/api/projects/${id}/tasks`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ schedule: true }),
        });
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  /**
   * The plan as a spreadsheet.
   *
   * Exports what is on screen, not everything: somebody filtered to one client
   * is asking for that client's plan, and handing them the whole book of work
   * would be a surprise in an email attachment.
   */
  function exportCsv() {
    const csv = planToCsv(shown);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    // Named after what is in it: one project's plan carries its name, the whole
    // book of work is just "plan". Not "plan-plan".
    const project = projectId ? visibleProjects.find((p) => p.id === projectId) : null;
    const stem = project ? `${project.name.replace(/[^\w-]+/g, "-").toLowerCase()}-plan` : "plan";
    a.download = `${stem}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Read a plan back.
   *
   * Matched on the id column, so a file that went out to a project manager,
   * came back edited, and is imported here updates the tasks rather than
   * duplicating them. A row whose id is not in this plan is skipped rather
   * than created: creating tasks from a spreadsheet is a different, more
   * dangerous operation than updating dates on ones that already exist.
   */
  async function importCsv(file: File) {
    setBusy(true);
    setImportNote(null);
    try {
      const { rows, problems } = csvToPlan(await file.text());
      const byId = new Map(tasks.map((t) => [t.id, t]));
      let updated = 0;
      let skipped = 0;
      for (const r of rows) {
        const existing = r.id ? byId.get(r.id) : undefined;
        if (!existing) {
          skipped++;
          continue;
        }
        await fetch(`/api/projects/${existing.projectId}/tasks/${existing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: r.title,
            owner: r.owner,
            ...(r.status ? { status: r.status } : {}),
            startsOn: r.startsOn,
            dueOn: r.dueOn,
          }),
        });
        updated++;
      }
      const parts = [`${updated} task${updated === 1 ? "" : "s"} updated`];
      if (skipped > 0) parts.push(`${skipped} row${skipped === 1 ? "" : "s"} matched nothing here`);
      if (problems.length > 0) parts.push(problems.slice(0, 3).join(" "));
      setImportNote(parts.join(". "));
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  /**
   * Every change to the plan, through one path.
   *
   * A drag, a bulk action and anything the assistant proposes all end up here,
   * which is what keeps them consistent: the same validation, the same
   * optimistic update, the same undo. The alternative is three code paths
   * computing the same edit, and the screen and the database disagreeing after
   * one of them.
   *
   * The local copy moves first and the requests follow. Anything that fails is
   * put back, because a plan that looks changed and is not is worse than one
   * that refused.
   */
  const runOps = useCallback(
    async (ops: PlanOp[]): Promise<{ applied: number; failed: number }> => {
      if (ops.length === 0) return { applied: 0, failed: 0 };
      const byId = new Map(plan.map((t) => [t.id, t]));

      // Inverses captured from the plan as it is now, before anything moves.
      // Recomputing them afterwards cannot work: once a shift has happened
      // there is no telling a task that moved from one that was already there.
      const inverses: PlanOp[] = [];
      for (const op of ops) {
        if (!("taskId" in op)) continue;
        const t = byId.get(op.taskId);
        if (!t) continue;
        const back = inverseOf(op, t);
        if (back) inverses.push(back);
      }

      setPlan((current) => {
        const map = new Map(current.map((t) => [t.id, t]));
        for (const op of ops) {
          if (!("taskId" in op)) continue;
          const t = map.get(op.taskId);
          if (!t) continue;
          if (op.kind === "delete") map.delete(op.taskId);
          else map.set(op.taskId, applyOp(op, t));
        }
        return [...map.values()];
      });

      setBusy(true);
      let applied = 0;
      let failed = 0;
      const structural = ops.some((o) => o.kind === "add" || o.kind === "delete");
      try {
        for (const op of ops) {
          try {
            if (op.kind === "add") {
              const res = await fetch(`/api/projects/${op.projectId}/tasks`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  title: op.title,
                  phase: op.phase,
                  startsOn: op.startsOn ?? null,
                  dueOn: op.dueOn ?? null,
                  owner: op.owner ?? null,
                }),
              });
              res.ok ? applied++ : failed++;
              continue;
            }
            const t = byId.get(op.taskId);
            if (!t) {
              failed++;
              continue;
            }
            if (op.kind === "delete") {
              const res = await fetch(`/api/projects/${t.projectId}/tasks/${t.id}`, {
                method: "DELETE",
              });
              res.ok ? applied++ : failed++;
              continue;
            }
            const patchBody = patchFor(op, t);
            if (!patchBody) {
              failed++;
              continue;
            }
            const res = await fetch(`/api/projects/${t.projectId}/tasks/${t.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(patchBody),
            });
            res.ok ? applied++ : failed++;
          } catch {
            failed++;
          }
        }
      } finally {
        setBusy(false);
      }

      // Something failed, so the local copy and the database disagree. The
      // server is right; ask for it again rather than guessing which half
      // landed.
      if (failed > 0) router.refresh();
      // Creating or deleting needs the server's ids, which nothing here can
      // invent.
      else if (structural) router.refresh();
      else if (inverses.length > 0) setUndoStack(inverses);

      return { applied, failed };
    },
    [plan, router],
  );

  const undoLast = useCallback(async () => {
    if (undoStack.length === 0) return;
    const back = undoStack;
    setUndoStack([]);
    await runOps(back);
  }, [undoStack, runOps]);

  /** One task, one field. What the detail bar and the chart use. */
  const patch = useCallback(
    (taskId: string, body: Record<string, unknown>) => {
      const t = plan.find((x) => x.id === taskId);
      if (!t) return;
      const op: PlanOp | null =
        "startsOn" in body || "dueOn" in body
          ? {
              kind: "setDates",
              taskId,
              startsOn: (body.startsOn as string | null) ?? null,
              dueOn: (body.dueOn as string | null) ?? null,
            }
          : "status" in body
            ? { kind: "setStatus", taskId, status: body.status as PlanTask["status"] }
            : "owner" in body
              ? { kind: "setOwner", taskId, owner: (body.owner as string | null) ?? null }
              : "dependsOn" in body
                ? { kind: "link", taskId, dependsOn: (body.dependsOn as string | null) ?? null }
                : null;
      if (op) void runOps([op]);
    },
    [plan, runOps],
  );

  /**
   * Changing the plan from a sentence.
   *
   * The one place in LADX where a model edits a document in bulk, and the
   * safeguards are the reason it is allowed to. It emits operations from a
   * fixed vocabulary and nothing else; every one is checked here against the
   * plan on screen before anything is sent, so an invented task id, a status
   * that does not exist or a dependency loop cannot get through; and the whole
   * batch is one click from undone.
   */
  const runAssist = useCallback(
    async (question: string, { step, model, signal }: AssistRunContext) => {
      step.start("read", "Reading the plan on screen");
      step.detail(
        `${shown.length} task${shown.length === 1 ? "" : "s"}, ${state.late.length} late, ${state.soon.length} due this week, ${state.unscheduled.length} undated`,
      );
      if (shown.length === 0) {
        step.fail("Nothing on the timeline");
        throw new Error("There is nothing on screen to change. Widen the filters first.");
      }

      step.start("ask", model ? `Asking ${model}` : "Asking the model");
      const res = await fetch("/api/planner/assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tasks: shown.map((t) => ({
            id: t.id,
            title: t.title,
            phase: t.phase,
            status: t.status,
            startsOn: t.startsOn,
            dueOn: t.dueOn,
            owner: t.owner,
            projectId: t.projectId,
            projectName: t.projectName ?? null,
          })),
          question,
          today,
          model,
        }),
        signal,
      });
      const b = (await res.json()) as {
        ops?: PlanOp[];
        summary?: string;
        model?: string;
        error?: string;
      };
      if (!res.ok || !Array.isArray(b.ops)) {
        step.fail(b.error ?? "No changes came back");
        throw new Error(b.error ?? "Could not reach a model.");
      }
      step.detail(
        `${b.model ? `${b.model} replied, ` : ""}${b.ops.length} change${b.ops.length === 1 ? "" : "s"} proposed`,
      );

      step.start("check", "Checking each change against the plan");
      const { ops, problems } = checkOps(b.ops, shown, new Set(visibleProjects.map((p) => p.id)));
      step.detail(
        problems.length === 0
          ? `All ${ops.length} can be made`
          : `${ops.length} can be made, ${problems.length} cannot`,
      );

      if (ops.length === 0) {
        // An empty result with a summary is the model asking a question, which
        // it is told to do rather than guess at an ambiguous selection.
        return {
          text: b.summary || "Nothing to change from that. Try naming the tasks or the phase.",
          problems: problems.map((p) => `${p.what}: ${p.why}`),
          undoable: false,
        };
      }

      if (runMode === "manual") {
        // Held rather than applied. Accepted from the bar above the timeline,
        // because that is next to the thing it would change.
        step.start("hold", "Holding for you to accept");
        step.detail(`${ops.length} change${ops.length === 1 ? "" : "s"} ready`);
        setProposed({ ops, summary: b.summary || "" });
        return {
          text: [
            b.summary || `${ops.length} change${ops.length === 1 ? "" : "s"} proposed.`,
            "Nothing has changed yet. Accept or discard it above the timeline.",
            ops
              .slice(0, 6)
              .map((o) => describeOp(o, shown))
              .join("; "),
            ops.length > 6 ? `and ${ops.length - 6} more.` : "",
          ]
            .filter(Boolean)
            .join(" "),
          problems: problems.map((p) => `${p.what}: ${p.why}`),
          undoable: false,
        };
      }

      step.start("apply", "Changing the plan");
      const { applied, failed } = await runOps(ops);
      step.detail(`${applied} applied${failed ? `, ${failed} refused by the server` : ""}`);

      return {
        text: [
          b.summary || `${applied} change${applied === 1 ? "" : "s"} made.`,
          applied > 0 ? "Undo in the header puts it all back." : "",
          ops
            .slice(0, 6)
            .map((o) => describeOp(o, shown))
            .join("; "),
          ops.length > 6 ? `and ${ops.length - 6} more.` : "",
        ]
          .filter(Boolean)
          .join(" "),
        problems: problems.map((p) => `${p.what}: ${p.why}`),
        undoable: applied > 0,
      };
    },
    [shown, state, today, visibleProjects, runOps, runMode],
  );

  /*
   * Keyed to what is being planned.
   *
   * Narrowed to one project, the thread is that project's; across the book of
   * work it is the general one. Carrying a conversation about one job into
   * another would be worse than starting fresh, because the task names in it
   * are somebody else's.
   */
  const assist = useAssistant({
    run: runAssist,
    memoryKey: projectId ? `planner:${projectId}` : "planner:all",
  });

  /** The same thing to every selected task. */
  const bulk = useCallback(
    (make: (id: string) => PlanOp) => {
      const ops = selectedIds.map((t) => make(t.id));
      void runOps(ops);
      setChecked(new Set());
    },
    [selectedIds, runOps],
  );

  async function addTask() {
    const target = projectId || visibleProjects[0]?.id;
    if (!target) return;
    const title = window.prompt("What is the task?");
    if (!title?.trim()) return;
    await runOps([{ kind: "add", projectId: target, title: title.trim(), phase: "requirements" }]);
  }

  const selectedTask = selected ? plan.find((t) => t.id === selected) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="relative flex shrink-0 flex-wrap items-center gap-2 border-b border-ink-100 bg-ink-50/60 px-3 py-2">
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

        <label className="relative flex items-center">
          <Search className="pointer-events-none absolute left-1.5 h-3 w-3 text-ink-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a task, owner or project"
            className="w-52 rounded-md border border-ink-200 bg-white py-1 pr-2 pl-6 text-[12.5px] outline-none focus:border-ink-500"
          />
        </label>

        <label className="flex items-center gap-1.5 text-[12.5px] text-ink-600">
          <input
            type="checkbox"
            checked={hideDone}
            onChange={(e) => setHideDone(e.target.checked)}
            className="h-3 w-3"
          />
          Hide done
        </label>

        <button
          type="button"
          onClick={() => void addTask()}
          disabled={visibleProjects.length === 0}
          title="Add a task to this project"
          className="flex items-center gap-1 rounded-md border border-ink-200 bg-white px-2 py-1 text-[12px] text-ink-700 transition-colors hover:border-ink-400 disabled:opacity-40"
        >
          <Plus className="h-3 w-3" />
          Task
        </button>

        {undoStack.length > 0 && (
          <button
            type="button"
            onClick={() => void undoLast()}
            title="Put the last change back"
            className="flex items-center gap-1 rounded-md border border-teal-500/50 bg-teal-50 px-2 py-1 text-[12px] text-teal-800 transition-colors hover:border-teal-600"
          >
            <RotateCcw className="h-3 w-3" />
            Undo {undoStack.length} change{undoStack.length === 1 ? "" : "s"}
          </button>
        )}

        {undated > 0 && (
          <button
            type="button"
            onClick={scheduleUndated}
            disabled={busy}
            title="Lay a working-day draft over the tasks that have no dates"
            className="rounded-md border border-ink-200 bg-white px-2 py-1 text-[12px] text-ink-700 transition-colors hover:border-ink-400 disabled:opacity-50"
          >
            Schedule {undated} undated
          </button>
        )}

        {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-ink-400" />}

        <button
          type="button"
          onClick={exportCsv}
          disabled={shown.length === 0}
          title="Download what is on screen as a spreadsheet"
          className="flex items-center gap-1 rounded-md border border-ink-200 bg-white px-2 py-1 text-[12px] text-ink-700 transition-colors hover:border-ink-400 disabled:opacity-40"
        >
          <Download className="h-3 w-3" />
          Export
        </button>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          title="Read dates and owners back from a spreadsheet"
          className="flex items-center gap-1 rounded-md border border-ink-200 bg-white px-2 py-1 text-[12px] text-ink-700 transition-colors hover:border-ink-400"
        >
          <Upload className="h-3 w-3" />
          Import
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void importCsv(f);
            e.target.value = "";
          }}
        />

        {projectId && (
          <Link
            href={`/studio/projects/${projectId}?phase=summary`}
            className="ml-auto text-[12.5px] text-ink-600 hover:text-teal-700"
          >
            Open the project →
          </Link>
        )}
      </div>

      {/*
        What is late, and what is about to be.
        
        The question a planner is opened to answer, and it was not on screen:
        you had to read the bars against the today line and work it out. Each
        one narrows the timeline to exactly those tasks, so seeing the number
        and acting on it are the same click.
      */}
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-ink-100 border-b px-3 py-1.5">
        {(
          [
            { id: "all", label: `All ${plan.length}`, tone: "text-ink-600", n: plan.length },
            {
              id: "late",
              label: `${state.late.length} late`,
              tone: "text-[#B4531A]",
              n: state.late.length,
            },
            {
              id: "soon",
              label: `${state.soon.length} due this week`,
              tone: "text-[#8A6A1F]",
              n: state.soon.length,
            },
            {
              id: "unscheduled",
              label: `${state.unscheduled.length} undated`,
              tone: "text-ink-500",
              n: state.unscheduled.length,
            },
          ] as const
        ).map((l) => (
          <button
            key={l.id}
            type="button"
            onClick={() => setLens(lens === l.id ? "all" : l.id)}
            disabled={l.n === 0 && l.id !== "all"}
            className={`rounded-full border px-2.5 py-0.5 text-[12px] transition-colors disabled:opacity-40 ${
              lens === l.id
                ? "border-ink-900 bg-ink-900 text-white"
                : `border-ink-200 bg-white ${l.tone} hover:border-ink-400`
            }`}
          >
            {l.label}
          </button>
        ))}
        <span className="ml-2 text-[11.5px] text-ink-400">
          {shown.length === plan.length
            ? "Showing everything"
            : `Showing ${shown.length} of ${plan.length}`}
        </span>
      </div>

      {/*
        A held change, and the two things you can do with it.

        Above the timeline rather than in the assistant, because the decision is
        about the plan and this is where the plan is. What it would do is spelled
        out rather than summarised as a count: "twelve changes" is not something
        anybody can accept responsibly.
      */}
      {proposed && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-teal-600 border-b-2 bg-teal-50 px-3 py-2">
          <span className="font-medium text-[12.5px] text-ink-900">
            {proposed.summary ||
              `${proposed.ops.length} change${proposed.ops.length === 1 ? "" : "s"} proposed`}
          </span>
          <span className="max-w-xl truncate text-[12px] text-ink-600">
            {proposed.ops
              .slice(0, 4)
              .map((o) => describeOp(o, plan))
              .join("; ")}
            {proposed.ops.length > 4 ? ` and ${proposed.ops.length - 4} more` : ""}
          </span>
          <button
            type="button"
            onClick={() => {
              const ops = proposed.ops;
              setProposed(null);
              void runOps(ops);
            }}
            className="ml-auto rounded-md bg-teal-600 px-2.5 py-1 font-medium text-[12px] text-white transition-opacity hover:opacity-90"
          >
            Accept {proposed.ops.length}
          </button>
          <button
            type="button"
            onClick={() => setProposed(null)}
            className="text-[12px] text-ink-500 hover:text-ink-900"
          >
            Discard
          </button>
        </div>
      )}

      {selectedIds.length > 0 && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-ink-100 border-b bg-teal-50/50 px-3 py-1.5">
          <span className="font-medium text-[12.5px] text-ink-900">
            {selectedIds.length} selected
          </span>
          <button
            type="button"
            onClick={() => bulk((id) => ({ kind: "shift", taskId: id, days: 7 }))}
            className={chip}
          >
            A week later
          </button>
          <button
            type="button"
            onClick={() => bulk((id) => ({ kind: "shift", taskId: id, days: -7 }))}
            className={chip}
          >
            A week earlier
          </button>
          <button
            type="button"
            onClick={() => bulk((id) => ({ kind: "setStatus", taskId: id, status: "done" }))}
            className={chip}
          >
            Mark done
          </button>
          <button
            type="button"
            onClick={() => {
              const who = window.prompt("Assign these to whom? Leave empty to unassign.");
              if (who === null) return;
              bulk((id) => ({ kind: "setOwner", taskId: id, owner: who.trim() || null }));
            }}
            className={chip}
          >
            Assign
          </button>
          <button
            type="button"
            onClick={() => {
              if (!window.confirm(`Delete ${selectedIds.length} tasks? This cannot be undone.`))
                return;
              bulk((id) => ({ kind: "delete", taskId: id }));
            }}
            className="flex items-center gap-1 rounded-md border border-[#E4B4A8] bg-white px-2 py-0.5 text-[12px] text-[#7A2E12] transition-colors hover:border-[#B4531A]"
          >
            <Trash2 className="h-3 w-3" />
            Delete
          </button>
          <button
            type="button"
            onClick={() => setChecked(new Set())}
            className="ml-auto text-[12px] text-ink-500 hover:text-ink-900"
          >
            Clear selection
          </button>
        </div>
      )}

      {importNote && (
        <p className="flex items-center gap-3 border-b border-ink-100 bg-ink-50/60 px-3 py-1.5 text-[12px] text-ink-600">
          {importNote}
          <button
            type="button"
            onClick={() => setImportNote(null)}
            className="ml-auto text-ink-400 hover:text-ink-700"
          >
            Dismiss
          </button>
        </p>
      )}

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
          <>
            {/* Select what is on screen, so a bulk action follows the filters
                rather than needing every bar clicked. */}
            <div className="flex items-center gap-3 px-3 py-1.5">
              <label className="flex items-center gap-1.5 text-[12px] text-ink-500">
                <input
                  type="checkbox"
                  checked={shown.length > 0 && selectedIds.length === shown.length}
                  onChange={(e) =>
                    setChecked(e.target.checked ? new Set(shown.map((t) => t.id)) : new Set())
                  }
                  className="h-3 w-3"
                />
                Select these {shown.length}
              </label>
              {selected && (
                <button
                  type="button"
                  onClick={() =>
                    setChecked((c) => {
                      const next = new Set(c);
                      next.has(selected) ? next.delete(selected) : next.add(selected);
                      return next;
                    })
                  }
                  className="text-[12px] text-ink-500 hover:text-ink-900"
                >
                  {checked.has(selected) ? "Unselect" : "Select"} the open task
                </button>
              )}
            </div>
            <GanttChart
              groups={groups}
              zoom={zoom}
              selectedId={selected}
              onSelect={setSelected}
              onReschedule={(id, startsOn, dueOn) => patch(id, { startsOn, dueOn })}
              onLink={(id, dependsOn) => patch(id, { dependsOn })}
              onSchedule={scheduleUndated}
            />
          </>
        )}
      </div>

      {/*
        The assistant, and the only one in LADX that edits a document in bulk.

        Every change it makes goes through the same runner a drag does, is
        checked against the plan on screen first, and is one click from undone.
      */}
      <Assistant
        toolId="planner"
        title={RELAY_TITLES.planner}
        placeholder="Push everything in commissioning back two weeks"
        suggestions={[
          "What is late?",
          "Push commissioning back two weeks",
          "Assign everything undated to me",
          "Mark the requirements tasks done",
        ]}
        turns={assist.turns}
        busy={assist.busy}
        steps={assist.steps}
        error={assist.error}
        models={assist.models}
        question={assist.question}
        onSend={assist.send}
        onAnswer={assist.answer}
        onStop={assist.stop}
        runMode={{
          value: runMode,
          onChange: setRunMode,
          autoHint: "Applies the change",
          manualHint: "Proposes, waits for you",
        }}
        actions={[
          {
            id: "task",
            label: "Add a task",
            hint: "To the project on screen.",
            onSelect: () => void addTask(),
          },
          {
            id: "schedule",
            label: `Schedule the ${undated} undated`,
            hint: "A working day draft over anything with no dates. Leaves dated work alone.",
            onSelect: () => void scheduleUndated(),
          },
          {
            id: "import",
            label: "Read a plan back from a spreadsheet",
            hint: "Matched on id, so a file that went out and came back updates rather than duplicates.",
            onSelect: () => fileRef.current?.click(),
          },
          { id: "export", label: "Export what is on screen", onSelect: exportCsv },
        ]}
        onUndo={
          undoStack.length > 0
            ? () => {
                void undoLast();
                assist.markUndone();
              }
            : undefined
        }
        footnote="It changes the plan you can see, after checking every change against it. Everything is undoable, and it cannot touch a task that is filtered out."
      />
    </div>
  );
}

const select =
  "rounded-md border border-ink-200 bg-white px-2 py-1 text-[12.5px] outline-none focus:border-ink-500";
const chip =
  "rounded-md border border-ink-200 bg-white px-2 py-0.5 text-[12px] text-ink-700 transition-colors hover:border-ink-400";
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
