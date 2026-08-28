// POST /api/indexnow - push changed URLs to Bing and friends.
//
// This exists because ChatGPT Search and Copilot retrieve from Bing's index. A
// page Bing has not crawled cannot appear in either answer regardless of how
// well it ranks on Google, and waiting for an organic crawl of a low-authority
// new site takes weeks. IndexNow moves that to hours.
//
// The protocol is deliberately simple: publish a key file at the site root,
// then POST a list of URLs. Yandex and Seznam honour the same submission.

import { createHash, timingSafeEqual } from "node:crypto";
import { POSTS } from "@/content/posts";
import { PRODUCTS } from "@/content/products";
import { env } from "@/lib/env";
import { CATEGORIES as FORUM_CATEGORIES } from "@/lib/forum/categories";
import { INDEXNOW_LABEL } from "@/lib/seo/indexnow";
import { SITE } from "@/lib/seo/schema";
import { TEMPLATES } from "@ladx/documents";

const ENDPOINT = "https://api.indexnow.org/IndexNow";

function allUrls(): string[] {
  const host = SITE.url;
  return [
    host,
    `${host}/products`,
    `${host}/resources`,
    `${host}/ladder`,
    `${host}/documents`,
    `${host}/convert`,
    `${host}/free`,
    `${host}/cad`,
    `${host}/hmi`,
    `${host}/forum`,
    `${host}/help`,
    ...PRODUCTS.map((p) => `${host}/products/${p.slug}`),
    ...TEMPLATES.map((t) => `${host}/documents/${t.slug}`),
    ...FORUM_CATEGORIES.map((c) => `${host}/forum/c/${c.slug}`),
    ...POSTS.map((p) => `${host}/resources/${p.slug}`),
  ];
}

export async function POST(req: Request) {
  const key = env.indexNowKey;
  if (!key) {
    return Response.json({ error: "INDEXNOW_KEY is not set" }, { status: 503 });
  }

  /*
   * Authorised by a token derived from the server's own secret, not by the
   * IndexNow key.
   *
   * This used to compare the bearer against INDEXNOW_KEY, which cannot work:
   * the IndexNow key is published at /indexnow.txt on purpose, because that is
   * how the protocol proves ownership. Using the published value as the bearer
   * meant anybody who read the key file could trigger submissions, spend the
   * crawl budget and, from Bing's side, look exactly like us doing it.
   */
  const secret = env.secretsKey;
  if (!secret) {
    return Response.json({ error: "server not configured" }, { status: 503 });
  }
  const expected = createHash("sha256").update(`${INDEXNOW_LABEL}${secret}`).digest("hex");
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  if (
    given.length !== expected.length ||
    !timingSafeEqual(Buffer.from(given), Buffer.from(expected))
  ) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let urlList: string[];
  try {
    const body = (await req.json().catch(() => ({}))) as { urls?: string[] };
    urlList = body.urls?.length ? body.urls : allUrls();
  } catch {
    urlList = allUrls();
  }

  const host = new URL(SITE.url).host;
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      host,
      key,
      // A fixed path Next can actually serve. See app/indexnow.txt/route.ts.
      keyLocation: `${SITE.url}/indexnow.txt`,
      urlList,
    }),
  });

  return Response.json(
    { submitted: urlList.length, status: res.status },
    { status: res.ok ? 200 : 502 },
  );
}
