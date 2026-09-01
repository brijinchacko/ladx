"use client";

import AccountMenu from "@/components/studio/account-menu";
import ChatHistory, { type HistoryItem } from "@/components/studio/chat-history";
import { GROUPS, TOOLS as SHARED_TOOLS } from "@/lib/studio/tools";
import {
  Logo,
  SIDEBAR_ASIDE,
  SIDEBAR_ASIDE_COLLAPSED,
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
  type MessageSquare,
  MessageSquarePlus,
  MonitorCog,
  MoreHorizontal,
  PanelLeft,
  PencilRuler,
  Plus,
  Ruler,
  Settings,
  ShieldCheck,
  Trash2,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
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
};

const TOOLS = SHARED_TOOLS.map((t) => ({
  href: t.href,
  label: t.label,
  icon: TOOL_ICONS[t.icon] ?? FileText,
  group: t.group,
}));

const COLLAPSE_KEY = "ladx.studio.sidebar";

/**
 * The Studio sidebar.
 *
 * Modelled on the desktop assistant pattern, because it is the shape that suits
 * this work: the thing you do most sits at the top as a single primary action,
 * your recent conversations sit under it as the default way back into work in
 * progress, and everything else is grouped beneath rather than presented as a
 * flat list of equal-weight destinations.
 *
 * The ordering is deliberate. Chat first because it is where most sessions
 * start. Then the work itself, projects and clients. Then the tools, which are
 * places you go *from* a piece of work rather than starting points. Settings and
 * the account sit at the foot, out of the way of everything used daily.
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
  const [menuFor, setMenuFor] = useState<string | null>(null);

  // Restored on the client so the server render does not guess and flash.
  useEffect(() => {
    setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === "1");
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) window.localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
  }, [collapsed, ready]);

  const isActive = (href: string) =>
    href === "/studio" ? pathname === "/studio" : pathname.startsWith(href);

  if (collapsed) {
    return (
      <aside className={SIDEBAR_ASIDE_COLLAPSED}>
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
          className="mb-4 flex h-9 w-9 items-center justify-center rounded-md bg-ink-900 text-white transition-opacity hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
        </Link>
        {[
          { href: "/studio/projects", label: "Projects", icon: FolderKanban },
          { href: "/studio/planner", label: "Planner", icon: CalendarRange },
          { href: "/studio/clients", label: "Clients", icon: Users },
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
                  ? "bg-ink-900 text-white"
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
      </aside>
    );
  }

  return (
    <aside className={SIDEBAR_ASIDE}>
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
      <div className="px-3 py-2.5">
        <NewButton onProjects={isActive("/studio/projects")} />
      </div>

      <div className={SIDEBAR_BODY}>
        {/*
          Where you can go, before what you have been doing.

          These four were spread across a tab pair and a section that also held
          five recent projects, so a place you navigate to and a thing you were
          working on sat in the same list looking like the same kind of item.
          They are not: one is a destination and the other is a memory of what
          you did, and mixing them is why the pane read as a pile.
        */}
        <div className="mb-4 space-y-px">
          <Row
            href="/studio"
            active={pathname === "/studio" || pathname.startsWith("/studio/c/")}
            icon={House}
          >
            Home
          </Row>
          <Row
            href="/studio/projects"
            active={isActive("/studio/projects")}
            icon={FolderKanban}
            count={projects.length || undefined}
          >
            Projects
          </Row>
          <Row href="/studio/planner" active={isActive("/studio/planner")} icon={CalendarRange}>
            Planner
          </Row>
          <Row href="/studio/clients" active={isActive("/studio/clients")} icon={Users}>
            Clients
          </Row>
        </div>

        {/* What you were last working on, as a list of names rather than as
            navigation dressed up to look like it. */}
        {projects.length > 0 && (
          <Section label="Recent projects">
            {projects.slice(0, 5).map((p) => (
              <ProjectRow
                key={p.id}
                project={p}
                active={pathname === `/studio/projects/${p.id}`}
                menuOpen={menuFor === p.id}
                onMenu={() => setMenuFor(menuFor === p.id ? null : p.id)}
                onClose={() => setMenuFor(null)}
              />
            ))}
            {projects.length > 5 && (
              <Link
                href="/studio/projects"
                className="block rounded-md px-2 py-1 text-[12.5px] text-ink-400 transition-colors hover:bg-ink-50 hover:text-ink-700"
              >
                All {projects.length} projects
              </Link>
            )}
          </Section>
        )}

        {/*
          The tools, in groups.

          Ten of them in one list is not a list, it is a pile: nothing in it
          says which relate to each other or what to reach for first. The three
          headings answer "what am I doing", which is the question somebody
          actually has standing here.
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

        {/* Only shown to an administrator, and shown last: it is not a tool
            and does not belong among them. The link being hidden is a
            courtesy, not the guard; requireAdmin is the guard. */}
        {isAdmin && (
          <Section label="Site">
            <Row href="/studio/admin" active={isActive("/studio/admin")} icon={ShieldCheck}>
              Admin
            </Row>
          </Section>
        )}

        {/* Conversation history, at the foot of the pane. */}
        <ChatHistory items={conversations} />
      </div>

      {/* account: settings, the way back to the website, and sign out */}
      <div className={SIDEBAR_FOOT}>
        <AccountMenu userName={userName} userEmail={userEmail} />
      </div>
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
      <div className="flex overflow-hidden rounded-md bg-ink-900">
        <Link
          href={primary.href}
          className="flex flex-1 items-center gap-2 px-3 py-2 text-[13.5px] font-medium text-white transition-opacity hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          {primary.label}
        </Link>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label="Other things to create"
          aria-expanded={open}
          className="flex w-7 items-center justify-center border-l border-white/15 text-white transition-opacity hover:opacity-90"
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </div>

      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-md border border-ink-200 bg-white shadow-lg">
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
  icon?: typeof MessageSquare;
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

/**
 * A project in the sidebar, with the destructive action on it.
 *
 * Delete lives here rather than on the project page. Inside a project you are
 * working: the phase selector, the deliverables and the documents are all one
 * click apart, and a Delete sitting among them is a slip waiting to happen. In
 * the sidebar you are choosing between projects, which is the moment where
 * removing one is a thing you might actually mean.
 */
function ProjectRow({
  project,
  active,
  menuOpen,
  onMenu,
  onClose,
}: {
  project: SidebarProject;
  active: boolean;
  menuOpen: boolean;
  onMenu: () => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen, onClose]);

  async function remove() {
    if (
      !window.confirm(
        `Delete "${project.name}"? Its documents and drawings go with it. This cannot be undone.`,
      )
    ) {
      return;
    }
    setBusy(true);
    onClose();
    await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
    // Standing on the page you just deleted would 404.
    if (active) router.push("/studio/projects");
    router.refresh();
    setBusy(false);
  }

  return (
    <div ref={ref} className="group relative">
      <Link
        href={`/studio/projects/${project.id}`}
        className={`flex items-center rounded-md py-1.5 pl-8 pr-7 text-[13px] transition-colors ${
          active
            ? "bg-white font-medium text-ink-900 shadow-[0_1px_2px_rgb(var(--ink-900)/0.06)]"
            : "text-ink-600 hover:bg-ink-100/70 hover:text-ink-900"
        } ${busy ? "opacity-50" : ""}`}
      >
        <span className="min-w-0 flex-1 truncate">{project.name}</span>
      </Link>

      <button
        type="button"
        onClick={onMenu}
        aria-label={`Options for ${project.name}`}
        className={`absolute right-1 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded transition-opacity ${
          menuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus:opacity-100"
        } ${active ? "text-ink-500 hover:bg-ink-100" : "text-ink-400 hover:bg-ink-200"}`}
      >
        <MoreHorizontal className="h-3.5 w-3.5" />
      </button>

      {menuOpen && (
        <div className="absolute right-1 top-full z-30 mt-0.5 w-40 overflow-hidden rounded-md border border-ink-200 bg-white shadow-lg">
          <button
            type="button"
            onClick={remove}
            className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12.5px] text-danger transition-colors hover:bg-ink-50"
          >
            <Trash2 className="h-3 w-3 shrink-0 opacity-60" />
            Delete project
          </button>
        </div>
      )}
    </div>
  );
}
