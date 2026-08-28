"use client";

import type { LadxProgram } from "@ladx/studio";
import { type AssistRunContext, Assistant, RELAY_TITLES, useAssistant } from "@ladx/ui";
import { useCallback } from "react";

/**
 * Writing ladder from a description.
 *
 * The thing people actually want from AI on a PLC tool, and the thing it is
 * most dangerous to do badly. A rung is not prose: it goes into a controller
 * that moves things, and the difference between XIC and XIO on a stop button
 * is the difference between a machine that stops when a wire breaks and one
 * that does not.
 *
 * So three things happen to every generated program before it reaches the
 * editor. The server validates it with the editor's own validator and hands
 * back what it found rather than hiding it. Ids are minted server side, never
 * trusted from the model, because a duplicate id makes two instructions share
 * one one-shot. And it lands as an ordinary edit that History undoes.
 *
 * It extends by default rather than replacing. Somebody with forty rungs open
 * who asks for an interlock means "add one", and a tool that answers by
 * replacing their program is a tool they will not open again.
 *
 * The panel, the step list, the model picker and the questions are the shared
 * assistant, so this behaves exactly like the one in CAD and the HMI builder.
 */
export default function LadderAi({
  getProgram,
  onProgram,
  onUndo,
  disabledReason,
}: {
  /** The program as it stands, for context. */
  getProgram: () => LadxProgram | null;
  /** Called with the merged program, for the editor to load. */
  onProgram: (program: LadxProgram, replaced: boolean) => void;
  /** Takes the last generated rungs back out. */
  onUndo?: () => void;
  /**
   * Why it cannot run, on a surface with no provider.
   *
   * Present rather than hidden, so the feature reads the same everywhere. It
   * opens as a bar in this state and costs no canvas.
   */
  disabledReason?: string | null;
}) {
  const run = useCallback(
    async (prompt: string, { step, ask, model, signal }: AssistRunContext) => {
      step.start("read", "Reading the program");
      const current = getProgram();
      const rungs = current?.rungs.length ?? 0;
      const tags = current?.tags.length ?? 0;
      step.detail(
        `${rungs} rung${rungs === 1 ? "" : "s"}, ${tags} tag${tags === 1 ? "" : "s"} already defined`,
      );

      // Replace only when there is nothing to lose.
      const mode = rungs > 0 ? "extend" : "replace";

      /*
       * Ask about the stop button rather than guessing.
       *
       * This is the one input on a ladder program where a wrong guess is a
       * safety difference rather than an inconvenience: a stop wired normally
       * closed reads 1 when healthy and needs XIC, and getting it backwards
       * builds a machine that will not stop when a wire breaks. A model asked
       * for "a start and stop" with no more information has to guess, and it
       * guesses wrong often enough to matter.
       */
      let request = prompt;
      if (/\bstop\b/i.test(prompt) && !/normally\s+(closed|open)|\bn\/?[co]\b/i.test(prompt)) {
        step.start("ask", "Checking one thing before writing it");
        const answer = await ask({
          text: "Is the stop button normally closed? A real one usually is, which means it reads 1 when healthy and the rung needs an XIC rather than an XIO.",
          options: [
            "Normally closed, the usual wiring",
            "Normally open",
            "I do not know, use the safe one",
          ],
        });
        request = `${prompt}. Stop button: ${answer}.`;
        step.start("asked", "Using that");
        step.detail(answer);
      }

      step.start("write", model ? `Asking ${model}` : "Asking the model");
      const res = await fetch("/api/ladder/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: request, current, mode, model }),
        signal,
      });
      const body = (await res.json()) as {
        program?: LadxProgram;
        problems?: string[];
        notes?: string;
        model?: string;
        error?: string;
      };
      if (!res.ok || !body.program) {
        step.fail(body.error ?? "The model did not return a program");
        throw new Error(body.error ?? "Could not write that.");
      }
      step.detail(body.model ? `${body.model} replied` : "Reply received");

      step.start("validate", "Running the validator over it");
      const problems = body.problems ?? [];
      step.detail(
        problems.length === 0
          ? "Nothing flagged, which is not the same as it being right"
          : `${problems.length} flagged`,
      );

      const generated = body.program;
      let merged = generated;
      if (mode === "extend" && current) {
        step.start("merge", "Merging into the program");
        // Tags are merged by name, keeping what the program already had: the
        // existing one carries the address and the device kind, which the
        // simulator needs and the model would have guessed at.
        const byName = new Map(current.tags.map((t) => [t.name, t]));
        let added = 0;
        for (const t of generated.tags)
          if (!byName.has(t.name)) {
            byName.set(t.name, t);
            added++;
          }
        merged = {
          ...current,
          tags: [...byName.values()],
          rungs: [...current.rungs, ...generated.rungs],
        };
        step.detail(
          `${generated.rungs.length} rung${generated.rungs.length === 1 ? "" : "s"} appended, ${added} new tag${added === 1 ? "" : "s"}, existing tags kept as wired`,
        );
      }

      onProgram(merged, mode === "replace");

      return {
        text: [
          `${generated.rungs.length} rung${generated.rungs.length === 1 ? "" : "s"} ${
            mode === "replace" ? "written" : "added"
          }.`,
          body.notes,
          "Simulate it before you download it.",
        ]
          .filter(Boolean)
          .join(" "),
        problems,
        undoable: true,
      };
    },
    [getProgram, onProgram],
  );

  const a = useAssistant({ run, modelsUrl: disabledReason ? null : "/api/models" });

  return (
    <Assistant
      toolId="ladder"
      title={RELAY_TITLES.ladder}
      placeholder="A motor with start, stop and a seal-in, and a lamp that comes on after five seconds"
      suggestions={[
        "Motor start/stop with a seal-in and an E-stop",
        "Add a guard interlock that stops the motor",
        "A conveyor that runs for 10 seconds after the last bottle passes",
      ]}
      turns={a.turns}
      busy={a.busy}
      steps={a.steps}
      error={a.error}
      models={disabledReason ? undefined : a.models}
      question={a.question}
      onSend={a.send}
      onAnswer={a.answer}
      onStop={a.stop}
      onUndo={
        onUndo
          ? () => {
              onUndo();
              a.markUndone();
            }
          : undefined
      }
      disabledReason={disabledReason}
      actions={[
        {
          id: "clear",
          label: "Start the conversation again",
          hint: "The program is untouched. Only the thread goes.",
          onSelect: a.reset,
        },
      ]}
      footnote="Relay can make mistakes, and how good the result is depends heavily on the model. Simulate everything before it reaches a controller."
    />
  );
}
