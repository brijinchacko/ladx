"use client";

import { useState } from "react";

/**
 * A colour control that offers the whole space, not a fixed set.
 *
 * The swatches are a shortcut, not the menu. Behind them is the native colour
 * picker and a hex box, because plant standards are specific: a house style
 * that says pumps are #1F6FB2 cannot be met from a palette of twelve, and
 * being unable to type the number is the point at which somebody gives up on
 * the tool and draws the screen somewhere else.
 *
 * The first row is the ISA-101 set, which is what most process graphics should
 * use, and the rest is everything else.
 */

/** Muted, for the base drawing. ISA-101 wants the screen quiet at rest. */
const PROCESS = [
  "#D8DCDF",
  "#C9CED3",
  "#B4BBC1",
  "#9AA7B2",
  "#7A8894",
  "#5A646E",
  "#3A4550",
  "#2B3138",
  "#E8EAEC",
  "#F2F4F5",
  "#FFFFFF",
  "transparent",
];

/** Reserved for deviation. Named so nobody uses red for a running pump. */
const STATE: { c: string; label: string }[] = [
  { c: "#3FBFB5", label: "Running / healthy" },
  { c: "#2E7D32", label: "Open / on" },
  { c: "#E8C39A", label: "Warning" },
  { c: "#B4531A", label: "Alarm" },
  { c: "#C62828", label: "Critical" },
  { c: "#1F6FB2", label: "Operator action" },
  { c: "#6A4FA3", label: "Manual / bypassed" },
  { c: "#8A8F94", label: "Out of service" },
];

/** Everything else, for equipment that is genuinely coloured. */
const WIDE = [
  "#FFEB3B",
  "#FFC107",
  "#FF9800",
  "#FF5722",
  "#F44336",
  "#E91E63",
  "#9C27B0",
  "#673AB7",
  "#3F51B5",
  "#2196F3",
  "#03A9F4",
  "#00BCD4",
  "#009688",
  "#4CAF50",
  "#8BC34A",
  "#CDDC39",
  "#795548",
  "#607D8B",
  "#000000",
  "#FFFFFF",
];

export default function ColourField({
  label,
  value,
  onChange,
  allowNone = false,
}: {
  label: string;
  value: string;
  onChange: (c: string) => void;
  allowNone?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [hex, setHex] = useState(value);

  const commit = (c: string) => {
    setHex(c);
    onChange(c);
  };

  return (
    <div className="relative">
      <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.1em] text-ink-400">
        {label}
      </span>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 rounded-sm border border-ink-200 bg-white px-1.5 py-1 text-[11.5px] text-ink-700 hover:border-ink-400"
      >
        <span
          className="h-4 w-6 shrink-0 rounded-[2px] border border-ink-300"
          style={{
            background:
              value === "transparent"
                ? "repeating-conic-gradient(#ccc 0 25%, #fff 0 50%) 50%/8px 8px"
                : value,
          }}
        />
        <span className="truncate font-mono">{value}</span>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-40 mt-1 w-[210px] rounded-sm border border-ink-200 bg-white p-2 shadow-lg">
          <p className="mb-1 font-mono text-[9.5px] uppercase tracking-[0.1em] text-ink-400">
            Process
          </p>
          <div className="mb-2 grid grid-cols-6 gap-1">
            {PROCESS.filter((c) => allowNone || c !== "transparent").map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => commit(c)}
                title={c}
                className="h-5 w-full rounded-[2px] border border-ink-300"
                style={{
                  background:
                    c === "transparent"
                      ? "repeating-conic-gradient(#ccc 0 25%, #fff 0 50%) 50%/6px 6px"
                      : c,
                }}
              />
            ))}
          </div>

          <p className="mb-1 font-mono text-[9.5px] uppercase tracking-[0.1em] text-ink-400">
            State
          </p>
          <div className="mb-2 grid grid-cols-4 gap-1">
            {STATE.map((s) => (
              <button
                key={s.c}
                type="button"
                onClick={() => commit(s.c)}
                title={`${s.label} · ${s.c}`}
                className="h-5 w-full rounded-[2px] border border-ink-300"
                style={{ background: s.c }}
              />
            ))}
          </div>

          <p className="mb-1 font-mono text-[9.5px] uppercase tracking-[0.1em] text-ink-400">All</p>
          <div className="mb-2 grid grid-cols-10 gap-0.5">
            {WIDE.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => commit(c)}
                title={c}
                className="h-4 w-full rounded-[1px] border border-ink-200"
                style={{ background: c }}
              />
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <input
              type="color"
              value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#888888"}
              onChange={(e) => commit(e.target.value)}
              title="Pick any colour"
              className="h-6 w-8 shrink-0"
            />
            <input
              value={hex}
              onChange={(e) => setHex(e.target.value)}
              onBlur={() => {
                // Accepted only when it is a colour: a half-typed hex must not
                // repaint the object black on every keystroke.
                if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex) || hex === "transparent")
                  onChange(hex);
                else setHex(value);
              }}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              placeholder="#3FBFB5"
              className="w-full rounded-sm border border-ink-200 px-1.5 py-0.5 font-mono text-[11px] outline-none focus:border-ink-500"
            />
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mt-1.5 w-full text-[11px] text-ink-500 hover:text-ink-900"
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
}
