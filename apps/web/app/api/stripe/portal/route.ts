// POST /api/stripe/portal — creates a Customer Portal session so the
// user can change plan, swap payment method, view invoices, or cancel.
// Requires the user to already have a stripeCustomerId on their
// subscription row (i.e. has gone through checkout at least once).

import { getApiUser } from "@/lib/auth/server";
import { getSubscription } from "@/lib/db/subscriptions";
import { env } from "@/lib/env";
import { stripe } from "@/lib/stripe/client";

export async function POST() {
  const authResult = await getApiUser();
  if ("error" in authResult) return authResult.error;

  const sub = await getSubscription(authResult.user.id);
  if (!sub?.stripeCustomerId) {
    return Response.json(
      { error: "no Stripe customer for this user — subscribe first" },
      { status: 400 },
    );
  }

  const session = await stripe().billingPortal.sessions.create({
    customer: sub.stripeCustomerId,
    return_url: `${env.appUrl}/settings`,
  });

  return Response.json({ url: session.url });
}
