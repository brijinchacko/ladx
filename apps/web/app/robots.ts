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
 * What is disallowed is everything private or pointless to index: the signed-in
 * app, the API surface, and auth pages.
 */
export default function robots(): MetadataRoute.Robots {
  const disallow = [
    "/api/",
    "/chat",
    "/projects",
    "/documents",
    "/memory",
    "/settings",
    "/sign-in",
    "/sign-up",
    "/reset-password",
    "/forgot-password",
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
      { userAgent: "PerplexityBot", allow: "/", disallow },
      { userAgent: "Google-Extended", allow: "/", disallow },
      { userAgent: "Applebot-Extended", allow: "/", disallow },
    ],
    sitemap: `${SITE.url}/sitemap.xml`,
    host: SITE.url,
  };
}
