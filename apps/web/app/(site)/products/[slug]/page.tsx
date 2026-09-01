import { AddressingFigure, AiLoopFigure, WiringFigure } from "@/components/site/figures";
import {
  CitationFigure,
  GanttFigure,
  IrHub,
  LifecycleFigure,
  ScanCycle,
  SealInRung,
  TagBindingFigure,
  ValidationLoop,
} from "@/components/site/schematics";
import { PRODUCTS, STATE_META, getProduct } from "@/content/products";
import { SITE, breadcrumbSchema, faqSchema, jsonLd, productSchema } from "@/lib/seo/schema";
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
  const url = `${SITE.url}/products/${product.slug}`;
  return {
    // The tool name alone competes with every other product called Ladder or
    // Monitor. What it is has to be in the title, because the title is most of
    // what a search result and a shared link show.
    title: `${product.name}: ${product.tagline}`,
    // The direct answer rather than the positioning paragraph, since this is
    // the text a result snippet and a link preview quote.
    description: product.answer,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      url,
      title: `LADX ${product.name}: ${product.tagline}`,
      description: product.answer,
      images: [
        { url: `/og/products/${product.slug}`, width: 1200, height: 630, alt: product.name },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: `LADX ${product.name}`,
      description: product.answer,
      images: [`/og/products/${product.slug}`],
    },
  };
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
  tagBinding: TagBindingFigure,
  gantt: GanttFigure,
} as const;

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = getProduct(slug);
  if (!product) notFound();

  const Figure = FIGURES[product.figure];
  const others = PRODUCTS.filter((p) => p.slug !== product.slug);
  const state = STATE_META[product.state];

  const url = `${SITE.url}/products/${product.slug}`;

  return (
    <div className="mx-auto max-w-6xl px-5 py-14">
      {/*
        Three records, and each answers a different question a retrieval system
        asks. SoftwareApplication: what is this thing. FAQPage: the shape an
        answer engine is already assembling, which is why it is the highest
        leverage type available. BreadcrumbList: where it sits, which is what
        puts the trail under a search result instead of a bare URL.
      */}
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD has no other insertion point.
        dangerouslySetInnerHTML={jsonLd(
          productSchema({
            slug: product.slug,
            name: product.name,
            tagline: product.tagline,
            summary: product.summary,
            answer: product.answer,
            features: product.does.map((d) => d.h),
            updated: product.updated,
            href: product.open?.href,
          }),
        )}
      />
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD has no other insertion point.
        dangerouslySetInnerHTML={jsonLd(faqSchema(product.faq, `/products/${product.slug}`))}
      />
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD has no other insertion point.
        dangerouslySetInnerHTML={jsonLd(
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Products", path: "/products" },
            { name: product.name, path: `/products/${product.slug}` },
          ]),
        )}
      />

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

      {/*
        The direct answer, above everything else on the page.
        Retrieval selects passages rather than pages, and the passage taken is
        usually the first one that answers the question outright. A product page
        whose opening is positioning gets summarised from somebody else's page.
      */}
      <section className="grid gap-10 border-b border-ink-100 py-12 lg:grid-cols-[1fr_1.5fr] lg:gap-16">
        <h2 className="font-mono text-[11.5px] font-semibold uppercase tracking-[0.16em] text-ink-400">
          In short
        </h2>
        <div className="max-w-2xl">
          <p className="font-mono text-[12px] text-ink-400">{product.intent}</p>
          <p className="mt-3 border-l-2 border-teal-600 pl-5 text-[17px] leading-relaxed text-ink-800">
            {product.answer}
          </p>
        </div>
      </section>

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

      {/*
        The questions, on the page as well as in the schema.
        Marking up an answer that is not visible is the thing every guidance
        note tells you not to do, and it is also just worse: these are the
        questions somebody actually arrives with, and burying them in a script
        tag helps a crawler and nobody standing in front of the screen.
      */}
      <section className="grid gap-10 border-t border-ink-100 py-14 lg:grid-cols-[1fr_1.5fr] lg:gap-16">
        <h2 className="font-mono text-[11.5px] font-semibold uppercase tracking-[0.16em] text-ink-400">
          Questions
        </h2>
        <dl className="max-w-2xl space-y-7">
          {product.faq.map((item) => (
            <div key={item.q}>
              <dt className="text-[16px] font-semibold leading-snug text-ink-900">{item.q}</dt>
              <dd className="mt-2 text-[15px] leading-relaxed text-ink-600">{item.a}</dd>
            </div>
          ))}
        </dl>
      </section>

      <nav className="border-t border-ink-100 pt-12">
        <h2 className="mb-7 font-mono text-[11.5px] font-semibold uppercase tracking-[0.16em] text-ink-400">
          The rest of it
        </h2>
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {others.map((p) => (
            <li key={p.slug}>
              <Link href={`/products/${p.slug}`} className="group block">
                <h3 className="font-display text-[1.05rem] font-bold text-ink-900 group-hover:text-teal-800">
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
