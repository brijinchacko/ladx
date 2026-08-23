# apps/web — ladX.ai Cloud

Next.js 15 App Router. Hosted at ladx.ai. Serves both the public site and the authenticated web app.

Inference is **bring-your-own-key**: each user connects their own provider (OpenRouter by
default, plus Anthropic, OpenAI, or any OpenAI-compatible base URL). LADX holds no shared
inference key and does no metering — there is no billing layer.

## Conventions

- All API routes in `app/api/` use Next.js Route Handlers, not legacy pages/api.
- Native auth: email + bcrypt + Postgres-backed sessions. Cookie name `ladx_session`. Helpers in `lib/auth/`. Middleware does a cheap cookie-presence check; full session validation happens in route handlers via `getCurrentUser()` / `getApiUser()`.
- Protected routes are under `(app)/`. The middleware bounces unauthenticated HTML requests to `/sign-in?next=...` and returns `401` for `/api/*`.
- Database via Drizzle. Schema in `lib/db/schema.ts`. Run `pnpm db:generate` after schema changes.
- Streaming responses use Server-Sent Events via `lib/inference/stream.ts`.

## Routes that need auth (Phase 1+)
Anything under `(app)/` plus `/api/chat`, `/api/projects`, `/api/inference`, `/api/documents/*`.

## Routes that don't
`/api/activation` (uses licence key), and the public marketing routes.

## Things to never do
- Don't load PLC project files into Next.js memory — use the Rust parser via subprocess. PLC projects can be 50MB+.
- Don't store project file content in Postgres. Use S3 / R2 with signed URLs.
- Don't expose any inference API key to the client. Always proxy through `/api/inference`.
- Don't store a user's provider key in plaintext. It goes through `lib/crypto/secrets.ts`
  (AES-256-GCM envelope, key-id prefixed so the master key can rotate). Never log it, and
  never return it to the client — only a masked preview.
