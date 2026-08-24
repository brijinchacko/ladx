"use client";

import AccountMenu from "@/components/studio/account-menu";
import { Logo } from "@ladx/ui";
import {
  ChevronsLeft,
  FileText,
  FolderKanban,
  GitCompareArrows,
  Grid2x2Check,
  Library,
  MessageSquare,
  PanelLeft,
  Plus,
  Settings,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export interface SidebarConversation {
  id: string;
  title: string | null;
  updatedAt: string;
}

export interface SidebarProject {
  id: string;
  name: string;
  phase: string;
}

const TOOLS = [
  { href: "/studio/ladder", label: "Ladder", icon: Grid2x2Check },
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
}: {
  conversations: SidebarConversation[];
  projects: SidebarProject[];
  userName: string | null;
  userEmail: string;
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
          { href: "/studio/clients", label: "Clients", icon: Users },
          ...TOOLS,
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
        <Link href="/studio" className="flex items-center gap-2" aria-label="LADX Studio">
          <Logo size={18} />
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-400">
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

      {/* primary action */}
      <div className="px-3 pb-3">
        <Link
          href="/studio"
          className="flex items-center gap-2 rounded-md bg-ink-900 px-3 py-2 text-[13.5px] font-medium text-white transition-opacity hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          New chat
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {/* recent conversations */}
        {conversations.length > 0 && (
          <Section label="Recent">
            {conversations.slice(0, 6).map((c) => (
              <Row
                key={c.id}
                href={`/studio/c/${c.id}`}
                active={pathname === `/studio/c/${c.id}`}
                icon={MessageSquare}
              >
                {c.title?.trim() || "Untitled chat"}
              </Row>
            ))}
          </Section>
        )}

        {/* the work */}
        <Section label="Workspace">
          <Row
            href="/studio/projects"
            active={isActive("/studio/projects")}
            icon={FolderKanban}
            count={projects.length || undefined}
          >
            Projects
          </Row>
          {projects.slice(0, 4).map((p) => (
            <Row
              key={p.id}
              href={`/studio/projects/${p.id}`}
              active={pathname === `/studio/projects/${p.id}`}
              indent
            >
              {p.name}
            </Row>
          ))}
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
      </div>

      {/* account: settings, the way back to the website, and sign out */}
      <div className="border-t border-ink-100 p-3">
        <AccountMenu userName={userName} userEmail={userEmail} />
      </div>
    </aside>
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
