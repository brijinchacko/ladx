import { IrHub, ValidationLoop } from "@/components/site/schematics";
import { GROUP_META, GROUP_ORDER, PRODUCTS, STATE_META, productsIn } from "@/content/products";
import { SITE, breadcrumbSchema, itemListSchema, jsonLd } from "@/lib/seo/schema";
import Link from "next/link";

export const metadata = {
  alternates: { canonical: `${SITE.url}/products` },
  title: "Products",
  description:
    "Ten tools on one project: a ladder editor with a real simulator, validated AI code generation, an HMI builder on the same tag table, CAD for the panel drawings, cross-platform conversion, a logic monitor, a Gantt planner, project and document generation, and a knowledge base over your own manuals.",
};

export default function ProductsPage() {
  return (
    <div className="mx-auto max-w-6xl px-5 py-16">
      {/*
        An ItemList, because this page enumerates things and a retrieval system
        asked "what tools does LADX have" should get the list rather than have
        to parse it out of prose.
      */}
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD has no other insertion point.
        dangerouslySetInnerHTML={jsonLd(
          itemListSchema({
            url: "/products",
            name: "LADX tools for automation engineers",
            items: PRODUCTS.map((p) => ({
              name: p.name,
              description: p.tagline,
              path: `/products/${p.slug}`,
            })),
          }),
        )}
      />
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD has no other insertion point.
        dangerouslySetInnerHTML={jsonLd(
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Products", path: "/products" },
          ]),
        )}
      />

      <header className="mb-14 max-w-2xl">
        <p className="mb-3 font-mono text-[11.5px] font-semibold uppercase tracking-[0.18em] text-ink-400">
          Products
        </p>
        <h1 className="font-display text-[2.4rem] font-extrabold leading-[1.05] tracking-[-0.02em] text-ink-900">
          Ten tools, one project
        </h1>
        <p className="mt-5 text-[16px] leading-relaxed text-ink-600">
          They are not separate applications that export to each other. They sit on one project, so
          the rung you draw is the rung the AI edits, the rung that converts to another platform,
          the rung Monitor runs, and the rung described in the functional spec. Change the client
          name once and it lands on every drawing title block and every document letterhead.
        </p>
      </header>

      <div className="mb-16 rounded-sm border border-ink-100 bg-white p-7">
        <IrHub className="w-full text-ink-800" />
        <p className="mt-4 text-center text-[13px] text-ink-400">
          One intermediate representation, written out to every format, which is why adding a vendor
          gives every other vendor a new destination. Reading a vendor project back in is the half
          that is not built yet.
        </p>
      </div>

      {GROUP_ORDER.map((g) => (
        <section key={g} className="mb-14">
          <div className="mb-1 flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-ink-200 pb-2">
            <h2 className="font-display text-[1.15rem] font-bold tracking-[-0.01em] text-ink-900">
              {GROUP_META[g].title}
            </h2>
            <p className="text-[13.5px] text-ink-500">{GROUP_META[g].blurb}</p>
            <span className="ml-auto font-mono text-[11px] tabular-nums text-ink-300">
              {productsIn(g).length}
            </span>
          </div>

          <ul className="space-y-px">
            {productsIn(g).map((p) => (
              <li key={p.slug}>
                <Link
                  href={`/products/${p.slug}`}
                  className="group grid gap-5 border-b border-ink-100 py-7 transition-colors hover:bg-ink-50/60 sm:grid-cols-[1fr_auto] sm:gap-8 sm:px-4"
                >
                  <div className="max-w-2xl">
                    <div className="mb-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <h3 className="font-display text-[1.3rem] font-bold tracking-[-0.012em] text-ink-900 group-hover:text-teal-700">
                        {p.name}
                      </h3>
                      <span
                        className={`rounded-sm border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] ${STATE_META[p.state].cls}`}
                      >
                        {STATE_META[p.state].label}
                      </span>
                    </div>
                    <p className="mb-2 text-[15px] font-medium text-ink-700">{p.tagline}</p>
                    <p className="text-[14.5px] leading-relaxed text-ink-500">{p.summary}</p>
                  </div>
                  <span
                    aria-hidden="true"
                    className="hidden self-center text-[14px] text-ink-300 transition-transform group-hover:translate-x-0.5 group-hover:text-ink-600 sm:block"
                  >
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <section className="mt-20 grid gap-10 border-t border-ink-100 pt-14 lg:grid-cols-[1fr_1.3fr] lg:items-center">
        <div>
          <h2 className="font-display text-[1.6rem] font-bold leading-tight tracking-[-0.015em] text-ink-900">
            The rule that ties them together
          </h2>
          <p className="mt-4 text-[15.5px] leading-relaxed text-ink-600">
            Nothing generated reaches you before a real IEC 61131-3 compiler has agreed it exists.
            When it fails, the errors go back to the model rather than to you, which is also what
            makes a small free model good enough to be useful.
          </p>
        </div>
        <div className="rounded-sm border border-ink-100 bg-white p-6">
          <ValidationLoop className="w-full text-ink-800" />
        </div>
      </section>
    </div>
  );
}
