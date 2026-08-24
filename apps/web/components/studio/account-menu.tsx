"use client";

import { ChevronUp, Globe, LogOut, Settings } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * The account menu at the foot of the sidebar.
 *
 * It exists because the rebuilt sidebar shipped without either of the two
 * things a signed-in person needs to be able to do from anywhere: leave, and
 * sign out. Studio filled the whole viewport with no way back to the public
 * site and no way to end the session, which is a trap rather than an app.
 */
export default function AccountMenu({
  userName,
  userEmail,
  collapsed,
}: {
  userName: string | null;
  userEmail: string;
  collapsed?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on an outside click or Escape, which is what every menu does and what
  // people will try without thinking about it.
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

  async function signOut() {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      // Full navigation rather than a client push: the session cookie is gone,
      // so every cached server component in this tree is now wrong.
      window.location.href = "/";
    } catch {
      setBusy(false);
    }
  }

  const initials = (userName ?? userEmail).slice(0, 2).toUpperCase();

  return (
    <div ref={ref} className="relative">
      {open && (
        <div className="absolute bottom-full left-0 mb-1 w-full min-w-[13rem] overflow-hidden rounded-md border border-ink-200 bg-white shadow-lg">
          <div className="border-b border-ink-100 px-3 py-2">
            <p className="truncate text-[13px] font-medium text-ink-900">
              {userName ?? userEmail.split("@")[0]}
            </p>
            <p className="truncate text-[11.5px] text-ink-400">{userEmail}</p>
          </div>

          <Link
            href="/studio/settings"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-3 py-2 text-[13px] text-ink-700 transition-colors hover:bg-ink-50"
          >
            <Settings className="h-3.5 w-3.5 text-ink-400" />
            Settings
          </Link>

          {/* The way out. Studio is the app; the site is still there. */}
          <Link
            href="/"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-3 py-2 text-[13px] text-ink-700 transition-colors hover:bg-ink-50"
          >
            <Globe className="h-3.5 w-3.5 text-ink-400" />
            Exit to website
          </Link>

          <button
            type="button"
            onClick={signOut}
            disabled={busy}
            className="flex w-full items-center gap-2.5 border-t border-ink-100 px-3 py-2 text-left text-[13px] text-ink-700 transition-colors hover:bg-ink-50 disabled:opacity-50"
          >
            <LogOut className="h-3.5 w-3.5 text-ink-400" />
            {busy ? "Signing out…" : "Sign out"}
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Account menu"
        className={`flex w-full items-center gap-2.5 rounded-md py-2 transition-colors hover:bg-ink-100 ${
          collapsed ? "justify-center px-0" : "px-2"
        }`}
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink-900 font-mono text-[11px] font-semibold text-white">
          {initials}
        </span>
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1 text-left">
              <span className="block truncate text-[13px] font-medium text-ink-900">
                {userName ?? userEmail.split("@")[0]}
              </span>
              <span className="block truncate text-[11px] text-ink-400">Account</span>
            </span>
            <ChevronUp
              className={`h-3.5 w-3.5 shrink-0 text-ink-300 transition-transform ${open ? "" : "rotate-180"}`}
            />
          </>
        )}
      </button>
    </div>
  );
}
