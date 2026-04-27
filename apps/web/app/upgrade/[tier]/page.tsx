// Single-shot redirect endpoint that the marketing /pricing CTAs link to.
// If the user isn't signed in, the middleware (or our own check) bounces
// them to /sign-up?next=/upgrade/<tier>. Once they're back here with a
// session, we mint a Stripe Checkout URL and redirect to it.

import { getCurrentUser } from "@/lib/auth/server";
import { getSubscription } from "@/lib/db/subscriptions";
import { env } from "@/lib/env";
import { priceIdForTier, stripe } from "@/lib/stripe/client";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ tier: string }>;
}

export default async function UpgradePage({ params }: PageProps) {
  const { tier: rawTier } = await params;
  // Studio is a desktop-licence purchase, not a Stripe subscription —
  // see ADR-008. /upgrade/* is for cloud tiers only.
  if (rawTier !== "pro") {
    redirect("/pricing?error=unknown_tier");
  }
  const tier = "pro" as const;

  const user = await getCurrentUser();
  if (!user) {
    redirect(`/sign-up?next=${encodeURIComponent(`/upgrade/${tier}`)}`);
  }

  const priceId = priceIdForTier(tier);
  if (!priceId) {
    // Stripe Price ID not configured — bounce to settings with a clear
    // signal rather than 500ing the upgrade flow.
    redirect("/settings?billing=price_not_configured");
  }

  const sub = await getSubscription(user.id);
  let customerId = sub?.stripeCustomerId ?? null;
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
    metadata: { userId: user.id, tier },
    subscription_data: { metadata: { userId: user.id, tier } },
  });

  if (!session.url) {
    redirect("/settings?billing=stripe_no_url");
  }
  redirect(session.url);
}
