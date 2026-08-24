import { AddressingFigure, AiLoopFigure, WiringFigure } from "@/components/site/figures";
import {
  CitationFigure,
  IrHub,
  LifecycleFigure,
  ScanCycle,
  SealInRung,
  ValidationLoop,
} from "@/components/site/schematics";
import { PRODUCTS, STATE_META, getProduct } from "@/content/products";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

export function generateStaticParams() {
  return PRODUCTS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const product = getProduct(slug);
  if (!product) return { title: "Not found" };
  return { title: product.name, description: product.summary };
}

const FIGURES = {
  sealIn: SealInRung,
  irHub: IrHub,
  validation: ValidationLoop,
  scan: ScanCycle,
  wiring: WiringFigure,
  aiLoop: AiLoopFigure,
  addressing: AddressingFigure,
  lifecycle: LifecycleFigure,
  citation: CitationFigure,
} as const;

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = getProduct(slug);
  if (!product) notFound();

  const Figure = FIGURES[product.figure];
  const others = PRODUCTS.filter((p) => p.slug !== product.slug);
  const state = STATE_META[product.state];

  return (
    <div className="mx-auto max-w-6xl px-5 py-14">
      <Link
        href="/products"
        className="mb-8 inline-block font-mono text-[12px] text-ink-400 hover:text-ink-700"
      >
        ← Products
      </Link>

      <header className="grid gap-10 border-b border-ink-100 pb-14 lg:grid-cols-[1fr_1fr] lg:items-center lg:gap-16">
        <div>
          <div className="mb-4 flex items-center gap-3">
            <h1 className="font-display text-[2.4rem] font-extrabold leading-none tracking-[-0.022em] text-ink-900">
              {product.name}
            </h1>
            <span
              className={`rounded-sm border px-2 py-0.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.1em] ${state.cls}`}
            >
              {state.label}
            </span>
          </div>
          <p className="text-[18px] font-medium leading-snug text-ink-800">{product.tagline}</p>
          <p className="mt-4 text-[16px] leading-relaxed text-ink-600">{product.summary}</p>
          {product.open && (
            <Link
              href={product.open.href}
              className="mt-7 inline-block rounded-sm bg-ink-900 px-5 py-2.5 text-[14.5px] font-semibold text-white hover:opacity-90"
            >
              {product.open.label}
            </Link>
          )}
        </div>
        <figure className="rounded-sm border border-ink-100 bg-white p-6 lg:justify-self-end">
          <Figure className="w-full text-ink-800" />
          <figcaption className="mt-3 text-[12.5px] leading-relaxed text-ink-400">
            {product.figureCaption}
          </figcaption>
        </figure>
      </header>

      <section className="grid gap-10 border-b border-ink-100 py-14 lg:grid-cols-[1fr_1.5fr] lg:gap-16">
        <h2 className="font-mono text-[11.5px] font-semibold uppercase tracking-[0.16em] text-ink-400">
          The problem
        </h2>
        <p className="max-w-2xl text-[17px] leading-relaxed text-ink-800">{product.problem}</p>
      </section>

      <section className="grid gap-10 border-b border-ink-100 py-14 lg:grid-cols-[1fr_1.5fr] lg:gap-16">
        <h2 className="font-mono text-[11.5px] font-semibold uppercase tracking-[0.16em] text-ink-400">
          What it does
        </h2>
        <ul className="max-w-2xl space-y-8">
          {product.does.map((d) => (
            <li key={d.h} className="border-t-2 border-ink-900 pt-4">
              <h3 className="mb-1.5 text-[16px] font-semibold text-ink-900">{d.h}</h3>
              <p className="text-[15px] leading-relaxed text-ink-600">{d.p}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="grid gap-10 py-14 lg:grid-cols-[1fr_1.5fr] lg:gap-16">
        <div>
          <h2 className="font-mono text-[11.5px] font-semibold uppercase tracking-[0.16em] text-ink-400">
            What it doesn't do
          </h2>
          <p className="mt-3 max-w-xs text-[13.5px] leading-relaxed text-ink-400">
            Listed because you would find out anyway, and finding out later is worse.
          </p>
        </div>
        <ul className="max-w-2xl space-y-3">
          {product.limits.map((l) => (
            <li key={l} className="flex gap-3 text-[15px] leading-relaxed text-ink-600">
              <span aria-hidden="true" className="mt-2 h-px w-4 shrink-0 bg-ink-300" />
              {l}
            </li>
          ))}
        </ul>
      </section>

      <nav className="border-t border-ink-100 pt-12">
        <h2 className="mb-7 font-mono text-[11.5px] font-semibold uppercase tracking-[0.16em] text-ink-400">
          The rest of it
        </h2>
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {others.map((p) => (
            <li key={p.slug}>
              <Link href={`/products/${p.slug}`} className="group block">
                <h3 className="font-display text-[1.05rem] font-bold text-ink-900 group-hover:text-teal-700">
                  {p.name}
                </h3>
                <p className="mt-1 text-[13.5px] leading-relaxed text-ink-500">{p.tagline}</p>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
