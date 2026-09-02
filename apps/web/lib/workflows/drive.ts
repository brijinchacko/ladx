import { db } from "@/lib/db/client";
import { loadProgram } from "@/lib/db/ladder";
import { workflowRuns } from "@/lib/db/schema";
import { complete } from "@/lib/inference/complete";
import { type WorkflowRun, advanceWorkflow } from "@/lib/parsers/spawn";
import { accessIds } from "@/lib/teams/access";
import { type LadxProgram, ladxProgramToIr } from "@ladx/studio";
import { and, eq, inArray } from "drizzle-orm";

export type RunStatus = "running" | "waiting_person" | "finished" | "stopped" | "failed";

/** How many model steps one drive may take before handing back. A guard, not a plan. */
const MAX_MODEL_STEPS = 8;

/** Appended to every role. A free model will otherwise narrate its own thinking. */
const NO_WORKING = " Give only the answer, with no preamble and none of your working shown.";

const FALLBACK_SYSTEM = `You are a specialist on a PLC job. Answer the question you are asked, plainly and specifically.${NO_WORKING}`;

const ROLE_SYSTEM: Record<string, string> = {
  surveyor:
    "You are the surveyor on a PLC job. Read what you are given and say what the program does now, plainly and without proposing anything. Name the rungs and tags you are talking about.",
  planner:
    "You are the planner on a PLC job. Turn the request into a plan against the program as it is: what changes, which rungs, which tags, and what must not change. Numbered steps, no code yet.",
  author:
    "You are the author on a PLC job. Write only the ladder logic the plan asks for, as IEC 61131 structured text or as a rung by rung description, with every tag named. Nothing else.",
  reviewer:
    "You are the reviewer on a PLC job. Read the logic back and argue with it: what is wrong, what is missing, what would fail on a machine. Be specific and be short.",
  documenter:
    "You are the documenter on a PLC job. Write the words that go around the logic: what it does, in order, for the people who will operate and maintain it.",
};

export function statusOf(run: WorkflowRun): RunStatus {
  if (run.finished) return "finished";
  if (run.stoppedBecause?.startsWith("waiting on a person")) return "waiting_person";
  if (run.stoppedBecause?.startsWith("waiting on a model")) return "running";
  return "stopped";
}

/**
 * Take a run as far as it can go without a person.
 *
 * The engine says where the run stands. If it is waiting on a model, the
 * prompt it wrote is sent to whatever the user can reach, the answer is
 * recorded against the step, and the engine is asked again. That repeats
 * until the run finishes, stops at a gate, or stops at a person. The engine
 * never calls a model and this never decides an outcome, which is the split
 * the whole design depends on.
 */
export async function driveRun(userId: string, runId: string): Promise<WorkflowRun> {
  const [row] = await db()
    .select()
    .from(workflowRuns)
    .where(and(eq(workflowRuns.id, runId), inArray(workflowRuns.userId, await accessIds(userId))))
    .limit(1);
  if (!row) throw new Error("no such run");

  const stored = await loadProgram(userId, row.projectId ?? null);
  if (!stored?.program) throw new Error("this project has no program to run a workflow on");
  const project = ladxProgramToIr(stored.program as LadxProgram);

  const answers = (row.answers ?? []) as [string, string][];
  const modelAnswers = (row.modelAnswers ?? []) as [string, string][];

  let run: WorkflowRun | null = null;
  let status: RunStatus = "running";
  try {
    for (let i = 0; i <= MAX_MODEL_STEPS; i++) {
      run = await advanceWorkflow({
        workflow: row.workflow,
        request: row.request,
        project,
        answers,
        modelAnswers,
      });
      status = statusOf(run);
      if (status !== "running") break;

      const waiting = run.steps.find((s) => s.outcome === "waiting");
      if (!waiting) break;
      if (i === MAX_MODEL_STEPS) {
        status = "failed";
        break;
      }

      const role = roleOf(row.workflow, waiting.id);
      const answer = await complete({
        userId,
        messages: [
          { role: "system", content: (ROLE_SYSTEM[role] ?? FALLBACK_SYSTEM) + NO_WORKING },
          { role: "user", content: waiting.input },
        ],
        // Generous, because the free tier may answer with a reasoning model
        // that spends most of its budget thinking before it writes a word.
        maxTokens: 6000,
        temperature: 0.2,
      });
      modelAnswers.push([waiting.id, answer.text]);
    }
  } catch (err) {
    // A model that could not be reached, or a binary that would not run.
    // The run keeps what it had; the row says it failed and why.
    status = "failed";
    await db()
      .update(workflowRuns)
      .set({
        modelAnswers,
        run: run ?? row.run,
        status,
        lastError: err instanceof Error ? err.message : "the run could not continue",
        updatedAt: new Date(),
      })
      .where(eq(workflowRuns.id, runId));
    throw err;
  }

  await db()
    .update(workflowRuns)
    .set({ modelAnswers, run, status, lastError: null, updatedAt: new Date() })
    .where(eq(workflowRuns.id, runId));

  if (!run) throw new Error("the engine returned nothing");
  return run;
}

/** Which specialist a model step is, from the step's id in the shipped workflows. */
function roleOf(workflow: string, stepId: string): string {
  const ROLES: Record<string, string> = {
    survey: "surveyor",
    plan: "planner",
    write: "author",
    review: "reviewer",
    report: "documenter",
    narrative: "documenter",
  };
  void workflow;
  return ROLES[stepId] ?? "surveyor";
}
