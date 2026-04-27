import { Logo } from "@ladx/ui";
import Link from "next/link";
import type { ReactNode } from "react";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://ladx.ai";

export function SiteHeader() {
  return (
    <header className="border-b border-ink-100 bg-white/80 backdrop-blur sticky top-0 z-40">
      <div className="container mx-auto flex items-center justify-between p-6">
        <Link href="/">
          <Logo />
        </Link>
        <nav className="flex items-center gap-6 text-sm">
          <Link href="/pricing" className="text-ink-500 hover:text-ink-900">
            Pricing
          </Link>
          <Link href="/docs" className="text-ink-500 hover:text-ink-900">
            Docs
          </Link>
          <Link href="/blog" className="text-ink-500 hover:text-ink-900">
            Blog
          </Link>
          <a href={`${APP_URL}/sign-in`} className="text-ink-500 hover:text-ink-900">
            Sign in
          </a>
          <a
            href={`${APP_URL}/sign-up`}
            className="rounded-md bg-teal text-white px-3 py-1.5 hover:bg-teal-500"
          >
            Try free
          </a>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-ink-100 mt-24">
      <div className="container mx-auto p-8 flex flex-wrap gap-8 justify-between text-sm text-ink-500">
        <div>
          <Logo />
          <p className="mt-3 max-w-xs">
            Local-first PLC AI agent. Wartens Ltd, registered in England & Wales.
          </p>
        </div>
        <div className="flex flex-wrap gap-12">
          <div>
            <h4 className="text-ink-900 font-medium mb-2">Product</h4>
            <ul className="space-y-1">
              <li>
                <Link href="/pricing">Pricing</Link>
              </li>
              <li>
                <a href={`${APP_URL}/sign-up`}>Try free</a>
              </li>
              <li>
                <Link href="/changelog">Changelog</Link>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="text-ink-900 font-medium mb-2">Resources</h4>
            <ul className="space-y-1">
              <li>
                <Link href="/docs">Docs</Link>
              </li>
              <li>
                <Link href="/blog">Blog</Link>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="text-ink-900 font-medium mb-2">Legal</h4>
            <ul className="space-y-1">
              <li>
                <Link href="/legal/privacy">Privacy</Link>
              </li>
              <li>
                <Link href="/legal/terms">Terms</Link>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </footer>
  );
}

export function SiteShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-white text-ink-900 flex flex-col">
      <SiteHeader />
      <div className="flex-1">{children}</div>
      <SiteFooter />
    </div>
  );
}
