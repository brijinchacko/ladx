import { AdminTabs } from "@/components/studio/admin-tabs";
import { requireAdmin } from "@/lib/auth/admin";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

/**
 * The admin area.
 *
 * The check is here as well as on every page inside it. Belt and braces on
 * purpose: a layout guard alone would be defeated by a page that renders
 * without its layout, and a page guard alone is one somebody forgets to add to
 * the next page. Both is cheap, since the session is already loaded.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireAdmin();
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="shrink-0 border-b border-ink-100 px-5 pb-3 pt-4">
        <h1 className="font-display text-[1.25rem] font-bold tracking-[-0.015em] text-ink-900">
          Admin
        </h1>
        <p className="mt-0.5 text-[12.5px] text-ink-500">
          Who is here, what they have built, and whether it is working.
        </p>
      </header>
      <AdminTabs />
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
