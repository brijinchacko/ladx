"use client";

import type { Element, LadxProgram } from "../lib/types";

/**
 * A submitted program, drawn read-only for marking.
 *
 * Text would be quicker to build and useless to mark: a trainer needs to see
 * the rung, because the mistakes in ladder are structural: a contact in the
 * wrong branch, a missing seal-in, a coil on the wrong tag. Those are visible
 * in a diagram and invisible in a list.
 */

const LIVE = "rgb(var(--teal-500))";

function glyph(el: Element): string {
  switch (el.type) {
    case "XIC":
      return "┤ ├";
    case "XIO":
      return "┤/├";
    case "OTE":
      return "( )";
    case "OTL":
      return "(L)";
    case "OTU":
      return "(U)";
    case "RES":
      return "(RES)";
    default:
      return el.type;
  }
}

function Box({ el }: { el: Element }) {
  const wide = !["XIC", "XIO", "OTE", "OTL", "OTU"].includes(el.type);
  return (
    <span className="flex flex-col items-center shrink-0">
      <span className="text-[9.5px] font-mono text-text-muted mb-0.5 max-w-[7rem] truncate">
        {el.tag || "-"}
      </span>
      <span
        className={`flex flex-col items-center justify-center rounded border-2 ${
          wide ? "px-2 h-8 min-w-[4rem]" : "w-12 h-8"
        }`}
        style={{ borderColor: "rgb(var(--ink-700))", color: "#c9d2cb" }}
      >
        <span className="font-mono text-[13px] leading-none">{glyph(el)}</span>
        {el.preset !== undefined && (
          <span className="text-[8.5px] opacity-70 leading-none mt-0.5">
            {el.type === "TON" || el.type === "TOF"
              ? `${(el.preset / 1000).toFixed(el.preset % 1000 ? 1 : 0)}s`
              : el.preset}
          </span>
        )}
        {el.operand && (
          <span className="text-[8.5px] opacity-70 leading-none mt-0.5">{el.operand}</span>
        )}
      </span>
    </span>
  );
}

const Wire = ({ grow = false }: { grow?: boolean }) => (
  <span
    className={grow ? "flex-1 min-w-[1rem]" : "w-4"}
    style={{ height: 2, background: "rgb(var(--ink-700))", marginTop: 18 }}
  />
);

export default function LadderPreview({ program }: { program: LadxProgram }) {
  if (!program?.rungs?.length) {
    return <p className="text-[12.5px] text-text-muted">This program has no rungs.</p>;
  }

  return (
    <div className="space-y-2">
      {program.rungs.map((r, i) => (
        <div key={r.id ?? i} className="rounded-lg border border-white/[0.07] bg-on-accent p-2.5">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[9.5px] font-mono font-bold px-1.5 py-0.5 rounded bg-white/[0.05] text-text-muted">
              {String(i + 1).padStart(3, "0")}
            </span>
            {r.comment && (
              <span className="text-[10.5px] text-text-muted truncate">{r.comment}</span>
            )}
          </div>

          <div className="flex items-stretch overflow-x-auto">
            <span
              className="w-[3px] shrink-0 rounded-sm"
              style={{ background: LIVE, opacity: 0.7 }}
            />
            <div className="flex-1 min-w-0 flex flex-col justify-center gap-2 pl-1">
              {(r.branches.length ? r.branches : [[]]).map((branch, bi) => (
                <div key={bi} className="flex items-start">
                  <Wire />
                  {branch.map((el) => (
                    <span key={el.id} className="flex items-start">
                      <Box el={el} />
                      <Wire />
                    </span>
                  ))}
                  {branch.length === 0 && (
                    <span className="text-[10px] text-text-muted mt-4">(empty branch)</span>
                  )}
                  <Wire grow />
                </div>
              ))}
            </div>
            <div className="flex items-center shrink-0 pl-1">
              {r.outputs.map((el) => (
                <span key={el.id} className="flex items-start">
                  <Wire />
                  <Box el={el} />
                </span>
              ))}
              {r.outputs.length === 0 && (
                <span className="text-[10px] text-warning mt-4">no output</span>
              )}
            </div>
            <span
              className="w-[3px] shrink-0 rounded-sm ml-2"
              style={{ background: LIVE, opacity: 0.7 }}
            />
          </div>
        </div>
      ))}

      <div className="rounded-lg border border-white/[0.07] bg-on-accent p-2.5">
        <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted mb-1.5">
          Tags declared
        </p>
        <div className="flex flex-wrap gap-1.5">
          {(program.tags ?? []).map((t) => (
            <span
              key={t.name}
              className="text-[10.5px] font-mono px-1.5 py-0.5 rounded bg-white/[0.05] text-text-secondary"
            >
              {t.name}
              <span className="text-text-muted"> · {t.type}</span>
              {t.preset ? <span className="text-text-muted"> · {t.preset}</span> : null}
            </span>
          ))}
          {(program.tags ?? []).length === 0 && (
            <span className="text-[11px] text-text-muted">None</span>
          )}
        </div>
      </div>
    </div>
  );
}
