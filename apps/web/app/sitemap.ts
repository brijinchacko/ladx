import { POSTS } from "@/content/posts";
import { PRODUCTS } from "@/content/products";
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
export default function sitemap(): MetadataRoute.Sitemap {
  const staticPages: MetadataRoute.Sitemap = [
    { url: SITE.url, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE.url}/products`, changeFrequency: "monthly", priority: 0.9 },
    { url: `${SITE.url}/resources`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE.url}/studio`, changeFrequency: "monthly", priority: 0.9 },
    { url: `${SITE.url}/forum`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE.url}/help`, changeFrequency: "monthly", priority: 0.6 },
  ];

  const productPages: MetadataRoute.Sitemap = PRODUCTS.map((p) => ({
    url: `${SITE.url}/products/${p.slug}`,
    changeFrequency: "monthly",
    priority: 0.8,
  }));

  const postPages: MetadataRoute.Sitemap = POSTS.map((p) => ({
    url: `${SITE.url}/resources/${p.slug}`,
    lastModified: new Date(p.updated ?? p.published),
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  return [...staticPages, ...productPages, ...postPages];
}
