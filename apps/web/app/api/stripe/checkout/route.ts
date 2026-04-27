// POST /api/stripe/checkout — creates a Stripe Checkout session for the
// chosen tier and returns the redirect URL. Reuses the existing Stripe
// customer if the user already has one, otherwise creates one.

import { getApiUser } from "@/lib/auth/server";
import { getSubscription } from "@/lib/db/subscriptions";
import { env } from "@/lib/env";
import { priceIdForTier, stripe } from "@/lib/stripe/client";
import { z } from "zod";

const schema = z.object({
  tier: z.enum(["pro"]),
});

export async function POST(req: Request) {
  const authResult = await getApiUser();
  if ("error" in authResult) return authResult.error;
  const { user } = authResult;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "invalid request" }, { status: 400 });
  }

  const priceId = priceIdForTier(parsed.data.tier);
  if (!priceId) {
    return Response.json(
      {
        error:
          "STRIPE_PRICE_PRO_MONTHLY not configured — create a Price in Stripe and set the env var.",
      },
      { status: 503 },
    );
  }

  const sub = await getSubscription(user.id);
  let customerId = sub?.stripeCustomerId ?? null;

  // Create the customer up-front if the user doesn't have one yet so we
  // can attach metadata.userId. The webhook uses metadata.userId to map
  // the resulting subscription back to our row.
  if (!customerId) {
    const customer = await stripe().customers.create({
      email: user.email,
      name: user.displayName ?? undefined,
      metadata: { userId: user.id },
    });
    customerId = customer.id;
  }

  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${env.appUrl}/settings?checkout=success`,
    cancel_url: `${env.appUrl}/pricing?checkout=canceled`,
    allow_promotion_codes: true,
    metadata: {
      userId: user.id,
      tier: parsed.data.tier,
    },
    subscription_data: {
      metadata: { userId: user.id, tier: parsed.data.tier },
    },
  });

  if (!session.url) {
    return Response.json({ error: "Stripe did not return a redirect URL" }, { status: 502 });
  }

  return Response.json({ url: session.url });
}
