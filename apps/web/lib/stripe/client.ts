// Lazy Stripe client. The SDK throws on import without a key, so we hide
// the construction behind a function. Routes that need Stripe call
// stripe(); pages that don't can build cleanly without the env var.

import Stripe from "stripe";
import { env } from "../env";

let cached: Stripe | null = null;

export function stripe(): Stripe {
  if (cached) return cached;
  const key = env.requireStripe().secret;
  cached = new Stripe(key, {
    // Pin the API version so dashboard upgrades don't silently break
    // shape assumptions. Match the version configured for the webhook
    // endpoint (2023-10-16 per the user's setup).
    apiVersion: "2023-10-16" as Stripe.LatestApiVersion,
    typescript: true,
  });
  return cached;
}

/** Map our internal cloud-tier slug to a Stripe Price id. Studio is
 *  desktop-only (licence keys, not subscriptions per ADR-008) so it is
 *  intentionally absent from this mapping. */
export type CheckoutTier = "pro";

export function priceIdForTier(tier: CheckoutTier): string | null {
  switch (tier) {
    case "pro":
      return env.stripePriceProMonthly ?? null;
  }
}
