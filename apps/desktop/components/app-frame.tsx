"use client";

/**
 * The shell, mounted once for the whole app.
 *
 * A client component so the root layout can stay a server component while the
 * sidebar still knows the current path and the open project. It exists only to
 * hand the shell the collapse preference, which lives with the rest of the
 * project state.
 */

import { DesktopShell } from "@/components/desktop-shell";
import { useProjectFolder } from "@/lib/project-folder";
import type { ReactNode } from "react";

export function AppFrame({ children }: { children: ReactNode }) {
  const { collapsed, setCollapsed } = useProjectFolder();
  return (
    <DesktopShell collapsed={collapsed} onCollapsed={setCollapsed}>
      {children}
    </DesktopShell>
  );
}
