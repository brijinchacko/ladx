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
 * The same thing on a phone, as chips rather than rows.
 *
 * The desktop menu earns its one line of description per tool because there is
 * room beside the name. On a phone that description wraps to two lines, and
 * eight tools plus eight descriptions plus the products menu underneath was
 * three screens of scrolling to reach Help.
 *
 * Chips fit four or five names to a line, so the whole thing is one screen and
 * the group headings still do the work of saying what each set is for. The
 * descriptions are one tap away on the page itself, which is where somebody
 * comparing tools is going anyway.
 */
export function FreeMenuMobile({ onNavigate }: { onNavigate: () => void }) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <p className="font-mono text-[10px] text-ink-400 uppercase tracking-[0.14em]">Free tools</p>
        <Link
          href="/free"
          onClick={onNavigate}
          className="text-[12px] text-ink-400 hover:text-teal-700"
        >
          All {FREE_SOFTWARE.length}
        </Link>
      </div>
      {FREE_GROUP_ORDER.map((g) => (
        <div key={g} className="mt-2">
          <p className="mb-0.5 text-[11px] text-ink-400">{FREE_GROUP_META[g].title}</p>
          <div className="flex flex-wrap gap-1.5">
            {freeToolsIn(g).map((t) => (
              <Link
                key={t.name}
                href={t.href}
                onClick={onNavigate}
                className="rounded-full border border-ink-200 px-2.5 py-1 text-[13px] text-ink-700 active:border-teal-600"
              >
                {t.name}
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
