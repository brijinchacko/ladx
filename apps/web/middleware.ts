import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

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

export default clerkMiddleware(async (auth, req) => {
  if (isPublic(req)) return;
  await auth.protect();
});

export const config = {
  // Match every route except Next internals and static assets.
  matcher: ["/((?!_next/|.*\\.(?:ico|png|jpg|jpeg|svg|webp|css|js|map)$).*)"],
};
