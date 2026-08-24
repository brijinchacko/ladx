# Deploying ladx.ai

The live runbook. `deploy-hostinger.md` is the original green-field sketch and
describes a Caddy topology that was never built; this is what the box actually
runs.

## What is on the box

`ladx.ai` is one of eighteen apps on a shared Hostinger VPS. Everything below is
scoped to LADX by name, on purpose. **No broadcast commands.** `pm2 restart all`
and `systemctl restart nginx` would take the neighbours down with us.

| Thing | Value |
|---|---|
| Host | `root@72.62.230.223`, key-only SSH |
| App root | `/var/www/ladx-ai` |
| Process | PM2 `ladx-web`, fork mode, `next start -p 3020` |
| Bind | `127.0.0.1:3020`, never exposed directly |
| Proxy | nginx, vhost `ladx.ai` → `127.0.0.1:3020` |
| TLS | Let's Encrypt via certbot, `/etc/letsencrypt/live/ladx.ai/` |
| Database | Postgres on the same host, database `ladx_ai`, role `ladx_ai` |
| Logs | `/var/log/ladx/{out,error}.log` |
| Build output | `.next-build`, not `.next` (see below) |

`next.config.ts` sets `distDir` to `.next-build` under `NODE_ENV=production`.
That exists because a production build in the same tree as a running dev server
used to clobber `.next` and break both. Do not "simplify" it away.

## Before anything else

```bash
ssh root@72.62.230.223 'pm2 list && df -h / && free -m'
```

The box runs close to its memory ceiling and is into swap. If free memory is
tight, build with the app stopped rather than alongside it.

## What this release changes

Two schema migrations, both additive and backward compatible, so they are safe
to apply **before** the new code goes live:

- `0010_hesitant_warbird` — adds nullable `projects.brief` (jsonb). The design
  basis. Old code ignores an unknown column.
- `0011_windy_hydra` — adds the `ladder_programs` table. Nothing reads it yet on
  the running version.

Order matters in one direction only: the new code **requires** both. Deploying
code before migrating would 500 every project page on the missing `brief`
column. Migrate first.

## Deploy

```bash
ssh root@72.62.230.223
```

```bash
cd /var/www/ladx-ai
git fetch origin && git status --short
```

Expect a clean tree. If it is dirty, something was hand-edited on the server;
find out what before continuing rather than discarding it.

```bash
git pull --ff-only origin main
pnpm install --frozen-lockfile
```

Migrate, then build, then reload:

```bash
cd /var/www/ladx-ai/apps/web
pnpm db:migrate
```

```bash
cd /var/www/ladx-ai && pnpm build --filter=@ladx/web
```

```bash
pm2 reload ladx-web --update-env
```

`reload` rather than `restart`: fork mode still drops connections briefly, but
it re-reads the environment and leaves every other process untouched. Never
`pm2 restart all`.

nginx only needs touching if `deploy/nginx-ladx.ai.conf` changed. It has not in
this release. If it ever does:

```bash
nginx -t && systemctl reload nginx
```

Reload, never restart.

## Verify

```bash
pm2 describe ladx-web | head -20
curl -sS -o /dev/null -w '%{http_code}\n' https://ladx.ai/
curl -sS -o /dev/null -w '%{http_code}\n' https://ladx.ai/sign-in
curl -sS -o /dev/null -w '%{http_code}\n' https://ladx.ai/documents
```

Signed-in surfaces need a session, so check them in a browser: a project page
(the design basis panel should render, empty), `/studio/monitor`, and
`/studio/cad`.

Then confirm the neighbours are still up:

```bash
pm2 list
```

Every process that was `online` before must still be `online`, with its restart
count unchanged.

## Rolling back

The migrations are additive, so the previous release runs fine against the new
schema. That makes rollback a code-only operation:

```bash
cd /var/www/ladx-ai
git log --oneline -5
git checkout <previous-sha>
pnpm install --frozen-lockfile
pnpm build --filter=@ladx/web
pm2 reload ladx-web --update-env
```

Do not roll the migrations back. Dropping `projects.brief` would destroy design
basis data that the newer code wrote, and there is no reason to: an unused
column and an unused table cost nothing.

## Outstanding, and not fixed by this deploy

- **The leaked credentials are still live.** An OpenRouter key and an SMTP
  password were publicly downloadable for months, and a further OpenRouter key
  was pasted into a chat transcript. Rotate all three. This is the oldest open
  item and it is not a code change.
- **`ladx_ai` can connect to the neighbours' databases.** Postgres grants
  `CONNECT` to `PUBLIC` by default, so the role can open the other databases on
  the host and list their table names, though `SELECT` is denied. Fixing it
  means `REVOKE CONNECT ... FROM PUBLIC` on databases this project does not own,
  which touches other people's apps, so it is deliberately left for a moment
  when their owners can be told.
- **No privacy policy.** A cookie policy exists; a privacy policy does not.
