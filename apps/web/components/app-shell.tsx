import { UserButton } from "@clerk/nextjs";
import { Logo } from "@ladx/ui";
import { FileText, Folder, MessageSquare, Settings, Sparkles } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

const clerkConfigured = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

const nav = [
  { href: "/projects", label: "Projects", icon: Folder },
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/documents", label: "Documents", icon: FileText },
  { href: "/memory", label: "Memory", icon: Sparkles },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex bg-white text-ink-900">
      <aside className="w-60 border-r border-ink-100 flex flex-col">
        <div className="p-4 border-b border-ink-100">
          <Link href="/projects">
            <Logo />
          </Link>
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
        <div className="p-4 border-t border-ink-100">
          {clerkConfigured ? (
            <UserButton afterSignOutUrl="/" />
          ) : (
            <p className="text-xs text-ink-400">
              Clerk not configured. Set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.
            </p>
          )}
        </div>
      </aside>
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
