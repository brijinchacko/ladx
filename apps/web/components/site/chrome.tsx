"use client";

import HeaderAccount, { type HeaderUser } from "@/components/site/header-account";
import ProductsMenu, { ProductsMenuMobile } from "@/components/site/products-menu";
import { GROUP_META, GROUP_ORDER, productsIn } from "@/content/products";
import { Logo } from "@ladx/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const NAV = [
  // First, because it is what most first-time visitors are actually after and
  // the only entry that leads somewhere they can use without signing up.
  { href: "/free", label: "Free tools" },
  { href: "/resources", label: "Resources" },
  { href: "/forum", label: "Forum" },
  { href: "/help", label: "Help" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  /**
   * Whether anyone is signed in.
   *
   * Checked on the client rather than in the layout on purpose. Reading the
   * session in the site layout would make every marketing page dynamic, and
   * fifty-one articles and seventeen template pages are pre-rendered today.
   *
   * The signed-out buttons render first, which is correct for crawlers and for
   * most visitors, and swap once the check returns. The slot keeps its size
   * either way, so nothing moves on the page.
   */
  const [user, setUser] = useState<HeaderUser | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d?.user) setUser(d.user as HeaderUser);
      })
      .catch(() => {
        // Not signed in, or offline. The default is already correct.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <header
      data-site-chrome
      className="sticky top-0 z-40 border-b border-ink-100 bg-white/90 backdrop-blur-sm"
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-8 px-5">
        <Link href="/" className="shrink-0" aria-label="LADX home">
          <Logo size={22} tone="light" />
        </Link>

        <nav className="hidden items-center gap-7 md:flex">
          <ProductsMenu active={pathname.startsWith("/products")} />
          {NAV.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`text-[14px] transition-colors ${
                  active ? "font-semibold text-ink-900" : "text-ink-500 hover:text-ink-900"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {user ? (
            <>
              <Link
                href="/studio"
                className="hidden rounded-sm bg-ink-900 px-3.5 py-1.5 text-[13.5px] font-medium text-white transition-opacity hover:opacity-90 sm:block"
              >
                Open Studio
              </Link>
              <HeaderAccount user={user} />
            </>
          ) : (
            <>
              <Link
                href="/ladder"
                className="hidden rounded-sm border border-ink-200 px-3.5 py-1.5 text-[13.5px] font-medium text-ink-700 transition-colors hover:border-ink-400 hover:text-ink-900 sm:block"
              >
                Try the editor
              </Link>
              <Link
                href="/sign-up"
                className="rounded-sm bg-ink-900 px-3.5 py-1.5 text-[13.5px] font-medium text-white transition-opacity hover:opacity-90"
              >
                Start free
              </Link>
            </>
          )}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label="Menu"
            className="ml-1 flex h-8 w-8 items-center justify-center rounded-sm border border-ink-200 md:hidden"
          >
            <span className="sr-only">Menu</span>
            <svg width="14" height="10" viewBox="0 0 14 10" aria-hidden="true">
              <path d="M0 1h14M0 5h14M0 9h14" stroke="currentColor" strokeWidth="1.4" />
            </svg>
          </button>
        </div>
      </div>

      {open && (
        <nav className="border-t border-ink-100 bg-white px-5 py-3 md:hidden">
          <ProductsMenuMobile onNavigate={() => setOpen(false)} />
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className="block py-2 text-[15px] text-ink-700"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}

export function SiteFooter() {
  const cols: { title: string; links: { href: string; label: string }[] }[] = [
    // Generated from the product list rather than typed, because a hand-kept
    // copy is how the footer ended up three tools behind the site.
    ...GROUP_ORDER.map((g) => ({
      title: GROUP_META[g].title,
      links: productsIn(g).map((p) => ({ href: `/products/${p.slug}`, label: p.name })),
    })),
    {
      title: "Learn",
      links: [
        { href: "/resources", label: "Articles" },
        { href: "/forum", label: "Forum" },
        { href: "/ladder", label: "Try the simulator" },
      ],
    },
    {
      title: "Company",
      links: [
        { href: "/help", label: "Contact" },
        { href: "/help#faq", label: "FAQ" },
        { href: "/documents", label: "Templates" },
        { href: "/cookies", label: "What we store" },
      ],
    },
  ];

  return (
    <footer data-site-chrome className="mt-24 border-t border-ink-100 bg-ink-50/60">
      <div className="mx-auto max-w-6xl px-5 py-14">
        <div className="grid gap-10 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-[1.5fr_repeat(5,1fr)]">
          <div className="sm:col-span-2 md:col-span-3 lg:col-span-1">
            <Logo size={20} tone="light" />
            <p className="mt-3 max-w-xs text-[13.5px] leading-relaxed text-ink-500">
              The AI workbench for automation engineers. Vendor-neutral, validated before you see
              it, and able to run where the cloud isn't allowed.
            </p>
          </div>
          {cols.map((col) => (
            <div key={col.title}>
              <h3 className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">
                {col.title}
              </h3>
              <ul className="space-y-2">
                {col.links.map((l) => (
                  <li key={l.href + l.label}>
                    <Link href={l.href} className="text-[13.5px] text-ink-600 hover:text-ink-900">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-2 border-t border-ink-100 pt-6 text-[12.5px] text-ink-400 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} LADX</p>
          <p className="font-mono text-[11.5px]">
            IEC 61131-3 · PLCopen TC6 · built on open standards
          </p>
        </div>
      </div>
    </footer>
  );
}
