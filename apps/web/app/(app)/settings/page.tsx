import { ManageBillingButton, UpgradeButton } from "@/components/billing-actions";
import { requireUser } from "@/lib/auth/server";
import { FREE_PROMPT_QUOTA, checkQuota } from "@/lib/db/subscriptions";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

interface SettingsPageProps {
  searchParams: Promise<{ checkout?: string; billing?: string }>;
}

const TIER_LABELS: Record<string, string> = {
  free: "Free",
  pro: "Pro",
  site: "Site",
  enterprise: "Enterprise",
};

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const user = await requireUser();
  const quota = await checkQuota(user.id);
  const params = await searchParams;
  const stripeConfigured = !!env.stripeSecretKey;

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight mb-2">Settings</h1>
        <p className="text-ink-500">Account, billing, and usage.</p>
      </header>

      {params.checkout === "success" && (
        <div className="rounded-md border border-teal/30 bg-teal-50 px-4 py-3 text-sm text-ink-700">
          Subscription confirmed — welcome to Pro. Your tier may take a few seconds to update while
          Stripe sends the webhook.
        </div>
      )}
      {params.billing === "price_not_configured" && (
        <div className="rounded-md border border-warning/30 bg-warning/5 px-4 py-3 text-sm text-warning">
          Pricing isn't configured yet — set <code>STRIPE_PRICE_PRO_MONTHLY</code> in env.
        </div>
      )}

      <section className="border border-ink-100 rounded-lg p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Account</h2>
            <p className="text-sm text-ink-500">{user.email}</p>
            {user.displayName && <p className="text-sm text-ink-500">{user.displayName}</p>}
          </div>
        </div>
      </section>

      <section className="border border-ink-100 rounded-lg p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Subscription</h2>
            <p className="text-sm text-ink-500">
              Tier: <span className="font-medium text-ink-900">{TIER_LABELS[quota.tier]}</span>
            </p>
            {quota.tier === "free" ? (
              <p className="text-sm text-ink-500 mt-2">
                {quota.used} / {FREE_PROMPT_QUOTA} prompts used this month.
              </p>
            ) : (
              <p className="text-sm text-ink-500 mt-2">
                {quota.used} prompts used this period · unlimited.
              </p>
            )}
          </div>
          {stripeConfigured ? (
            quota.tier === "free" ? (
              <UpgradeButton tier="pro" label="Upgrade to Pro" />
            ) : (
              <ManageBillingButton />
            )
          ) : (
            <p className="text-xs text-ink-400 max-w-xs text-right">
              Stripe not configured. Set STRIPE_SECRET_KEY in env.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
