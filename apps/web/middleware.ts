// Auth middleware. Cheap cookie-presence check only, full session
// validation happens in the route handler / server component, which has
// DB access. Edge runtime can't easily talk to Postgres, so we don't try.

import { SESSION_COOKIE } from "@/lib/auth/cookie";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

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
const PROTECTED_PREFIXES = ["/chat", "/projects", "/documents", "/memory", "/settings"];

/** API routes anyone may call: sign-in itself, licence activation, the contact form. */
const PUBLIC_API = ["/api/auth/", "/api/activation", "/api/contact"];

function needsAuth(pathname: string): boolean {
  if (pathname.startsWith("/api/")) {
    return !PUBLIC_API.some((p) => pathname === p || pathname.startsWith(p));
  }
  return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function middleware(req: NextRequest) {
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
