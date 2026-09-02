"use client";

import { GROUPS, TOOLS } from "@/lib/studio/tools";
import { type Theme, applyTheme } from "@/lib/theme/theme";
import {
  Activity,
  Cable,
  CalendarRange,
  ClipboardCheck,
  FileText,
  FolderKanban,
  GitCompareArrows,
  Grid2x2Check,
  House,
  Library,
  type LucideIcon,
  MessageSquare,
  MessageSquarePlus,
  MonitorCog,
  Monitor as MonitorIcon,
  Moon,
  PencilRuler,
  Plus,
  Ruler,
  Search,
  Settings,
  ShieldCheck,
  Sun,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/** Fired on `window` to open the palette from anywhere, such as the sidebar's search row. */
export const OPEN_PALETTE = "ladx:palette";

interface Item {
  id: string;
  label: string;
  hint?: string;
  group: string;
  icon: LucideIcon;
  run: () => void;
}

const TOOL_ICONS: Record<string, LucideIcon> = {
  Grid2x2Check,
  GitCompareArrows,
  MonitorCog,
  PencilRuler,
  Activity,
  Cable,
  ClipboardCheck,
  Ruler,
  Library,
  FileText,
};

/**
 * Cmd+K.
 *
 * One box that reaches everything: a tool, a project, a chat, a setting, an
 * action. The sidebar already lists all of these, and that is the point: on a
 * laptop the sidebar is a scroll, and the people who use this all day know
 * the name of the thing they want. Typing three letters of it is faster than
 * finding it, on any screen.
 *
 * Deliberately plain matching. Every word typed has to appear in the label,
 * in any order, which is what people expect of a search box and is enough for
 * a few dozen items. Fuzzy matching on a list this size mostly produces
 * surprises.
 */
export function CommandPalette({
  projects,
  conversations,
  isAdmin,
}: {
  projects: { id: string; name: string }[];
  conversations: { id: string; title: string | null }[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_PALETTE, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_PALETTE, onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      // After the paint, so the input exists to focus.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router],
  );

  const items = useMemo<Item[]>(() => {
    const groupLabel = Object.fromEntries(GROUPS.map((g) => [g.id, g.label]));
    const theme = (t: Theme, icon: LucideIcon, label: string): Item => ({
      id: `theme-${t}`,
      label,
      group: "Appearance",
      icon,
      run: () => {
        applyTheme(t);
        setOpen(false);
      },
    });
    return [
      {
        id: "new-chat",
        label: "New chat",
        group: "Actions",
        icon: MessageSquarePlus,
        run: () => go("/studio"),
      },
      {
        id: "new-project",
        label: "New project",
        group: "Actions",
        icon: Plus,
        run: () => go("/studio/projects?new=1"),
      },
      {
        id: "new-client",
        label: "New client",
        group: "Actions",
        icon: Users,
        run: () => go("/studio/clients/new"),
      },
      { id: "home", label: "Home", group: "Go to", icon: House, run: () => go("/studio") },
      {
        id: "projects",
        label: "Projects",
        group: "Go to",
        icon: FolderKanban,
        run: () => go("/studio/projects"),
      },
      {
        id: "planner",
        label: "Planner",
        group: "Go to",
        icon: CalendarRange,
        run: () => go("/studio/planner"),
      },
      {
        id: "clients",
        label: "Clients",
        group: "Go to",
        icon: Users,
        run: () => go("/studio/clients"),
      },
      {
        id: "settings",
        label: "Settings",
        group: "Go to",
        icon: Settings,
        run: () => go("/studio/settings"),
      },
      ...(isAdmin
        ? [
            {
              id: "admin",
              label: "Admin",
              group: "Go to",
              icon: ShieldCheck,
              run: () => go("/studio/admin"),
            },
          ]
        : []),
      ...TOOLS.map((t) => ({
        id: t.href,
        label: t.label,
        hint: t.about,
        group: groupLabel[t.group] ?? "Tools",
        icon: TOOL_ICONS[t.icon] ?? FileText,
        run: () => go(t.href),
      })),
      ...projects.map((p) => ({
        id: `project-${p.id}`,
        label: p.name,
        group: "Projects",
        icon: FolderKanban,
        run: () => go(`/studio/projects/${p.id}`),
      })),
      ...conversations.map((c) => ({
        id: `chat-${c.id}`,
        label: c.title?.trim() || "Untitled chat",
        group: "Chats",
        icon: MessageSquare,
        run: () => go(`/studio/c/${c.id}`),
      })),
      theme("light", Sun, "Light theme"),
      theme("dark", Moon, "Dark theme"),
      theme("system", MonitorIcon, "Follow the system theme"),
    ];
  }, [projects, conversations, isAdmin, go]);

  const shown = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      // Nothing typed: the things somebody most often reaches for, not all of it.
      return items.filter(
        (i) =>
          i.group === "Actions" || i.group === "Go to" || GROUPS.some((g) => g.label === i.group),
      );
    }
    return items.filter((i) => {
      const hay = `${i.label} ${i.hint ?? ""} ${i.group}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [items, query]);

  // Keep the highlighted row on screen as the arrows move it.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, shown.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      shown[active]?.run();
    }
  };

  // Rows grouped in the order they appear, with one label per group.
  let lastGroup = "";

  return (
    <div className="fixed inset-0 z-[80]" onKeyDown={onKeyDown}>
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: the whole overlay handles Escape above; the click is the pointer's way of saying the same thing. */}
      <div
        className="absolute inset-0 animate-fade-in bg-black/60"
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />
      <div
        // biome-ignore lint/a11y/useSemanticElements: <dialog> manages its own open state through showModal(), which fights conditional rendering and the keyboard handling above. The ARIA roles give the same semantics without that conflict, as the consent sheet does.
        role="dialog"
        aria-modal="true"
        aria-label="Go to anything"
        className="absolute left-1/2 top-[14%] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 animate-rise overflow-hidden rounded-lg border border-ink-200 bg-white shadow-lg"
      >
        <div className="flex items-center gap-2.5 border-b border-ink-100 px-4">
          <Search className="h-4 w-4 shrink-0 text-ink-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            placeholder="Go to a tool, a project, a chat…"
            aria-label="Go to anything"
            className="h-12 w-full border-0 bg-transparent text-[14px] text-ink-900 outline-none placeholder:text-ink-400"
          />
          <kbd className="shrink-0 rounded border border-ink-200 px-1.5 py-0.5 font-mono text-[10.5px] text-ink-400">
            esc
          </kbd>
        </div>

        <div ref={listRef} className="max-h-[min(60vh,420px)] overflow-y-auto py-1.5">
          {shown.length === 0 && (
            <p className="px-4 py-6 text-center text-[13px] text-ink-500">
              Nothing called "{query}".
            </p>
          )}
          {shown.map((item, i) => {
            const Icon = item.icon;
            const label = item.group !== lastGroup ? item.group : null;
            lastGroup = item.group;
            return (
              <div key={item.id}>
                {label && (
                  <p className="px-4 pb-0.5 pt-2 text-[11px] font-medium text-ink-400">{label}</p>
                )}
                <button
                  type="button"
                  data-index={i}
                  onMouseEnter={() => setActive(i)}
                  onClick={item.run}
                  className={`flex w-full items-center gap-3 px-4 py-2 text-left transition-colors ${
                    i === active ? "bg-ink-100 text-ink-900" : "text-ink-700"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0 text-ink-400" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px]">{item.label}</span>
                    {item.hint && (
                      <span className="block truncate text-[12px] text-ink-500">{item.hint}</span>
                    )}
                  </span>
                  {i === active && (
                    <kbd className="shrink-0 font-mono text-[10.5px] text-ink-400">↵</kbd>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
