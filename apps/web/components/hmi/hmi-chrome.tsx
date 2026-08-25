"use client";

import { type Layout, PANELS, type PanelId, clamp, isMoved, panel } from "@/lib/hmi/panels-layout";
import type { HmiDoc } from "@/lib/hmi/types";
import {
  Bell,
  ChevronDown,
  ChevronRight,
  LayoutGrid,
  LineChart,
  Monitor,
  Tag as TagIcon,
  X,
} from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";

/* ─────────────────────────────── menu bar ─────────────────────────────── */

export interface MenuItem {
  label: string;
  shortcut?: string;
  onSelect?: () => void;
  disabled?: boolean;
  separator?: boolean;
  /** A tick, for the View menu's panel toggles. */
  checked?: boolean;
}
export interface Menu {
  label: string;
  items: MenuItem[];
}

/**
 * The menu bar.
 *
 * Every desktop tool this replaces has one, and people look for File before
 * they look anywhere else. Opens on click, then follows the pointer across the
 * other menus the way a native bar does, because having to click twice to look
 * at the next menu is the detail that makes a web menu feel wrong.
 */
export function MenuBar({ menus }: { menus: Menu[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(null);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <div ref={ref} className="flex shrink-0 items-stretch border-b border-ink-100 bg-white">
      {menus.map((m) => (
        <div key={m.label} className="relative">
          <button
            type="button"
            onClick={() => setOpen(open === m.label ? null : m.label)}
            onMouseEnter={() => open && setOpen(m.label)}
            className={`px-3 py-1.5 text-[12.5px] transition-colors ${
              open === m.label ? "bg-ink-900 text-white" : "text-ink-700 hover:bg-ink-50"
            }`}
          >
            {m.label}
          </button>
          {open === m.label && (
            <div className="absolute left-0 top-full z-50 min-w-[200px] border border-ink-200 bg-white py-1 shadow-lg">
              {m.items.map((it, i) =>
                it.separator ? (
                  // Keyed on the item it follows: a separator has no identity
                  // of its own, but the thing above it does.
                  <div
                    key={`after-${m.items[i - 1]?.label ?? "top"}`}
                    className="my-1 border-t border-ink-100"
                  />
                ) : (
                  <button
                    key={it.label}
                    type="button"
                    disabled={it.disabled}
                    onClick={() => {
                      setOpen(null);
                      it.onSelect?.();
                    }}
                    className="flex w-full items-center gap-3 px-3 py-1 text-left text-[12.5px] text-ink-700 transition-colors hover:bg-ink-50 disabled:opacity-35 disabled:hover:bg-transparent"
                  >
                    <span className="w-3 shrink-0 text-teal-600">{it.checked ? "✓" : ""}</span>
                    <span className="flex-1">{it.label}</span>
                    {it.shortcut && (
                      <span className="font-mono text-[10.5px] text-ink-400">{it.shortcut}</span>
                    )}
                  </button>
                ),
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ─────────────────────────────── panels ─────────────────────────────── */

/**
 * A dockable pane with a drag gutter.
 *
 * The gutter is on the edge facing the canvas, and it is 5px rather than 1px
 * because a one-pixel target is a thing people miss and then conclude does not
 * resize. Closing puts it in the dock strip rather than removing it.
 */
export function Panel({
  id,
  layout,
  onResize,
  onClose,
  children,
  actions,
}: {
  id: PanelId;
  layout: Layout;
  onResize: (size: number) => void;
  onClose: () => void;
  children: ReactNode;
  actions?: ReactNode;
}) {
  const def = panel(id);
  const state = layout[id];
  const dragging = useRef(false);

  const onDown = (e: React.PointerEvent) => {
    e.preventDefault();
    dragging.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const box = (e.currentTarget as HTMLElement).parentElement?.getBoundingClientRect();
    if (!box) return;
    const next =
      def.side === "left"
        ? e.clientX - box.left
        : def.side === "right"
          ? box.right - e.clientX
          : box.bottom - e.clientY;
    onResize(clamp(Math.round(next), def.min, def.max));
  };
  const stop = () => {
    dragging.current = false;
  };

  const isSide = def.side !== "bottom";

  return (
    <div
      className={`relative flex shrink-0 flex-col bg-white ${
        def.side === "left"
          ? "border-r border-ink-100"
          : def.side === "right"
            ? "border-l border-ink-100"
            : "border-t border-ink-100"
      }`}
      style={isSide ? { width: state.size } : { height: state.size }}
    >
      <header className="flex shrink-0 items-center gap-1.5 border-b border-ink-100 bg-ink-50/60 px-2 py-1">
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-500">
          {def.title}
        </span>
        {actions}
        <button
          type="button"
          onClick={onClose}
          title={`Close ${def.title}. It goes to the strip along the bottom.`}
          className="ml-auto text-ink-300 transition-colors hover:text-ink-900"
        >
          <X className="h-3 w-3" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-auto">{children}</div>

      {/* the gutter, on the side facing the canvas */}
      <div
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={stop}
        onPointerCancel={stop}
        className={`absolute z-10 ${
          def.side === "left"
            ? "right-0 top-0 h-full w-[5px] cursor-col-resize"
            : def.side === "right"
              ? "left-0 top-0 h-full w-[5px] cursor-col-resize"
              : "left-0 top-0 h-[5px] w-full cursor-row-resize"
        } hover:bg-teal-500/40`}
      />
    </div>
  );
}

/**
 * The strip along the bottom holding whatever has been closed.
 *
 * It stays visible even when nothing is closed, with a quiet hint, so people
 * know where things go before they close the first one. A pane that vanishes
 * completely reads as destroyed; one that becomes a labelled tab reads as put
 * away.
 */
export function PanelDock({
  layout,
  onOpen,
  onReset,
}: { layout: Layout; onOpen: (id: PanelId) => void; onReset: () => void }) {
  const closed = PANELS.filter((p) => !layout[p.id].open);
  return (
    <div className="flex shrink-0 items-center gap-2 border-t border-ink-100 bg-ink-50/60 px-2 py-1">
      <LayoutGrid className="h-3 w-3 shrink-0 text-ink-300" />
      {closed.length === 0 ? (
        <span className="text-[11px] text-ink-400">
          Closed panels come back here. Nothing is closed.
        </span>
      ) : (
        closed.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onOpen(p.id)}
            title={p.blurb}
            className="rounded-sm border border-ink-200 bg-white px-2 py-0.5 text-[11.5px] text-ink-700 transition-colors hover:border-teal-500"
          >
            {p.title}
          </button>
        ))
      )}
      {isMoved(layout) && (
        <button
          type="button"
          onClick={onReset}
          className="ml-auto text-[11px] text-ink-500 hover:text-ink-900"
        >
          Reset layout
        </button>
      )}
    </div>
  );
}

/* ─────────────────────────── project tree ─────────────────────────── */

/**
 * The application, as a tree.
 *
 * Screens, the tags it owns, the alarms and the trends: the four things a
 * document actually contains, in the order somebody works through them.
 * Everything here selects or opens; nothing here edits, which is what Setup is
 * for. Keeping those apart stops the tree becoming a form.
 */
export function ProjectTree({
  doc,
  screenId,
  plcTagCount,
  onSelectScreen,
  onOpenSetup,
  appName,
}: {
  doc: HmiDoc;
  screenId: string;
  plcTagCount: number;
  onSelectScreen: (id: string) => void;
  onOpenSetup: (tab: "screen" | "tags" | "alarms" | "trends" | "connection") => void;
  appName: string;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({
    screens: true,
    tags: false,
    alarms: false,
    trends: false,
  });
  const toggle = (k: string) => setOpen((o) => ({ ...o, [k]: !o[k] }));

  const Branch = ({
    id,
    label,
    count,
    icon: Icon,
    children,
    onAdd,
  }: {
    id: string;
    label: string;
    count: number;
    icon: typeof Monitor;
    children?: ReactNode;
    onAdd?: () => void;
  }) => (
    <div>
      <div className="flex items-center gap-1 px-1.5 py-0.5 hover:bg-ink-50">
        <button
          type="button"
          onClick={() => toggle(id)}
          className="flex min-w-0 flex-1 items-center gap-1 text-left"
        >
          {open[id] ? (
            <ChevronDown className="h-3 w-3 shrink-0 text-ink-400" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0 text-ink-400" />
          )}
          <Icon className="h-3 w-3 shrink-0 text-ink-400" />
          <span className="truncate text-[12px] text-ink-700">{label}</span>
          <span className="font-mono text-[10px] tabular-nums text-ink-400">{count}</span>
        </button>
        {onAdd && (
          <button
            type="button"
            onClick={onAdd}
            title={`Edit ${label.toLowerCase()}`}
            className="shrink-0 text-ink-300 hover:text-teal-700"
          >
            +
          </button>
        )}
      </div>
      {open[id] && children && <div className="ml-4 border-l border-ink-100 pl-1">{children}</div>}
    </div>
  );

  return (
    <div className="py-1">
      <div className="flex items-center gap-1.5 px-2 py-1">
        <Monitor className="h-3 w-3 shrink-0 text-teal-600" />
        <span className="truncate font-mono text-[11px] uppercase tracking-[0.1em] text-ink-600">
          {appName}
        </span>
      </div>

      <Branch
        id="screens"
        label="Screens"
        count={doc.screens.length}
        icon={Monitor}
        onAdd={() => onOpenSetup("screen")}
      >
        {doc.screens.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onSelectScreen(s.id)}
            className={`flex w-full items-baseline gap-1.5 px-1.5 py-0.5 text-left text-[12px] ${
              s.id === screenId ? "bg-teal-50 text-ink-900" : "text-ink-600 hover:bg-ink-50"
            }`}
          >
            <span className="min-w-0 flex-1 truncate">{s.name}</span>
            <span className="font-mono text-[9.5px] text-ink-400">{s.widgets.length}</span>
          </button>
        ))}
      </Branch>

      <Branch
        id="tags"
        label="Tags"
        count={doc.tags.length + plcTagCount}
        icon={TagIcon}
        onAdd={() => onOpenSetup("tags")}
      >
        <p className="px-1.5 py-1 text-[11px] leading-snug text-ink-400">
          {plcTagCount} from the ladder program, {doc.tags.length} owned by this HMI. Controller
          tags are not listed twice: the screens bind to them by name.
        </p>
      </Branch>

      <Branch
        id="alarms"
        label="Alarms"
        count={doc.alarms.length}
        icon={Bell}
        onAdd={() => onOpenSetup("alarms")}
      >
        {doc.alarms.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => onOpenSetup("alarms")}
            className="flex w-full items-baseline gap-1.5 px-1.5 py-0.5 text-left text-[12px] text-ink-600 hover:bg-ink-50"
          >
            <span className="min-w-0 flex-1 truncate">{a.message}</span>
            <span className="font-mono text-[9px] uppercase text-ink-400">
              {a.priority.slice(0, 4)}
            </span>
          </button>
        ))}
        {doc.alarms.length === 0 && (
          <p className="px-1.5 py-1 text-[11px] text-ink-400">None defined.</p>
        )}
      </Branch>

      <Branch
        id="trends"
        label="Trends"
        count={doc.trends.length}
        icon={LineChart}
        onAdd={() => onOpenSetup("trends")}
      >
        {doc.trends.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onOpenSetup("trends")}
            className="flex w-full items-baseline gap-1.5 px-1.5 py-0.5 text-left text-[12px] text-ink-600 hover:bg-ink-50"
          >
            <span className="min-w-0 flex-1 truncate">{t.name}</span>
            <span className="font-mono text-[9px] text-ink-400">{t.pens.length}p</span>
          </button>
        ))}
        {doc.trends.length === 0 && (
          <p className="px-1.5 py-1 text-[11px] text-ink-400">None defined.</p>
        )}
      </Branch>

      <button
        type="button"
        onClick={() => onOpenSetup("connection")}
        className="mt-1 flex w-full items-center gap-1.5 px-2 py-1 text-left text-[12px] text-ink-600 hover:bg-ink-50"
      >
        <span className="ml-4 truncate">Connection · {doc.connection.protocol}</span>
      </button>
    </div>
  );
}
