import { getCurrentUser } from "@/lib/auth/server";
import { Logo } from "@ladx/ui";
import {
  FileText,
  FolderKanban,
  GitCompareArrows,
  Grid2x2Check,
  Library,
  MessageSquare,
  Settings,
  Users,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { UserMenu } from "./user-menu";

/**
 * The platform navigation.
 *
 * Grouped by what the sidebar is for: the work (projects and clients) at the
 * top, the tools that do the work in the middle, settings at the foot. This is
 * the shape that makes five separate products read as one platform, LADX
 * Studio, rather than a menu of unrelated pages.
 */
const NAV_GROUPS: {
  label: string | null;
  items: { href: string; label: string; icon: typeof FileText }[];
}[] = [
  {
    label: null,
    items: [
      { href: "/projects", label: "Projects", icon: FolderKanban },
      { href: "/clients", label: "Clients", icon: Users },
    ],
  },
  {
    label: "Tools",
    items: [
      { href: "/studio", label: "Ladder", icon: Grid2x2Check },
      { href: "/chat", label: "Chat", icon: MessageSquare },
      { href: "/convert", label: "Convert", icon: GitCompareArrows },
      { href: "/documents", label: "Documents", icon: Library },
      { href: "/knowledge", label: "Knowledge", icon: FileText },
    ],
  },
  {
    label: null,
    items: [{ href: "/settings", label: "Settings", icon: Settings }],
  },
];

export async function AppShell({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();

  return (
    <div className="flex min-h-screen bg-white text-ink-900">
      <aside className="flex w-60 flex-col border-r border-ink-100">
        <div className="border-b border-ink-100 p-4">
          <Link href="/projects" className="flex items-center gap-2" aria-label="LADX Studio">
            <Logo />
            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-400">
              Studio
            </span>
          </Link>
        </div>

        <nav className="flex-1 space-y-4 p-3">
          {NAV_GROUPS.map((group, gi) => (
            <div key={group.label ?? `g${gi}`}>
              {group.label && (
                <p className="mb-1 px-3 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-300">
                  {group.label}
                </p>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-ink-700 transition-colors hover:bg-ink-50"
                    >
                      <Icon className="h-4 w-4 text-ink-400" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-ink-100 p-3">
          <UserMenu email={user?.email ?? null} displayName={user?.displayName ?? null} />
        </div>
      </aside>
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
