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
| Host | `root@72.62.230.223`, key-only SSH (`~/.ssh/seekof_deploy`) |
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

**The server is not a git checkout.** `/var/www/ladx-ai` is an rsync target
owned by uid 501, with no `.git` in it. Deploying is a file sync from a local
clone, so commit locally first and sync the working tree.

Two paths on the server exist only there and must never be overwritten or
deleted: `apps/web/.env.production`, which holds the database URL and the
secrets, and `.next-build`, the running build output. Both are excluded below,
and rsync protects excluded paths from `--delete`, so they survive.

Back up first. There is no git history on the box to fall back to:

```bash
ssh -i ~/.ssh/seekof_deploy root@72.62.230.223 'cd /var/www && STAMP=$(date +%Y%m%d-%H%M%S) && tar czf /root/ladx-ai-source-$STAMP.tar.gz --exclude=node_modules --exclude=.next-build --exclude=target ladx-ai && cp -a ladx-ai/apps/web/.next-build /root/ladx-next-build-$STAMP && echo $STAMP'
```

Dry run the sync and read what it would delete. Expect nothing:

```bash
rsync -azn --delete --out-format='%o %n' -e "ssh -i ~/.ssh/seekof_deploy" --exclude='.git/' --exclude='node_modules/' --exclude='.next/' --exclude='.next-build/' --exclude='target/' --exclude='.env' --exclude='.env.*' --exclude='.turbo/' --exclude='*.log' ./ root@72.62.230.223:/var/www/ladx-ai/ | grep '^del'
```

Then sync for real, dropping the `n` from `-azn`:

```bash
rsync -az --delete --stats -e "ssh -i ~/.ssh/seekof_deploy" --exclude='.git/' --exclude='node_modules/' --exclude='.next/' --exclude='.next-build/' --exclude='target/' --exclude='.env' --exclude='.env.*' --exclude='.turbo/' --exclude='*.log' ./ root@72.62.230.223:/var/www/ladx-ai/
```

The rest runs on the server. Node is under nvm and is not on the default PATH
for a non-login shell, so every remote command has to put it there:

```bash
ssh -i ~/.ssh/seekof_deploy root@72.62.230.223
```

```bash
export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH"
cd /var/www/ladx-ai && pnpm install --frozen-lockfile
```

Migrate before building, because the new code requires the new schema while the
old code is happily ignoring it. `drizzle-kit` reads the environment, not the
`.env.production` file, so source it:

```bash
cd /var/www/ladx-ai/apps/web && set -a && . ./.env.production && set +a && pnpm db:migrate
```

`relation "__drizzle_migrations" already exists, skipping` in the output is
normal and is followed by the success line.

```bash
cd /var/www/ladx-ai && NODE_ENV=production pnpm build --filter=@ladx/web
```

Turbo prints `no output files found for task @ladx/web#build` at the end. That
is a `turbo.json` `outputs` mismatch against the custom `distDir`, not a failed
build; check the route table printed above it instead.

```bash
pm2 reload ladx-web --update-env
```

`reload` rather than `restart`: it re-reads the environment and leaves every
other process untouched. Never `pm2 restart all`.

nginx only needs touching if `deploy/nginx-ladx.ai.conf` changed:

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
schema. That makes rollback a code-only operation, and with no git on the box it
is done from the backup taken before the deploy:

```bash
ssh -i ~/.ssh/seekof_deploy root@72.62.230.223 'ls -t /root/ladx-ai-source-*.tar.gz | head -3 && ls -td /root/ladx-next-build-* | head -3'
```

The fastest route back is the saved build, which needs no rebuild at all:

```bash
export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH"
rm -rf /var/www/ladx-ai/apps/web/.next-build
cp -a /root/ladx-next-build-<STAMP> /var/www/ladx-ai/apps/web/.next-build
pm2 reload ladx-web --update-env
```

Restore the source tarball as well if the source itself is the problem, then
`pnpm install --frozen-lockfile` and rebuild. Alternatively re-sync from a local
clone checked out at the previous commit, which is the same rsync as above.

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
