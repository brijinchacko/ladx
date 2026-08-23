import { IrHub, ValidationLoop } from "@/components/site/schematics";
import { PRODUCTS, STATE_META } from "@/content/products";
import Link from "next/link";

export const metadata = {
  title: "Products",
  description:
    "Five tools that share one program: a ladder studio with a real simulator, validated AI code generation, cross-platform conversion, document generation and a project knowledge base.",
};

export default function ProductsPage() {
  return (
    <div className="mx-auto max-w-6xl px-5 py-16">
      <header className="mb-14 max-w-2xl">
        <p className="mb-3 font-mono text-[11.5px] font-semibold uppercase tracking-[0.18em] text-ink-400">
          Products
        </p>
        <h1 className="font-display text-[2.4rem] font-extrabold leading-[1.05] tracking-[-0.02em] text-ink-900">
          Five tools, one program
        </h1>
        <p className="mt-5 text-[16px] leading-relaxed text-ink-600">
          They are not separate applications that export to each other. Everything reads and writes
          the same representation, so the rung you draw is the rung the AI edits, the rung that
          converts to another platform, and the rung that ends up described in the functional spec.
        </p>
      </header>

      <div className="mb-16 rounded-sm border border-ink-100 bg-white p-7">
        <IrHub className="w-full text-ink-800" />
        <p className="mt-4 text-center text-[13px] text-ink-400">
          Every format is read into one representation and written back out of it, which is why
          adding a vendor gives every other vendor a new destination.
        </p>
      </div>

      <ul className="space-y-px">
        {PRODUCTS.map((p, i) => (
          <li key={p.slug}>
            <Link
              href={`/products/${p.slug}`}
              className="group grid gap-5 border-t border-ink-100 py-9 transition-colors last:border-b hover:bg-ink-50/60 sm:grid-cols-[auto_1fr_auto] sm:gap-8 sm:px-4"
            >
              <span className="font-mono text-[12px] tabular-nums text-ink-300">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="max-w-2xl">
                <div className="mb-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h2 className="font-display text-[1.35rem] font-bold tracking-[-0.012em] text-ink-900">
                    {p.name}
                  </h2>
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
