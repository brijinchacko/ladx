// POST /api/indexnow - push changed URLs to Bing and friends.
//
// This exists because ChatGPT Search and Copilot retrieve from Bing's index. A
// page Bing has not crawled cannot appear in either answer regardless of how
// well it ranks on Google, and waiting for an organic crawl of a low-authority
// new site takes weeks. IndexNow moves that to hours.
//
// The protocol is deliberately simple: publish a key file at the site root,
// then POST a list of URLs. Yandex and Seznam honour the same submission.

import { POSTS } from "@/content/posts";
import { PRODUCTS } from "@/content/products";
import { SITE } from "@/lib/seo/schema";

const ENDPOINT = "https://api.indexnow.org/IndexNow";

function allUrls(): string[] {
  const host = SITE.url;
  return [
    host,
    `${host}/products`,
    `${host}/resources`,
    `${host}/studio`,
    `${host}/forum`,
    `${host}/help`,
    ...PRODUCTS.map((p) => `${host}/products/${p.slug}`),
    ...POSTS.map((p) => `${host}/resources/${p.slug}`),
  ];
}

export async function POST(req: Request) {
  const key = process.env.INDEXNOW_KEY;
  if (!key) {
    return Response.json({ error: "INDEXNOW_KEY is not set" }, { status: 503 });
  }

  // Only we may trigger a submission: an open endpoint would let anyone spend
  // the site's crawl budget and look, from Bing's side, like us doing it.
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${key}`) {
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
      keyLocation: `${SITE.url}/${key}.txt`,
      urlList,
    }),
  });

  return Response.json(
    { submitted: urlList.length, status: res.status },
    { status: res.ok ? 200 : 502 },
  );
}
