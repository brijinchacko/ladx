"use client";

import AccountMenu from "@/components/studio/account-menu";
import ChatHistory, { type HistoryItem } from "@/components/studio/chat-history";
import { OPEN_PALETTE } from "@/components/studio/command-palette";
import { GROUPS, TOOLS as SHARED_TOOLS } from "@/lib/studio/tools";
import {
  Logo,
  SIDEBAR_BODY,
  SIDEBAR_BRAND,
  SIDEBAR_BRAND_LINK,
  SIDEBAR_BRAND_SUB,
  SIDEBAR_COLLAPSE_BUTTON,
  SIDEBAR_EXPAND_BUTTON,
  SIDEBAR_FOOT,
  SIDEBAR_SECTION,
  SIDEBAR_SECTION_LABEL,
  SIDEBAR_SECTION_ROWS,
  sidebarCountClass,
  sidebarIconClass,
  sidebarRowClass,
} from "@ladx/ui";
import {
  Activity,
  Cable,
  CalendarRange,
  ChevronDown,
  ChevronsLeft,
  ClipboardCheck,
  FileText,
  FolderKanban,
  GitCompareArrows,
  Grid2x2Check,
  House,
  Library,
  type LucideIcon,
  MessageSquarePlus,
  MonitorCog,
  PanelLeft,
  PencilRuler,
  Plus,
  Ruler,
  Search,
  Settings,
  ShieldCheck,
  Users,
  Workflow,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export type SidebarConversation = HistoryItem;

export interface SidebarProject {
  id: string;
  name: string;
  phase: string;
}

/**
 * Icons for the shared tool list.
 *
 * The list itself lives in lib/studio/tools, so the sidebar and the project
 * page cannot drift apart. Only the icon mapping is here, because an icon is a
 * component and the shared list has to stay importable by the server.
 */
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
  Workflow,
};

const TOOLS = SHARED_TOOLS.map((t) => ({
  href: t.href,
  label: t.label,
  icon: TOOL_ICONS[t.icon] ?? FileText,
  group: t.group,
}));

const PLACES = [
  { href: "/studio", label: "Home", icon: House },
  { href: "/studio/projects", label: "Projects", icon: FolderKanban },
  { href: "/studio/planner", label: "Planner", icon: CalendarRange },
  { href: "/studio/clients", label: "Clients", icon: Users },
];

const COLLAPSE_KEY = "ladx.studio.sidebar";

/**
 * The Studio sidebar.
 *
 * The shape both of the assistants people use all day settled on, because it
 * is the shape that suits work that starts with a question: one primary action
 * at the top, a search under it, a handful of places, and then what you were
 * last doing. Ours adds the tools between the places and the recents, in three
 * short groups, because the tools are the product.
 *
 * What is not here any more is a list of recent projects. It sat between the
 * places and the tools looking like a third kind of navigation, and it is the
 * reason the pane did not fit a laptop: at 1280 by 720 the last five rows were
 * below the fold with nothing to say so. Home opens on the recent projects and
 * Projects lists all of them, so the pane lost nothing but the height.
 *
 * Recents are conversations, as they are in both references.
 */
export default function StudioSidebar({
  conversations,
  projects,
  userName,
  userEmail,
  isAdmin = false,
}: {
  conversations: SidebarConversation[];
  projects: SidebarProject[];
  userName: string | null;
  userEmail: string;
  /** Shows the admin link. Absence of the link is not the access control. */
  isAdmin?: boolean;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [ready, setReady] = useState(false);

  // Restored on the client so the server render does not guess and flash.
  useEffect(() => {
    setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === "1");
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) window.localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
  }, [collapsed, ready]);

  const isActive = (href: string) =>
    href === "/studio"
      ? pathname === "/studio" || pathname.startsWith("/studio/c/")
      : pathname.startsWith(href);

  const openSearch = () => window.dispatchEvent(new Event(OPEN_PALETTE));

  /*
    One element, two widths.

    The collapsed and expanded panes used to be two different trees, so
    collapsing replaced the whole sidebar in one frame. Keeping the element
    and changing its width lets it slide, which is what makes the collapse
    read as the same pane getting out of the way rather than a different one
    arriving. The transition is only switched on once the stored state has
    been read, so a pane that starts collapsed does not animate shut on load.
  */
  return (
    <aside
      className={`flex shrink-0 flex-col bg-ink-50 ${collapsed ? "w-14 items-center py-3" : "w-64"} ${
        ready ? "transition-[width] duration-150 ease-out" : ""
      }`}
    >
      {collapsed ? (
        <>
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            aria-label="Expand sidebar"
            className={SIDEBAR_EXPAND_BUTTON}
          >
            <PanelLeft className="h-4 w-4" />
          </button>
          <Link
            href="/studio"
            aria-label="New chat"
            title="New chat"
            className="mb-1 flex h-9 w-9 items-center justify-center rounded-md bg-ink-900 text-white transition-opacity hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
          </Link>
          <button
            type="button"
            onClick={openSearch}
            aria-label="Search"
            title="Search (⌘K)"
            className="mb-3 flex h-9 w-9 items-center justify-center rounded-md text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-900"
          >
            <Search className="h-4 w-4" />
          </button>
          {[
            ...PLACES.slice(1),
            ...TOOLS,
            ...(isAdmin ? [{ href: "/studio/admin", label: "Admin", icon: ShieldCheck }] : []),
          ].map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-label={item.label}
                title={item.label}
                className={`mb-1 flex h-9 w-9 items-center justify-center rounded-md transition-colors ${
                  isActive(item.href)
                    ? "bg-white text-ink-900 shadow-[0_1px_2px_rgb(var(--ink-900)/0.06)]"
                    : "text-ink-400 hover:bg-ink-100 hover:text-ink-900"
                }`}
              >
                <Icon className="h-4 w-4" />
              </Link>
            );
          })}
          <Link
            href="/studio/settings"
            aria-label="Settings"
            title="Settings"
            className="mt-auto flex h-9 w-9 items-center justify-center rounded-md text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-900"
          >
            <Settings className="h-4 w-4" />
          </Link>
          <div className="mt-2 w-full px-2">
            <AccountMenu userName={userName} userEmail={userEmail} collapsed />
          </div>
        </>
      ) : (
        <>
          {/* brand + collapse */}
          <div className={SIDEBAR_BRAND}>
            <Link href="/studio" className={SIDEBAR_BRAND_LINK} aria-label="LADX Studio">
              <Logo size={17} />
              <span className={SIDEBAR_BRAND_SUB}>Studio</span>
            </Link>
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              aria-label="Collapse sidebar"
              className={SIDEBAR_COLLAPSE_BUTTON}
            >
              <ChevronsLeft className="h-4 w-4" />
            </button>
          </div>

          {/* New, one action, meaning whichever of the two you are standing in. */}
          <div className="px-3 pt-1.5">
            <NewButton onProjects={isActive("/studio/projects")} />
          </div>

          <div className="px-3 pb-1.5 pt-1">
            <button
              type="button"
              onClick={openSearch}
              className="flex w-full items-center gap-2.5 rounded-md px-2 py-1 text-[13px] text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900"
            >
              <Search className="h-3.5 w-3.5 shrink-0 text-ink-400" />
              <span className="flex-1 text-left">Search</span>
              <kbd className="font-mono text-[10.5px] text-ink-400">⌘K</kbd>
            </button>
          </div>

          <div className={SIDEBAR_BODY}>
            {/* Where you can go. */}
            <div className="mb-3.5 space-y-px">
              {PLACES.map((p) => (
                <Row
                  key={p.href}
                  href={p.href}
                  active={isActive(p.href)}
                  icon={p.icon}
                  count={p.href === "/studio/projects" ? projects.length || undefined : undefined}
                >
                  {p.label}
                </Row>
              ))}
            </div>

            {/*
              The tools, in groups.

              Ten of them in one list is not a list, it is a pile: nothing in
              it says which relate to each other or what to reach for first.
              The three headings answer "what am I doing", which is the
              question somebody actually has standing here.
            */}
            {GROUPS.map((g) => (
              <Section key={g.id} label={g.label}>
                {TOOLS.filter((t) => t.group === g.id).map((t) => (
                  <Row key={t.href} href={t.href} active={isActive(t.href)} icon={t.icon}>
                    {t.label}
                  </Row>
                ))}
              </Section>
            ))}

            {/* Only shown to an administrator, and shown last: it is not a
                tool and does not belong among them. The link being hidden is
                a courtesy, not the guard; requireAdmin is the guard. */}
            {isAdmin && (
              <Section label="Site">
                <Row href="/studio/admin" active={isActive("/studio/admin")} icon={ShieldCheck}>
                  Admin
                </Row>
              </Section>
            )}

            {/* What you were last doing. */}
            <ChatHistory items={conversations} />
          </div>

          {/* account: settings, the way back to the website, and sign out */}
          <div className={SIDEBAR_FOOT}>
            <AccountMenu userName={userName} userEmail={userEmail} />
          </div>
        </>
      )}
    </aside>
  );
}

/**
 * New.
 *
 * One button that means the obvious thing where you are standing, with the
 * other still one click away. Splitting it into two permanent buttons would
 * make the commonest action compete with itself, and hiding the second would
 * strand somebody in Projects who wants to ask a question.
 */
function NewButton({ onProjects }: { onProjects: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const primary = onProjects
    ? { label: "New project", href: "/studio/projects?new=1" }
    : { label: "New chat", href: "/studio" };
  const secondary = onProjects
    ? { label: "New chat", href: "/studio", icon: MessageSquarePlus }
    : { label: "New project", href: "/studio/projects?new=1", icon: FolderKanban };

  const SecondaryIcon = secondary.icon;

  return (
    <div ref={ref} className="relative">
      <div className="flex overflow-hidden rounded-md bg-ink-900 transition-transform active:scale-[0.99]">
        <Link
          href={primary.href}
          className="flex flex-1 items-center gap-2 px-3 py-1.5 text-[13.5px] font-medium text-white transition-opacity hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          {primary.label}
        </Link>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label="Other things to create"
          aria-expanded={open}
          className="flex w-7 items-center justify-center border-l border-white text-white transition-opacity hover:opacity-90"
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </div>

      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 animate-slide-down overflow-hidden rounded-md border border-ink-200 bg-white shadow-lg">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              router.push(secondary.href);
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-ink-700 transition-colors hover:bg-ink-50"
          >
            <SecondaryIcon className="h-3.5 w-3.5 shrink-0 text-ink-400" />
            {secondary.label}
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              router.push("/studio/clients/new");
            }}
            className="flex w-full items-center gap-2 border-t border-ink-100 px-3 py-2 text-left text-[13px] text-ink-700 transition-colors hover:bg-ink-50"
          >
            <Users className="h-3.5 w-3.5 shrink-0 text-ink-400" />
            New client
          </button>
        </div>
      )}
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={SIDEBAR_SECTION}>
      <p className={SIDEBAR_SECTION_LABEL}>{label}</p>
      <div className={SIDEBAR_SECTION_ROWS}>{children}</div>
    </div>
  );
}

function Row({
  href,
  active,
  icon: Icon,
  indent,
  count,
  children,
}: {
  href: string;
  active: boolean;
  icon?: LucideIcon;
  indent?: boolean;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className={sidebarRowClass({ active, indent })}>
      {Icon && <Icon className={sidebarIconClass(active)} />}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {count !== undefined && <span className={sidebarCountClass(active)}>{count}</span>}
    </Link>
  );
}
