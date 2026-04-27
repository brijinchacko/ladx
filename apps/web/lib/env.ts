// Single env-var gateway. Throws at boot if a *required* value is missing,
// returns `undefined` for optional ones. Phase 1 leaves most as optional so
// the app can build and dev-run without keys.

function optional(key: string): string | undefined {
  const v = process.env[key];
  return v && v.length > 0 ? v : undefined;
}

function required(key: string): string {
  const v = optional(key);
  if (!v) {
    throw new Error(
      `Missing required env var ${key}. See .env.example. Phase 1 dev mode tolerates most missing keys but this one is load-bearing.`,
    );
  }
  return v;
}

export const env = {
  databaseUrl: optional("DATABASE_URL"),
  openrouterApiKey: optional("OPENROUTER_API_KEY"),
  anthropicApiKey: optional("ANTHROPIC_API_KEY"),
  stripeSecretKey: optional("STRIPE_SECRET_KEY"),
  stripeWebhookSecret: optional("STRIPE_WEBHOOK_SECRET"),
  stripePublishableKey: optional("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"),
  stripePriceProMonthly: optional("STRIPE_PRICE_PRO_MONTHLY"),
  stripePriceStudioYearly: optional("STRIPE_PRICE_STUDIO_YEARLY"),
  r2: {
    accountId: optional("R2_ACCOUNT_ID"),
    accessKeyId: optional("R2_ACCESS_KEY_ID"),
    secretAccessKey: optional("R2_SECRET_ACCESS_KEY"),
    bucket: optional("R2_BUCKET"),
  },
  resendApiKey: optional("RESEND_API_KEY"),
  fromEmail: optional("LADX_FROM_EMAIL") ?? "ladX.ai <onboarding@resend.dev>",
  appUrl: optional("NEXT_PUBLIC_APP_URL") ?? "http://localhost:3000",
  posthogKey: optional("NEXT_PUBLIC_POSTHOG_KEY"),

  // Asserts; call from API routes that need a specific service.
  requireDatabaseUrl: () => required("DATABASE_URL"),
  requireOpenRouter: () => required("OPENROUTER_API_KEY"),
  requireResend: () => required("RESEND_API_KEY"),
  requireStripe: () => ({
    secret: required("STRIPE_SECRET_KEY"),
    webhookSecret: required("STRIPE_WEBHOOK_SECRET"),
  }),
} as const;
