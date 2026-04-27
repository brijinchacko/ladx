# ladX.ai

Local-first, ladder-first PLC AI agent. Three surfaces:

- **ladX.ai Cloud** (`apps/web`) — SaaS, Claude API
- **ladX.ai Studio** (`apps/desktop`) — Windows Tauri app, Ollama-only, air-gapped
- **Marketing site** (`apps/marketing`) — `www.ladx.ai`

Shared core in `packages/core` (Rust crates) and `packages/ui` (React).

See [`MASTER_BUILD_SPEC.md`](./MASTER_BUILD_SPEC.md) for the full build plan and [`CLAUDE.md`](./CLAUDE.md) for working rules.

## Quickstart

```bash
pnpm install
pnpm build
pnpm dev --filter=@ladx/web        # localhost:3000
pnpm dev --filter=@ladx/marketing  # localhost:3001
pnpm tauri:dev                     # opens Studio window
```

## Brand

- ink `#0F1A24`
- teal `#3FBFB5`
- white `#FFFFFF`

© Wartens Ltd. Proprietary.
