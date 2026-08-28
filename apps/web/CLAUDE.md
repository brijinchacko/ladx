# apps/web, ladX.ai Cloud

Next.js 15 App Router. Hosted at ladx.ai. Serves both the public site and the authenticated web app.

Inference is **bring-your-own-key**: each user connects their own provider (OpenRouter by
default, plus Anthropic, OpenAI, or any OpenAI-compatible base URL). LADX holds no shared
inference key and does no metering, there is no billing layer.

## Conventions

- All API routes in `app/api/` use Next.js Route Handlers, not legacy pages/api.
- Native auth: email + bcrypt + Postgres-backed sessions. Cookie name `ladx_session`. Helpers in `lib/auth/`. Middleware does a cheap cookie-presence check; full session validation happens in route handlers via `getCurrentUser()` / `getApiUser()`.
- Protected pages are under `(studio)/`, served at `/studio`. The middleware bounces unauthenticated HTML requests to `/sign-in?next=...` and returns `401` for `/api/*`.
- Database via Drizzle. Schema in `lib/db/schema.ts`. Run `pnpm db:generate` after schema changes.
- Streaming responses use Server-Sent Events via `lib/inference/stream.ts`.

## Auth: the default is closed

**Every** `/api/*` route requires a session unless it is on the public allow
list in `middleware.ts`. Adding an API route does not mean adding it to a
protected list; it means it is already protected, and making it public is the
edit somebody has to justify.

Public today: `/api/auth/*` (sign-in itself), `/api/activation` (a licence key
rather than a session), `/api/contact`, `/api/indexnow` (does its own bearer
check, so a deploy script can call it and a signed-in user cannot),
`/api/metrics/ingest` (posted by the middleware with a derived token), and
`/api/templates/*` (the template library is deliberately account free, and
gating its download would make the most linkable pages on the site useless).

Pages are the other way round: everything is public except `/studio`, which is
one prefix rather than a list that grows with every tool.

## Things to never do
- Don't load PLC project files into Next.js memory, use the Rust parser via subprocess. PLC projects can be 50MB+.
- Don't store project file content in Postgres. Use S3 / R2 with signed URLs.
- Don't expose any inference API key to the client. Always proxy through `/api/inference`.
- Don't store a user's provider key in plaintext. It goes through `lib/crypto/secrets.ts`
  (AES-256-GCM envelope, key-id prefixed so the master key can rotate). Never log it, and
  never return it to the client, only a masked preview.
