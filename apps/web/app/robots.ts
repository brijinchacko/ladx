import { SITE } from "@/lib/seo/schema";
import type { MetadataRoute } from "next";

/**
 * robots.txt.
 *
 * AI crawlers are allowed deliberately. The whole point of the writing on this
 * site is to be found and quoted, and blocking GPTBot or ClaudeBot to protect
 * content nobody has read yet trades the only distribution we have for a
 * principle that costs more than it returns.
 *
 * The disallow list used to be the pre-/studio route names, written before the
 * application moved under one prefix and never revisited. Two things were
 * wrong with it, in opposite directions.
 *
 * It blocked `/documents`, which stopped being an application route and became
 * the public template library: seventeen pages, all of them in the sitemap,
 * all of them among the most linkable things on the site, and every one of
 * them barred from every crawler. A sitemap that advertises pages robots.txt
 * forbids is the worst of both, because the pages are known to exist and
 * cannot be read.
 *
 * And it did not block `/studio`, which is the actual application. Every tool
 * page was crawlable, returning a redirect to sign-in, spending crawl budget
 * on nothing.
 *
 * Both are fixed below. The rule for anything added later: this list holds
 * paths that are private or worthless to index, and a path in the sitemap must
 * never appear in it.
 */
export default function robots(): MetadataRoute.Robots {
  const disallow = [
    // The application. One prefix, so this stays correct as tools are added.
    "/studio",
    // Not a page, and the surface most worth not inviting a crawler into.
    "/api/",
    // Auth. Nothing to index and every one of them is a dead end for a reader
    // arriving from a search result.
    "/sign-in",
    "/sign-up",
    "/reset-password",
    "/forgot-password",
    // A share link is a secret in a URL. Indexing one publishes it.
    "/share/",
  ];

  return {
    rules: [
      { userAgent: "*", allow: "/", disallow },
      // Named explicitly so the intent is unambiguous to operators who check.
      { userAgent: "GPTBot", allow: "/", disallow },
      { userAgent: "OAI-SearchBot", allow: "/", disallow },
      { userAgent: "ChatGPT-User", allow: "/", disallow },
      { userAgent: "ClaudeBot", allow: "/", disallow },
      { userAgent: "Claude-Web", allow: "/", disallow },
      { userAgent: "anthropic-ai", allow: "/", disallow },
      { userAgent: "PerplexityBot", allow: "/", disallow },
      { userAgent: "Perplexity-User", allow: "/", disallow },
      { userAgent: "Google-Extended", allow: "/", disallow },
      { userAgent: "Applebot-Extended", allow: "/", disallow },
      { userAgent: "Bingbot", allow: "/", disallow },
      { userAgent: "CCBot", allow: "/", disallow },
      { userAgent: "cohere-ai", allow: "/", disallow },
      { userAgent: "meta-externalagent", allow: "/", disallow },
      { userAgent: "Bytespider", allow: "/", disallow },
      { userAgent: "Amazonbot", allow: "/", disallow },
      { userAgent: "DuckAssistBot", allow: "/", disallow },
      { userAgent: "MistralAI-User", allow: "/", disallow },
      { userAgent: "YouBot", allow: "/", disallow },
    ],
    sitemap: `${SITE.url}/sitemap.xml`,
    host: SITE.url,
  };
}
