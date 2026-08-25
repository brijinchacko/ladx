// Auth middleware. Cheap cookie-presence check only, full session
// validation happens in the route handler / server component, which has
// DB access. Edge runtime can't easily talk to Postgres, so we don't try.

import { SESSION_COOKIE } from "@/lib/auth/cookie";
import { normalisePath } from "@/lib/metrics/path";
import { metricsTokenAsync } from "@/lib/metrics/token";
import { NextResponse } from "next/server";
import type { NextFetchEvent, NextRequest } from "next/server";

/**
 * The routes that need an account.
 *
 * This list is deliberately the *protected* one rather than the public one.
 * It used to be inverted, everything was private unless named, which meant
 * every new marketing page silently redirected to /sign-in until somebody
 * remembered to come here. The failure was invisible in development, where you
 * are always signed in, and obvious to a first-time visitor, which is the worst
 * possible split.
 *
 * Adding a page should not require editing auth. Adding a *private* page should.
 */
// LADX Studio is the whole application and lives under one prefix, so the
// protected list is one entry rather than a list that has to be extended every
// time a tool is added. Everything outside it is the public site.
const PROTECTED_PREFIXES = ["/studio"];

/**
 * API routes the session check does not apply to.
 *
 * Most are genuinely public: sign-in itself, licence activation, the contact
 * form. `/api/indexnow` is the odd one, and it is listed here because it does
 * its own auth rather than because it is open. It takes a Bearer token holding
 * INDEXNOW_KEY, which is the right check for it, since a submission should be
 * triggerable by a deploy script with no browser session, and should NOT be
 * triggerable by any signed-in user who happens to find the route. Leaving it
 * out of this list meant the middleware rejected every call before the route
 * ran, and the endpoint could not be used at all.
 */
const PUBLIC_API = [
  "/api/auth/",
  "/api/activation",
  "/api/contact",
  "/api/indexnow",
  // Posted by the middleware above, authenticated by a derived token rather
  // than a session. Listed here so the session check does not reject it before
  // the route can run.
  "/api/metrics/ingest",
  // The document template library is deliberately account free, so its download
  // endpoint has to be too. Gating it would make the most linkable pages on the
  // site useless to the people who find them.
  "/api/templates/",
];

function needsAuth(pathname: string): boolean {
  if (pathname.startsWith("/api/")) {
    return !PUBLIC_API.some((p) => pathname === p || pathname.startsWith(p));
  }
  return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/* ────────────────────────── the page counter ────────────────────────── */

/**
 * Counts held in memory and flushed in batches.
 *
 * A row per request would be thousands of statements in a busy hour to answer
 * a question that only needs a daily total, on a box that has fifteen other
 * applications on it. So the count is kept here and posted once every few
 * hundred requests or once a minute, whichever comes first, which makes the
 * cost of counting about one extra request per page of reading.
 *
 * Module scope survives between requests in the same process. If the process
 * restarts mid-buffer the pending counts are lost, which is the right trade: a
 * counter is not worth a write on the hot path to protect.
 *
 * Nothing in this buffer identifies anybody. The key is a page name and a
 * boolean, and there is nowhere in it to put a session, an address or an id.
 */
const buffer = new Map<string, number>();
const referrers = new Map<string, number>();
let lastFlush = Date.now();
let flushing = false;

const FLUSH_EVERY_MS = 30_000;
const FLUSH_AT_KEYS = 200;
/** A hard ceiling, so a pathological crawler cannot grow this without bound. */
const MAX_KEYS = 2_000;

function bump(map: Map<string, number>, key: string) {
  if (map.size >= MAX_KEYS && !map.has(key)) return;
  map.set(key, (map.get(key) ?? 0) + 1);
}

/**
 * The host somebody arrived from, if it was not this site.
 *
 * The host and nothing else. A full referring URL can carry a search term or a
 * name in its query, and there is no version of that which belongs in a table
 * this application keeps forever.
 */
function referrerHost(raw: string | null, self: string): string | null {
  if (!raw) return null;
  try {
    const host = new URL(raw).hostname.toLowerCase();
    if (!host || host === self.toLowerCase()) return null;
    return host.length <= 253 ? host : null;
  } catch {
    return null;
  }
}

function maybeFlush(req: NextRequest, event: NextFetchEvent) {
  const now = Date.now();
  const due = buffer.size >= FLUSH_AT_KEYS || now - lastFlush >= FLUSH_EVERY_MS;
  if (!due || flushing || buffer.size === 0) return;

  const hits = Object.fromEntries(buffer);
  const refs = Object.fromEntries(referrers);
  buffer.clear();
  referrers.clear();
  lastFlush = now;
  flushing = true;

  const secret = process.env.LADX_SECRETS_KEY;
  if (!secret) {
    // Counting is off rather than open. The Traffic page says so.
    flushing = false;
    return;
  }

  const url = new URL("/api/metrics/ingest", req.nextUrl.origin);
  event.waitUntil(
    metricsTokenAsync(secret)
      .then((token) =>
        fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-ladx-metrics": token },
          body: JSON.stringify({ hits, referrers: refs }),
        }),
      )
      .catch(() => {
        // The batch is gone either way. Losing a minute of counts is not worth
        // holding a retry queue in the request path.
      })
      .finally(() => {
        flushing = false;
      }),
  );
}

function count(req: NextRequest, event: NextFetchEvent) {
  if (req.method !== "GET") return;
  const page = normalisePath(req.nextUrl.pathname);
  if (!page) return;

  const authed = req.cookies.has(SESSION_COOKIE) ? "1" : "0";
  bump(buffer, `${page} ${authed}`);

  const host = referrerHost(req.headers.get("referer"), req.nextUrl.hostname);
  if (host) bump(referrers, host);

  maybeFlush(req, event);
}

export function middleware(req: NextRequest, event: NextFetchEvent) {
  count(req, event);

  const { pathname } = req.nextUrl;
  if (!needsAuth(pathname)) return NextResponse.next();

  const sessionId = req.cookies.get(SESSION_COOKIE)?.value;
  if (sessionId) return NextResponse.next();

  // No cookie → bounce to /sign-in for HTML routes, return 401 for API.
  if (pathname.startsWith("/api/")) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/sign-in";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  // Skip anything that is an asset rather than a page. `webmanifest`, `txt` and
  // `xml` are here because the manifest, robots.txt and sitemap are generated
  // routes, not files in public/, without them the auth check catches the
  // manifest and redirects it to /sign-in, which browsers read as a broken
  // install target rather than as a login prompt.
  matcher: [
    "/((?!_next/|.*\\.(?:ico|png|jpg|jpeg|svg|webp|avif|css|js|map|woff2?|webmanifest|txt|xml)$).*)",
  ],
};
