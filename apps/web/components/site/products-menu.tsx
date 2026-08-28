"use client";

import MegaMenu, { MegaColumn, MegaFooter } from "@/components/site/mega-menu";
import { GROUP_META, GROUP_ORDER, PRODUCTS, productsIn } from "@/content/products";
import Link from "next/link";

/**
 * The Products mega menu.
 *
 * Ten tools is past the point where a dropdown list is readable, so the menu is
 * the shape of the work instead: write the logic, draw it and prove it, ship
 * the project. Somebody who has never heard of LADX can read the three column
 * headings and know what the thing is, which a flat list of product names
 * cannot do.
 *
 * The opening and closing behaviour lives in MegaMenu, along with the Free
 * tools menu, so the two cannot drift into disagreeing about what a hover does.
 */
export default function ProductsMenu({ active }: { active: boolean }) {
  return (
    <MegaMenu label="Products" active={active}>
      {(close) => (
        <>
          <div className="grid gap-px bg-ink-100 sm:grid-cols-3">
            {GROUP_ORDER.map((g) => (
              <MegaColumn key={g} title={GROUP_META[g].title} blurb={GROUP_META[g].blurb}>
                {productsIn(g).map((p) => (
                  <li key={p.slug}>
                    <Link
                      href={`/products/${p.slug}`}
                      onClick={close}
                      className="group -mx-2 block rounded-sm px-2 py-1.5 transition-colors hover:bg-ink-50"
                    >
                      <span className="flex items-baseline gap-2">
                        <span className="font-display font-bold text-[14.5px] text-ink-900 group-hover:text-teal-700">
                          {p.name}
                        </span>
                        {p.state !== "live" && (
                          <span className="font-mono text-[9.5px] text-ink-400 uppercase tracking-[0.1em]">
                            {p.state === "building" ? "in build" : "planned"}
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 block text-[12.5px] text-ink-500 leading-snug">
                        {p.menuLine}
                      </span>
                    </Link>
                  </li>
                ))}
              </MegaColumn>
            ))}
          </div>

          <MegaFooter>
            <Link
              href="/products"
              onClick={close}
              className="font-medium text-[13px] text-ink-800 hover:text-teal-700"
            >
              All {PRODUCTS.length} tools →
            </Link>
            <span className="text-[12.5px] text-ink-400">
              One project underneath all of them. Nothing exports to anything.
            </span>
            {/* The ones that need no account, named individually. "Try the
                editor" hid them behind a phrase nobody would guess covered CAD
                and HMI. */}
            <span className="ml-auto flex flex-wrap items-center gap-3 font-medium text-[13px]">
              <span className="text-[12px] text-ink-400">No account:</span>
              {[
                { href: "/ladder", label: "Ladder" },
                { href: "/cad", label: "CAD" },
                { href: "/hmi", label: "HMI" },
                { href: "/convert", label: "Convert" },
              ].map((t) => (
                <Link
                  key={t.href}
                  href={t.href}
                  onClick={close}
                  className="text-teal-700 hover:text-teal-800"
                >
                  {t.label}
                </Link>
              ))}
            </span>
          </MegaFooter>
        </>
      )}
    </MegaMenu>
  );
}

/**
 * The same thing on a phone, as chips.
 *
 * Ten products with a line of description each is most of a screen before the
 * free tools above it are counted. The names alone still show how many there
 * are and how they group, which is what the menu is for; what each one does is
 * on its own page. Anything not yet live is greyed rather than hidden, so the
 * shape of the product is honest without needing a label per chip.
 */
export function ProductsMenuMobile({ onNavigate }: { onNavigate: () => void }) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <p className="font-mono text-[10px] text-ink-400 uppercase tracking-[0.14em]">Products</p>
        <Link
          href="/products"
          onClick={onNavigate}
          className="text-[12px] text-ink-400 hover:text-teal-700"
        >
          All {PRODUCTS.length}
        </Link>
      </div>
      {GROUP_ORDER.map((g) => (
        <div key={g} className="mt-2">
          <p className="mb-0.5 text-[11px] text-ink-400">{GROUP_META[g].title}</p>
          <div className="flex flex-wrap gap-1.5">
            {productsIn(g).map((p) => (
              <Link
                key={p.slug}
                href={`/products/${p.slug}`}
                onClick={onNavigate}
                className={`rounded-full border px-2.5 py-1 text-[13px] active:border-teal-600 ${
                  p.state === "live" ? "border-ink-200 text-ink-700" : "border-ink-100 text-ink-400"
                }`}
              >
                {p.name}
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
