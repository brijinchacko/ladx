"use client";

import { ChevronDown, ChevronRight, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { clearDrag, clearDraggedInstruction, takeDrag, takeDraggedInstruction } from "../lib/drag";
import type { ElNode, LadderNode, ParallelNode, Path, SeriesNode } from "../lib/tree";
import type { Element, ElementType, Rung } from "../lib/types";
import { INSTRUCTION_BY_TYPE } from "../lib/types";

/**
 * One network, drawn from the rung tree.
 *
 * ALIGNMENT IS STRUCTURAL, NOT ARITHMETIC. Every cell is a column of one CSS
 * grid with three fixed rows — tag label, symbol, mnemonic — so a wire and a
 * symbol share a centreline by construction rather than by a computed offset
 * that drifts the moment a label grows.
 *
 * That gives one invariant the branches depend on: the electrical centreline is
 * ALWAYS 29px from the top of any node (13px label + half the 32px symbol). So
 * a parallel can draw its two rails without measuring the DOM — from 29px down
 * to the last leg's offset plus 29 — and they meet every leg's wire exactly.
 *
 * Heights are computed, not measured: a series is as tall as its tallest child,
 * a parallel is the sum of its legs. Nesting therefore needs no layout pass and
 * the drawing cannot disagree with the logic.
 *
 * Every gap between elements is live. It accepts a dropped instruction, and it
 * is the grab point for drawing a branch: press one gap, drag to another, and
 * the span between them is enclosed.
 */

/*
 * One row of a rung, in four bands: tag name, symbol, mnemonic, address.
 *
 * These three MUST agree with each other and with the grid below, because
 * the branch rails are positioned by arithmetic on them rather than by
 * measuring the DOM. Adding the address line lengthened every cell by 10px
 * and these were not updated, so a branch rail stopped 9px short of the
 * second leg's wire — the "broken branch": a leg drawn hanging off the end
 * of a rail that no longer reached it.
 *
 * If a band is added or resized, change all three. ROW_H is the sum, and
 * CENTRE is the distance from the top of a row to the middle of its wire —
 * the name band plus half the symbol band.
 */
export const ROW_BANDS = [13, 32, 11, 10] as const; // name, symbol, mnemonic, address
export const ROW_H = ROW_BANDS.reduce((a, b) => a + b, 0);
export const CENTRE = ROW_BANDS[0] + ROW_BANDS[1] / 2; // middle of the symbol band
const ROWS = ROW_BANDS.map((n) => `${n}px`).join(" ");
const CELL_W = 74;
const INK = "#334155";
const LIVE = "#22c55e";
const SELECT = "#2891FF";

export function nodeHeight(n: LadderNode): number {
  if (n.kind === "el") return ROW_H;
  if (n.kind === "series") {
    return n.children.length === 0 ? ROW_H : Math.max(...n.children.map(nodeHeight));
  }
  return n.children.reduce((h, c) => h + nodeHeight(c), 0);
}

// ── Symbols ───────────────────────────────────────────────────────────────

function Glyph({ type, live }: { type: ElementType; live: boolean }) {
  const c = live ? LIVE : INK;
  const bar = { position: "absolute" as const, background: c };
  const meta = INSTRUCTION_BY_TYPE.get(type);
  const isContact = meta?.side === "input";

  if (isContact) {
    return (
      <span className="relative block" style={{ width: CELL_W, height: 32 }}>
        <span style={{ ...bar, left: 0, width: 21, top: 15, height: 2 }} />
        <span style={{ ...bar, right: 0, width: 21, top: 15, height: 2 }} />
        <span style={{ ...bar, left: 21, top: 4, width: 2.5, height: 24 }} />
        <span style={{ ...bar, right: 21, top: 4, width: 2.5, height: 24 }} />
        {/*
          The slash on a normally-closed contact, crossing the gap.

          It used to sit at left:26 — the gap between the two bars runs from
          23.5 to 50.5 on a 74px cell, so its centre is 37, and the slash was
          leaning against the left bar about ten pixels off. It also spanned
          only half the gap, so it read as a mark beside the contact rather
          than a line through it.

          Now centred on the gap and long enough to touch both bars, drawn
          from lower-left to upper-right the way every ladder editor and every
          IEC drawing does it.
        */}
        {type === "XIO" && (
          <span
            style={{
              ...bar,
              left: 35.75,
              top: -2,
              width: 2.5,
              height: 36,
              transform: "rotate(48deg)",
            }}
          />
        )}
        {type !== "XIC" && type !== "XIO" && (
          <span
            className="absolute text-[9px] font-bold leading-none"
            style={{ left: 24, right: 24, top: 11, textAlign: "center", color: c }}
          >
            {type === "ONS" ? "P" : type}
          </span>
        )}
      </span>
    );
  }

  // Output side: a coil, or a boxed instruction for timers, counters and maths.
  const boxed = meta && meta.group !== "Bit";
  if (boxed) {
    return (
      <span className="relative block" style={{ width: CELL_W, height: 32 }}>
        <span style={{ ...bar, left: 0, width: 9, top: 15, height: 2 }} />
        <span style={{ ...bar, right: 0, width: 9, top: 15, height: 2 }} />
        <span
          className="absolute grid place-items-center text-[10px] font-bold"
          style={{
            left: 9,
            right: 9,
            top: 2,
            bottom: 2,
            border: `2px solid ${c}`,
            borderRadius: 2,
            color: c,
          }}
        >
          {type}
        </span>
      </span>
    );
  }

  /*
   * The coil, as SVG.
   *
   * It was two spans with half a border-radius each. That geometry is fixed
   * in the source and yet the coil visibly changed shape once the simulator
   * opened — because opening a panel narrows the canvas, the cell lands on a
   * fractional pixel, and the browser rounds each arc's box independently.
   * Two arcs rounded in opposite directions stop being a matched pair, and a
   * clean ( ) closes up into an ellipse.
   *
   * A path on a viewBox has no such problem: it is scaled, not snapped, so
   * the coil is the same coil at any position and any zoom. The contacts are
   * straight lines and unaffected, which is why only the coils moved.
   */
  return (
    <svg
      width={CELL_W}
      height={32}
      viewBox={`0 0 ${CELL_W} 32`}
      className="block"
      role="img"
      aria-label={`${type} coil`}
      style={{ overflow: "visible" }}
    >
      {/* Wires in, and out to the rail. */}
      <line x1={0} y1={16} x2={17} y2={16} stroke={c} strokeWidth={2} shapeRendering="crispEdges" />
      <line
        x1={CELL_W - 17}
        y1={16}
        x2={CELL_W}
        y2={16}
        stroke={c}
        strokeWidth={2}
        shapeRendering="crispEdges"
      />
      {/* The two arcs — true semicircles, so the pair always matches. */}
      <path
        d="M 30 3 A 13 13 0 0 0 30 29"
        fill="none"
        stroke={c}
        strokeWidth={2.4}
        strokeLinecap="round"
      />
      <path
        d={`M ${CELL_W - 30} 3 A 13 13 0 0 1 ${CELL_W - 30} 29`}
        fill="none"
        stroke={c}
        strokeWidth={2.4}
        strokeLinecap="round"
      />
      {(type === "OTL" || type === "OTU") && (
        <text x={CELL_W / 2} y={20} textAnchor="middle" fontSize={11} fontWeight={700} fill={c}>
          {type === "OTL" ? "S" : "R"}
        </text>
      )}
    </svg>
  );
}

// ── Cells ─────────────────────────────────────────────────────────────────

function Wire({ live, grow, w }: { live: boolean; grow?: boolean; w?: number }) {
  return (
    <span
      style={{
        display: "grid",
        gridTemplateRows: ROWS,
        alignSelf: "flex-start",
        flex: grow ? "1 1 auto" : `0 0 ${w ?? 8}px`,
        minWidth: grow ? 10 : undefined,
      }}
    >
      <span />
      <span style={{ position: "relative" }}>
        <span
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 15,
            height: 2,
            background: live ? LIVE : INK,
          }}
        />
      </span>
      <span />
    </span>
  );
}

function ElementCell({
  type,
  tag,
  address,
  detail,
  live,
  selected,
  help,
  onSelect,
  onOpen,
  onDropSide,
  onDragStart,
  onContextMenu,
  onDrive,
  driveHint,
}: {
  type: ElementType;
  tag: string;
  /** The terminal this tag is on, printed under the instruction as it is on
      a real drawing — I0.0 beside Start_PB, so the two are learned together. */
  address?: string;
  detail: string;
  live: boolean;
  selected: boolean;
  help?: string;
  /** `additive` is true for a Ctrl or Cmd-click, which extends the selection. */
  onSelect: (additive: boolean) => void;
  onOpen: () => void;
  /** Dropping on a contact inserts beside it — left half before, right after. */
  onDropSide?: (t: ElementType, after: boolean) => void;
  /** Picking this instruction up to move it somewhere else. */
  onDragStart?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  /**
   * Operate the signal this instruction reads, while the program is running.
   *
   * The point of a simulator is to press the button and watch the rung. Doing
   * that from a panel on the far side of the screen means looking away from
   * the thing you are trying to understand, so a contact whose tag is an
   * input becomes the button while the controller is running.
   */
  onDrive?: (down: boolean) => void;
  driveHint?: string;
}) {
  const [dragging, setDragging] = useState(false);
  return (
    <span
      role="button"
      tabIndex={0}
      title={help}
      /*
       * Every instruction on a rung can be picked up and put somewhere else.
       * Selecting still works because a click and a drag are different
       * gestures — the browser only starts a drag once the pointer moves.
       */
      draggable={!!onDragStart}
      onDragStart={(e) => {
        if (!onDragStart) return;
        e.stopPropagation();
        setDragging(true);
        onDragStart();
        e.dataTransfer.effectAllowed = "move";
        // Set for the cursor affordance only; the payload that matters is the
        // module one, because a custom MIME type does not survive every
        // browser's round trip.
        e.dataTransfer.setData("text/plain", type);
      }}
      onDragEnd={() => setDragging(false)}
      onContextMenu={onContextMenu}
      onDragOver={
        onDropSide
          ? (e) => {
              const d = takeDrag();
              if (!d) return;
              // A move is allowed to fall through to the card, which is the only
              // thing that can see both networks at once.
              if (d.kind !== "new") return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "copy";
            }
          : undefined
      }
      onDrop={
        onDropSide
          ? (e) => {
              /*
               * A contact is wider than the gaps either side of it, so most drops
               * land here rather than on a gap. This used to swallow every one:
               * it cleared the payload and stopped propagation, so a MOVE — which
               * only the card can carry out, because only the card knows which
               * network it is — reached nothing and did nothing. Moving a contact
               * looked broken while dropping a new one from the palette worked.
               *
               * A move is therefore left alone, uncleared and still bubbling, for
               * the card to handle.
               */
              const d = takeDrag();
              if (!d || d.kind !== "new") return;

              e.preventDefault();
              e.stopPropagation();
              clearDrag();
              const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
              onDropSide(d.type, e.clientX > box.left + box.width / 2);
            }
          : undefined
      }
      onClick={(e) => {
        e.stopPropagation();
        // While the controller runs, a click on an input contact drives it.
        // Ctrl-click still selects, so a rung can be edited mid-run.
        if (onDrive && !(e.metaKey || e.ctrlKey)) return;
        onSelect(e.metaKey || e.ctrlKey);
      }}
      onPointerDown={(e) => {
        if (onDrive && !(e.metaKey || e.ctrlKey)) {
          e.stopPropagation();
          onDrive(true);
        }
      }}
      onPointerUp={() => onDrive?.(false)}
      onPointerLeave={() => onDrive?.(false)}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onOpen();
        }
      }}
      style={{
        display: "grid",
        gridTemplateRows: ROWS,
        flex: "0 0 auto",
        alignSelf: "flex-start",
        cursor: "pointer",
        outline: selected ? `2px solid ${SELECT}` : "none",
        outlineOffset: 1,
        borderRadius: 3,
        background: selected ? "rgba(40,145,255,0.08)" : undefined,
        // The original stays visible but faded while it is being carried, so
        // it is obvious the gesture is a move and where it started.
        opacity: dragging ? 0.4 : 1,
      }}
    >
      <span
        className="text-[10px] leading-[13px] text-center truncate px-0.5"
        style={{ color: tag ? "#0f172a" : "#B3382C", width: CELL_W }}
      >
        {tag || "no tag"}
      </span>
      <Glyph type={type} live={live} />
      <span
        className="text-[8.5px] leading-[11px] text-center truncate px-0.5"
        style={{ color: "#64748b", width: CELL_W }}
      >
        {detail}
      </span>
      {/* The address, if the tag has one. Kept to a single line and the same
          width as the cell, so a rung with addresses is the same height as
          one without and nothing shifts when a tag is given a terminal. */}
      <span
        className="text-[8px] leading-[10px] text-center truncate px-0.5 font-mono"
        style={{ color: address ? "#1B7F84" : "transparent", width: CELL_W }}
      >
        {address || "\u00a0"}
      </span>
    </span>
  );
}

function detailOf(n: { type: ElementType; preset?: number; operand?: string; dest?: string }) {
  if (n.preset !== undefined) return `${n.type} ${n.preset}`;
  if (n.operand) return `${n.type} ${n.operand}`;
  if (n.dest) return `${n.type} → ${n.dest}`;
  return n.type;
}

// ── Gaps ──────────────────────────────────────────────────────────────────

type GapDrag = { seriesId: string; from: number } | null;

function Gap({
  live,
  isAnchor,
  inSpan,
  isCaret,
  hinted,
  onDropType,
  onDown,
  onEnter,
  onUp,
  onClick,
  gapKey,
}: {
  live: boolean;
  isAnchor: boolean;
  inSpan: boolean;
  /** The current insertion point — where a clicked instruction will land. */
  isCaret: boolean;
  /** The parent says this is where the current drag would land. */
  hinted: boolean;
  onDropType: (t: ElementType) => void;
  onDown: () => void;
  onEnter: () => void;
  onUp: () => void;
  onClick: () => void;
  gapKey: string;
}) {
  const [over, setOver] = useState(false);

  return (
    <span
      onDragOver={(e) => {
        const d = takeDrag();
        if (!d) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = d.kind === "new" ? "copy" : "move";
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        /*
         * A gap handles a NEW instruction from the palette and nothing else.
         *
         * A move has to be carried out by the network card, which is the only
         * thing that can see both the source and the destination. This used to
         * take the payload, clear it and stop the event regardless of what it
         * was, so a contact dragged onto a gap reached nothing and did
         * nothing — and a gap is precisely where somebody aims when moving one.
         */
        const d = takeDrag();
        if (!d || d.kind !== "new") return;

        e.preventDefault();
        e.stopPropagation();
        clearDrag();
        onDropType(d.type);
      }}
      data-gap={gapKey}
      onPointerDown={(e) => {
        e.stopPropagation();
        onDown();
      }}
      onPointerEnter={onEnter}
      onPointerUp={(e) => {
        e.stopPropagation();
        onUp();
      }}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title="Click to put the insertion point here · drop an instruction · drag to another gap to draw a branch"
      style={{
        display: "grid",
        gridTemplateRows: ROWS,
        alignSelf: "flex-start",
        flex: "0 0 20px",
        cursor: "pointer",
      }}
    >
      <span />
      <span style={{ position: "relative" }}>
        <span
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 15,
            height: 2,
            background: live ? LIVE : INK,
          }}
        />
        {(over || hinted || isAnchor || inSpan) && (
          <span
            style={{
              position: "absolute",
              left: 3,
              right: 3,
              top: 2,
              bottom: 2,
              borderRadius: 2,
              background:
                over || hinted
                  ? "rgba(40,145,255,0.9)"
                  : isAnchor
                    ? "rgba(40,145,255,0.6)"
                    : "rgba(40,145,255,0.3)",
            }}
          />
        )}
        {isCaret && !over && !hinted && (
          // The insertion point, drawn as a caret so it reads as "the next
          // instruction lands HERE" rather than as a selected object.
          <span
            style={{
              position: "absolute",
              left: "50%",
              marginLeft: -1.5,
              top: 0,
              bottom: 0,
              width: 3,
              borderRadius: 2,
              background: SELECT,
            }}
          />
        )}
      </span>
      <span />
    </span>
  );
}

function EdgeBtn({ label, title, onClick }: { label: string; title: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={title}
      className="grid place-items-center rounded text-[9px] font-bold text-white hover:brightness-110"
      style={{ width: 15, height: 15, background: SELECT, lineHeight: 1 }}
    >
      {label}
    </button>
  );
}

// ── Recursive rendering ───────────────────────────────────────────────────

type Ctx = {
  power: Record<string, boolean>;
  running: boolean;
  /** Returns a press/release handler for a tag, or undefined if it is not
      something a person can operate (an internal bit, a timer, an output). */
  onDriveTag?: (tag: string) => ((down: boolean) => void) | undefined;
  /** The terminal address for a tag name, for printing under the symbol. */
  addressOf?: (tag: string) => string | undefined;
  selectedId: string | null;
  /** Everything selected, so more than one can be shown as selected. */
  selectedIds: string[];
  /** Ctrl or Cmd-click. */
  onToggleSelect: (id: string) => void;
  drag: GapDrag;
  setDrag: (d: GapDrag) => void;
  hover: { seriesId: string; index: number } | null;
  setHover: (h: { seriesId: string; index: number } | null) => void;
  onSelect: (id: string | null) => void;
  onOpen: (el: ElNode) => void;
  onInsert: (parentPath: Path, index: number, type: ElementType) => void;
  onBranch: (seriesPath: Path, from: number, to: number) => void;
  caret: { path: Path; index: number } | null;
  /** Gap key the current drag would land in, so every gap can light itself. */
  dropHint: string | null;
  onGapClick: (seriesPath: Path, index: number, seriesId: string) => void;
  onEdge: (parallelPath: Path, side: "left" | "right", grow: boolean) => void;
  /** Picking an instruction up to move it. */
  onPickUp: (el: ElNode) => void;
  /** Right-click on one instruction. */
  onElementMenu: (e: React.MouseEvent, el: ElNode) => void;
  /**
   * Right-click on a branch.
   *
   * Selecting a branch by clicking used to mean hitting one of its 3px rails,
   * because every contact inside it stops the click — which is why "I cannot
   * delete the branch" was a fair description of a feature that existed.
   */
  onBranchMenu: (e: React.MouseEvent, id: string, path: Path) => void;
};

const lit = (ctx: Ctx, id: string) => ctx.running && !!ctx.power[id];

/**
 * Can this instruction's tag be operated by hand right now?
 *
 * Only while running, only for a tag the I/O panel would give a switch to,
 * and only on the condition side — clicking a coil would be asking the
 * controller to lie about its own output.
 */
function driverFor(ctx: Ctx, tag: string, isOutputSide: boolean) {
  if (!ctx.running || isOutputSide || !ctx.onDriveTag) return undefined;
  return ctx.onDriveTag(tag);
}

function NodeView({ node, path, ctx }: { node: LadderNode; path: Path; ctx: Ctx }) {
  if (node.kind === "el") {
    return (
      <ElementCell
        type={node.type}
        tag={node.tag}
        detail={detailOf(node)}
        live={lit(ctx, node.id)}
        selected={ctx.selectedIds.includes(node.id)}
        help={INSTRUCTION_BY_TYPE.get(node.type)?.help}
        onSelect={(additive) => (additive ? ctx.onToggleSelect(node.id) : ctx.onSelect(node.id))}
        address={ctx.addressOf?.(node.tag)}
        onDrive={driverFor(ctx, node.tag, false)}
        driveHint={ctx.running ? "Click to operate this input" : undefined}
        onOpen={() => ctx.onOpen(node)}
        onDropSide={(t, after) => {
          const parent = path.slice(0, -1);
          const idx = path[path.length - 1] ?? 0;
          ctx.onInsert(parent, after ? idx + 1 : idx, t);
        }}
        onDragStart={() => ctx.onPickUp(node)}
        onContextMenu={(e) => ctx.onElementMenu(e, node)}
      />
    );
  }
  if (node.kind === "series") return <SeriesView node={node} path={path} ctx={ctx} />;
  return <ParallelView node={node} path={path} ctx={ctx} />;
}

function SeriesView({ node, path, ctx }: { node: SeriesNode; path: Path; ctx: Ctx }) {
  const live = lit(ctx, node.id);
  const drag = ctx.drag?.seriesId === node.id ? ctx.drag : null;
  const hoverIdx = ctx.hover?.seriesId === node.id ? ctx.hover.index : null;
  const lo = drag && hoverIdx !== null ? Math.min(drag.from, hoverIdx) : -1;
  const hi = drag && hoverIdx !== null ? Math.max(drag.from, hoverIdx) : -2;

  const gap = (index: number) => (
    <Gap
      key={`g${index}`}
      live={live}
      isAnchor={drag?.from === index}
      inSpan={index > lo && index < hi}
      gapKey={JSON.stringify({ p: path, i: index })}
      isCaret={
        !!ctx.caret &&
        ctx.caret.index === index &&
        JSON.stringify(ctx.caret.path) === JSON.stringify(path)
      }
      hinted={ctx.dropHint === JSON.stringify({ p: path, i: index })}
      onClick={() => ctx.onGapClick(path, index, node.id)}
      onDropType={(t) => ctx.onInsert(path, index, t)}
      onDown={() => ctx.setDrag({ seriesId: node.id, from: index })}
      onEnter={() => ctx.setHover({ seriesId: node.id, index })}
      onUp={() => {
        if (drag) {
          // Gap i sits before child i, so gaps a..b enclose children a..b-1.
          const a = Math.min(drag.from, index);
          const b = Math.max(drag.from, index);
          if (b > a) ctx.onBranch(path, a, b - 1);
        }
        ctx.setDrag(null);
      }}
    />
  );

  if (node.children.length === 0) {
    return (
      <span style={{ display: "flex", alignItems: "stretch", flex: "1 1 auto", minWidth: 60 }}>
        {gap(0)}
        <Wire live={live} grow />
      </span>
    );
  }

  return (
    <span style={{ display: "flex", alignItems: "stretch", flex: "1 1 auto" }}>
      {node.children.map((child, i) => (
        <span key={child.id} style={{ display: "flex", alignItems: "stretch" }}>
          {gap(i)}
          <NodeView node={child} path={[...path, i]} ctx={ctx} />
        </span>
      ))}
      {gap(node.children.length)}
      <Wire live={live} grow />
    </span>
  );
}

function ParallelView({ node, path, ctx }: { node: ParallelNode; path: Path; ctx: Ctx }) {
  const live = lit(ctx, node.id);
  const selected = ctx.selectedId === node.id;

  const offsets: number[] = [];
  let acc = 0;
  for (const leg of node.children) {
    offsets.push(acc + CENTRE);
    acc += nodeHeight(leg);
  }
  const first = offsets[0] ?? CENTRE;
  const last = offsets[offsets.length - 1] ?? CENTRE;
  /*
   * The rails run from the top edge of the first leg's wire to the bottom
   * edge of the last one's.
   *
   * CENTRE is the wire's centre line, not its top: a wire is 2px thick and
   * sits at y = CENTRE-1 .. CENTRE+1. Starting the rail at CENTRE therefore
   * left the top half of the first wire with no rail beside it and pushed the
   * bottom of the rail one pixel past the last, so both ends showed a notch
   * where a ladder drawing should show a square corner.
   */
  /*
   * 2px, matching the wires. It was 3px, and a 3px vertical cannot centre on
   * a 2px horizontal — one of them always overhangs by half a pixel, which
   * the browser resolves by smearing the join. That is the "corner is not
   * proper" you can see at any zoom: the rung looks hand-drawn where it
   * should look ruled.
   */
  const railStyle = {
    position: "absolute" as const,
    top: first - 1,
    height: Math.max(2, last - first) + 2,
    width: 2,
    background: live ? LIVE : INK,
    zIndex: 1,
  };

  return (
    <span
      onClick={(e) => {
        e.stopPropagation();
        ctx.onSelect(node.id);
      }}
      onContextMenu={(e) => ctx.onBranchMenu(e, node.id, path)}
      title="Branch — right-click for options"
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        flex: "0 1 auto",
        alignSelf: "flex-start",
        outline: selected ? `2px dashed ${SELECT}` : "none",
        outlineOffset: 1,
        borderRadius: 3,
      }}
    >
      <span style={{ ...railStyle, left: 0 }} />
      <span style={{ ...railStyle, right: 0 }} />

      {/* Edge handles. A branch is rarely the right width first time — you
          draw it, then see that the contact just outside should have been
          inside. These move the edge one element at a time: the outward arrow
          pulls the neighbour in, the inward arrow pushes the outermost element
          back out into series. */}
      {selected && (
        <>
          <span
            style={{ position: "absolute", left: -9, top: first - 20, display: "flex", gap: 1 }}
          >
            <EdgeBtn
              label="◄"
              title="Move the left edge out — take in the contact before"
              onClick={() => ctx.onEdge(path, "left", true)}
            />
            <EdgeBtn
              label="►"
              title="Move the left edge in — release the first contact"
              onClick={() => ctx.onEdge(path, "left", false)}
            />
          </span>
          <span
            style={{ position: "absolute", right: -9, top: first - 20, display: "flex", gap: 1 }}
          >
            <EdgeBtn
              label="◄"
              title="Move the right edge in — release the last contact"
              onClick={() => ctx.onEdge(path, "right", false)}
            />
            <EdgeBtn
              label="►"
              title="Move the right edge out — take in the contact after"
              onClick={() => ctx.onEdge(path, "right", true)}
            />
          </span>
        </>
      )}
      {node.children.map((leg, i) => (
        <span key={leg.id} style={{ display: "flex", alignItems: "stretch" }}>
          <NodeView node={leg} path={[...path, i]} ctx={ctx} />
        </span>
      ))}
    </span>
  );
}

// ── The rung ──────────────────────────────────────────────────────────────

export default function RungView({
  rung,
  logic,
  index,
  power,
  rungPowered,
  running,
  selectedId,
  onSelect,
  onOpen,
  onInsert,
  onBranch,
  onOpenOutput,
  onAddOutput,
  onDropOutput,
  onPickUp,
  onElementMenu,
  onRungMenu,
  onOutputMenu,
  onDropPayload,
  onPickUpRung,
  selectedIds,
  onToggleSelect,
  onBranchMenu,
  caret,
  onGapClick,
  onEdge,
  onDriveTag,
  addressOf,
  selected: rungSelected,
  collapsed,
  onSelectRung,
  onToggleCollapse,
  onRename,
  onDeleteRung,
}: {
  rung: Rung;
  logic: SeriesNode;
  index: number;
  power: Record<string, boolean>;
  rungPowered: boolean;
  running: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onOpen: (el: ElNode) => void;
  onInsert: (parentPath: Path, index: number, type: ElementType) => void;
  onBranch: (seriesPath: Path, from: number, to: number) => void;
  onOpenOutput: (el: Element) => void;
  onAddOutput: () => void;
  onDropOutput: (type: ElementType) => void;
  /** Everything selected, so more than one can be drawn as selected. */
  selectedIds: string[];
  /** Ctrl or Cmd-click on an instruction. */
  onToggleSelect: (id: string) => void;
  onBranchMenu: (e: React.MouseEvent, id: string, path: Path) => void;
  /** Picking an instruction up to move it somewhere else. */
  onPickUp: (el: ElNode) => void;
  /** Picking the whole network up, to reorder it. */
  onPickUpRung: () => void;
  /** Right-click, on an instruction / the network / a coil. */
  onElementMenu: (e: React.MouseEvent, el: ElNode) => void;
  onRungMenu: (e: React.MouseEvent) => void;
  onOutputMenu: (e: React.MouseEvent, el: Element) => void;
  /**
   * A drop of something that was already on a rung. Returns true when it was
   * handled, so the card can fall back to the palette path when it was not.
   */
  onDropPayload: (parentPath: Path | "output", index: number) => boolean;
  /** Where a clicked instruction lands, drawn as a caret in the rung. */
  caret: { path: Path; index: number } | null;
  onGapClick: (seriesPath: Path, index: number, seriesId: string) => void;
  onEdge: (parallelPath: Path, side: "left" | "right", grow: boolean) => void;
  /** While running, hands back a press/release handler for an input tag. */
  onDriveTag?: (tag: string) => ((down: boolean) => void) | undefined;
  /** The terminal address for a tag name. */
  addressOf?: (tag: string) => string | undefined;
  /** The network itself is selectable, so it can be deleted as a whole. */
  selected: boolean;
  collapsed: boolean;
  onSelectRung: () => void;
  onToggleCollapse: () => void;
  onRename: (title: string) => void;
  onDeleteRung: () => void;
}) {
  const [drag, setDrag] = useState<GapDrag>(null);
  const [hover, setHover] = useState<{ seriesId: string; index: number } | null>(null);
  const [outOver, setOutOver] = useState(false);
  /**
   * Where the instruction currently being dragged would land.
   *
   * Recomputed on every dragover anywhere on this network, so the target lights
   * up continuously as the pointer moves instead of only when it happens to be
   * over a 20px gap. That was the whole of "drag and drop is fiddly": the drop
   * did work, but nothing told you where it was going until you let go.
   */
  const [dropHint, setDropHint] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(rung.comment ?? "");

  const ctx: Ctx = {
    power,
    running,
    selectedId,
    selectedIds,
    onToggleSelect,
    drag,
    setDrag,
    hover,
    setHover,
    onSelect,
    onOpen,
    onInsert,
    onBranch,
    caret,
    onGapClick,
    onEdge,
    dropHint,
    onPickUp,
    onElementMenu,
    onBranchMenu,
    onDriveTag,
    addressOf,
  };

  /** Is the thing being dragged a coil-side instruction? */
  const draggedIsOutput = () => {
    const t = takeDraggedInstruction();
    return !!t && INSTRUCTION_BY_TYPE.get(t)?.side === "output";
  };

  /** The gap nearest a point, weighted so branch legs do not steal each other's drops. */
  const nearestGapKey = (root: HTMLElement, x: number, y: number): string | null => {
    const gaps = Array.from(root.querySelectorAll<HTMLElement>("[data-gap]"));
    let best: { key: string; d: number } | null = null;
    for (const g of gaps) {
      const b = g.getBoundingClientRect();
      if (b.width === 0 && b.height === 0) continue;
      const dx = x - (b.left + b.width / 2);
      const dy = y - (b.top + b.height / 2);
      const d = dx * dx + dy * dy * 9;
      if (!best || d < best.d) best = { key: g.dataset.gap ?? "", d };
    }
    return best?.key || null;
  };
  const live = running && rungPowered;
  const height = Math.max(ROW_H, nodeHeight(logic));

  return (
    <div
      className="bg-white rounded"
      style={{
        border: rungSelected ? "2px solid #2891FF" : "1px solid #C9D2DC",
        // Keep the box the same size selected or not, so selecting a network
        // does not nudge every network below it down the page.
        margin: rungSelected ? 0 : 1,
      }}
      onClick={() => onSelect(null)}
      onPointerUp={() => setDrag(null)}
      onPointerLeave={() => {
        setDrag(null);
        setHover(null);
      }}
      /*
       * Drop handling lives on the whole network card — header, padding and
       * all — rather than on the inner strip of rungs. Dropping on a network's
       * title bar or in the space beside the last contact used to do nothing
       * at all, which reads as the drop being broken rather than as having
       * missed a target by four pixels.
       */
      onDragOver={(e) => {
        const d = takeDrag();
        if (!d) return;
        // A network being reordered is handled by the strips between cards,
        // not by the card itself — dropping a network inside a network has no
        // meaning and lighting a gap for it would promise one.
        if (d.kind === "rung") return;
        e.preventDefault();
        e.dataTransfer.dropEffect = d.kind === "new" ? "copy" : "move";
        if (collapsed) return;
        const isOut = d.kind === "new" ? draggedIsOutput() : d.isOutput;
        setDropHint(
          isOut ? null : nearestGapKey(e.currentTarget as HTMLElement, e.clientX, e.clientY),
        );
        setOutOver(isOut);
      }}
      onDragLeave={(e) => {
        // Only when the pointer has actually left the card, not on the way
        // between two children of it.
        if ((e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) return;
        setDropHint(null);
        setOutOver(false);
      }}
      onDrop={(e) => {
        const d = takeDrag();
        setDropHint(null);
        setOutOver(false);
        if (!d || d.kind === "rung") return;
        e.preventDefault();

        // A collapsed network still accepts a drop; it expands to show it.
        if (collapsed) onToggleCollapse();

        /*
         * Something already on a rung is a MOVE, and the studio owns it —
         * it is the only thing that can see both networks at once. The card
         * only has to say where it landed.
         */
        if (d.kind === "element") {
          /*
           * Deliberately not cleared here. The studio reads the payload again
           * when it handles the move — it is the only thing that can see both
           * networks — and clearing it first left it reading null and quietly
           * doing nothing, which is the exact failure this whole feature was
           * meant to remove.
           */
          if (d.isOutput) {
            onDropPayload("output", 0);
            return;
          }
          const k = nearestGapKey(e.currentTarget as HTMLElement, e.clientX, e.clientY);
          if (!k) {
            onDropPayload([], 0);
            return;
          }
          try {
            const { p, i } = JSON.parse(k) as { p: Path; i: number };
            onDropPayload(p, i);
          } catch {
            onDropPayload([], 0);
          }
          return;
        }

        const t = d.type;
        clearDrag();

        // Routed by what the instruction IS, not by where it was let go. A
        // coil dropped among the contacts belongs on the right-hand rail, and
        // silently doing nothing is the worst of the three options.
        if (INSTRUCTION_BY_TYPE.get(t)?.side === "output") {
          onDropOutput(t);
          return;
        }

        const key = nearestGapKey(e.currentTarget as HTMLElement, e.clientX, e.clientY);
        if (!key) {
          onInsert([], 0, t);
          return;
        }
        try {
          const { p, i } = JSON.parse(key) as { p: Path; i: number };
          onInsert(p, i, t);
        } catch {
          onInsert([], 0, t);
        }
      }}
    >
      {/*
        The header is the handle for the whole network.
        
        Deliberately the header and not the card: if the card itself were
        draggable, every attempt to drag a contact out of it would start a
        network drag instead, because the card is the outer element and gets
        the gesture first.
      */}
      <div
        draggable
        onDragStart={(e) => {
          e.stopPropagation();
          onPickUpRung();
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", `network-${index + 1}`);
        }}
        onDragEnd={() => clearDrag()}
        onClick={(e) => {
          e.stopPropagation();
          onSelectRung();
        }}
        onContextMenu={onRungMenu}
        title="Drag to reorder this network. Right-click for more."
        className="flex items-center gap-1.5 px-2 py-1 border-b border-[#E2E8F0] bg-[#F7F9FB] cursor-pointer"
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleCollapse();
          }}
          title={collapsed ? "Expand this network" : "Collapse this network"}
          className="text-[#64748B] hover:text-[#0f172a] shrink-0"
        >
          {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
        </button>

        <span className="text-[10.5px] font-bold text-[#334155] shrink-0">Network {index + 1}</span>

        {renaming ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onBlur={() => {
              onRename(draft.trim());
              setRenaming(false);
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") {
                onRename(draft.trim());
                setRenaming(false);
              }
              if (e.key === "Escape") setRenaming(false);
            }}
            placeholder="Describe what this network does"
            className="flex-1 min-w-0 bg-white border border-[#2891FF] rounded px-1 text-[10.5px] text-[#0f172a] outline-none"
          />
        ) : (
          <span
            onDoubleClick={(e) => {
              e.stopPropagation();
              setDraft(rung.comment ?? "");
              setRenaming(true);
            }}
            className="flex-1 min-w-0 truncate text-[10.5px] font-normal text-[#64748B]"
            title="Double-click to rename"
          >
            {rung.comment || <span className="italic text-[#94A3B8]">untitled</span>}
          </span>
        )}

        {running && (
          <span
            className="text-[9.5px] font-bold px-1.5 rounded shrink-0"
            style={{
              color: live ? "#15803d" : "#94a3b8",
              background: live ? "rgba(34,197,94,0.12)" : "transparent",
            }}
          >
            {live ? "TRUE" : "FALSE"}
          </span>
        )}

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setDraft(rung.comment ?? "");
            setRenaming(true);
          }}
          title="Rename this network"
          className="text-[#94A3B8] hover:text-[#2891FF] shrink-0"
        >
          <Pencil size={11} />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDeleteRung();
          }}
          title="Delete this network"
          className="text-[#94A3B8] hover:text-red-500 shrink-0"
        >
          <Trash2 size={11} />
        </button>
      </div>

      {!collapsed && (
        <div className="flex items-stretch px-3 py-2 overflow-x-auto">
          <span style={{ flex: "0 0 3px", background: live ? LIVE : INK, minHeight: height }} />

          <SeriesView node={logic} path={[]} ctx={ctx} />

          {/* Outputs, each fed from the rung's power. */}
          <span
            onDragOver={(e) => {
              e.preventDefault();
              setOutOver(true);
            }}
            onDragLeave={() => setOutOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setOutOver(false);
              const t =
                takeDraggedInstruction() ??
                (e.dataTransfer.getData("application/ladx-instruction") as ElementType | "");
              clearDraggedInstruction();
              if (t) onDropOutput(t as ElementType);
            }}
            style={{
              position: "relative",
              display: "flex",
              flexDirection: "column",
              background: outOver ? "rgba(40,145,255,0.10)" : undefined,
              borderRadius: 3,
            }}
          >
            {rung.outputs.map((o) => (
              <span key={o.id} style={{ display: "flex", alignItems: "stretch", width: "100%" }}>
                <ElementCell
                  type={o.type}
                  tag={o.tag}
                  address={addressOf?.(o.tag)}
                  detail={detailOf(o)}
                  live={running && !!power[o.id]}
                  selected={selectedIds.includes(o.id)}
                  help={INSTRUCTION_BY_TYPE.get(o.type)?.help}
                  onSelect={(additive) => (additive ? onToggleSelect(o.id) : onSelect(o.id))}
                  onOpen={() => onOpenOutput(o)}
                  onDragStart={() =>
                    onPickUp({
                      kind: "el",
                      id: o.id,
                      type: o.type,
                      tag: o.tag,
                      preset: o.preset,
                      operand: o.operand,
                      dest: o.dest,
                    })
                  }
                  onContextMenu={(e) => onOutputMenu(e, o)}
                />
                {/* Wire from the coil to the right rail. This column is as wide as
                  the "+ parallel coil" button sitting under it, which is wider
                  than a 74px coil, so the coil stopped short and left a visible
                  break before the rail. INK rather than LIVE: the run back to
                  the right rail is the neutral side, which is why the rail
                  itself is drawn in INK whether the rung is energised or not. */}
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    alignSelf: "flex-start",
                    marginTop: 28,
                    height: 2,
                    background: INK,
                  }}
                />
              </span>
            ))}
            {/* Stacked outputs ARE parallel coils — the branch on the output
              side. The rails join them, so the drawing says what the logic
              does: one rung driving several coils at once. */}
            {rung.outputs.length > 1 && (
              <>
                <span
                  style={{
                    position: "absolute",
                    left: 0,
                    top: CENTRE - 1,
                    height: (rung.outputs.length - 1) * ROW_H + 2,
                    width: 2,
                    background: live ? LIVE : INK,
                  }}
                />
                {/*
                There is no right-hand vertical, deliberately.

                Parallel coils sit between two nodes: the rung's output on the
                left, and the right rail on the right. The rail IS the common
                connection — drawing a second vertical beside it says there is
                a junction there that does not exist, and on a real drawing
                that reads as an extra wire. Only the left side needs a join.
              */}
              </>
            )}

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onAddOutput();
              }}
              title={
                rung.outputs.length === 0
                  ? "Add an output to this rung"
                  : "Add another coil in parallel — this rung will drive both"
              }
              className="text-[10px] text-[#94A3B8] hover:text-[#2891FF] px-3 whitespace-nowrap text-left"
              style={{ height: rung.outputs.length === 0 ? ROW_H : 18 }}
            >
              + {rung.outputs.length === 0 ? "output" : "parallel coil"}
            </button>
          </span>

          <span style={{ flex: "0 0 3px", background: INK, minHeight: height }} />
        </div>
      )}
    </div>
  );
}
