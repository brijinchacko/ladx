"use client";

import { useId } from "react";
import { formatLength } from "../lib/types";
import type { Entity, Layer } from "../lib/types";

/**
 * What is selected, and how to change it.
 *
 * Drawing accurately with the mouse alone stops working the moment precision
 * matters: a terminal at 6 mm pitch, a rail 35 mm from the plate edge, a
 * dimension that has to read "typ." rather than its measurement. Every CAD
 * package answers this the same way, with a properties panel that lets you type
 * the number, and a drafting tool without one is a sketching tool.
 *
 * Edits apply immediately rather than behind an Apply button, because the
 * canvas is right there showing the result and undo already exists.
 */
export default function CadProperties({
  selected,
  layers,
  onChange,
  onChangeLayer,
}: {
  selected: Entity[];
  layers: Layer[];
  /** One entity, changed. The editor commits it to history. */
  onChange: (next: Entity) => void;
  /** Every selected entity moved to a layer, which is the common bulk edit. */
  onChangeLayer: (layer: string) => void;
}) {
  const id = useId();

  if (selected.length === 0) {
    return (
      <p className="px-1 text-[11.5px] leading-snug text-ink-400">
        Nothing selected. Click something on the drawing, or drag a box around it.
      </p>
    );
  }

  if (selected.length > 1) {
    return (
      <div className="space-y-2">
        <p className="text-[12px] text-ink-600">
          {selected.length} entities selected.
          <span className="mt-0.5 block text-[11px] text-ink-400">
            Move them to a layer, or edit them one at a time.
          </span>
        </p>
        <LayerSelect
          id={`${id}-bulk`}
          layers={layers}
          value={
            selected.every((e) => e.layer === selected[0]?.layer) ? (selected[0]?.layer ?? "") : ""
          }
          onChange={onChangeLayer}
          mixed={!selected.every((e) => e.layer === selected[0]?.layer)}
        />
      </div>
    );
  }

  const e = selected[0] as Entity;
  const set = (patch: Partial<Entity>) => onChange({ ...e, ...patch } as Entity);

  return (
    <div className="space-y-2.5">
      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-400">{e.type}</p>

      <LayerSelect
        id={`${id}-layer`}
        layers={layers}
        value={e.layer}
        onChange={(layer) => set({ layer })}
      />

      {(e.type === "line" || e.type === "rect" || e.type === "dimension") && (
        <>
          <PointRow
            id={`${id}-a`}
            label={e.type === "rect" ? "Corner 1" : "From"}
            point={e.a}
            onChange={(a) => set({ a })}
          />
          <PointRow
            id={`${id}-b`}
            label={e.type === "rect" ? "Corner 2" : "To"}
            point={e.b}
            onChange={(b) => set({ b })}
          />
          <Readout
            label={e.type === "rect" ? "Size" : "Length"}
            value={
              e.type === "rect"
                ? `${formatLength(Math.abs(e.b.x - e.a.x))} x ${formatLength(Math.abs(e.b.y - e.a.y))} mm`
                : `${formatLength(Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y))} mm`
            }
          />
        </>
      )}

      {(e.type === "circle" || e.type === "arc") && (
        <>
          <PointRow id={`${id}-c`} label="Centre" point={e.c} onChange={(c) => set({ c })} />
          <NumberRow
            id={`${id}-r`}
            label="Radius"
            value={e.r}
            onChange={(r) => set({ r: Math.max(0.01, r) })}
          />
          {e.type === "arc" && (
            <>
              <NumberRow
                id={`${id}-start`}
                label="Start angle"
                value={e.start}
                suffix="deg"
                onChange={(start) => set({ start })}
              />
              <NumberRow
                id={`${id}-end`}
                label="End angle"
                value={e.end}
                suffix="deg"
                onChange={(end) => set({ end })}
              />
            </>
          )}
        </>
      )}

      {e.type === "text" && (
        <>
          <label
            htmlFor={`${id}-text`}
            className="block font-mono text-[10px] uppercase tracking-[0.1em] text-ink-400"
          >
            Text
          </label>
          <textarea
            id={`${id}-text`}
            value={e.text}
            onChange={(ev) => set({ text: ev.target.value })}
            rows={2}
            className="w-full rounded-md border border-ink-200 px-2 py-1.5 text-[12.5px] outline-none focus:border-ink-500"
          />
          <PointRow id={`${id}-at`} label="At" point={e.at} onChange={(at) => set({ at })} />
          <NumberRow
            id={`${id}-h`}
            label="Height"
            value={e.height}
            onChange={(height) => set({ height: Math.max(0.5, height) })}
          />
        </>
      )}

      {e.type === "dimension" && (
        <>
          <NumberRow
            id={`${id}-off`}
            label="Offset"
            value={e.offset}
            onChange={(offset) => set({ offset })}
          />
          <NumberRow
            id={`${id}-dh`}
            label="Text height"
            value={e.height}
            onChange={(height) => set({ height: Math.max(0.5, height) })}
          />
          <label
            htmlFor={`${id}-label`}
            className="block font-mono text-[10px] uppercase tracking-[0.1em] text-ink-400"
          >
            Override
          </label>
          <input
            id={`${id}-label`}
            value={e.label ?? ""}
            placeholder={formatLength(Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y))}
            onChange={(ev) => set({ label: ev.target.value || undefined })}
            className="w-full rounded-md border border-ink-200 px-2 py-1 text-[12.5px] outline-none placeholder:text-ink-400 focus:border-ink-500"
          />
          <p className="text-[10.5px] leading-snug text-ink-400">
            Empty measures the geometry. Fill it only for a dimension that is deliberately not its
            own measurement, like "typ." or "ref".
          </p>
        </>
      )}

      {e.type === "polyline" && (
        <>
          <Readout label="Vertices" value={String(e.points.length)} />
          <label className="flex items-center gap-2 text-[12px] text-ink-700">
            <input
              type="checkbox"
              checked={e.closed}
              onChange={(ev) => set({ closed: ev.target.checked })}
              className="h-3 w-3"
            />
            Closed
          </label>
        </>
      )}
    </div>
  );
}

function LayerSelect({
  id,
  layers,
  value,
  onChange,
  mixed,
}: {
  id: string;
  layers: Layer[];
  value: string;
  onChange: (v: string) => void;
  mixed?: boolean;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="block font-mono text-[10px] uppercase tracking-[0.1em] text-ink-400"
      >
        Layer
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-0.5 w-full rounded-md border border-ink-200 bg-white px-2 py-1 text-[12.5px] outline-none focus:border-ink-500"
      >
        {mixed && <option value="">mixed</option>}
        {layers.map((l) => (
          <option key={l.name} value={l.name}>
            {l.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function PointRow({
  id,
  label,
  point,
  onChange,
}: {
  id: string;
  label: string;
  point: { x: number; y: number };
  onChange: (p: { x: number; y: number }) => void;
}) {
  return (
    <div>
      <span className="block font-mono text-[10px] uppercase tracking-[0.1em] text-ink-400">
        {label}
      </span>
      <div className="mt-0.5 flex gap-1.5">
        <Num
          id={`${id}-x`}
          prefix="X"
          value={point.x}
          onChange={(x) => onChange({ ...point, x })}
        />
        <Num
          id={`${id}-y`}
          prefix="Y"
          value={point.y}
          onChange={(y) => onChange({ ...point, y })}
        />
      </div>
    </div>
  );
}

function NumberRow({
  id,
  label,
  value,
  suffix,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="block font-mono text-[10px] uppercase tracking-[0.1em] text-ink-400"
      >
        {label}
      </label>
      <div className="mt-0.5">
        <Num id={id} value={value} suffix={suffix} onChange={onChange} />
      </div>
    </div>
  );
}

/**
 * A number field that does not fight you while you type.
 *
 * Parsing on every keystroke turns "-" and "1." into NaN and snaps the value
 * back, which makes typing a negative offset impossible. Anything unparseable
 * is left alone and the last good value stands.
 */
function Num({
  id,
  prefix,
  suffix,
  value,
  onChange,
}: {
  id: string;
  prefix?: string;
  suffix?: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-1 rounded-md border border-ink-200 px-1.5 focus-within:border-ink-500">
      {prefix && <span className="shrink-0 font-mono text-[10px] text-ink-400">{prefix}</span>}
      <input
        id={id}
        inputMode="decimal"
        value={Number.isInteger(value) ? String(value) : value.toFixed(2)}
        onChange={(e) => {
          const n = Number.parseFloat(e.target.value);
          if (!Number.isNaN(n)) onChange(n);
        }}
        className="min-w-0 flex-1 border-0 bg-transparent py-1 font-mono text-[12px] tabular-nums outline-none"
      />
      {suffix && <span className="shrink-0 font-mono text-[10px] text-ink-400">{suffix}</span>}
    </span>
  );
}

function Readout({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-t border-ink-100 pt-1.5">
      <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-400">{label}</span>
      <span className="font-mono text-[11.5px] tabular-nums text-ink-700">{value}</span>
    </div>
  );
}
