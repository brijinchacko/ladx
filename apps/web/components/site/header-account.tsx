"use client";

import { ChevronDown, LayoutGrid, LogOut, Settings, User } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export interface HeaderUser {
  email: string;
  displayName: string | null;
}

/**
 * The account control in the public site header.
 *
 * A signed-in visitor reading an article or a template should be able to see
 * who they are signed in as and sign out from where they are, without first
 * navigating into Studio to find the menu. The header previously offered only
 * "Open Studio", which meant signing out required a detour through the app.
 */
export default function HeaderAccount({ user }: { user: HeaderUser }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
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

  async function signOut() {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      // Hard reload: the session cookie is gone, so anything cached against it
      // is now wrong, including this header.
      window.location.href = "/";
    } catch {
      setBusy(false);
    }
  }

  const name = user.displayName?.trim() || user.email.split("@")[0] || "Account";
  const initials = name.slice(0, 2).toUpperCase();

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Account menu"
        className="flex items-center gap-2 rounded-sm border border-ink-200 py-1 pl-1 pr-2 transition-colors hover:border-ink-400"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ink-900 font-mono text-[10px] font-semibold text-white">
          {initials}
        </span>
        <span className="hidden max-w-[9rem] truncate text-[13px] text-ink-700 sm:block">
          {name}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-ink-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1.5 w-56 overflow-hidden rounded-sm border border-ink-200 bg-white shadow-lg">
          <div className="flex items-start gap-2.5 border-b border-ink-100 px-3 py-2.5">
            <User className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-400" />
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-medium text-ink-900">{name}</span>
              <span className="block truncate text-[11.5px] text-ink-400">{user.email}</span>
            </span>
          </div>

          <Link
            href="/studio"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-3 py-2 text-[13px] text-ink-700 transition-colors hover:bg-ink-50"
          >
            <LayoutGrid className="h-3.5 w-3.5 text-ink-400" />
            Open Studio
          </Link>

          <Link
            href="/studio/settings"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-3 py-2 text-[13px] text-ink-700 transition-colors hover:bg-ink-50"
          >
            <Settings className="h-3.5 w-3.5 text-ink-400" />
            Settings
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
    </div>
  );
}
