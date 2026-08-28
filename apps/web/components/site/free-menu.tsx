"use client";

import MegaMenu, { MegaColumn, MegaFooter } from "@/components/site/mega-menu";
import {
  FREE_GROUP_META,
  FREE_GROUP_ORDER,
  FREE_SOFTWARE,
  freeToolsIn,
} from "@/content/free-tools";
import Link from "next/link";

/**
 * The Free tools mega menu.
 *
 * This is the entry most first-time visitors are actually after, and it was a
 * single link to a page listing four tools. A link is the wrong shape for it:
 * somebody who arrived from "free PLC programming software" does not know that
 * this site also has CAD, an HMI builder, a converter and seventeen document
 * templates, and one word in a nav bar is not going to tell them.
 *
 * Grouped by the work rather than by product name, which is the only reason a
 * menu like this beats a list. The footer says the catch out loud, because the
 * question this audience is really asking is not what is free, it is what stops
 * being free later.
 */
export default function FreeMenu({ active }: { active: boolean }) {
  return (
    <MegaMenu label="Free tools" active={active}>
      {(close) => (
        <>
          <div className="grid gap-px bg-ink-100 sm:grid-cols-3">
            {FREE_GROUP_ORDER.map((g) => (
              <MegaColumn key={g} title={FREE_GROUP_META[g].title} blurb={FREE_GROUP_META[g].blurb}>
                {freeToolsIn(g).map((t) => (
                  <li key={t.name}>
                    <Link
                      href={t.href}
                      onClick={close}
                      className="group -mx-2 block rounded-sm px-2 py-1.5 transition-colors hover:bg-ink-50"
                    >
                      <span className="font-display font-bold text-[14.5px] text-ink-900 group-hover:text-teal-700">
                        {t.name}
                      </span>
                      <span className="mt-0.5 block text-[12.5px] text-ink-500 leading-snug">
                        {t.menuLine}
                      </span>
                    </Link>
                  </li>
                ))}
              </MegaColumn>
            ))}
          </div>

          <MegaFooter>
            <Link
              href="/free"
              onClick={close}
              className="font-medium text-[13px] text-ink-800 hover:text-teal-700"
            >
              All {FREE_SOFTWARE.length} free tools, and what an account adds →
            </Link>
            <span className="text-[12.5px] text-ink-400">
              No sign-up, no installer, no trial period, no tag limit, nothing that expires.
            </span>
          </MegaFooter>
        </>
      )}
    </MegaMenu>
  );
}

/**
 * The same thing in the mobile sheet.
 *
 * A hover panel means nothing on a phone, so the groups are listed inline.
 * Collapsing them behind an accordion would save a screen of scrolling and cost
 * the one thing the menu is for, which is seeing how much of this is free.
 */
export function FreeMenuMobile({ onNavigate }: { onNavigate: () => void }) {
  return (
    <div className="py-1">
      <Link
        href="/free"
        onClick={onNavigate}
        className="block py-2 font-semibold text-[15px] text-ink-900"
      >
        Free tools
      </Link>
      {FREE_GROUP_ORDER.map((g) => (
        <div key={g} className="mt-1 mb-2 border-ink-100 border-l pl-3">
          <p className="mt-1 mb-1 font-mono text-[10px] text-ink-400 uppercase tracking-[0.14em]">
            {FREE_GROUP_META[g].title}
          </p>
          {freeToolsIn(g).map((t) => (
            <Link
              key={t.name}
              href={t.href}
              onClick={onNavigate}
              className="block py-1.5 text-[14px] text-ink-600"
            >
              {t.name}
              <span className="ml-2 text-[12px] text-ink-400">{t.menuLine}</span>
            </Link>
          ))}
        </div>
      ))}
    </div>
  );
}
