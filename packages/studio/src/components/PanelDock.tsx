"use client";

import { LayoutGrid } from "lucide-react";
import { DEFAULT_LAYOUT, type Layout, PANELS, type PanelId } from "../lib/panels";
import { ink, line, radius } from "../lib/theme";
import Tip from "./Tip";
import css from "./ladx.module.css";

/**
 * The strip along the bottom holding whatever has been closed.
 *
 * This exists so that closing a panel is not frightening. A pane that vanishes
 * completely reads as destroyed; a pane that becomes a labelled tab you can
 * click reads as put away. The strip stays visible even when nothing is
 * closed, with a quiet hint, so people know where things go before they close
 * the first one.
 */
export default function PanelDock({
  layout,
  onOpen,
  onReset,
  onHelp,
}: {
  layout: Layout;
  onOpen: (id: PanelId) => void;
  onReset: () => void;
  onHelp: (topic: string) => void;
}) {
  const closed = PANELS.filter((p) => !layout[p.id].open);
  // Only offer the reset once the layout actually differs from the default, // the simulator starts closed, so "some panel is closed" would show it from
  // the first render and teach people to ignore it.
  const anyMoved = PANELS.some(
    (p) =>
      layout[p.id].open !== DEFAULT_LAYOUT[p.id].open ||
      layout[p.id].size !== DEFAULT_LAYOUT[p.id].size,
  );

  return (
    <div
      className="flex items-center gap-2 px-2 shrink-0"
      style={{
        height: 30,
        border: `1px solid ${line.base}`,
        borderRadius: radius.md,
        // A shade darker than a panel header, and lifted, so the strip reads
        // as the floor of the workspace rather than another panel that
        // happens to be at the bottom.
        background: "linear-gradient(#F2F5F8, #E9EDF2)",
        boxShadow: "inset 0 1px 0 #FFFFFF",
      }}
    >
      <span
        className="shrink-0"
        style={{
          fontSize: 9,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          color: ink.faint,
        }}
      >
        Dock
      </span>

      {closed.length === 0 ? (
        <span style={{ fontSize: 10, color: ink.faint, fontStyle: "italic" }}>
          Closed panels appear here, click one to bring it back.
        </span>
      ) : (
        <div className="flex items-center gap-1 overflow-x-auto">
          {closed.map((p) => (
            <Tip
              key={p.id}
              label={p.title}
              text={`${p.blurb} Click to reopen.`}
              topic={p.helpTopic}
              onOpenHelp={onHelp}
              place="top"
            >
              <button
                type="button"
                onClick={() => onOpen(p.id)}
                className={`${css.dockChip} ${css.dockIn}`}
              >
                {p.title}
              </button>
            </Tip>
          ))}
        </div>
      )}

      <span className="flex-1" />

      {anyMoved && (
        <Tip
          label="Reset layout"
          text="Put every panel back to its default size and position."
          topic="screen"
          onOpenHelp={onHelp}
          place="top"
        >
          <button type="button" onClick={onReset} className={css.dockReset}>
            <LayoutGrid size={10} /> Reset layout
          </button>
        </Tip>
      )}
    </div>
  );
}
