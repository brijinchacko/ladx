"use client";

import { useAuthModal } from "@/components/auth/auth-modal";
import type { AuthMode } from "@/components/auth/auth-panel";
import Link from "next/link";
import type { ReactNode } from "react";

export interface AuthLinkProps {
  mode: AuthMode;
  /** Where to go once they are in. Defaults to the page they are on. */
  next?: string;
  className?: string;
  children: ReactNode;
}

/**
 * A real link to /sign-in or /sign-up that opens the dialog instead.
 *
 * It stays an anchor on purpose. A crawler follows it, a middle-click or a
 * cmd-click opens the route in a tab, and a browser that never ran our
 * JavaScript navigates to the page. Only a plain left-click is intercepted,
 * and only when the dialog is actually mounted.
 */
export function AuthLink({ mode, next, className, children }: AuthLinkProps) {
  const auth = useAuthModal();
  const href = mode === "sign-up" ? "/sign-up" : "/sign-in";

  return (
    <Link
      href={next ? `${href}?next=${encodeURIComponent(next)}` : href}
      className={className}
      onClick={(e) => {
        if (!auth) return;
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        auth.open({ mode, next });
      }}
    >
      {children}
    </Link>
  );
}
