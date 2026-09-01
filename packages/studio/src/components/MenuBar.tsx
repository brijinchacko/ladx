"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The menu bar.
 *
 * Every PLC IDE has one, in the same order, with roughly the same contents, * and that matters more than it looks. A student who learns that saving is
 * under File and undo is under Edit carries that to TIA and Studio 5000
 * unchanged. Inventing a nicer arrangement here would teach a habit that works
 * in exactly one piece of software.
 *
 * Every item either does something or is disabled with a reason. Nothing is
 * listed to look complete: a greyed-out item a student cannot explain is worse
 * than an absent one.
 */

export type MenuItem = {
  label: string;
  shortcut?: string;
  onSelect?: () => void;
  disabled?: boolean;
  /** Draws a rule above this item. */
  separator?: boolean;
};

export type Menu = { label: string; items: MenuItem[] };

export default function MenuBar({
  menus,
  title,
}: {
  menus: Menu[];
  /**
   * The name of what is open, shown at the right of the menu row.
   *
   * A title bar names the document; a toolbar acts on it. The project name
   * was sitting in the toolbar between Save and Compile, which made the row
   * read as "one of these things does something" when one of them is just a
   * label. This is the title-bar position, and the menu row already had the
   * space.
   */
  title?: React.ReactNode;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Click-away and Escape, because a menu that will not close is worse than no
  // menu at all.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(null);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div
      ref={ref}
      className="flex items-center gap-0.5 px-1 h-7 bg-ink-100 border-b border-ink-200 rounded-t relative"
    >
      {menus.map((m) => (
        <div key={m.label} className="relative" data-tour={`${m.label.toLowerCase()}-menu`}>
          <button
            type="button"
            onClick={() => setOpen((cur) => (cur === m.label ? null : m.label))}
            onMouseEnter={() => setOpen((cur) => (cur ? m.label : cur))}
            className={`px-2.5 h-6 rounded text-[11.5px] font-medium transition-colors ${
              open === m.label ? "bg-action text-white" : "text-ink-700 hover:bg-ink-100"
            }`}
          >
            {m.label}
          </button>

          {open === m.label && (
            <div
              className="absolute left-0 top-full mt-0.5 min-w-[15rem] rounded border border-ink-200 bg-white py-1"
              style={{ zIndex: 60, boxShadow: "0 8px 24px rgba(15,23,42,0.18)" }}
              role="menu"
            >
              {m.items.map((it, i) => (
                <div key={`${it.label}-${i}`}>
                  {it.separator && <div className="my-1 border-t border-ink-100" />}
                  <button
                    type="button"
                    role="menuitem"
                    disabled={it.disabled || !it.onSelect}
                    onClick={() => {
                      setOpen(null);
                      it.onSelect?.();
                    }}
                    className="w-full flex items-center gap-4 px-3 h-7 text-left text-[12px] text-ink-700 hover:bg-ink-100 disabled:text-ink-400 disabled:hover:bg-transparent"
                  >
                    <span className="flex-1 truncate">{it.label}</span>
                    {it.shortcut && (
                      <span className="text-[10.5px] text-ink-400 font-mono shrink-0">
                        {it.shortcut}
                      </span>
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
      {title && <span className="ml-auto flex items-center pr-1 min-w-0">{title}</span>}
    </div>
  );
}
