/**
 * JSON-LD, written for answer engines rather than for rich snippets.
 *
 * The measured effect is large: pages combining text, images and structured
 * data are selected for Google's AI Overviews far more often than plain prose,
 * and the schema is what lets a retrieval system decide a passage answers a
 * question without having to infer it. Article, FAQPage and HowTo are the three
 * types that carry weight; the rest is scaffolding so the graph connects.
 *
 * Everything here is emitted server-side into the HTML. That is not incidental:
 * ChatGPT's crawler parses HTML only and does not run JavaScript, so anything
 * injected on the client is invisible to it.
 */

export const SITE = {
  name: "LADX",
  url: process.env.NEXT_PUBLIC_APP_URL ?? "https://ladx.ai",
  description:
    "The AI workbench for automation engineers. Draw ladder logic and watch it run, generate PLC code that compiles before you see it, and convert programs between platforms.",
  logo: "/brand/icon-512.png",
} as const;

function abs(path: string): string {
  return path.startsWith("http") ? path : `${SITE.url}${path}`;
}

/** Wrap any JSON-LD object for inline injection. */
export function jsonLd(data: object): { __html: string } {
  // Escaped so a "</script>" inside any string cannot close the tag early.
  return { __html: JSON.stringify(data).replace(/</g, "\\u003c") };
}

/* ─────────────────────────── organisation ─────────────────────────── */

/**
 * Emitted once, on the home page.
 *
 * Answer engines lean heavily on entity recognition: ChatGPT's citations skew
 * hard toward sources it can resolve to a known entity. Declaring the
 * organisation explicitly is the cheapest way to become one.
 */
export function organizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${SITE.url}/#organization`,
    name: SITE.name,
    url: SITE.url,
    logo: { "@type": "ImageObject", url: abs(SITE.logo), width: 512, height: 512 },
    description: SITE.description,
    knowsAbout: [
      "Programmable logic controllers",
      "Ladder logic",
      "IEC 61131-3",
      "Structured Text",
      "Industrial automation",
      "PLC programming",
      "SCADA",
      "PLCopen",
    ],
  };
}

export function websiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE.url}/#website`,
    url: SITE.url,
    name: SITE.name,
    description: SITE.description,
    publisher: { "@id": `${SITE.url}/#organization` },
  };
}

/**
 * The product itself.
 *
 * Answers the "what tool should I use for X" class of question, which is where
 * a software product actually wants to appear in a generated answer.
 */
export function softwareSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "LADX Studio",
    applicationCategory: "DeveloperApplication",
    applicationSubCategory: "PLC programming and simulation",
    operatingSystem: "Web browser",
    url: `${SITE.url}/studio`,
    description:
      "A browser ladder logic editor with a scan-accurate PLC simulator. Real output image, per-instruction edge memory, and timers that count elapsed milliseconds rather than scans. No account required.",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    featureList: [
      "Ladder logic editor",
      "Scan-accurate PLC simulator",
      "IEC 61131-3 instruction set",
      "Tag table with I/O addressing",
      "Structured Text conversion",
      "Runs offline in the browser",
    ],
    publisher: { "@id": `${SITE.url}/#organization` },
  };
}

/* ───────────────────────────── articles ───────────────────────────── */

export interface ArticleInput {
  slug: string;
  title: string;
  summary: string;
  published: string;
  updated?: string;
  minutes: number;
  topic: string;
  /** Terms the article genuinely covers. Not a keyword dump. */
  about?: string[];
}

export function articleSchema(a: ArticleInput) {
  const url = `${SITE.url}/resources/${a.slug}`;
  return {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    "@id": `${url}#article`,
    headline: a.title,
    description: a.summary,
    url,
    datePublished: a.published,
    // Freshness is a measured ranking input for AI citations, so the modified
    // date is always present even when it equals the published date.
    dateModified: a.updated ?? a.published,
    author: { "@id": `${SITE.url}/#organization` },
    publisher: { "@id": `${SITE.url}/#organization` },
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    articleSection: a.topic,
    timeRequired: `PT${a.minutes}M`,
    ...(a.about?.length ? { about: a.about.map((t) => ({ "@type": "Thing", name: t })) } : {}),
    inLanguage: "en",
    image: abs(`/og/resources/${a.slug}`),
  };
}

/* ─────────────────────────────── FAQ ──────────────────────────────── */

export interface QA {
  q: string;
  a: string;
}

/**
 * FAQPage.
 *
 * The highest-leverage type for answer engines, because it hands them exactly
 * what they are assembling: a question paired with a self-contained answer. The
 * answers here are written to stand alone at roughly 40 to 60 words, since
 * retrieval selects passages rather than pages.
 */
export function faqSchema(items: QA[], pageUrl: string) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "@id": `${abs(pageUrl)}#faq`,
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };
}

/* ──────────────────────────── breadcrumbs ─────────────────────────── */

export function breadcrumbSchema(trail: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((crumb, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: crumb.name,
      item: abs(crumb.path),
    })),
  };
}

/* ────────────────────────────── how-to ────────────────────────────── */

export interface HowToStep {
  name: string;
  text: string;
}

export function howToSchema(input: {
  name: string;
  description: string;
  url: string;
  steps: HowToStep[];
}) {
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: input.name,
    description: input.description,
    url: abs(input.url),
    step: input.steps.map((s, i) => ({
      "@type": "HowToStep",
      position: i + 1,
      name: s.name,
      text: s.text,
    })),
  };
}
