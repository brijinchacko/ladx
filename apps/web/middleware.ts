import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// Public surface = marketing-style pages, auth pages, Stripe webhook,
// activation endpoint (desktop licence check), and the sign-up funnel.
// Everything under (app) and most /api routes are private.
const isPublic = createRouteMatcher([
  "/",
  "/pricing",
  "/docs(.*)",
  "/blog(.*)",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/stripe/webhook",
  "/api/activation",
]);

const clerkConfigured = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export default clerkConfigured
  ? clerkMiddleware(async (auth, req) => {
      if (isPublic(req)) return;
      await auth.protect();
    })
  : // Dev fallback: no auth checks. The (app)/* routes still render but
    // anything that calls Clerk's `auth()` will throw — which is fine in
    // dev because we want loud failures when keys are missing.
    () => NextResponse.next();

export const config = {
  // Match every route except Next internals and static assets.
  matcher: ["/((?!_next/|.*\\.(?:ico|png|jpg|jpeg|svg|webp|css|js|map)$).*)"],
};
