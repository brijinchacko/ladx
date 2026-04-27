// POST /api/webhooks/stripe — Stripe webhook handler.
//
// Configured at https://dashboard.stripe.com/webhooks. Signing secret is
// in STRIPE_WEBHOOK_SECRET. Events subscribed (per recommendation):
//   checkout.session.completed
//   customer.subscription.updated
//   customer.subscription.deleted
//   invoice.payment_succeeded
//   invoice.payment_failed
//
// Each handler is idempotent — Stripe retries on non-2xx, so we may see
// the same event multiple times.

import { db } from "@/lib/db/client";
import { subscriptions, users } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { stripe } from "@/lib/stripe/client";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  if (!sig) return new Response("missing signature", { status: 400 });

  if (!env.stripeWebhookSecret) {
    return new Response("webhook secret not configured", { status: 503 });
  }

  let event: Stripe.Event;
  try {
    const body = await req.text();
    event = stripe().webhooks.constructEvent(body, sig, env.stripeWebhookSecret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "verification failed";
    return new Response(`webhook error: ${msg}`, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object);
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
        await handleSubscriptionUpsert(event.data.object);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object);
        break;
      case "invoice.payment_succeeded":
        await handleInvoicePaid(event.data.object);
        break;
      case "invoice.payment_failed":
        await handleInvoiceFailed(event.data.object);
        break;
      default:
        // Unhandled events are fine — Stripe just expects 200.
        break;
    }
  } catch (err) {
    console.error("[stripe-webhook] handler failed:", event.type, err);
    return new Response("handler failed", { status: 500 });
  }

  return Response.json({ received: true });
}

// ---- handlers ----

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  // We populate metadata.userId when creating the session.
  const userId = session.metadata?.userId;
  if (!userId) {
    console.warn("[stripe-webhook] checkout.session.completed without userId metadata");
    return;
  }

  const stripeCustomerId =
    typeof session.customer === "string" ? session.customer : session.customer?.id;
  const stripeSubscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : (session.subscription?.id ?? null);

  if (!stripeCustomerId) return;

  // Pull the actual subscription so we know the tier and period end.
  let tier: SubTier = "free";
  let currentPeriodEnd: Date | null = null;
  let status: SubStatus = "active";

  if (stripeSubscriptionId) {
    const sub = await stripe().subscriptions.retrieve(stripeSubscriptionId);
    tier = tierFromPriceId(sub.items.data[0]?.price.id ?? null);
    currentPeriodEnd = new Date(sub.current_period_end * 1000);
    status = mapStatus(sub.status);
  }

  await upsertSubscription({
    userId,
    stripeCustomerId,
    stripeSubscriptionId,
    tier,
    status,
    currentPeriodEnd,
  });
}

async function handleSubscriptionUpsert(sub: Stripe.Subscription) {
  const stripeCustomerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const userId = await userIdForCustomer(stripeCustomerId);
  if (!userId) {
    console.warn("[stripe-webhook] subscription event for unknown customer", stripeCustomerId);
    return;
  }

  const tier = tierFromPriceId(sub.items.data[0]?.price.id ?? null);
  await upsertSubscription({
    userId,
    stripeCustomerId,
    stripeSubscriptionId: sub.id,
    tier,
    status: mapStatus(sub.status),
    currentPeriodEnd: new Date(sub.current_period_end * 1000),
  });
}

async function handleSubscriptionDeleted(sub: Stripe.Subscription) {
  const stripeCustomerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const userId = await userIdForCustomer(stripeCustomerId);
  if (!userId) return;

  await db()
    .update(subscriptions)
    .set({
      tier: "free",
      status: "canceled",
      stripeSubscriptionId: null,
      currentPeriodEnd: null,
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.userId, userId));
}

async function handleInvoicePaid(invoice: Stripe.Invoice) {
  const stripeCustomerId =
    typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
  if (!stripeCustomerId) return;
  const userId = await userIdForCustomer(stripeCustomerId);
  if (!userId) return;

  // Period rolled over — reset prompt counter.
  await db()
    .update(subscriptions)
    .set({
      promptsUsedThisPeriod: 0,
      status: "active",
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.userId, userId));
}

async function handleInvoiceFailed(invoice: Stripe.Invoice) {
  const stripeCustomerId =
    typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
  if (!stripeCustomerId) return;
  const userId = await userIdForCustomer(stripeCustomerId);
  if (!userId) return;

  await db()
    .update(subscriptions)
    .set({ status: "past_due", updatedAt: new Date() })
    .where(eq(subscriptions.userId, userId));
}

// ---- helpers ----

type SubStatus = "active" | "past_due" | "canceled" | "incomplete" | "trialing" | "unpaid";

/** Cloud-side subscription tiers. Matches the `subscription_tier` enum
 *  in the DB. Studio is desktop-only (licence keys, not Stripe subs). */
type SubTier = "free" | "pro" | "site" | "enterprise";

function mapStatus(s: Stripe.Subscription.Status): SubStatus {
  switch (s) {
    case "active":
    case "trialing":
    case "past_due":
    case "canceled":
    case "incomplete":
    case "unpaid":
      return s;
    case "incomplete_expired":
      return "canceled";
    case "paused":
      return "past_due";
    default:
      return "active";
  }
}

function tierFromPriceId(priceId: string | null): SubTier {
  if (!priceId) return "free";
  if (priceId === env.stripePriceProMonthly) return "pro";
  // Future cloud tiers (Site, Enterprise) plug in here once we mint
  // their Stripe Prices. Studio is desktop-only and never appears here.
  return "free";
}

async function userIdForCustomer(stripeCustomerId: string): Promise<string | null> {
  const rows = await db()
    .select({ userId: subscriptions.userId })
    .from(subscriptions)
    .where(eq(subscriptions.stripeCustomerId, stripeCustomerId))
    .limit(1);
  return rows[0]?.userId ?? null;
}

async function upsertSubscription(opts: {
  userId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string | null;
  tier: SubTier;
  status: SubStatus;
  currentPeriodEnd: Date | null;
}) {
  // Verify the user exists — defensive against orphaned events.
  const u = await db()
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, opts.userId))
    .limit(1);
  if (!u[0]) return;

  await db()
    .insert(subscriptions)
    .values({
      userId: opts.userId,
      stripeCustomerId: opts.stripeCustomerId,
      stripeSubscriptionId: opts.stripeSubscriptionId,
      tier: opts.tier,
      status: opts.status,
      currentPeriodEnd: opts.currentPeriodEnd,
    })
    .onConflictDoUpdate({
      target: subscriptions.userId,
      set: {
        stripeCustomerId: opts.stripeCustomerId,
        stripeSubscriptionId: opts.stripeSubscriptionId,
        tier: opts.tier,
        status: opts.status,
        currentPeriodEnd: opts.currentPeriodEnd,
        updatedAt: new Date(),
      },
    });
}
