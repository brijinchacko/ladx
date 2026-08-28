"use client";

import type { LadderGenerateRequest, LadderGenerated } from "@ladx/studio";

/**
 * How the web writes ladder: the API route, which holds the keys and the
 * audit entry. The desktop has its own, talking to a local Ollama.
 */
export async function generateLadderViaApi(req: LadderGenerateRequest): Promise<LadderGenerated> {
  const res = await fetch("/api/ladder/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: req.prompt,
      current: req.current,
      mode: req.mode,
      model: req.model,
    }),
    signal: req.signal,
  });
  const body = (await res.json()) as Partial<LadderGenerated> & { error?: string };
  if (!res.ok || !body.program) {
    throw new Error(body.error ?? "The model did not return a program.");
  }
  return {
    program: body.program,
    problems: body.problems ?? [],
    notes: body.notes ?? "",
    model: body.model ?? null,
  };
}
