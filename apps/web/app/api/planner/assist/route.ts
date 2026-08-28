import { getApiUser } from "@/lib/auth/server";
import { auditInBackground } from "@/lib/db/audit";
import { complete, firstJsonObject } from "@/lib/inference/complete";
import { PHASES } from "@/lib/platform/lifecycle";
import type { PlanOp } from "@/lib/platform/plan-ops";
import { ProviderError } from "@/lib/providers";
import { NextResponse } from "next/server";
import { z } from "zod";

/**
 * Turning a sentence into changes to a plan.
 *
 * "Push everything in commissioning back two weeks" is the request, and doing
 * it by hand is forty drags. This is the one place in LADX where a model is
 * allowed to change a document in bulk, so the shape is deliberately narrow:
 * it returns operations, never prose and never a rewritten plan, and every
 * operation is checked against the tasks that actually exist before anything
 * is applied. That checking happens on the client in `checkOps`, against the
 * plan the person is looking at, which is the only place that knows it.
 *
 * The model is given task ids and told to use them. It cannot invent one that
 * survives validation, it cannot invent a status or a phase, and it cannot
 * express anything that is not in the vocabulary. What it can do is get the
 * selection wrong, which is why the reply says what it is about to do in
 * words and everything it does is undoable in one click.
 */

const body = z.object({
  /** The plan on screen, already narrowed by whatever filters are applied. */
  tasks: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        phase: z.string(),
        status: z.string(),
        startsOn: z.string().nullable(),
        dueOn: z.string().nullable(),
        owner: z.string().nullable(),
        projectId: z.string(),
        projectName: z.string().nullable().optional(),
      }),
    )
    .max(600),
  question: z.string().trim().min(2).max(2000),
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  model: z.string().trim().max(200).nullish(),
});

function system(today: string): string {
  return [
    "You change a project plan for an industrial automation firm.",
    "",
    "Reply with ONE JSON object and nothing else. No prose outside it, no fence.",
    "",
    "{",
    '  "summary": "what you are about to do, one sentence, in plain words",',
    '  "ops": [ ... ]',
    "}",
    "",
    "An op is exactly one of:",
    '  { "kind": "shift", "taskId": "", "days": 14 }          move it, + later, - earlier',
    '  { "kind": "setDates", "taskId": "", "startsOn": "YYYY-MM-DD"|null, "dueOn": "YYYY-MM-DD"|null }',
    '  { "kind": "setStatus", "taskId": "", "status": "todo"|"doing"|"blocked"|"done" }',
    '  { "kind": "setOwner", "taskId": "", "owner": ""|null }',
    '  { "kind": "setTitle", "taskId": "", "title": "" }',
    '  { "kind": "link", "taskId": "", "dependsOn": ""|null }   taskId waits for dependsOn',
    '  { "kind": "delete", "taskId": "" }',
    '  { "kind": "add", "projectId": "", "title": "", "phase": "", "startsOn": null, "dueOn": null, "owner": null }',
    "",
    `Lifecycle phases: ${PHASES.map((p) => p.id).join(", ")}.`,
    `Today is ${today}.`,
    "",
    "Rules:",
    "",
    "- Use only taskId values from the list you were given. Never invent one.",
    "- Prefer shift over setDates when the request is relative. Shifting keeps",
    "  the duration; setting both dates does not, and changing a duration",
    "  nobody asked you to change is the way to get this wrong.",
    "- If the request names a group (a phase, a project, an owner, everything",
    "  late), emit one op per matching task. Do not stop at a few.",
    "- If the request is ambiguous about which tasks it means, return an empty",
    "  ops array and put the question in summary. Asking is cheap; redating",
    "  somebody's plan wrongly is not.",
    "- Never delete unless the request plainly says to delete.",
    "- Weekends are not handled here. If asked for working days, shift by whole",
    "  days and say in summary that weekends were not accounted for.",
  ].join("\n");
}

export async function POST(req: Request) {
  const auth = await getApiUser();
  if ("error" in auth) return auth.error;

  let parsed: z.infer<typeof body>;
  try {
    parsed = body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "That request could not be read." }, { status: 400 });
  }

  if (parsed.tasks.length === 0) {
    return NextResponse.json(
      { error: "There is nothing on the timeline to change." },
      { status: 400 },
    );
  }

  const list = parsed.tasks
    .map(
      (t) =>
        `  ${t.id} | ${t.title} | phase ${t.phase} | ${t.status} | ${t.startsOn ?? "no start"} to ${t.dueOn ?? "no end"} | ${t.owner ?? "unassigned"}${t.projectName ? ` | ${t.projectName}` : ""} | project ${t.projectId}`,
    )
    .join("\n");

  try {
    const result = await complete({
      userId: auth.user.id,
      model: parsed.model,
      messages: [
        { role: "system", content: system(parsed.today) },
        {
          role: "user",
          content: `The plan on screen:\n\n${list}\n\nWhat I want: ${parsed.question}`,
        },
      ],
      maxTokens: 3000,
      // Deterministic, because this edits a plan. There is nothing to be
      // creative about in "move these fourteen tasks back a fortnight".
      temperature: 0,
    });

    const raw = firstJsonObject(result.text) as {
      summary?: string;
      ops?: PlanOp[];
    } | null;

    if (!raw || !Array.isArray(raw.ops)) {
      return NextResponse.json(
        {
          error:
            "That came back in a shape the planner could not use. Try saying it differently, or pick a stronger model.",
        },
        { status: 502 },
      );
    }

    auditInBackground({
      userId: auth.user.id,
      actor: auth.user.email,
      event: "planner_assisted",
      payload: {
        model: result.model,
        tasksConsidered: parsed.tasks.length,
        opsProposed: raw.ops.length,
      },
    });

    return NextResponse.json({
      summary: typeof raw.summary === "string" ? raw.summary : "",
      ops: raw.ops,
      model: result.model,
    });
  } catch (err) {
    if (err instanceof ProviderError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    return NextResponse.json(
      { error: "Could not reach a model. Try again, or connect a key in Settings." },
      { status: 502 },
    );
  }
}
