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

  // Master key for the AES-256-GCM envelope that wraps each user's stored
  // provider keys. 32 bytes, hex-encoded. Rotating it is safe: every record
  // carries the id of the key that sealed it (see lib/crypto/secrets.ts).
  secretsKey: optional("LADX_SECRETS_KEY"),

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
  requireSecretsKey: () => required("LADX_SECRETS_KEY"),
} as const;
