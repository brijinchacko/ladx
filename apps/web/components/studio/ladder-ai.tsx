"use client";

import AiDock, { type AiTurn } from "@/components/studio/ai-dock";
import type { LadxProgram } from "@ladx/studio";
import { useCallback, useState } from "react";

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
 */
export default function LadderAi({
  projectId,
  getProgram,
  onProgram,
}: {
  /** Scratch or a project, only to name the thread. */
  projectId: string;
  /** The program as it stands, for context. */
  getProgram: () => LadxProgram | null;
  /** Called with the merged program, for the editor to load. */
  onProgram: (program: LadxProgram, replaced: boolean) => void;
}) {
  const [turns, setTurns] = useState<AiTurn[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);

  const send = useCallback(
    async (prompt: string) => {
      setBusy(true);
      setError(null);
      setTurns((t) => [...t, { id: `u${Date.now()}`, role: "you", text: prompt }]);

      const current = getProgram();
      // Replace only when there is nothing to lose.
      const mode = current && current.rungs.length > 0 ? "extend" : "replace";

      try {
        const res = await fetch("/api/ladder/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt, current, mode }),
        });
        const body = (await res.json()) as {
          program?: LadxProgram;
          problems?: string[];
          notes?: string;
          model?: string;
          error?: string;
        };
        if (!res.ok || !body.program) {
          setError(body.error ?? "Could not write that.");
          return;
        }

        const generated = body.program;
        let merged = generated;
        if (mode === "extend" && current) {
          // Tags are merged by name, keeping what the program already had: the
          // existing one carries the address and the device kind, which the
          // simulator needs and the model would have guessed at.
          const byName = new Map(current.tags.map((t) => [t.name, t]));
          for (const t of generated.tags) if (!byName.has(t.name)) byName.set(t.name, t);
          merged = {
            ...current,
            tags: [...byName.values()],
            rungs: [...current.rungs, ...generated.rungs],
          };
        }

        onProgram(merged, mode === "replace");
        setModel(body.model ?? null);

        const problems = body.problems ?? [];
        setTurns((t) => [
          ...t,
          {
            id: `a${Date.now()}`,
            role: "ladx",
            text: [
              `${generated.rungs.length} rung${generated.rungs.length === 1 ? "" : "s"} ${
                mode === "replace" ? "written" : "added"
              }.`,
              body.notes,
              problems.length
                ? `The validator flagged ${problems.length}: ${problems.slice(0, 3).join(" ")}`
                : "The validator found nothing wrong, which is not the same as it being right.",
              "Simulate it before you download it.",
            ]
              .filter(Boolean)
              .join(" "),
            undoable: true,
          },
        ]);
      } catch {
        setError("Could not reach the model. Try again, or write it by hand.");
      } finally {
        setBusy(false);
      }
    },
    [getProgram, onProgram],
  );

  return (
    <AiDock
      title="Write with LADX"
      placeholder="A motor with start, stop and a seal-in, and a lamp that comes on after five seconds"
      suggestions={[
        "Motor start/stop with a seal-in and an E-stop",
        "Add a guard interlock that stops the motor",
        "A conveyor that runs for 10 seconds after the last bottle passes",
      ]}
      turns={turns}
      busy={busy}
      error={error}
      modelNote={model}
      onSend={(p) => void send(p)}
    />
  );
}
