# apps/web — ladX.ai Cloud

Next.js 15 App Router. Hosted at ladx.ai. Inference via OpenRouter (default) or Anthropic direct.

## Conventions

- All API routes in `app/api/` use Next.js Route Handlers, not legacy pages/api.
- Native auth: email + bcrypt + Postgres-backed sessions. Cookie name `ladx_session`. Helpers in `lib/auth/`. Middleware does a cheap cookie-presence check; full session validation happens in route handlers via `getCurrentUser()` / `getApiUser()`.
- Protected routes are under `(app)/`. The middleware bounces unauthenticated HTML requests to `/sign-in?next=...` and returns `401` for `/api/*`.
- Database via Drizzle. Schema in `lib/db/schema.ts`. Run `pnpm db:generate` after schema changes.
- Streaming responses use Server-Sent Events via `lib/inference/stream.ts`.

## Routes that need auth (Phase 1+)
Anything under `(app)/` plus `/api/chat`, `/api/projects`, `/api/inference`, `/api/documents/*`.

## Routes that don't
`/api/stripe/webhook` (validates signature instead), `/api/activation` (uses licence key).

## Stripe events to handle
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_failed`

## Things to never do
- Don't load PLC project files into Next.js memory — use the Rust parser via subprocess. PLC projects can be 50MB+.
- Don't store project file content in Postgres. Use S3 / R2 with signed URLs.
- Don't expose the inference API key to the client. Always proxy through `/api/inference`.
