import { POSTS } from "@/content/posts";
import { PRODUCTS } from "@/content/products";
import { TEMPLATES } from "@/content/templates";
import { CATEGORIES as FORUM_CATEGORIES } from "@/lib/forum/categories";
import { SITE } from "@/lib/seo/schema";
import type { MetadataRoute } from "next";

/**
 * The sitemap.
 *
 * Matters more than usual here because ChatGPT and Copilot retrieve from Bing's
 * index, and a page Bing has not crawled cannot appear in either answer no
 * matter how well it ranks on Google. The sitemap is how Bing finds these pages
 * at all; IndexNow (see /api/indexnow) is how it finds them quickly.
 *
 * `lastModified` is real rather than "now": pages updated recently earn
 * measurably more AI citations, and a sitemap that claims everything changed
 * today teaches a crawler to ignore the field.
 */
/**
 * The newest date among a set of ISO dates, or undefined if there are none.
 *
 * An index page's lastModified is the newest thing it lists. That is both true
 * and useful: /resources genuinely changes when an article is added, and
 * claiming otherwise on either side, never changing or changing daily, teaches
 * a crawler to disregard the field.
 */
function newest(dates: (string | undefined)[]): Date | undefined {
  const real = dates.filter((d): d is string => Boolean(d)).sort();
  const last = real[real.length - 1];
  return last ? new Date(last) : undefined;
}

export default function sitemap(): MetadataRoute.Sitemap {
  const newestPost = newest(POSTS.map((p) => p.updated ?? p.published));
  const newestProduct = newest(PRODUCTS.map((p) => p.updated));

  const staticPages: MetadataRoute.Sitemap = [
    { url: SITE.url, lastModified: newestProduct, changeFrequency: "weekly", priority: 1 },
    {
      url: `${SITE.url}/products`,
      lastModified: newestProduct,
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: `${SITE.url}/resources`,
      lastModified: newestPost,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    { url: `${SITE.url}/ladder`, changeFrequency: "monthly", priority: 0.9 },
    // The template library is the strongest thing here for search: an engineer
    // looking for a FAT protocol wants a file, and these pages hand them one.
    { url: `${SITE.url}/documents`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE.url}/convert`, changeFrequency: "monthly", priority: 0.9 },
    // The three tools that need no account. High priority deliberately: these
    // are what somebody searching for a free tool is actually looking for, and
    // they are the only pages on the site that answer that query by being the
    // thing rather than describing it.
    { url: `${SITE.url}/free`, changeFrequency: "monthly", priority: 0.9 },
    { url: `${SITE.url}/cad`, changeFrequency: "monthly", priority: 0.9 },
    { url: `${SITE.url}/hmi`, changeFrequency: "monthly", priority: 0.9 },
    { url: `${SITE.url}/forum`, changeFrequency: "daily", priority: 0.7 },
    { url: `${SITE.url}/help`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE.url}/cookies`, changeFrequency: "yearly", priority: 0.2 },
  ];

  const templatePages: MetadataRoute.Sitemap = TEMPLATES.map((t) => ({
    url: `${SITE.url}/documents/${t.slug}`,
    changeFrequency: "monthly",
    priority: 0.8,
  }));

  const forumPages: MetadataRoute.Sitemap = FORUM_CATEGORIES.map((c) => ({
    url: `${SITE.url}/forum/c/${c.slug}`,
    changeFrequency: "daily",
    priority: 0.5,
  }));

  const productPages: MetadataRoute.Sitemap = PRODUCTS.map((p) => ({
    url: `${SITE.url}/products/${p.slug}`,
    lastModified: new Date(p.updated),
    changeFrequency: "monthly",
    // The tools are what somebody is looking for when they are ready to use
    // something, so they outrank the writing that brought them here.
    priority: 0.9,
  }));

  const postPages: MetadataRoute.Sitemap = POSTS.map((p) => ({
    url: `${SITE.url}/resources/${p.slug}`,
    lastModified: new Date(p.updated ?? p.published),
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  return [...staticPages, ...productPages, ...templatePages, ...forumPages, ...postPages];
}
