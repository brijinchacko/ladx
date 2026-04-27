# ladX.ai — Project Context

ladX.ai is a local-first, ladder-first PLC AI agent. Three surfaces:
- `apps/web` — Cloud SaaS, Next.js 15, OpenRouter (default) or Anthropic API
- `apps/desktop` — Windows Tauri app, Ollama-only, no cloud calls ever
- `apps/marketing` — Static site

Shared core in `packages/core` (Rust crates) and `packages/ui` (React).

## Critical rules

- **Desktop must never make outbound network calls.** No `fetch`, no `reqwest` to public domains, no telemetry. The only allowed network call is the one-time licence activation against `auth.ladx.ai`.
- **Every generated PLC code passes through validation before display.** matiec compile + iec-checker + PLCopen schema. No exceptions.
- **Audit log every prompt and every accepted output.** ALCOA+ compliance is a sales gate.
- **LADX brand:** ink `#0F1A24`, teal `#3FBFB5`, white `#FFFFFF`. Use design tokens from `@ladx/design-system`. Never hardcode colours.
- **Type safety is non-negotiable.** Rust types in `ladx-types` are the source of truth. Frontend imports from `@ladx/types` (auto-generated). Never hand-write types that mirror Rust structs.

## Workspace layout

- pnpm + Turborepo for JS/TS
- Cargo workspace at the repo root (`Cargo.toml`)
- See `MASTER_BUILD_SPEC.md` for the full directory tree

## Common commands

```bash
pnpm install                        # Install all workspace deps
pnpm dev                            # Run all dev servers (Turbo)
pnpm dev --filter=@ladx/web         # Run only web
pnpm tauri:dev                      # Run desktop (Tauri)
pnpm dev --filter=@ladx/marketing   # Run only marketing
pnpm build                          # Build everything
pnpm test                           # Run all tests
pnpm test:rust                      # cargo test --workspace + regenerate TS bindings
pnpm tauri:build                    # Tauri production build (signed installer)
```

## Don'ts

- Don't add localStorage/sessionStorage/IndexedDB to the desktop app — use Tauri filesystem APIs.
- Don't use `fetch()` in the desktop app — use `invoke()` for IPC, never HTTP.
- Don't bypass `lib/api.ts` — it's the surface-aware abstraction (Phase 1 onward).
- Don't import directly from `packages/types/src/generated/` — go via `@ladx/types`.
- Don't add new vendor connectors without an ADR. They have licensing and version implications.
- Don't add ESLint or Prettier — Biome is the only linter/formatter.

## Where to find things

- Architecture: `MASTER_BUILD_SPEC.md`
- ADRs: `docs/adr/` (Phase 1+)
- Sample PLC projects for testing: `tests/fixtures/` (Phase 1+)
- Prompt templates: `packages/core/crates/ladx-agents/prompts/` (Phase 1+)
- Document templates: `packages/core/crates/ladx-templates/templates/` (Phase 3+)
