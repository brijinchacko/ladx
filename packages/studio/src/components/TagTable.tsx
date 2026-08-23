"use client";

import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { addressProblem, areaFor, isPhysical, nextFreeAddress } from "../lib/addressing";
import { brand, ink, line, radius, state, surface } from "../lib/theme";
import { DEVICE_LABEL, INPUT_DEVICES, OUTPUT_DEVICES, type Tag, defaultDevice } from "../lib/types";
import css from "./ladx.module.css";

/**
 * The tag table — a real table.
 *
 * It was a stack of cards, which is fine for five tags and unreadable for
 * thirty: nothing lines up, so you cannot scan a column to find the free
 * terminal or spot the one output that is still unassigned. A tag table is a
 * document an engineer reads down, so it is now columns with headers that
 * stay put while the rows scroll.
 *
 * The address column is the point of it. A name says what a signal means; an
 * address says which screw on the controller it lands on. Students who only
 * ever see names cannot read a wiring drawing, and the panel does not know
 * your tag is called Start_PB — it knows I0.0.
 */
export default function TagTable({
  tags,
  onChange,
  onAdd,
  onRemove,
  disabled,
}: {
  tags: Tag[];
  onChange: (index: number, patch: Partial<Tag>) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
  disabled?: boolean;
}) {
  const [sortBy, setSortBy] = useState<"none" | "address" | "name">("none");

  /**
   * Scale the table down when the column it is in is too narrow for it.
   *
   * Six columns need about 430px to be readable. In the 200px project column
   * they do not fit, and the table overflowed sideways — which showed up as a
   * black bar across the bottom of the panel, because that is what a
   * horizontal scrollbar looks like on macOS when scrollbars are set to
   * always show. Shrinking the type is the honest answer: the whole table
   * stays visible and legible-if-small rather than half of it hiding behind a
   * scrollbar nobody expected.
   *
   * It never scales UP — a wide window gets a normal-sized table, not a
   * stretched one.
   */
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  const NATURAL = 430;

  useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width;
      // Floored at 0.62: below that the type stops being readable and the
      // right answer is to pop the table out, which the button offers.
      setScale(Math.max(0.62, Math.min(1, w / NATURAL)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* Sorting the VIEW, not the array: the index passed to onChange has to keep
     pointing at the same tag, so the original position rides along. */
  const rows = useMemo(() => {
    const withIndex = tags.map((t, i) => ({ t, i }));
    if (sortBy === "name") {
      return [...withIndex].sort((a, b) => a.t.name.localeCompare(b.t.name));
    }
    if (sortBy === "address") {
      const key = (t: Tag) => {
        const area = areaFor(t) ?? "Z";
        const order = { I: 0, IW: 1, Q: 2, QW: 3, M: 4, MW: 5, T: 6, C: 7, Z: 8 }[area] ?? 8;
        return `${order}${(t.address ?? "").padStart(8, "0")}`;
      };
      return [...withIndex].sort((a, b) => key(a.t).localeCompare(key(b.t)));
    }
    return withIndex;
  }, [tags, sortBy]);

  const unassigned = tags.filter((t) => !t.address).length;

  return (
    <div className="h-full flex flex-col" style={{ background: surface.raised }}>
      {/* Toolbar */}
      <div
        className="flex items-center gap-2 px-2 shrink-0"
        style={{ height: 26, borderBottom: `1px solid ${line.soft}`, background: surface.subtle }}
      >
        <span
          style={{
            fontSize: 9.5,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.09em",
            color: ink.muted,
          }}
        >
          Tags
        </span>
        <span style={{ fontSize: 9.5, color: ink.faint }}>{tags.length}</span>
        {unassigned > 0 && (
          <span
            title={`${unassigned} tag${unassigned === 1 ? " has" : "s have"} no address`}
            style={{ fontSize: 9, color: state.warn }}
          >
            {unassigned} unaddressed
          </span>
        )}
        <span className="flex-1" />
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          title="Order the table"
          className={css.scanSelect}
          style={{ height: 19, fontSize: 9.5 }}
        >
          <option value="none">In order added</option>
          <option value="address">By address</option>
          <option value="name">By name</option>
        </select>
        <button
          type="button"
          onClick={onAdd}
          disabled={disabled}
          title="Add a tag"
          className={css.iconBtn}
        >
          <Plus size={13} />
        </button>
      </div>

      <div ref={boxRef} className="flex-1 overflow-y-auto overflow-x-hidden">
        <div
          style={{
            width: `${100 / scale}%`,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        >
          <table className={css.tagTable}>
            <thead>
              <tr>
                <th style={{ width: "26%" }} title="What the signal is called in the program">
                  Name
                </th>
                <th style={{ width: "17%" }} title="Which terminal or memory location it is">
                  Address
                </th>
                <th style={{ width: "13%" }} title="BOOL is on/off, INT is a number">
                  Type
                </th>
                <th
                  style={{ width: "16%" }}
                  title="Wired in from the field, out to the field, or internal"
                >
                  Use
                </th>
                <th
                  style={{ width: "22%" }}
                  title="What is physically connected, which decides how the control behaves"
                >
                  Device
                </th>
                <th style={{ width: "6%" }} />
              </tr>
            </thead>
            <tbody>
              {tags.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: "14px 10px", color: ink.faint, fontSize: 11 }}>
                    No tags yet. One is created for you when you name a contact, or add one with +
                    above.
                  </td>
                </tr>
              )}
              {rows.map(({ t, i }) => (
                <Row
                  key={`${t.name}-${i}`}
                  tag={t}
                  all={tags}
                  disabled={disabled}
                  onChange={(patch) => onChange(i, patch)}
                  onRemove={() => onRemove(i)}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* The legend. Without it the address column is six characters of
          jargon; with it, it is the thing the panel is labelled with. */}
      <div
        className="shrink-0 px-2 py-1.5"
        style={{
          borderTop: `1px solid ${line.soft}`,
          background: surface.subtle,
          fontSize: 9,
          color: ink.faint,
          lineHeight: 1.6,
        }}
      >
        <b style={{ color: ink.muted }}>I</b> input · <b style={{ color: ink.muted }}>Q</b> output ·{" "}
        <b style={{ color: ink.muted }}>M</b> internal bit ·{" "}
        <b style={{ color: ink.muted }}>IW/QW/MW</b> numbers · <b style={{ color: ink.muted }}>T</b>{" "}
        timer · <b style={{ color: ink.muted }}>C</b> counter
        <br />
        In <b style={{ color: ink.muted }}>I0.3</b> the 0 is the byte and the 3 is the bit. Bits run
        0–7, so I0.7 is followed by I1.0.
      </div>
    </div>
  );
}

function Row({
  tag,
  all,
  disabled,
  onChange,
  onRemove,
}: {
  tag: Tag;
  all: Tag[];
  disabled?: boolean;
  onChange: (patch: Partial<Tag>) => void;
  onRemove: () => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? tag.address ?? "";
  const problem = draft === null ? null : addressProblem(draft, tag, all);

  const use = tag.isInput ? "input" : tag.isOutput ? "output" : "internal";
  const devices = tag.isInput ? INPUT_DEVICES : tag.isOutput ? OUTPUT_DEVICES : [];
  const physical = isPhysical(tag.address);

  const commit = () => {
    if (draft === null) return;
    if (!addressProblem(draft, tag, all)) {
      onChange({ address: draft.trim().toUpperCase() || undefined });
    }
    setDraft(null);
  };

  return (
    <>
      <tr className={css.tagRow}>
        <td>
          <input
            value={tag.name}
            onChange={(e) => onChange({ name: e.target.value })}
            disabled={disabled}
            className={css.cellInput}
            style={{ fontWeight: 600 }}
          />
        </td>

        <td>
          <input
            value={shown}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.currentTarget.blur();
              }
              if (e.key === "Escape") {
                setDraft(null);
                e.currentTarget.blur();
              }
            }}
            disabled={disabled}
            placeholder={nextFreeAddress(tag, all) || "—"}
            title={
              physical ? "Wired to a terminal on the controller" : "Lives in memory — no terminal"
            }
            className={css.cellInput}
            data-invalid={problem ? "true" : "false"}
            style={{
              fontFamily: "ui-monospace, monospace",
              fontWeight: 700,
              color: problem ? state.fault : physical ? brand.tealInk : ink.muted,
            }}
          />
        </td>

        <td>
          <select
            value={tag.type}
            onChange={(e) => onChange({ type: e.target.value as Tag["type"] })}
            disabled={disabled}
            className={css.cellSelect}
          >
            <option value="BOOL">BOOL</option>
            <option value="INT">INT</option>
            <option value="TIMER">TIMER</option>
            <option value="COUNTER">COUNTER</option>
          </select>
        </td>

        <td>
          <select
            value={use}
            onChange={(e) => {
              const v = e.target.value;
              onChange({
                isInput: v === "input" || undefined,
                isOutput: v === "output" || undefined,
                ...(v !== "internal" && !tag.device
                  ? {
                      device: defaultDevice({
                        ...tag,
                        isInput: v === "input",
                        isOutput: v === "output",
                      }),
                    }
                  : {}),
              });
            }}
            disabled={disabled || tag.type === "TIMER" || tag.type === "COUNTER"}
            className={css.cellSelect}
          >
            <option value="internal">internal</option>
            <option value="input">input</option>
            <option value="output">output</option>
          </select>
        </td>

        <td>
          {devices.length > 0 ? (
            <select
              value={tag.device ?? defaultDevice(tag)}
              onChange={(e) => onChange({ device: e.target.value as Tag["device"] })}
              disabled={disabled}
              className={css.cellSelect}
            >
              {devices.map((d) => (
                <option key={d} value={d}>
                  {DEVICE_LABEL[d]}
                </option>
              ))}
            </select>
          ) : (
            <span style={{ fontSize: 10, color: ink.faint, paddingLeft: 4 }}>—</span>
          )}
        </td>

        <td style={{ textAlign: "right" }}>
          <button
            type="button"
            onClick={onRemove}
            disabled={disabled}
            title={`Delete ${tag.name}`}
            className={css.rowDelete}
          >
            <Trash2 size={11} />
          </button>
        </td>
      </tr>

      {/* The reason, under the row that caused it, while it is still wrong. */}
      {problem && (
        <tr>
          <td colSpan={6} style={{ padding: 0 }}>
            <p
              className="flex items-start gap-1.5"
              style={{
                margin: 0,
                padding: "5px 8px",
                fontSize: 10,
                lineHeight: 1.45,
                color: state.fault,
                background: state.faultWash,
                borderLeft: `3px solid ${state.faultEdge}`,
                borderRadius: `0 ${radius.sm}px ${radius.sm}px 0`,
              }}
            >
              <AlertTriangle size={11} style={{ marginTop: 1, flexShrink: 0 }} />
              <span>{problem}</span>
            </p>
          </td>
        </tr>
      )}
    </>
  );
}
