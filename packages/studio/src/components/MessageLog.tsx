"use client";

import { AlertCircle, AlertTriangle, CheckCircle2, Info, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { LEVEL_STYLE, type LogMessage, type MessageLevel, countBy, stamp } from "../lib/messages";
import { brand, ink, line, surface } from "../lib/theme";
import css from "./ladx.module.css";

const ICON: Record<MessageLevel, React.ComponentType<{ size?: number }>> = {
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
  success: CheckCircle2,
};

/**
 * The output window: everything the editor and the controller have reported.
 *
 * The point of keeping history is that the message explaining the current
 * confusion was usually printed a minute ago. Filters exist because a scanning
 * simulator produces a lot of info, and the one error in it is what matters.
 */
export default function MessageLog({
  log,
  onClear,
  onPick,
}: {
  log: LogMessage[];
  onClear: () => void;
  /** Jump to whatever a message refers to: a network, a tag. */
  onPick?: (m: LogMessage) => void;
}) {
  const [filter, setFilter] = useState<MessageLevel | "all">("all");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pinned = useRef(true);

  const rows = useMemo(
    () => (filter === "all" ? log : log.filter((m) => m.level === filter)),
    [log, filter],
  );

  // Newest sits at the top, so the panel can be two rows tall and still show
  // what just happened. Follow it there, but stop the moment somebody
  // scrolls down to read something older, or the log yanks itself away
  // mid-sentence.
  useEffect(() => {
    if (pinned.current) scrollRef.current?.scrollTo({ top: 0 });
  }, [rows.length]);

  // Every chip counts messages, not rows: a collapsed row standing for nine
  // identical errors is nine errors. "All" counting rows while "Errors"
  // counted messages made the numbers disagree on screen.
  const counts = {
    all: log.reduce((n, m) => n + m.count, 0),
    error: countBy(log, "error"),
    warning: countBy(log, "warning"),
    info: countBy(log, "info") + countBy(log, "success"),
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div
        className="flex items-center gap-1 px-2 shrink-0"
        style={{ height: 24, borderBottom: `1px solid ${line.soft}`, background: surface.subtle }}
      >
        <Chip
          label="All"
          n={counts.all}
          active={filter === "all"}
          onClick={() => setFilter("all")}
        />
        <Chip
          label="Errors"
          n={counts.error}
          active={filter === "error"}
          tone="#B3382C"
          onClick={() => setFilter("error")}
        />
        <Chip
          label="Warnings"
          n={counts.warning}
          active={filter === "warning"}
          tone="#B45309"
          onClick={() => setFilter("warning")}
        />
        <Chip
          label="Info"
          n={counts.info}
          active={filter === "info"}
          onClick={() => setFilter("info")}
        />
        <span className="flex-1" />
        <button
          type="button"
          onClick={onClear}
          title="Clear the log"
          disabled={log.length === 0}
          className={`${css.iconBtn} disabled:opacity-30`}
        >
          <Trash2 size={11} />
        </button>
      </div>

      <div
        ref={scrollRef}
        onScroll={(e) => {
          pinned.current = e.currentTarget.scrollTop < 24;
        }}
        className="flex-1 min-h-0 overflow-auto font-mono"
        style={{ fontSize: 10.5 }}
      >
        {rows.length === 0 ? (
          <p className="px-2.5 py-2 text-[10.5px] text-ink-400 font-sans italic">
            {log.length === 0
              ? "Nothing yet. Compile results, warnings, errors and controller faults appear here."
              : `No ${filter} messages.`}
          </p>
        ) : (
          rows.map((m, i) => {
            const s = LEVEL_STYLE[m.level];
            const Icon = ICON[m.level];
            return (
              <div
                key={m.id}
                onClick={() => onPick?.(m)}
                className={`flex items-start gap-2 px-2.5 py-[3.5px] ${css.logRow} ${i === 0 ? css.rowIn : ""} ${onPick ? "cursor-pointer" : ""}`}
                style={{ borderBottom: `1px solid ${line.hairline}` }}
              >
                <span className="shrink-0 mt-[1px]" style={{ color: s.colour }}>
                  <Icon size={10} />
                </span>
                <span className="shrink-0 tabular-nums" style={{ color: ink.faint }}>
                  {stamp(m.at)}
                </span>
                <span className="shrink-0" style={{ color: ink.muted, minWidth: 62 }}>
                  {m.source}
                </span>
                <span className="flex-1 break-words" style={{ color: s.colour }}>
                  {m.text}
                </span>
                {m.count > 1 && (
                  <span
                    className="shrink-0 px-1 rounded-full text-[9px] font-sans font-bold"
                    style={{ background: s.bg, color: s.colour }}
                  >
                    ×{m.count}
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function Chip({
  label,
  n,
  active,
  tone,
  onClick,
}: {
  label: string;
  n: number;
  active: boolean;
  tone?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1 px-1.5 rounded-sm font-semibold ${css.logChip}`}
      style={{
        height: 17,
        fontSize: 9.5,
        background: active ? brand.tealWash : "transparent",
        color: active ? brand.tealInk : n > 0 && tone ? tone : ink.muted,
      }}
    >
      {label}
      {n > 0 && <span className="tabular-nums opacity-70">{n}</span>}
    </button>
  );
}
