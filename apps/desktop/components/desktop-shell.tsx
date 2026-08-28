"use client";

import { useProjectFolder } from "@/lib/project-folder";
import { Logo } from "@ladx/ui";
import {
  Activity,
  Folder,
  FolderTree,
  GitCompareArrows,
  Grid2x2Check,
  MessageSquare,
  MonitorCog,
  Settings,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

const nav = [
  { href: "/", label: "Home", icon: Folder },
  { href: "/workspace", label: "Workspace", icon: FolderTree },
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/ladder", label: "Ladder", icon: Grid2x2Check },
  { href: "/monitor", label: "Monitor", icon: Activity },
  { href: "/hmi", label: "HMI", icon: MonitorCog },
  { href: "/convert", label: "Convert", icon: GitCompareArrows },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function DesktopShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex bg-white text-ink-900">
      <aside className="w-56 border-r border-ink-100 flex flex-col">
        <div className="p-4 border-b border-ink-100">
          <Logo />
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {nav.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-ink-700 hover:bg-ink-50"
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <OpenProject />
        <div className="p-4 border-t border-ink-100 text-xs text-ink-400">
          Air-gapped · Ollama-only
        </div>
      </aside>
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}

/**
 * Which project everything is filing into, on every screen.
 *
 * Not a nicety: the tools write into whichever project is open, and somebody
 * who has forgotten which one that is will put a drawing in the wrong job and
 * not find out until handover.
 */
function OpenProject() {
  const { project } = useProjectFolder();
  return (
    <Link
      href="/workspace"
      className="block border-t border-ink-100 px-4 py-3 hover:bg-ink-50"
      title={project ? project.path : "Nothing is open, so nothing is being filed"}
    >
      <p className="text-[10.5px] font-medium uppercase tracking-wide text-ink-400">Filing into</p>
      <p className={`truncate text-[13px] ${project ? "text-ink-900" : "text-ink-400"}`}>
        {project ? project.name : "No project"}
      </p>
    </Link>
  );
}
