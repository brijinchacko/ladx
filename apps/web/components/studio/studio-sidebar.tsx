"use client";

import AccountMenu from "@/components/studio/account-menu";
import ChatHistory, { type HistoryItem } from "@/components/studio/chat-history";
import { Logo } from "@ladx/ui";
import {
  Activity,
  CalendarRange,
  ChevronDown,
  ChevronsLeft,
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
  Settings,
  ShieldCheck,
  Trash2,
  Users,
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

const TOOLS = [
  { href: "/studio/ladder", label: "Ladder", icon: Grid2x2Check },
  { href: "/studio/monitor", label: "Monitor", icon: Activity },
  { href: "/studio/cad", label: "CAD", icon: PencilRuler },
  { href: "/studio/hmi", label: "HMI/SCADA", icon: MonitorCog },
  { href: "/studio/convert", label: "Convert", icon: GitCompareArrows },
  { href: "/studio/documents", label: "Documents", icon: Library },
  { href: "/studio/knowledge", label: "Knowledge", icon: FileText },
];

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
      <aside className="flex w-14 shrink-0 flex-col items-center border-r border-ink-100 bg-ink-50/40 py-3">
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          aria-label="Expand sidebar"
          className="mb-3 flex h-9 w-9 items-center justify-center rounded-md text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-900"
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
    <aside className="flex w-64 shrink-0 flex-col border-r border-ink-100 bg-ink-50/40">
      {/* brand + collapse */}
      <div className="flex items-center justify-between px-4 py-3.5">
        <Link href="/studio" className="flex flex-col items-start gap-0.5" aria-label="LADX Studio">
          <Logo size={17} />
          <span className="pl-[1px] font-mono text-[9.5px] uppercase leading-none tracking-[0.34em] text-ink-400">
            Studio
          </span>
        </Link>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          aria-label="Collapse sidebar"
          className="flex h-7 w-7 items-center justify-center rounded-md text-ink-300 transition-colors hover:bg-ink-100 hover:text-ink-700"
        >
          <ChevronsLeft className="h-4 w-4" />
        </button>
      </div>

      {/*
        Home and Projects.

        The two places work starts from, given equal weight at the top because
        that is what they are: a question you want answered now, and a job you
        are part way through. Everything below is reached from one of them.
      */}
      <div className="px-3">
        <div className="flex gap-1">
          <TopTab
            href="/studio"
            icon={House}
            active={pathname === "/studio" || pathname.startsWith("/studio/c/")}
          >
            Home
          </TopTab>
          <TopTab
            href="/studio/projects"
            icon={FolderKanban}
            active={isActive("/studio/projects")}
            count={projects.length || undefined}
          >
            Projects
          </TopTab>
        </div>
      </div>

      {/* New, which means whichever of the two you are standing in. */}
      <div className="px-3 py-3">
        <NewButton onProjects={isActive("/studio/projects")} />
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {/* the work */}
        <Section label="Workspace">
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
          {projects.length === 0 && (
            <p className="px-2 py-1 text-[12px] leading-snug text-ink-400">
              No projects yet. New starts one.
            </p>
          )}
          <Row href="/studio/planner" active={isActive("/studio/planner")} icon={CalendarRange}>
            Planner
          </Row>
          <Row href="/studio/clients" active={isActive("/studio/clients")} icon={Users}>
            Clients
          </Row>
        </Section>

        {/* the tools, all of which open inside this shell */}
        <Section label="Tools">
          {TOOLS.map((t) => (
            <Row key={t.href} href={t.href} active={isActive(t.href)} icon={t.icon}>
              {t.label}
            </Row>
          ))}
        </Section>

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
      <div className="border-t border-ink-100 p-3">
        <AccountMenu userName={userName} userEmail={userEmail} />
      </div>
    </aside>
  );
}

/**
 * Home or Projects.
 *
 * A pair rather than a list, and at the top rather than among the tools,
 * because these are the two modes the application has. Chat is for a question
 * that has no file behind it yet; a project is for work that does. Everything
 * else in this pane belongs to one of them.
 */
function TopTab({
  href,
  icon: Icon,
  active,
  count,
  children,
}: {
  href: string;
  icon: typeof House;
  active: boolean;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-[13px] transition-colors ${
        active
          ? "bg-white text-ink-900 shadow-sm ring-1 ring-ink-200"
          : "text-ink-500 hover:bg-ink-100 hover:text-ink-900"
      }`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      {children}
      {count !== undefined && (
        <span className="font-mono text-[10.5px] tabular-nums opacity-50">{count}</span>
      )}
    </Link>
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
    <div className="mb-4">
      <p className="mb-1 px-2 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-300">
        {label}
      </p>
      <div className="space-y-px">{children}</div>
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
    <Link
      href={href}
      className={`flex items-center gap-2.5 rounded-md py-1.5 text-[13px] transition-colors ${
        indent ? "pl-8 pr-2" : "px-2"
      } ${active ? "bg-ink-900 text-white" : "text-ink-700 hover:bg-ink-100"}`}
    >
      {Icon && (
        <Icon className={`h-3.5 w-3.5 shrink-0 ${active ? "text-white" : "text-ink-400"}`} />
      )}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {count !== undefined && (
        <span
          className={`shrink-0 font-mono text-[10.5px] tabular-nums ${active ? "text-white/70" : "text-ink-300"}`}
        >
          {count}
        </span>
      )}
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
          active ? "bg-ink-900 text-white" : "text-ink-700 hover:bg-ink-100"
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
        } ${active ? "text-white hover:bg-white/15" : "text-ink-400 hover:bg-ink-200"}`}
      >
        <MoreHorizontal className="h-3.5 w-3.5" />
      </button>

      {menuOpen && (
        <div className="absolute right-1 top-full z-30 mt-0.5 w-40 overflow-hidden rounded-md border border-ink-200 bg-white shadow-lg">
          <button
            type="button"
            onClick={remove}
            className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12.5px] text-red-700 transition-colors hover:bg-ink-50"
          >
            <Trash2 className="h-3 w-3 shrink-0 opacity-60" />
            Delete project
          </button>
        </div>
      )}
    </div>
  );
}
