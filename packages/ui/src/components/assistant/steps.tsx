"use client";

import { AlertCircle, Check } from "lucide-react";
import { ThinkingMark } from "../brand/thinking-mark";

/**
 * What it is doing, while it does it.
 *
 * A spinner says "busy" and nothing else, and on a free model the wait is long
 * enough that "busy" stops being reassuring and starts looking stuck. Naming
 * the step it is on turns the same wait into progress, and it does something a
 * spinner cannot: when the result is wrong, the step list says where it went
 * wrong, so the next prompt can be aimed at that rather than at the whole task.
 *
 * The steps are real. Each one is emitted by the code doing the work as it
 * reaches that stage, so a step that is still spinning is genuinely the stage
 * it is stuck on. Faking them on a timer would look identical for as long as
 * nothing went wrong, and would lie exactly when it mattered.
 */

export type StepState = "doing" | "done" | "failed" | "skipped";

export interface AssistStep {
  id: string;
  label: string;
  state: StepState;
  /** What it found, once it knows. One short line. */
  detail?: string;
}

export function Steps({ steps }: { steps: AssistStep[] }) {
  if (steps.length === 0) return null;
  return (
    <ol className="space-y-1.5" aria-live="polite">
      {steps.map((s) => (
        <li key={s.id} className="flex gap-2">
          <span className="mt-[3px] flex h-3.5 w-3.5 shrink-0 items-center justify-center">
            {s.state === "doing" && <ThinkingMark size={14} className="text-teal-700" />}
            {s.state === "done" && <Check className="h-3.5 w-3.5 text-teal-700" />}
            {s.state === "failed" && <AlertCircle className="h-3.5 w-3.5 text-danger" />}
            {s.state === "skipped" && (
              <span className="h-1 w-1 rounded-full bg-ink-300" aria-hidden="true" />
            )}
          </span>
          <span className="min-w-0">
            <span
              className={`text-[12.5px] leading-snug ${
                s.state === "doing"
                  ? "text-ink-900"
                  : s.state === "failed"
                    ? "text-warning"
                    : s.state === "skipped"
                      ? "text-ink-400"
                      : "text-ink-600"
              }`}
            >
              {s.label}
            </span>
            {s.detail && (
              <span className="mt-0.5 block font-mono text-[11px] text-ink-400 leading-snug">
                {s.detail}
              </span>
            )}
          </span>
        </li>
      ))}
    </ol>
  );
}

/**
 * A running list of steps, as a value the caller mutates through one function.
 *
 * The alternative is every tool keeping its own array and its own "mark the
 * last one done" logic, which is where the states drift: one tool leaves the
 * final step spinning forever, another marks everything done before the work
 * finishes. This owns the transitions, so a step can only be finished by
 * starting the next one or by ending the run.
 */
export class StepLog {
  private steps: AssistStep[] = [];

  constructor(private readonly onChange: (steps: AssistStep[]) => void) {}

  /** Begin a step, finishing the previous one. */
  start(id: string, label: string): void {
    this.finishLast("done");
    this.steps = [...this.steps, { id, label, state: "doing" }];
    this.onChange(this.steps);
  }

  /** Add a line under the step in progress. */
  detail(text: string): void {
    const last = this.steps[this.steps.length - 1];
    if (!last) return;
    this.steps = [...this.steps.slice(0, -1), { ...last, detail: text }];
    this.onChange(this.steps);
  }

  /** Record a step that did not need doing, so the list stays honest. */
  skip(id: string, label: string, why?: string): void {
    this.finishLast("done");
    this.steps = [...this.steps, { id, label, state: "skipped", detail: why }];
    this.onChange(this.steps);
  }

  done(): void {
    this.finishLast("done");
    this.onChange(this.steps);
  }

  fail(message?: string): void {
    this.finishLast("failed", message);
    this.onChange(this.steps);
  }

  get value(): AssistStep[] {
    return this.steps;
  }

  private finishLast(state: StepState, detail?: string): void {
    const last = this.steps[this.steps.length - 1];
    if (!last || last.state !== "doing") return;
    this.steps = [...this.steps.slice(0, -1), { ...last, state, ...(detail ? { detail } : {}) }];
  }
}
