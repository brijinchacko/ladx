"use client";

import { Download, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { type Historian, historyToCsv } from "../lib/historian";
import type { TrendDef } from "../lib/types";

/**
 * Reviewing a recorded run.
 *
 * A trend widget answers "what is it doing", which is a question about the
 * last few minutes and is why it is a ring buffer. This answers "what did it
 * do", which is the question asked after the run, usually about a moment that
 * has already scrolled off the end.
 *
 * Said plainly on the panel itself: the runtime is the simulator, so this is a
 * recording of a test rather than a plant history. That wording is not
 * modesty. Somebody will eventually put one of these next to a real trend in a
 * report, and the label is what stops it being read as an instrument record.
 */

function stamp(t: number): string {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function duration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

/**
 * The band chart.
 *
 * Every bucket is drawn as a vertical extent from its low to its high, so a
 * compacted region reads as a band and a live sample reads as a point. Drawn
 * against time rather than against sample index, because the recording mixes
 * compacted buckets with live samples and an index axis would compress the
 * recent past into a sliver without saying so.
 */
function Band({
  historian,
  pens,
  width,
  height,
}: {
  historian: Historian;
  pens: TrendDef["pens"];
  width: number;
  height: number;
}) {
  const buckets = historian.all();
  const extent = historian.extent();
  if (!extent || buckets.length === 0) return null;

  const t0 = extent.from;
  const t1 = extent.to;
  const xOf = (t: number) => (t1 === t0 ? 0 : ((t - t0) / (t1 - t0)) * width);

  /**
   * A pen with no scale set is drawn against its own recorded range.
   *
   * The trend widget falls back to nought to a hundred, which is a reasonable
   * guess for a live gauge on a screen somebody has configured. It is the
   * wrong default here: a review chart exists to show what happened, and a
   * pen that ran to 2400 against an assumed hundred is a flat line along the
   * bottom, which reads as "nothing happened" rather than "wrong scale".
   *
   * Padded by a twentieth so a flat trace does not sit exactly on an edge, and
   * a pen that never moved is given a band around its value rather than a zero
   * height range that would divide by nothing.
   */
  const scaleOf = (pi: number): { lo: number; hi: number; auto: boolean } => {
    const pen = pens[pi];
    if (pen?.min !== undefined && pen?.max !== undefined) {
      return { lo: pen.min, hi: pen.max, auto: false };
    }
    let lo: number | null = null;
    let hi: number | null = null;
    for (const b of buckets) {
      const l = b.lo[pi];
      const h = b.hi[pi];
      if (l !== null && l !== undefined) lo = lo === null ? l : Math.min(lo, l);
      if (h !== null && h !== undefined) hi = hi === null ? h : Math.max(hi, h);
    }
    if (lo === null || hi === null) return { lo: 0, hi: 100, auto: true };
    if (lo === hi) return { lo: lo - 1, hi: hi + 1, auto: true };
    const pad = (hi - lo) / 20;
    return { lo: lo - pad, hi: hi + pad, auto: true };
  };

  return (
    <svg width={width} height={height} role="img" aria-label="Recorded run">
      <title>Recorded run</title>
      {[0.25, 0.5, 0.75].map((f) => (
        <line
          key={f}
          x1={0}
          y1={height * f}
          x2={width}
          y2={height * f}
          stroke="rgb(var(--ink-900))"
          strokeWidth="0.5"
          opacity="0.12"
        />
      ))}
      {pens.map((pen, pi) => {
        const { lo, hi } = scaleOf(pi);
        const yOf = (v: number) =>
          Math.max(0, Math.min(height, height - ((v - lo) / (hi - lo || 1)) * height));

        /*
         * Broken into segments wherever a bucket has nothing readable, rather
         * than joined across the gap. A line drawn straight through missing
         * data is a claim the recording cannot support, and it is the exact
         * shape somebody would read as "steady".
         */
        const segments: string[][] = [];
        let current: string[] = [];
        for (const b of buckets) {
          const l = b.lo[pi];
          const h = b.hi[pi];
          if (l === null || l === undefined || h === null || h === undefined) {
            if (current.length > 1) segments.push(current);
            current = [];
            continue;
          }
          const x = xOf(b.t + b.span / 2);
          current.push(`${x.toFixed(1)},${yOf((l + h) / 2).toFixed(1)}`);
        }
        if (current.length > 1) segments.push(current);

        return (
          <g key={pen.id}>
            {/* The envelope first, so the mid line sits on top of it. */}
            {buckets.map((b) => {
              const l = b.lo[pi];
              const h = b.hi[pi];
              if (l === null || l === undefined || h === null || h === undefined) return null;
              if (l === h) return null;
              const x = xOf(b.t + b.span / 2);
              return (
                <line
                  key={`${pen.id}-${b.t}`}
                  x1={x}
                  y1={yOf(l)}
                  x2={x}
                  y2={yOf(h)}
                  stroke={pen.colour}
                  strokeWidth="1.5"
                  opacity="0.35"
                />
              );
            })}
            {segments.map((seg) => (
              <polyline
                key={seg[0]}
                points={seg.join(" ")}
                fill="none"
                stroke={pen.colour}
                strokeWidth="1.4"
                strokeLinejoin="round"
              />
            ))}
          </g>
        );
      })}
    </svg>
  );
}

export default function HistoryPanel({
  trends,
  historians,
  onClear,
  onClose,
}: {
  trends: TrendDef[];
  /** One recording per trend, by trend id. Live: the panel reads it as it is. */
  historians: Map<string, Historian>;
  onClear: (trendId: string) => void;
  onClose: () => void;
}) {
  const [trendId, setTrendId] = useState<string>(trends[0]?.id ?? "");
  const trend = trends.find((t) => t.id === trendId) ?? trends[0];
  const historian = trend ? historians.get(trend.id) : undefined;

  const extent = historian?.extent() ?? null;

  /**
   * Low, high and last per pen across the whole recording.
   *
   * The three numbers somebody actually reads off a run: how far it went each
   * way, and where it finished.
   */
  const summary = useMemo(() => {
    if (!historian || !trend) return [];
    const buckets = historian.all();
    return trend.pens.map((pen, pi) => {
      let lo: number | null = null;
      let hi: number | null = null;
      let last: number | null = null;
      for (const b of buckets) {
        const l = b.lo[pi];
        const h = b.hi[pi];
        if (l !== null && l !== undefined) lo = lo === null ? l : Math.min(lo, l);
        if (h !== null && h !== undefined) {
          hi = hi === null ? h : Math.max(hi, h);
          last = h;
        }
      }
      return { pen, lo, hi, last };
    });
  }, [historian, trend]);

  const download = () => {
    if (!historian || !trend) return;
    const blob = new Blob([historyToCsv(historian)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${trend.name.replace(/[^\w.-]+/g, "-")}-run.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const num = (v: number | null) => (v === null ? "-" : v.toFixed(2).replace(/\.00$/, ""));

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/60"
      onClick={onClose}
      onKeyDown={undefined}
    >
      <div
        className="flex h-full w-full max-w-xl flex-col bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-ink-100 px-4 py-3">
          <h2 className="font-display text-[15px] font-bold text-ink-900">Recorded run</h2>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto text-ink-400 hover:text-ink-900"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <p className="mb-4 text-[12.5px] leading-relaxed text-ink-600">
            The runtime here is the simulator, so this is a recording of a test rather than a plant
            history. It keeps the recent samples whole and folds older ones into bands of minimum
            and maximum, so a brief excursion survives being compacted instead of being averaged
            flat.
          </p>

          {trends.length === 0 && (
            <p className="text-[13px] text-ink-500">
              No trends are defined yet. Add one under Setup, Trends, and it will record while the
              panel runs.
            </p>
          )}

          {trends.length > 1 && (
            <div className="mb-3 flex gap-0.5">
              {trends.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTrendId(t.id)}
                  className={`rounded-sm px-2 py-1 text-[12.5px] transition-colors ${
                    t.id === trend?.id ? "bg-ink-900 text-white" : "text-ink-600 hover:bg-ink-50"
                  }`}
                >
                  {t.name}
                </button>
              ))}
            </div>
          )}

          {trend && !extent && (
            <p className="text-[13px] text-ink-500">
              Nothing recorded yet. Press Run and this fills as the trend samples.
            </p>
          )}

          {trend && extent && historian && (
            <>
              <dl className="mb-3 flex flex-wrap gap-x-6 gap-y-1 text-[12.5px]">
                <div className="flex gap-1.5">
                  <dt className="text-ink-500">From</dt>
                  <dd className="font-mono text-ink-900">{stamp(extent.from)}</dd>
                </div>
                <div className="flex gap-1.5">
                  <dt className="text-ink-500">To</dt>
                  <dd className="font-mono text-ink-900">{stamp(extent.to)}</dd>
                </div>
                <div className="flex gap-1.5">
                  <dt className="text-ink-500">Length</dt>
                  <dd className="font-mono text-ink-900">{duration(extent.to - extent.from)}</dd>
                </div>
                <div className="flex gap-1.5">
                  <dt className="text-ink-500">Points</dt>
                  <dd className="font-mono text-ink-900">{historian.length.toLocaleString()}</dd>
                </div>
              </dl>

              <div className="mb-4 rounded-sm border border-ink-100 bg-ink-50 p-2">
                <Band historian={historian} pens={trend.pens} width={520} height={160} />
              </div>
              <p className="-mt-3 mb-4 text-[11.5px] text-ink-500">
                Each pen is drawn against its own range unless a scale is set on it, so the shapes
                are comparable and the numbers are in the table. The paler band behind a trace is
                the spread inside a compacted interval.
              </p>

              <table className="mb-4 w-full text-[12.5px]">
                <thead>
                  <tr className="border-ink-100 border-b text-left text-ink-500">
                    <th className="py-1 font-medium">Pen</th>
                    <th className="py-1 text-right font-medium">Lowest</th>
                    <th className="py-1 text-right font-medium">Highest</th>
                    <th className="py-1 text-right font-medium">Last</th>
                  </tr>
                </thead>
                <tbody className="font-mono">
                  {summary.map(({ pen, lo, hi, last }) => (
                    <tr key={pen.id} className="border-ink-50 border-b">
                      <td className="py-1">
                        <span
                          className="mr-2 inline-block h-2 w-2 rounded-full align-middle"
                          style={{ background: pen.colour }}
                        />
                        <span className="font-sans text-ink-900">
                          {pen.label ?? pen.target.tag}
                        </span>
                      </td>
                      <td className="py-1 text-right tabular-nums text-ink-900">{num(lo)}</td>
                      <td className="py-1 text-right tabular-nums text-ink-900">{num(hi)}</td>
                      <td className="py-1 text-right tabular-nums text-ink-900">{num(last)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={download}
                  className="inline-flex items-center gap-1.5 rounded-sm bg-ink-900 px-2.5 py-1.5 text-[12.5px] text-white hover:bg-ink-800"
                >
                  <Download className="h-3.5 w-3.5" />
                  Export CSV
                </button>
                <button
                  type="button"
                  onClick={() => onClear(trend.id)}
                  className="inline-flex items-center gap-1.5 rounded-sm border border-ink-200 px-2.5 py-1.5 text-[12.5px] text-ink-700 hover:bg-ink-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Clear recording
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
