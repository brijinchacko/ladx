"use client";

import { useEffect, useState } from "react";
import { ThinkingMark } from "../brand/thinking-mark";

/**
 * What LADX shows while it is thinking.
 *
 * The gap between pressing send and the first token is the moment a chat feels
 * broken or feels alive, and on a free model that gap can be several seconds.
 * A static spinner says "busy"; this says "working, and still working", which
 * is the difference between waiting and wondering whether it heard you.
 *
 * Two parts. The mark, turning, so there is always motion and it is LADX's own
 * rather than a browser spinner. And a line of text that advances through
 * stages if the wait runs long, because after four seconds a person wants
 * evidence that something is still happening rather than the same word they
 * read at the start.
 */

const STAGES: { after: number; label: string }[] = [
  { after: 0, label: "Thinking" },
  { after: 3500, label: "Working through the logic" },
  { after: 9000, label: "Still going, free models can be slow" },
  { after: 20000, label: "Waiting on the provider" },
];

export function Thinking({ label }: { label?: string }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const started = Date.now();
    const t = setInterval(() => setElapsed(Date.now() - started), 500);
    return () => clearInterval(t);
  }, []);

  const stage =
    label ?? [...STAGES].reverse().find((s) => elapsed >= s.after)?.label ?? STAGES[0]?.label;

  return (
    <div className="flex items-center gap-2.5" aria-live="polite" aria-busy="true">
      <ThinkingMark size={15} className="text-teal-600" />
      <span className="text-[13px] text-ink-400">{stage}</span>
      <span className="sr-only">LADX is generating a reply.</span>
    </div>
  );
}

/**
 * The caret that trails streaming text.
 *
 * Sits at the end of the last line so the answer reads as being written rather
 * than as having arrived.
 */
export function StreamCaret() {
  return (
    <span
      aria-hidden="true"
      className="ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[0.15em] bg-ink-400 [animation:ladx-caret_1s_step-end_infinite]"
    />
  );
}
