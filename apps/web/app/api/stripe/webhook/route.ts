// POST /api/stripe/webhook — handles subscription lifecycle events.
// Verifies the Stripe signature; rejects unsigned bodies (replay-safe).
//
// Events handled in Phase 1:
// - customer.subscription.created
// - customer.subscription.updated
// - customer.subscription.deleted
// - invoice.payment_failed

import { env } from "@/lib/env";
import Stripe from "stripe";

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  if (!sig) return new Response("missing signature", { status: 400 });

  const { secret, webhookSecret } = env.requireStripe();
  const stripe = new Stripe(secret);

  let event: Stripe.Event;
  try {
    const body = await req.text();
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "verification failed";
    return new Response(`webhook error: ${msg}`, { status: 400 });
  }

  // TODO(phase-1): persist subscription state to db.subscriptions.
  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
    case "invoice.payment_failed":
      // Logged for now. Full handler lands with the billing UI.
      break;
    default:
      // Unhandled events are intentionally a no-op — Stripe expects 200.
      break;
  }

  return Response.json({ received: true });
}
