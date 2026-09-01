"use client";

import { Bell, ChevronDown, ChevronRight, LineChart, Monitor, Tag as TagIcon } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import type { HmiDoc } from "../lib/types";

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
            className="shrink-0 text-ink-400 hover:text-teal-700"
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

/* ─────────────────────────── context menu ─────────────────────────── */

export interface CtxItem {
  label?: string;
  shortcut?: string;
  disabled?: boolean;
  sep?: boolean;
  onSelect?: () => void;
}

/**
 * The right-click menu.
 *
 * Flipped back inside the window when it would open off the edge, which is
 * what happens every time somebody right-clicks an object near the bottom of a
 * panel: a menu that opens below the fold is a menu nobody can use.
 */
export function ContextMenu({
  at,
  items,
  onClose,
}: {
  at: { x: number; y: number };
  items: CtxItem[];
  hasSelection?: boolean;
  canPaste?: boolean;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: at.x, y: at.y });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({
      x: Math.min(at.x, window.innerWidth - r.width - 8),
      y: Math.min(at.y, window.innerHeight - r.height - 8),
    });
  }, [at.x, at.y]);

  useEffect(() => {
    const close = () => onClose();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    // Captured, so a click anywhere dismisses it before that click does
    // anything else.
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      style={{ left: pos.x, top: pos.y }}
      className="fixed z-[60] min-w-[190px] border border-ink-200 bg-white py-1 shadow-xl"
      onMouseDown={(e) => e.stopPropagation()}
    >
      {items.map((it, i) =>
        it.sep ? (
          <div
            key={`after-${items[i - 1]?.label ?? "top"}`}
            className="my-1 border-t border-ink-100"
          />
        ) : (
          <button
            key={it.label}
            type="button"
            disabled={it.disabled}
            onClick={() => {
              onClose();
              it.onSelect?.();
            }}
            className="flex w-full items-center gap-4 px-3 py-1 text-left text-[12.5px] text-ink-700 transition-colors hover:bg-ink-50 disabled:opacity-35 disabled:hover:bg-transparent"
          >
            <span className="flex-1">{it.label}</span>
            {it.shortcut && (
              <span className="font-mono text-[10.5px] text-ink-400">{it.shortcut}</span>
            )}
          </button>
        ),
      )}
    </div>
  );
}
