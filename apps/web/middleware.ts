// Auth middleware. Cheap cookie-presence check only — full session
// validation happens in the route handler / server component, which has
// DB access. Edge runtime can't easily talk to Postgres, so we don't try.

import { SESSION_COOKIE } from "@/lib/auth/session";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function isPublic(pathname: string): boolean {
  if (pathname === "/") return true;
  if (pathname.startsWith("/sign-in")) return true;
  if (pathname.startsWith("/sign-up")) return true;
  if (pathname.startsWith("/api/auth/")) return true;
  if (pathname === "/api/activation") return true;
  if (pathname === "/pricing") return true;
  // Studio runs entirely in the browser and stores projects there, so it needs
  // no account. Being able to open the ladder editor from a cold link, draw a
  // rung and press Run is the shortest path to understanding what LADX is.
  if (pathname.startsWith("/studio")) return true;
  return false;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

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
  // routes, not files in public/ — without them the auth check catches the
  // manifest and redirects it to /sign-in, which browsers read as a broken
  // install target rather than as a login prompt.
  matcher: [
    "/((?!_next/|.*\\.(?:ico|png|jpg|jpeg|svg|webp|avif|css|js|map|woff2?|webmanifest|txt|xml)$).*)",
  ],
};
