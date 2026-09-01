"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The admin area's own navigation.
 *
 * A strip rather than another sidebar. Four pages do not need a tree, and the
 * studio sidebar is already there on the left holding the tools; a second one
 * beside it would leave the table it exists to show about half the window.
 *
 * On its own in a client file because it reads the current path, and that one
 * hook would otherwise drag every helper beside it over the client boundary.
 * It did, once: `ago` was exported from the same file and a server page
 * calling it failed at render with "attempted to call ago() from the server".
 */

const TABS = [
  { href: "/studio/admin", label: "Overview" },
  { href: "/studio/admin/users", label: "People" },
  { href: "/studio/admin/traffic", label: "Traffic" },
  { href: "/studio/admin/licences", label: "Licences" },
  { href: "/studio/admin/status", label: "Status" },
];

export function AdminTabs() {
  const pathname = usePathname();
  return (
    <nav className="flex shrink-0 items-center gap-1 border-b border-ink-100 bg-ink-50 px-5">
      {TABS.map((t) => {
        const active =
          t.href === "/studio/admin" ? pathname === t.href : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`-mb-px border-b-2 px-3 py-2.5 text-[13px] transition-colors ${
              active
                ? "border-teal-600 font-medium text-ink-900"
                : "border-transparent text-ink-500 hover:text-ink-900"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
