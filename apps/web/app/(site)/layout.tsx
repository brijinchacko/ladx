import { SiteFooter, SiteHeader } from "@/components/site/chrome";
import type { ReactNode } from "react";

/**
 * The public site.
 *
 * Grouped as `(site)` so the marketing pages get header and footer chrome while
 * `/studio` and the signed-in app stay full-bleed — a ladder editor wrapped in
 * a marketing nav is a ladder editor with less room for ladder.
 */
export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-white text-ink-900 antialiased">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
