# Deploying ladX.ai Cloud to a Hostinger VPS

This is the deployment sketch — actual rollout happens later when you're
ready. We're explicitly **not** using Vercel.

## Topology

Three subdomains, all served from the one VPS via Caddy:

| Domain | Process | Port |
|---|---|---|
| `www.ladx.ai` | `apps/marketing` (Next.js standalone) | `127.0.0.1:3001` |
| `ladx.ai` | `apps/web` (Next.js standalone) | `127.0.0.1:3000` |
| `auth.ladx.ai` | same as `ladx.ai` (just the `/api/activation` route) | `127.0.0.1:3000` |

Postgres runs locally on the same VPS for low-latency, with a daily
`pg_dump` to a private S3-compatible bucket for backup. R2 (Cloudflare)
stays as the project-file blob store — no reason to host that on the VPS.

## Server prep

```bash
# Hostinger gives you a clean Ubuntu 22.04 / 24.04 box. SSH in then:
sudo apt update && sudo apt upgrade -y
sudo apt install -y build-essential curl git ufw fail2ban postgresql postgresql-contrib

# Lock down — only SSH + HTTPS open
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable

# Node 22 via nvm (keeps it user-scoped, easy to upgrade)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.nvm/nvm.sh
nvm install 22
corepack enable
corepack prepare pnpm@9.12.0 --activate

# Rust (for the parser + validator binaries)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source ~/.cargo/env

# Caddy 2 — auto-TLS via Let's Encrypt
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install caddy
```

## Postgres

```bash
sudo -u postgres psql <<'EOF'
CREATE USER ladx WITH PASSWORD 'CHANGE-ME-PROD';
CREATE DATABASE ladx OWNER ladx;
EOF
# Use the resulting connection string in apps/web/.env.production.local:
#   DATABASE_URL=postgres://ladx:CHANGE-ME-PROD@127.0.0.1:5432/ladx
```

## Building on the VPS

```bash
cd /opt && sudo git clone https://github.com/wartens/ladx.git ladx
sudo chown -R $USER:$USER /opt/ladx
cd /opt/ladx
pnpm install --frozen-lockfile
cargo build --release --bin ladx-parser --bin ladx-validate
pnpm --filter=@ladx/web build
pnpm --filter=@ladx/marketing build
# Web: outputs .next/standalone — that's what we run.
```

## systemd units

```ini
# /etc/systemd/system/ladx-web.service
[Unit]
Description=ladX Cloud (Next.js)
After=network.target postgresql.service

[Service]
Type=simple
User=ladx
WorkingDirectory=/opt/ladx/apps/web
EnvironmentFile=/opt/ladx/apps/web/.env.production.local
ExecStart=/home/ladx/.nvm/versions/node/v22.22.0/bin/node .next/standalone/apps/web/server.js
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
```

```ini
# /etc/systemd/system/ladx-marketing.service
[Unit]
Description=ladX marketing site
After=network.target

[Service]
Type=simple
User=ladx
WorkingDirectory=/opt/ladx/apps/marketing
EnvironmentFile=/opt/ladx/apps/marketing/.env.production.local
ExecStart=/home/ladx/.nvm/versions/node/v22.22.0/bin/node .next/standalone/apps/marketing/server.js
Environment=PORT=3001
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now ladx-web ladx-marketing
```

> Note: Next.js standalone output requires `output: 'standalone'` in
> `next.config.ts`. Currently the web app uses default. Add this when we
> wire the actual deploy:
>
> ```ts
> const config: NextConfig = { ...config, output: "standalone" };
> ```

## Caddyfile

```caddy
# /etc/caddy/Caddyfile
ladx.ai, auth.ladx.ai {
    reverse_proxy 127.0.0.1:3000
    encode gzip
    header {
        Strict-Transport-Security "max-age=63072000; includeSubDomains; preload"
        X-Content-Type-Options nosniff
        Referrer-Policy strict-origin-when-cross-origin
    }
}

www.ladx.ai {
    reverse_proxy 127.0.0.1:3001
    encode gzip
}

# Bare apex → www
ladx.ai {
    redir https://www.ladx.ai{uri} permanent
}
```

`sudo systemctl reload caddy`. Let's Encrypt auto-issues. DNS at Hostinger:
A records for `@`, `www`, `auth` all pointing at the VPS IP.

## Stripe webhook

Update the Stripe dashboard webhook endpoint to
`https://ladx.ai/api/webhooks/stripe` (already correct in the user's
config — they set this up when wiring Phase 1I).

## Deploy script

```bash
# /opt/ladx/scripts/deploy.sh
#!/usr/bin/env bash
set -euo pipefail
cd /opt/ladx
git pull --ff-only
pnpm install --frozen-lockfile
cargo build --release --bin ladx-parser --bin ladx-validate
pnpm --filter=@ladx/web build
pnpm --filter=@ladx/marketing build
sudo systemctl restart ladx-web ladx-marketing
```

Make it executable, then `./scripts/deploy.sh` from any push. Wire to a
GitHub Action later for true CD.

## What still needs deciding before going live

- **Domain DNS** — point `ladx.ai`, `www.ladx.ai`, `auth.ladx.ai` at the
  VPS A record.
- **Resend domain verification** — once `ladx.ai` is verified at
  resend.com/domains, set `LADX_FROM_EMAIL="ladX.ai <noreply@ladx.ai>"`
  in `.env.production.local` so we can email any user (currently locked
  to the Resend account-owner address).
- **Backups** — daily `pg_dump`, weekly `.ladx-storage/` snapshot
  (uploads/files), both pushed to off-VPS storage.
- **Monitoring** — at minimum, a uptime ping on `ladx.ai/` and a Stripe
  webhook delivery dashboard alert.
