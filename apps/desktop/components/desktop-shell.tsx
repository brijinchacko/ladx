"use client";

/**
 * The Studio shell, on the desktop.
 *
 * The same shape as the web app, deliberately and in the same class strings,
 * which come from @ladx/ui so the two cannot drift. They had drifted: this was
 * a component each page opted into, and four of the tools never did, so the
 * ladder editor, Monitor, the HMI builder and Convert opened with no sidebar
 * at all. It is a layout now, mounted once, so a page cannot forget it.
 *
 * What differs from the web is only what does not exist here. There are no
 * accounts, so the foot of the pane carries settings rather than a sign out;
 * and CAD, Documents and Knowledge are not on the desktop yet, so they are not
 * listed as though they were.
 */

import { useProjectFolder } from "@/lib/project-folder";
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
  ChevronsLeft,
  FolderKanban,
  FolderPlus,
  GitCompareArrows,
  Grid2x2Check,
  House,
  Library,
  type MessageSquare,
  MessageSquarePlus,
  MonitorCog,
  PanelLeft,
  PencilRuler,
  Settings,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * The tools, in the web app's order.
 *
 * Ladder first because it is where most work starts, then the ones you open
 * from a program rather than instead of one. Knowledge is still to come and is absent rather than disabled: a greyed row that never becomes
 * available is a promise the app is not keeping.
 */
const TOOLS = [
  { href: "/ladder", label: "Ladder", icon: Grid2x2Check },
  { href: "/monitor", label: "Monitor", icon: Activity },
  { href: "/cad", label: "CAD", icon: PencilRuler },
  { href: "/hmi", label: "HMI/SCADA", icon: MonitorCog },
  { href: "/convert", label: "Convert", icon: GitCompareArrows },
  { href: "/documents", label: "Documents", icon: Library },
];

export function DesktopShell({
  children,
  collapsed,
  onCollapsed,
}: {
  children: ReactNode;
  collapsed: boolean;
  onCollapsed: (next: boolean) => void;
}) {
  const pathname = usePathname();
  const { project, projects } = useProjectFolder();

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    /*
      h-screen and overflow-hidden, matching the web shell.
    
      Not min-h-screen, which was the old value and the reason several pages
      looked wrong: an editor that sizes itself with flex-1 and min-h-0 needs a
      parent whose height is settled, and under min-h-screen it either collapsed
      to nothing or grew until the whole page scrolled behind its own toolbar.
    */
    <div className="flex h-screen overflow-hidden bg-white text-ink-900">
      {collapsed ? (
        <aside className={SIDEBAR_ASIDE_COLLAPSED}>
          <button
            type="button"
            onClick={() => onCollapsed(false)}
            aria-label="Expand sidebar"
            className={SIDEBAR_EXPAND_BUTTON}
          >
            <PanelLeft className="h-4 w-4" />
          </button>
          <div className="flex flex-1 flex-col items-center gap-1">
            <IconRow href="/" active={pathname === "/"} icon={House} label="Home" />
            <IconRow
              href="/workspace"
              active={isActive("/workspace")}
              icon={FolderKanban}
              label="Workspace"
            />
            <IconRow
              href="/chat"
              active={isActive("/chat")}
              icon={MessageSquarePlus}
              label="Chat"
            />
            {TOOLS.map((t) => (
              <IconRow
                key={t.href}
                href={t.href}
                active={isActive(t.href)}
                icon={t.icon}
                label={t.label}
              />
            ))}
          </div>
          <IconRow
            href="/settings"
            active={isActive("/settings")}
            icon={Settings}
            label="Settings"
          />
        </aside>
      ) : (
        <aside className={SIDEBAR_ASIDE}>
          <div className={SIDEBAR_BRAND}>
            <Link href="/" className={SIDEBAR_BRAND_LINK} aria-label="LADX Studio">
              <Logo size={17} />
              <span className={SIDEBAR_BRAND_SUB}>Studio</span>
            </Link>
            <button
              type="button"
              onClick={() => onCollapsed(true)}
              aria-label="Collapse sidebar"
              className={SIDEBAR_COLLAPSE_BUTTON}
            >
              <ChevronsLeft className="h-4 w-4" />
            </button>
          </div>

          {/* One primary action, as on the web. Here it is a project, because
              a project is the thing everything else is filed into. */}
          <div className="px-3 py-2.5">
            <Link
              href="/workspace"
              className="flex h-8 items-center gap-2 rounded-md bg-ink-900 px-3 text-[13px] font-medium text-white transition-opacity hover:opacity-90"
            >
              <FolderPlus className="h-3.5 w-3.5" />
              New project
            </Link>
          </div>

          <div className={SIDEBAR_BODY}>
            <div className="mb-4 space-y-px">
              <Row href="/" active={pathname === "/"} icon={House}>
                Home
              </Row>
              <Row
                href="/workspace"
                active={isActive("/workspace")}
                icon={FolderKanban}
                count={projects.length || undefined}
              >
                Workspace
              </Row>
              <Row href="/chat" active={isActive("/chat")} icon={MessageSquarePlus}>
                Chat
              </Row>
            </div>

            {projects.length > 0 && (
              <Section label="Recent projects">
                {projects.slice(0, 5).map((p) => (
                  <Row key={p.path} href="/workspace" active={p.path === project?.path} indent>
                    {p.name}
                  </Row>
                ))}
                {projects.length > 5 && (
                  <Link
                    href="/workspace"
                    className="block rounded-md px-2 py-1 text-[12.5px] text-ink-400 transition-colors hover:bg-ink-50 hover:text-ink-700"
                  >
                    All {projects.length} projects
                  </Link>
                )}
              </Section>
            )}

            <Section label="Tools">
              {TOOLS.map((t) => (
                <Row key={t.href} href={t.href} active={isActive(t.href)} icon={t.icon}>
                  {t.label}
                </Row>
              ))}
            </Section>
          </div>

          <div className={SIDEBAR_FOOT}>
            <Row href="/settings" active={isActive("/settings")} icon={Settings}>
              Settings
            </Row>
            <p className="mt-2 px-2 text-[11px] text-ink-400">
              {project ? `Filing into ${project.name}` : "No project open"}
            </p>
          </div>
        </aside>
      )}

      {/* min-w-0 so a tool that scrolls sideways does not widen the page, and
          flex-col so an editor can claim the height with flex-1. */}
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">{children}</main>
    </div>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
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
  children: ReactNode;
}) {
  return (
    <Link href={href} className={sidebarRowClass({ active, indent })}>
      {Icon && <Icon className={sidebarIconClass(active)} />}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {count !== undefined && <span className={sidebarCountClass(active)}>{count}</span>}
    </Link>
  );
}

/** The collapsed pane: the icon alone, with the name as its tooltip. */
function IconRow({
  href,
  active,
  icon: Icon,
  label,
}: {
  href: string;
  active: boolean;
  icon: typeof MessageSquare;
  label: string;
}) {
  return (
    <Link
      href={href}
      title={label}
      aria-label={label}
      className={`flex h-9 w-9 items-center justify-center rounded-md transition-colors ${
        active ? "bg-ink-900 text-white" : "text-ink-400 hover:bg-ink-100 hover:text-ink-900"
      }`}
    >
      <Icon className="h-4 w-4" />
    </Link>
  );
}
