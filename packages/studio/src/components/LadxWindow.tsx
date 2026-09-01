"use client";

import { Cpu } from "lucide-react";
import FloatingWindow from "./FloatingWindow";
import LadxHome from "./LadxHome";

/**
 * LADX Mini, floating over the lesson.
 *
 * The reason to practise a rung is that you just watched somebody explain it.
 * Sending the student to another page to do that loses their place in the
 * video, so the simulator opens in the same movable window the notes use.
 */
export default function LadxWindow({ onClose }: { onClose: () => void }) {
  return (
    <FloatingWindow
      storageKey="ladx"
      title="LADX Mini"
      icon={<Cpu size={13} style={{ color: "rgb(var(--teal-500))" }} className="shrink-0" />}
      onClose={onClose}
      defaultWidth={900}
      defaultHeight={620}
    >
      <div className="flex-1 min-h-0 overflow-auto p-3 bg-ink-100">
        <LadxHome />
      </div>
    </FloatingWindow>
  );
}
