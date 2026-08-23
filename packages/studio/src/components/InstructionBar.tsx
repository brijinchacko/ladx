"use client";

import { GitBranch, Rows3, Trash2 } from "lucide-react";
import { useState } from "react";
import { clearDraggedInstruction, setDraggedInstruction } from "../lib/drag";
import { INSTRUCTION_DOCS, topicForInstruction } from "../lib/help";
import { GROUPS, type GroupKey, PALETTE_KEYS } from "../lib/palette";
import { brand, ink, line, surface } from "../lib/theme";
import { type ElementType, INSTRUCTIONS } from "../lib/types";
import Tip from "./Tip";
import css from "./ladx.module.css";

/**
 * The instruction palette.
 *
 * Grouped the way PicoSoft groups it, contacts, coils, timers and counters,
 * compare and maths, because that is the mental filing cabinet the hardware
 * itself uses, and a student who learns it here recognises it on the panel.
 * One group is open at a time so the palette stays two rows tall instead of
 * pushing the ladder off the screen.
 *
 * Two ways to place an instruction, because both are muscle memory somewhere:
 * DRAG it onto any gap in a rung, or CLICK it to drop it at the cursor. Drag is
 * what Pico users expect; click-at-cursor is faster once you know the keyboard.
 *
 * The symbols are drawn, not written. A student learning to recognise ┤├ on a
 * printed drawing should be clicking that shape, not the letters "XIC".
 */

export type BarAction =
  | { kind: "instruction"; type: ElementType }
  | { kind: "branch" }
  | { kind: "rung" }
  | { kind: "delete" };

const KEYS = PALETTE_KEYS;
const INK = ink.base;

function Glyph({ type }: { type: ElementType }) {
  const s = { position: "absolute" as const, background: INK };
  const meta = INSTRUCTIONS.find((i) => i.type === type);

  if (type === "XIC" || type === "XIO" || type === "ONS") {
    return (
      <span className="relative block" style={{ width: 24, height: 14 }}>
        <span style={{ ...s, left: 0, width: 7, top: 6, height: 2 }} />
        <span style={{ ...s, right: 0, width: 7, top: 6, height: 2 }} />
        <span style={{ ...s, left: 7, top: 1, width: 2, height: 12 }} />
        <span style={{ ...s, right: 7, top: 1, width: 2, height: 12 }} />
        {type === "XIO" && (
          <span
            style={{ ...s, left: 10, top: 0, width: 2, height: 14, transform: "rotate(36deg)" }}
          />
        )}
        {type === "ONS" && (
          <span
            className="absolute text-[8px] font-bold leading-none"
            style={{ left: 0, right: 0, top: 3, textAlign: "center", color: INK }}
          >
            P
          </span>
        )}
      </span>
    );
  }

  if (meta && meta.side === "output" && meta.group === "Bit") {
    return (
      <span className="relative block" style={{ width: 24, height: 14 }}>
        <span style={{ ...s, left: 0, width: 6, top: 6, height: 2 }} />
        <span style={{ ...s, right: 0, width: 6, top: 6, height: 2 }} />
        <span
          className="absolute"
          style={{
            left: 6,
            top: 1,
            width: 6,
            height: 12,
            border: `2px solid ${INK}`,
            borderRight: "none",
            borderRadius: "6px 0 0 6px",
          }}
        />
        <span
          className="absolute"
          style={{
            right: 6,
            top: 1,
            width: 6,
            height: 12,
            border: `2px solid ${INK}`,
            borderLeft: "none",
            borderRadius: "0 6px 6px 0",
          }}
        />
        {(type === "OTL" || type === "OTU") && (
          <span
            className="absolute text-[8px] font-bold leading-none"
            style={{ left: 0, right: 0, top: 3, textAlign: "center", color: INK }}
          >
            {type === "OTL" ? "S" : "R"}
          </span>
        )}
      </span>
    );
  }

  // Boxed instruction.
  return (
    <span className="relative block" style={{ width: 24, height: 14 }}>
      <span style={{ ...s, left: 0, width: 3, top: 6, height: 2 }} />
      <span style={{ ...s, right: 0, width: 3, top: 6, height: 2 }} />
      <span
        className="absolute grid place-items-center text-[7.5px] font-bold"
        style={{
          left: 3,
          right: 3,
          top: 0,
          bottom: 0,
          border: `1.5px solid ${INK}`,
          borderRadius: 2,
          color: INK,
        }}
      >
        {type}
      </span>
    </span>
  );
}

export default function InstructionBar({
  onAction,
  disabled,
  hint,
  canDelete,
  branchArmed,
  onHelp,
}: {
  onAction: (a: BarAction) => void;
  disabled: boolean;
  hint: string;
  canDelete: boolean;
  /** True while waiting for the second click that closes a branch. */
  branchArmed: boolean;
  /** Opens the manual at a topic, from the hover card on each instruction. */
  onHelp?: (topic: string) => void;
}) {
  const [open, setOpen] = useState<GroupKey>("Contacts");
  const group = GROUPS.find((g) => g.key === open)!;

  return (
    <div className="flex flex-col h-full min-h-0" style={{ background: surface.raised }}>
      {/* Group tabs */}
      <div className="flex items-center gap-0.5 px-2 pt-1 flex-wrap shrink-0">
        {GROUPS.map((g) => (
          <button
            type="button"
            key={g.key}
            onClick={() => setOpen(g.key)}
            title={g.hint}
            className={css.groupTab}
            data-active={open === g.key ? "true" : "false"}
          >
            {g.key}
          </button>
        ))}

        <span className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onAction({ kind: "branch" })}
            disabled={disabled}
            title="Branch around the selected element, or click one gap in the rung, then another, to enclose what is between them  ·  B"
            className={css.barBtn}
            style={
              branchArmed
                ? { borderColor: brand.teal, background: brand.tealWash, color: brand.tealInk }
                : undefined
            }
          >
            <GitBranch size={11} /> {branchArmed ? "Pick the other end" : "Branch"}
          </button>
          <button
            type="button"
            onClick={() => onAction({ kind: "rung" })}
            disabled={disabled}
            title="Add a network  ·  N"
            className={css.barBtn}
          >
            <Rows3 size={11} /> Network
          </button>
          <button
            type="button"
            onClick={() => onAction({ kind: "delete" })}
            disabled={disabled || !canDelete}
            title="Delete the selected element  ·  Delete"
            className={`${css.barBtn} ${css.barBtnDanger}`}
          >
            <Trash2 size={11} /> Delete
          </button>
        </span>
      </div>

      {/* The open group */}
      <div
        className="flex items-center gap-1.5 flex-wrap px-2 py-2 flex-1 min-h-0 content-start overflow-auto"
        style={{ borderTop: `1px solid ${line.soft}` }}
      >
        {group.types.map((type) => {
          const meta = INSTRUCTIONS.find((i) => i.type === type)!;
          const key = KEYS[type];
          const doc = INSTRUCTION_DOCS[type];
          return (
            <Tip
              key={type}
              label={`${type}, ${meta.label}`}
              /* The one-line help, plus the mistake people actually make with
                 this instruction. That second sentence is the reason the card
                 exists: the summary alone is already on the button. */
              text={`${meta.help}${doc?.gotcha ? `\n\nWatch out: ${doc.gotcha}` : ""}${key ? `\n\nShortcut: ${key}` : ""}`}
              topic={topicForInstruction(type)}
              onOpenHelp={onHelp}
              place="top"
              asChild
            >
              <button
                type="button"
                draggable={!disabled}
                onDragStart={(e) => {
                  // Both: dataTransfer for the browser's copy cursor, and the
                  // module ref because a custom MIME type on a draggable button
                  // does not survive the round trip everywhere, which is why
                  // drops fired and did nothing.
                  setDraggedInstruction(type);
                  e.dataTransfer.setData("application/ladx-instruction", type);
                  e.dataTransfer.setData("text/plain", type);
                  e.dataTransfer.effectAllowed = "copy";
                }}
                onDragEnd={() => clearDraggedInstruction()}
                onClick={() => onAction({ kind: "instruction", type })}
                disabled={disabled}
                aria-label={`${meta.label} (${type})`}
                className={`relative grid place-items-center ${css.pickable} ${css.paletteBtn}`}
                style={{ cursor: disabled ? "not-allowed" : "grab" }}
              >
                <Glyph type={type} />
                {key && (
                  <span
                    className="absolute font-bold leading-none"
                    style={{ right: 2, bottom: 1, fontSize: 6.5, color: "#B6BFC9" }}
                  >
                    {key}
                  </span>
                )}
              </button>
            </Tip>
          );
        })}

        <span className="ml-auto pl-2 self-center" style={{ fontSize: 10, color: ink.faint }}>
          {hint}
        </span>
      </div>
    </div>
  );
}
