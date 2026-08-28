import { SiteFooter, SiteHeader } from "@/components/site/chrome";
import { DOCK_INSET_STYLE } from "@ladx/ui";
import type { ReactNode } from "react";

/**
 * The public site.
 *
 * Grouped as `(site)` so the marketing pages get header and footer chrome while
 * `/ladder` and the signed-in app stay full-bleed: a ladder editor wrapped in
 * a marketing nav is a ladder editor with less room for ladder.
 */
export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    /*
      Padded away from a docked LADX AI, the same as the studio shell.
      
      The free tools mount it too, and docking it to the left there covered the
      site header. The variables are zero unless it is docked.
    */
    <div
      style={DOCK_INSET_STYLE}
      className="flex min-h-screen flex-col bg-white text-ink-900 antialiased transition-[padding] duration-150"
    >
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
