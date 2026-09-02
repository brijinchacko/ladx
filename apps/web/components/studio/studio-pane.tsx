"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * The pane a tool renders into.
 *
 * Keyed on the path, so moving between tools remounts the content and the
 * fade runs once per arrival. A hundred and fifty milliseconds of opacity is
 * all it is: enough that the new pane reads as having arrived rather than
 * having been swapped under the cursor, and short enough never to be waited
 * for. Somebody who asked their system for less motion gets none.
 */
export function StudioPane({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="flex min-h-0 flex-1 animate-fade-in flex-col">
      {children}
    </div>
  );
}
