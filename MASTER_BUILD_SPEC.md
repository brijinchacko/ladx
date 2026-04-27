# LADX MASTER BUILD SPEC

> **The single source of truth for building ladX.ai — Cloud (web) + Studio (Windows desktop) + Marketing site.**
> Drop this file in your repo as `MASTER_BUILD_SPEC.md`. Reference it from `CLAUDE.md`. Build phase by phase.

**Prepared for:** Brijin Chacko (JBC), CEO, Wartens Ltd
**Date:** 27 April 2026
**Brand:** LADX — ink `#0F1A24`, teal `#3FBFB5`, white `#FFFFFF`

---

## Table of Contents

1. [Executive Overview](#1-executive-overview)
2. [Architecture Decisions Log](#2-architecture-decisions-log)
3. [Repository Structure](#3-repository-structure)
4. [Technology Stack](#4-technology-stack)
5. [The CLAUDE.md Hierarchy](#5-the-claudemd-hierarchy)
6. [Type Sharing Pattern](#6-type-sharing-pattern-rust--typescript)
7. [Phase-by-Phase Build Plan](#7-phase-by-phase-build-plan)
   - [Phase 0: Foundation](#phase-0--foundation-weeks-1-3)
   - [Phase 1: Web MVP](#phase-1--web-mvp-weeks-4-10)
   - [Phase 2: Desktop MVP](#phase-2--desktop-mvp-siemens-only-weeks-8-18)
   - [Phase 3: Multi-vendor + Memory + Documents](#phase-3--multi-vendor--memory--documents-weeks-18-26)
   - [Phase 4: Regulatory templates + HMI](#phase-4--regulatory-templates--hmi-weeks-26-40)
   - [Phase 5: Enterprise add-ons](#phase-5--enterprise-add-ons-weeks-40)
8. [Workflows](#8-workflows)
9. [Build/Test/Deploy Commands](#9-buildtestdeploy-commands)
10. [Risk Register](#10-risk-register)
11. [Appendix — Starter Snippets](#11-appendix--starter-snippets)

---

## 1. Executive Overview

ladX.ai is a **local-first, ladder-first, vendor-IDE-integrated PLC AI agent** delivered through three surfaces:

| Surface | Path | Audience | Inference |
|---|---|---|---|
| **ladX.ai Cloud** | `apps/web` → `ladx.ai` | Engineers, students, non-regulated work | Claude API |
| **ladX.ai Studio** | `apps/desktop` → Windows installer | SIs, OEMs, regulated customers | Ollama (local, mandatory) |
| **Marketing site** | `apps/marketing` → `www.ladx.ai` | Acquisition | Static |

**Shared core:** ~70% of code lives in `packages/core` (Rust workspace) and `packages/ui` (React components). The two product surfaces diverge only at inference target, storage backend, and IDE integration.

**Capabilities the system must deliver:**

- PLC code generation (ladder + ST) for Siemens TIA, Rockwell L5X, Beckhoff TwinCAT, CODESYS
- HMI co-generation for Ignition Perspective, WinCC Unified, TwinCAT HMI, FactoryTalk View
- Document generation: FDS, FAT, SAT, BOM, I/O lists, manuals, control narrative, alarm philosophy, SIL/PL evidence
- Project Memory with auto-learn, explicit teach, forbidden patterns, optional LoRA fine-tuning
- Cross-vendor migration
- Tag drift detection, handover pack export, change-driven document regeneration

**The non-negotiables:**

- Desktop is **air-gapped capable**. Zero outbound network calls. Ollama mandatory.
- Cloud-stored data is **opt-in** with one-click erasure.
- Every generated artefact passes **deterministic validation** (matiec, schema, vendor compiler) before display.
- **Audit log** records every prompt, retrieval, model output, validator result, human approval — for ALCOA+ compliance.

---

## 2. Architecture Decisions Log

These decisions are load-bearing. Changing one cascades into the rest. Document the rationale here so future contributors (and Claude Code in future sessions) understand why.

### ADR-001: Monorepo with pnpm + Turborepo + Cargo workspace
**Decision:** One repository, two workspace systems coexisting. pnpm + Turborepo for JS/TS, Cargo workspace for Rust. Tauri's `src-tauri/` is a member of the Cargo workspace, not a separate Rust project.
**Rationale:** Avoids version drift between web and desktop frontends. Shared Rust crates compile once for desktop (native) and web (WASM/native server). Shared UI components don't get duplicated.
**Alternative rejected:** Separate repos. Costs months in shared-code synchronisation overhead.

### ADR-002: Tauri 2.0, not Electron, not WPF
**Decision:** Tauri 2.0 with Next.js frontend.
**Rationale:** ~10MB binary vs Electron's 150MB+. Native COM interop via Rust. Same Next.js codebase for web and desktop. WPF would force off the React stack and lose the web reuse.
**Trade-off:** Rust learning curve. Mitigated by keeping Rust surface small (COM, Ollama orchestration, vendor parsers).

### ADR-003: Next.js 15 App Router, SSG mode for desktop, full mode for web
**Decision:** Same Next.js codebase compiled differently. Web uses SSR + API routes. Desktop uses `output: 'export'` (SSG) + Tauri commands instead of API routes.
**Rationale:** Tauri requires static export. Conditional API layer (`lib/api.ts`) routes to either `fetch('/api/...')` (web) or `invoke('command_name', ...)` (desktop) at runtime via a feature flag.

### ADR-004: ts-rs for type sharing
**Decision:** Rust structs in `packages/core/crates/ladx-types` derive `ts_rs::TS` and export to `packages/types/generated/`. Frontend imports from `@ladx/types`.
**Rationale:** Single source of truth. Compile-time errors when Rust types diverge from TypeScript expectations. Generated on `cargo test`, runs in CI.
**Alternative considered:** taurpc (uses Specta). Better DX but newer, smaller community. Revisit at Phase 4 if ts-rs becomes friction.

### ADR-005: Ollama for desktop, Claude API for web, no fallback between them
**Decision:** Desktop is Ollama-only (Qwen2.5-Coder primary). Web is Claude API only. No "use cloud as fallback when local is slow" — that violates the desktop's air-gap promise.
**Rationale:** The privacy contract is the entire desktop USP. A fallback breaks it. Sell the cloud product to people who are OK with cloud; sell the desktop to people who aren't.

### ADR-006: LanceDB embedded for desktop, Postgres + pgvector for cloud
**Decision:** Embedded vector DB on desktop (no server process). Postgres + pgvector on cloud (managed). Same retrieval logic via trait abstraction in `ladx-rag`.
**Rationale:** Desktop must work offline with zero infrastructure. Cloud benefits from managed Postgres for billing-tied data.

### ADR-007: Drizzle ORM, not Prisma
**Decision:** Drizzle for cloud Postgres.
**Rationale:** Edge-runtime compatible. Smaller bundle. Type-safe SQL without schema mismatch. Prisma's runtime overhead and Vercel edge incompatibility are real frictions in 2026.

### ADR-008: Clerk for auth, Stripe for billing — cloud only
**Decision:** Clerk handles auth on web. Stripe handles subscriptions. Desktop uses licence keys validated against a tiny activation endpoint (`auth.ladx.ai/activate`).
**Rationale:** Desktop must work offline; can't depend on Clerk session refresh. Activation is a one-time online check; all subsequent runs are offline.

### ADR-009: Vendor connectors as Rust crates with COM/PInvoke
**Decision:** One crate per vendor (`ladx-vendor-siemens`, `ladx-vendor-rockwell`, etc). COM interop via the `windows` crate for Siemens TIA Openness and Beckhoff TwinCAT. .NET interop via `netcorehost` for Rockwell L5Sharp. Python subprocess for CODESYS ScriptEngine.
**Rationale:** Native, fast, no Python runtime to ship for the user. Desktop binary stays small.

### ADR-010: shadcn/ui + Tailwind with LADX design tokens
**Decision:** shadcn/ui copied into `packages/ui` (not as a dep — that's how shadcn works). Tailwind config in `packages/design-system` with LADX colour tokens.
**Rationale:** Consistent UI between web and desktop. Brand control. shadcn copy-not-import means we own the components.

### ADR-011: Audit log as append-only SQLite (desktop) and Postgres table (cloud)
**Decision:** `ladx-audit` crate provides a unified API. Desktop writes to `%APPDATA%\ladX\audit.db`. Cloud writes to a Postgres table with `WORM` (write-once, read-many) semantics enforced at the DB level.
**Rationale:** ALCOA+ compliance requires immutable record. Critical for pharma sales conversations.

### ADR-012: matiec + iec-checker as bundled Win32/Linux binaries
**Decision:** Pre-compiled matiec and iec-checker binaries shipped with the desktop installer. Cloud runs them in Lambda/container.
**Rationale:** Asking users to install matiec is a deal-breaker. Bundled binaries are ~10MB total — acceptable.

### ADR-013: One repo, multiple CLAUDE.md files
**Decision:** Root CLAUDE.md is the brief project overview. Each `apps/*` and meaningful `packages/*` directory has its own CLAUDE.md with specifics. Claude Code reads parent + current automatically.
**Rationale:** Keeps the root file focused. Per-directory rules don't bloat irrelevant sessions.

---

## 3. Repository Structure

The full directory tree. Treat this as canonical — don't deviate without updating this section.

```
ladx/
├── CLAUDE.md                          # Root context (brief, broad rules)
├── README.md                          # Public-facing intro
├── MASTER_BUILD_SPEC.md               # This document
├── ARCHITECTURE.md                    # Architecture overview (longer than CLAUDE.md)
├── package.json                       # pnpm workspace root
├── pnpm-workspace.yaml                # Lists all JS/TS workspaces
├── turbo.json                         # Turborepo task pipeline
├── Cargo.toml                         # Rust workspace manifest
├── tsconfig.base.json                 # Shared TS config
├── .claudeignore                      # Files Claude Code ignores
├── .gitignore
├── .env.example
├── biome.json                         # Linter/formatter (replaces ESLint+Prettier)
│
├── apps/
│   ├── web/                           # ladX.ai Cloud (SaaS)
│   │   ├── CLAUDE.md
│   │   ├── package.json
│   │   ├── next.config.ts             # SSR mode
│   │   ├── tsconfig.json
│   │   ├── app/                       # Next.js 15 App Router
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx               # /
│   │   │   ├── (marketing)/
│   │   │   │   ├── pricing/page.tsx
│   │   │   │   ├── docs/[slug]/page.tsx
│   │   │   │   └── blog/[slug]/page.tsx
│   │   │   ├── (auth)/
│   │   │   │   ├── sign-in/[[...sign-in]]/page.tsx
│   │   │   │   └── sign-up/[[...sign-up]]/page.tsx
│   │   │   ├── (app)/
│   │   │   │   ├── layout.tsx         # Authenticated shell
│   │   │   │   ├── chat/[projectId]/page.tsx
│   │   │   │   ├── projects/page.tsx
│   │   │   │   ├── projects/[id]/page.tsx
│   │   │   │   ├── documents/[id]/page.tsx
│   │   │   │   ├── memory/page.tsx
│   │   │   │   └── settings/page.tsx
│   │   │   └── api/
│   │   │       ├── chat/route.ts      # SSE streaming chat
│   │   │       ├── projects/route.ts
│   │   │       ├── projects/[id]/parse/route.ts
│   │   │       ├── inference/route.ts
│   │   │       ├── documents/[id]/generate/route.ts
│   │   │       ├── stripe/webhook/route.ts
│   │   │       └── activation/route.ts # Desktop licence check
│   │   ├── lib/
│   │   │   ├── api.ts                 # Surface-aware API client
│   │   │   ├── auth.ts                # Clerk helpers
│   │   │   ├── stripe.ts
│   │   │   ├── inference/
│   │   │   │   ├── claude.ts
│   │   │   │   └── stream.ts
│   │   │   ├── parse/
│   │   │   │   └── server.ts          # Calls ladx-parsers via subprocess or WASM
│   │   │   └── db/
│   │   │       ├── schema.ts          # Drizzle schema
│   │   │       ├── client.ts
│   │   │       └── migrations/
│   │   ├── components/                # Web-only UI (marketing, billing, etc.)
│   │   ├── public/
│   │   └── tests/
│   │
│   ├── desktop/                       # ladX.ai Studio (Tauri)
│   │   ├── CLAUDE.md
│   │   ├── package.json
│   │   ├── next.config.ts             # output: 'export' (SSG)
│   │   ├── tsconfig.json
│   │   ├── app/                       # Re-uses web layout where possible
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx               # Project list
│   │   │   ├── chat/[projectId]/page.tsx
│   │   │   ├── projects/[id]/page.tsx
│   │   │   ├── documents/[id]/page.tsx
│   │   │   ├── memory/page.tsx
│   │   │   └── settings/
│   │   │       ├── models/page.tsx    # Ollama model picker
│   │   │       ├── vendors/page.tsx   # Vendor pack management
│   │   │       └── licence/page.tsx
│   │   ├── lib/
│   │   │   ├── api.ts                 # Tauri-mode API client
│   │   │   ├── invoke.ts              # Typed wrappers around Tauri commands
│   │   │   └── ollama/                # Ollama lifecycle helpers
│   │   ├── components/                # Desktop-only UI
│   │   ├── public/
│   │   └── src-tauri/                 # Rust Tauri shell
│   │       ├── CLAUDE.md
│   │       ├── Cargo.toml
│   │       ├── tauri.conf.json
│   │       ├── build.rs
│   │       ├── capabilities/
│   │       │   ├── default.json
│   │       │   └── desktop.json
│   │       ├── icons/
│   │       ├── resources/             # Bundled binaries (matiec, iec-checker)
│   │       │   ├── matiec.exe
│   │       │   └── iec-checker.exe
│   │       └── src/
│   │           ├── lib.rs             # Mobile entry (unused for v1)
│   │           ├── main.rs            # Desktop entry
│   │           ├── commands/          # Tauri command handlers (one file per domain)
│   │           │   ├── mod.rs
│   │           │   ├── projects.rs
│   │           │   ├── chat.rs
│   │           │   ├── inference.rs
│   │           │   ├── documents.rs
│   │           │   ├── memory.rs
│   │           │   ├── vendor.rs
│   │           │   └── licence.rs
│   │           ├── ollama/
│   │           │   ├── mod.rs
│   │           │   ├── client.rs
│   │           │   ├── lifecycle.rs   # Detect / start / stop Ollama
│   │           │   └── models.rs
│   │           ├── memory/
│   │           │   ├── mod.rs
│   │           │   └── lance.rs       # LanceDB wrapper
│   │           ├── audit.rs           # SQLite audit log
│   │           └── state.rs           # Tauri state container
│   │
│   └── marketing/                     # www.ladx.ai (static)
│       ├── CLAUDE.md
│       ├── package.json
│       ├── next.config.ts
│       ├── app/
│       │   ├── page.tsx               # Hero with cable-pull demo
│       │   ├── pricing/page.tsx
│       │   ├── docs/[...slug]/page.tsx
│       │   ├── blog/[slug]/page.tsx
│       │   └── changelog/page.tsx
│       └── content/                   # MDX
│
├── packages/
│   ├── core/                          # Rust workspace root for shared crates
│   │   ├── CLAUDE.md
│   │   ├── Cargo.toml
│   │   └── crates/
│   │       ├── ladx-types/            # Shared types with ts-rs derive
│   │       │   ├── src/
│   │       │   │   ├── lib.rs
│   │       │   │   ├── project.rs
│   │       │   │   ├── tag.rs
│   │       │   │   ├── plc.rs
│   │       │   │   ├── hmi.rs
│   │       │   │   ├── document.rs
│   │       │   │   ├── memory.rs
│   │       │   │   └── audit.rs
│   │       │   └── tests/
│   │       │       └── export_bindings.rs
│   │       │
│   │       ├── ladx-parsers/          # PLC project parsers
│   │       │   ├── CLAUDE.md
│   │       │   └── src/
│   │       │       ├── lib.rs
│   │       │       ├── plcopen/       # PLCopen TC6 XML
│   │       │       ├── l5x/           # Rockwell L5X
│   │       │       ├── tia/           # Siemens TIA XML
│   │       │       ├── twincat/       # Beckhoff TwinCAT
│   │       │       └── codesys/       # CODESYS XML
│   │       │
│   │       ├── ladx-vendor/           # Vendor instruction-set manifests + few-shot patterns
│   │       │   ├── CLAUDE.md
│   │       │   ├── src/
│   │       │   └── manifests/         # YAML files per vendor
│   │       │       ├── siemens-s7-1500.yaml
│   │       │       ├── rockwell-controllogix.yaml
│   │       │       ├── beckhoff-tc3.yaml
│   │       │       └── codesys-v3.yaml
│   │       │
│   │       ├── ladx-agents/           # Prompts + orchestration logic
│   │       │   ├── CLAUDE.md
│   │       │   ├── src/
│   │       │   │   ├── lib.rs
│   │       │   │   ├── reader.rs
│   │       │   │   ├── generator.rs   # PLC code generator
│   │       │   │   ├── hmi_generator.rs
│   │       │   │   ├── explainer.rs
│   │       │   │   ├── translator.rs  # Cross-vendor migration
│   │       │   │   ├── documenter.rs
│   │       │   │   └── curator.rs     # Memory layer agent
│   │       │   └── prompts/           # Markdown prompt templates
│   │       │       ├── reader.system.md
│   │       │       ├── generator.system.md
│   │       │       ├── hmi_generator.system.md
│   │       │       └── ...
│   │       │
│   │       ├── ladx-rag/              # Retrieval + ranking
│   │       │   ├── CLAUDE.md
│   │       │   └── src/
│   │       │       ├── lib.rs
│   │       │       ├── store.rs       # Trait abstraction (LanceDB or pgvector)
│   │       │       ├── lance.rs
│   │       │       ├── pgvector.rs
│   │       │       ├── embed.rs       # Embedding model client
│   │       │       ├── retrieve.rs    # Multi-stage retrieval
│   │       │       └── rerank.rs      # Cross-encoder
│   │       │
│   │       ├── ladx-validator/        # Compile-and-fix loop
│   │       │   ├── CLAUDE.md
│   │       │   └── src/
│   │       │       ├── lib.rs
│   │       │       ├── matiec.rs      # Subprocess wrapper
│   │       │       ├── iec_checker.rs
│   │       │       ├── plcopen_schema.rs
│   │       │       └── grammar.rs     # Constrained decoding grammars
│   │       │
│   │       ├── ladx-templates/        # Document templates
│   │       │   ├── CLAUDE.md
│   │       │   ├── src/
│   │       │   │   ├── lib.rs
│   │       │   │   ├── engine.rs      # Template fill engine
│   │       │   │   ├── render.rs      # Word/PDF/Excel renderers
│   │       │   │   └── trace.rs       # Traceability map
│   │       │   └── templates/         # Markdown + YAML templates
│   │       │       ├── fds/
│   │       │       │   ├── base.md
│   │       │       │   ├── gamp5.overlay.md
│   │       │       │   └── isa88.overlay.md
│   │       │       ├── fat/
│   │       │       ├── sat/
│   │       │       ├── io-list/
│   │       │       ├── bom/
│   │       │       ├── manual/
│   │       │       ├── control-narrative/
│   │       │       └── alarm-philosophy/
│   │       │
│   │       ├── ladx-inference/        # Trait abstraction over Claude API + Ollama
│   │       │   ├── CLAUDE.md
│   │       │   └── src/
│   │       │       ├── lib.rs
│   │       │       ├── claude.rs
│   │       │       ├── ollama.rs
│   │       │       └── stream.rs
│   │       │
│   │       ├── ladx-audit/            # Append-only audit log
│   │       │   ├── CLAUDE.md
│   │       │   └── src/
│   │       │
│   │       ├── ladx-hmi/              # HMI generation per platform
│   │       │   ├── CLAUDE.md
│   │       │   └── src/
│   │       │       ├── lib.rs
│   │       │       ├── ignition.rs    # Perspective JSON
│   │       │       ├── wincc.rs       # WinCC Unified XML
│   │       │       ├── twincat.rs     # TwinCAT HMI
│   │       │       └── factorytalk.rs # FT View
│   │       │
│   │       ├── ladx-vendor-siemens/   # COM interop for TIA Openness
│   │       │   ├── CLAUDE.md
│   │       │   └── src/
│   │       ├── ladx-vendor-rockwell/  # L5Sharp via .NET interop
│   │       │   ├── CLAUDE.md
│   │       │   └── src/
│   │       ├── ladx-vendor-beckhoff/  # TwinCAT Automation Interface
│   │       │   ├── CLAUDE.md
│   │       │   └── src/
│   │       └── ladx-vendor-codesys/   # ScriptEngine subprocess
│   │           ├── CLAUDE.md
│   │           └── src/
│   │
│   ├── ui/                            # Shared React components
│   │   ├── CLAUDE.md
│   │   ├── package.json
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── ui/                # shadcn primitives (copy-not-import)
│   │   │   │   ├── chat/
│   │   │   │   │   ├── chat-window.tsx
│   │   │   │   │   ├── message.tsx
│   │   │   │   │   └── input.tsx
│   │   │   │   ├── code/
│   │   │   │   │   ├── ladder-view.tsx        # Visual ladder rendering
│   │   │   │   │   ├── st-view.tsx            # ST with syntax highlight
│   │   │   │   │   └── code-diff.tsx
│   │   │   │   ├── hmi/
│   │   │   │   │   ├── hmi-preview.tsx
│   │   │   │   │   └── sketch-uploader.tsx
│   │   │   │   ├── documents/
│   │   │   │   │   ├── doc-preview.tsx
│   │   │   │   │   ├── doc-editor.tsx
│   │   │   │   │   └── citation-popover.tsx
│   │   │   │   ├── memory/
│   │   │   │   │   ├── pattern-list.tsx
│   │   │   │   │   └── teach-dialog.tsx
│   │   │   │   ├── project/
│   │   │   │   │   ├── project-tree.tsx
│   │   │   │   │   └── tag-browser.tsx
│   │   │   │   └── shell/
│   │   │   │       ├── sidebar.tsx
│   │   │   │       └── topbar.tsx
│   │   │   ├── hooks/
│   │   │   ├── lib/
│   │   │   └── index.ts
│   │   └── tsconfig.json
│   │
│   ├── types/                         # Auto-generated TS bindings from Rust
│   │   ├── package.json
│   │   ├── src/
│   │   │   ├── index.ts               # Re-exports from generated/
│   │   │   └── generated/             # ts-rs output (gitignored, regenerated)
│   │   └── tsconfig.json
│   │
│   ├── design-system/                 # LADX brand tokens
│   │   ├── CLAUDE.md
│   │   ├── package.json
│   │   ├── src/
│   │   │   ├── tokens.ts              # Colour, spacing, typography
│   │   │   ├── tailwind-preset.ts     # Tailwind config preset
│   │   │   └── globals.css
│   │   └── tsconfig.json
│   │
│   ├── eslint-config/                 # Shared lint config (using biome)
│   ├── tsconfig/                      # Shared TS configs
│   └── prompts/                       # Prompt-engineering library (Markdown)
│       ├── CLAUDE.md
│       └── library/
│
├── tools/
│   ├── codegen/                       # Custom codegen scripts (e.g., template indexer)
│   ├── scripts/
│   │   ├── build-windows-installer.ps1
│   │   ├── publish-marketing.sh
│   │   └── seed-corpus.ts
│   └── benchmarks/                    # PLC pattern eval suite
│
├── docs/
│   ├── CLAUDE.md                      # Doc style rules
│   ├── architecture.md
│   ├── api-reference.md
│   ├── adr/                           # Architecture Decision Records
│   │   ├── 0001-monorepo-layout.md
│   │   ├── 0002-tauri-vs-electron.md
│   │   └── ...
│   └── runbooks/
│
├── tests/
│   ├── e2e/                           # Playwright (web + Tauri)
│   ├── fixtures/                      # Sample PLC projects
│   │   ├── siemens-conveyor.zap20
│   │   ├── rockwell-batch.l5x
│   │   └── twincat-motion.tszip
│   └── golden/                        # Expected outputs for regression
│
└── .github/
    └── workflows/
        ├── ci.yml
        ├── release-web.yml
        ├── release-desktop.yml
        └── release-marketing.yml
```

---

## 4. Technology Stack

Pinned versions. Don't drift without an ADR.

### Frontend / shared
- **Node.js** 22 LTS
- **pnpm** 9.x (`packageManager` in root `package.json`)
- **Turborepo** 2.x
- **TypeScript** 5.5+
- **Next.js** 15.x (App Router)
- **React** 19.x
- **Tailwind CSS** 4.x
- **shadcn/ui** (copied, not as dep)
- **lucide-react** for icons
- **Biome** for lint + format (replaces ESLint + Prettier)
- **Vitest** for unit tests
- **Playwright** for E2E

### Web product specific
- **Clerk** for auth
- **Stripe** for billing
- **Drizzle ORM** with **Postgres 16** (managed: Neon or Supabase)
- **pgvector** extension for embeddings
- **Vercel** for hosting (or Fly.io if Vercel pricing becomes an issue)
- **Resend** for transactional email
- **PostHog** for product analytics

### Desktop product specific
- **Tauri** 2.x
- **Rust** 1.80+
- **Ollama** (downloaded by user, not bundled — too large)
- **LanceDB** 0.10+ (embedded vector store)
- **rusqlite** for audit log
- **windows** crate for COM interop
- **netcorehost** for .NET interop

### Rust core
- **Cargo workspace** at `packages/core/`
- **ts-rs** for type generation
- **serde** with derive
- **tokio** for async runtime
- **anyhow** + **thiserror** for errors
- **tracing** for structured logging
- **reqwest** for HTTP
- **quick-xml** for XML parsing (Rockwell L5X, Siemens TIA, PLCopen)
- **zip** for project archive handling

### External tools (bundled binaries)
- **matiec** (IEC 61131-3 compiler) — bundled in `apps/desktop/src-tauri/resources/`
- **iec-checker** (static analysis) — bundled

### LLM models
- **Cloud:** Claude API (`claude-sonnet-4-6` for primary, fallback to Haiku for cost-sensitive paths)
- **Desktop:** Ollama with Qwen2.5-Coder 32B (workstation) / 14B (mid) / 7B (laptop)
- **Embeddings:** `bge-small-en-v1.5` via Ollama on desktop, OpenAI `text-embedding-3-small` via API on web

---

## 5. The CLAUDE.md Hierarchy

Claude Code reads CLAUDE.md files at every level from root to current. Keep the root file short; push specifics down.

### Root `CLAUDE.md`

```markdown
# ladX.ai — Project Context

ladX.ai is a local-first, ladder-first PLC AI agent. Three surfaces:
- `apps/web` — Cloud SaaS, Next.js 15, Claude API
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
- Cargo workspace for Rust at `packages/core`
- See `MASTER_BUILD_SPEC.md` for the full directory tree

## Common commands

```bash
pnpm install              # Install all workspace deps
pnpm dev                  # Run all dev servers (Turbo)
pnpm dev --filter=web     # Run only web
pnpm dev --filter=desktop # Run only desktop (Tauri)
pnpm build                # Build everything
pnpm test                 # Run all tests
pnpm test:rust            # Run cargo test (also regenerates TS bindings)
pnpm tauri:dev            # Tauri dev mode
pnpm tauri:build          # Tauri production build (signed installer)
```

## Don'ts

- Don't add localStorage/sessionStorage/IndexedDB to the desktop app — use Tauri filesystem APIs.
- Don't use `fetch()` in the desktop app — use `invoke()` for IPC, never HTTP.
- Don't bypass `lib/api.ts` — it's the surface-aware abstraction.
- Don't import directly from `packages/types/generated/` — go via `@ladx/types`.
- Don't add new vendor connectors without an ADR. They have licensing and version implications.
- Don't add ESLint or Prettier — Biome is the only linter/formatter.

## Where to find things

- Architecture: `MASTER_BUILD_SPEC.md` and `ARCHITECTURE.md`
- ADRs: `docs/adr/`
- Sample PLC projects for testing: `tests/fixtures/`
- Prompt templates: `packages/core/crates/ladx-agents/prompts/`
- Document templates: `packages/core/crates/ladx-templates/templates/`
```

### `apps/web/CLAUDE.md`

```markdown
# apps/web — ladX.ai Cloud

Next.js 15 App Router. Hosted at ladx.ai. Inference via Claude API.

## Conventions

- All API routes in `app/api/` use Next.js Route Handlers, not legacy pages/api.
- Auth via Clerk middleware at root. Protected routes are under `(app)/`.
- Database via Drizzle. Schema in `lib/db/schema.ts`. Run `pnpm db:generate` after schema changes.
- Streaming responses use Server-Sent Events via `lib/inference/stream.ts`.

## Routes that need auth
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
- Don't expose Claude API key to the client. Always proxy through `/api/inference`.
```

### `apps/desktop/CLAUDE.md`

```markdown
# apps/desktop — ladX.ai Studio (Tauri)

Windows-first desktop app. **Air-gapped capable.** Ollama for inference.

## CRITICAL — Network policy

The desktop app makes EXACTLY ONE outbound HTTP call in its entire lifetime: a licence activation check against `https://auth.ladx.ai/activate`. No telemetry, no analytics, no model downloads, no anything else.

If you find yourself adding `fetch()` or `reqwest::get()` to anything in this app, stop and read this rule again. There is almost certainly a different way.

## Tauri command pattern

All Rust→TS communication goes through `#[tauri::command]` functions in `src-tauri/src/commands/*.rs`. Never expose Rust state directly to the frontend.

Frontend calls them via `lib/invoke.ts`:
```typescript
import { invoke } from '@/lib/invoke';
const result = await invoke('parse_project', { path: '/path/to/file' });
```

## Storage locations

- Project Memory: `%APPDATA%\ladX\rag\` (LanceDB)
- Audit log: `%APPDATA%\ladX\audit.db` (SQLite)
- Settings: `%APPDATA%\ladX\settings.json`
- Cached models reference: `%APPDATA%\ladX\models.json` (NOT the model weights — Ollama owns those)

## Ollama lifecycle

- Detect Ollama on startup (`http://localhost:11434/api/tags`)
- If not running, prompt user to install/start (don't try to start it ourselves — permission issues)
- Cache available models in `models.json`
- Default model selection logic in `src-tauri/src/ollama/models.rs`

## Vendor connector loading

- Vendor packs are detected at startup based on installed vendor IDEs.
- TIA Openness detection: check for `Siemens.Engineering.dll` in known paths.
- Studio 5000 detection: check Windows Registry for installed Logix Designer.
- TwinCAT detection: check for `TwinCAT XAE Shell` registration.
- A connector being unavailable is fine — disable the related UI rather than erroring.

## Things to never do
- Don't cache PLC project parses to disk in cleartext. Encrypt with a per-install key.
- Don't add localStorage / sessionStorage / IndexedDB. Use Tauri filesystem APIs.
- Don't write to `%APPDATA%\ladX\` from the frontend directly. Always go through Tauri commands.
- Don't bundle Ollama. The model weights alone are 5–20GB. User installs Ollama separately.
```

### `packages/core/CLAUDE.md`

```markdown
# packages/core — Rust workspace

Shared Rust crates used by both `apps/web` (via subprocess or WASM) and `apps/desktop` (via Tauri).

## Workspace members
See `Cargo.toml`. Each crate has its own `CLAUDE.md`.

## Type-sharing rule

Every Rust struct/enum that crosses the FFI boundary to TypeScript MUST:
1. Live in `ladx-types` crate
2. Derive `serde::Serialize`, `serde::Deserialize`, `ts_rs::TS`
3. Have `#[ts(export, export_to = "../../../packages/types/src/generated/")]` attribute

After adding/changing types, run `pnpm test:rust` to regenerate TS bindings. CI fails if bindings drift.

## Error handling

- Use `thiserror` for library errors (typed, structured)
- Use `anyhow` only at binary edges (Tauri commands, CLI tools)
- Never `unwrap()` outside of tests
- Errors that cross FFI must derive `serde::Serialize` so the frontend can read them

## Async runtime

`tokio` with `rt-multi-thread`. Don't mix runtimes.

## Logging

`tracing` with structured fields. JSON output in production, pretty in dev.
Audit log is separate — see `ladx-audit` crate.

## Don't do

- Don't add a Python dependency. We tried, the Windows packaging story is awful.
- Don't add a PostgreSQL dependency to crates that desktop uses. Desktop is SQLite + LanceDB.
- Don't put long-lived state in crate-level `static` variables. Pass state through the Tauri State container.
```

---

## 6. Type Sharing Pattern (Rust ↔ TypeScript)

This is the lynchpin that prevents the frontend and backend from diverging.

### How it works

1. **Rust types live in `packages/core/crates/ladx-types/`**
2. They derive `ts_rs::TS` with an export attribute pointing at `packages/types/src/generated/`
3. `cargo test` runs in CI and regenerates `.ts` files
4. `packages/types/src/index.ts` re-exports everything from `generated/`
5. Frontend imports from `@ladx/types` — same types, single source of truth

### Example

In `packages/core/crates/ladx-types/src/project.rs`:

```rust
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use chrono::{DateTime, Utc};

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../packages/types/src/generated/")]
pub struct Project {
    pub id: String,
    pub name: String,
    pub vendor: VendorKind,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub tag_count: u32,
    pub routine_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../packages/types/src/generated/")]
pub enum VendorKind {
    Siemens,
    Rockwell,
    Beckhoff,
    Codesys,
    Mitsubishi,
}
```

After `cargo test`, `packages/types/src/generated/Project.ts`:

```typescript
import type { VendorKind } from "./VendorKind";

export type Project = {
  id: string;
  name: string;
  vendor: VendorKind;
  created_at: string;
  updated_at: string;
  tag_count: number;
  routine_count: number;
};
```

`packages/types/src/index.ts`:

```typescript
export * from "./generated/Project";
export * from "./generated/VendorKind";
// Auto-maintained by tools/scripts/build-types-index.ts
```

Frontend usage:

```typescript
import type { Project, VendorKind } from "@ladx/types";

async function loadProject(id: string): Promise<Project> {
  return await api.invoke<Project>("get_project", { id });
}
```

### CI enforcement

The CI pipeline runs:
```bash
pnpm test:rust              # Regenerates bindings
git diff --exit-code packages/types/src/generated/  # Fail if bindings drift
```

This guarantees no PR can land Rust changes without updated TS types.


---

## 7. Phase-by-Phase Build Plan

Each phase is a self-contained Claude Code session. Open the repo, paste the prompt, run. Verify against the checklist. Commit. Move to next.

The phases are deliberately sized to be completable in a single Claude Code session each (1–4 hours of focused work). If a phase is taking longer, the prompt was too big — split it.

### Phase 0 — Foundation (Weeks 1-3)

**Goal:** A working monorepo skeleton with all tooling configured. No business logic yet. The output is a repo where every command in `package.json` works.

#### Phase 0 Claude Code Prompt

```
You are setting up the foundation for ladX.ai, a Tauri 2 + Next.js 15 + Rust monorepo.

Read MASTER_BUILD_SPEC.md sections 3, 4, 5, 6 before starting.

Tasks:
1. Initialise pnpm workspace at root with workspaces: apps/*, packages/*, tools/*
2. Add Turborepo with turbo.json defining pipeline: build, dev, lint, test, test:rust
3. Initialise Cargo workspace at packages/core/Cargo.toml with all crates listed in section 3
4. Create empty Rust crate skeletons for: ladx-types, ladx-parsers, ladx-vendor, ladx-agents, ladx-rag, ladx-validator, ladx-templates, ladx-inference, ladx-audit, ladx-hmi
5. In ladx-types, set up ts-rs with one example struct (Project, with id/name/vendor) deriving TS and exporting to packages/types/src/generated/
6. Create packages/types as a TS package that re-exports from generated/
7. Create packages/design-system with LADX brand tokens (ink #0F1A24, teal #3FBFB5) and a Tailwind preset
8. Create packages/ui as a TS package depending on design-system, with shadcn/ui setup (run shadcn init and copy button + input + dialog as starters)
9. Initialise apps/web as Next.js 15 with App Router, TypeScript, Tailwind. Verify it imports from @ladx/ui and @ladx/types successfully
10. Initialise apps/desktop as a Next.js 15 app + Tauri 2 (npm create tauri-app), with output: 'export' in next.config.ts. Tauri's Cargo.toml must be a member of the packages/core workspace.
11. Initialise apps/marketing as a static Next.js site with App Router and MDX support
12. Set up Biome for lint + format. Add a pre-commit hook with husky.
13. Add GitHub Actions workflow at .github/workflows/ci.yml that runs lint, test, test:rust, and verifies generated TS bindings are committed
14. Add CLAUDE.md files at root, apps/web, apps/desktop, packages/core (use the templates in MASTER_BUILD_SPEC.md section 5)
15. Create the directory skeletons listed in section 3 even if empty (with .gitkeep where needed)

Use pnpm everywhere, not npm or yarn. Use TypeScript strict mode everywhere.

Verification:
- `pnpm install` succeeds
- `pnpm build` succeeds
- `pnpm test:rust` regenerates bindings; `git status` shows no diff in packages/types/src/generated/
- `pnpm dev --filter=web` starts Next.js dev server
- `pnpm dev --filter=desktop` starts Tauri dev mode (no errors, blank window OK)
- `pnpm dev --filter=marketing` starts marketing site
- All three apps render an empty page with the LADX logo and brand colours

Commit message: "Phase 0: monorepo foundation, type sharing, brand tokens"
```

#### Phase 0 Verification Checklist

- [ ] `pnpm install` completes without warnings about peer deps
- [ ] `pnpm -r build` succeeds
- [ ] `pnpm test:rust` runs and regenerates bindings
- [ ] `pnpm dev --filter=web` shows a blank LADX-branded page at localhost:3000
- [ ] `pnpm dev --filter=desktop` opens a Tauri window
- [ ] `cargo check --workspace` succeeds inside `packages/core`
- [ ] `apps/web` imports from `@ladx/ui` and `@ladx/types` work
- [ ] CI pipeline green on push

---

### Phase 1 — Web MVP (Weeks 4-10)

**Goal:** ladX.ai Cloud is live at ladx.ai. Users can sign up, upload a PLC project, chat with it, get generated ST code back, and pay £29/mo for unlimited prompts.

This phase ships first because it has fewer moving parts than the desktop and is the funnel for the desktop later. **No vendor IDE integration. No HMI. No documents. Just chat → generate ST → download.**

#### Phase 1 Claude Code Prompt

```
You are implementing the ladX.ai Cloud MVP at apps/web.

Read MASTER_BUILD_SPEC.md sections 7 (Phase 1) and 8 (Workflows) before starting.

Scope:
- Sign-up/sign-in via Clerk (Email + Google + GitHub)
- Project upload: accept .L5X (Rockwell) and PLCopen .xml. Reject other formats with friendly error.
- Project parsing via ladx-parsers crate, exposed through a Next.js API route as a subprocess call
- Project view: list of routines, tag count, basic stats. Read-only.
- Chat interface: streaming responses from Claude API. Send conversation history + project context.
- ST code generation: when user asks "generate X", agent (ladx-agents/generator) produces ST. Validate via ladx-validator. Show in code preview pane.
- Download: button to export generated code as a .txt file
- Stripe billing: Free tier (50 prompts/mo, watermarked), Pro tier (£29/mo unlimited)
- Stripe webhook for subscription state sync
- Postgres schema: users, projects, conversations, messages, generated_code, subscriptions

Stack reminder:
- Next.js 15 App Router, server components by default, "use client" only when needed
- Clerk for auth, middleware at root
- Drizzle ORM with Postgres (use Neon for managed)
- Stripe for billing, webhooks at /api/stripe/webhook
- Streaming via Server-Sent Events from /api/chat
- All chat history stored — needed for conversation continuity
- Project files stored in Cloudflare R2 with signed URLs, NOT in Postgres
- Use components from @ladx/ui where possible. Add to packages/ui if a component would be reused on desktop too.
- Generated code rendered with Shiki, syntax highlighting for IEC 61131-3 ST

Out of scope (deliberately):
- Vendor IDE integration (Phase 2-3)
- HMI generation (Phase 4)
- Document generation (Phase 3)
- Memory layer (Phase 3)
- Ladder visual rendering (Phase 2)
- Desktop app

Deliverables:
1. Working signup → upload → chat → generate → download flow
2. Stripe Free + Pro tiers operational
3. /api/chat returns streaming responses with proper backpressure
4. Audit log entries written for every prompt and accepted output
5. Marketing site at apps/marketing with hero, pricing, and "Try free" CTA

Verification:
- Create a fresh Stripe test customer, upgrade to Pro, downgrade, cancel — webhook handles all transitions
- Upload tests/fixtures/rockwell-batch.l5x, ask "explain the main routine", get a sensible response
- Ask "generate a motor start/stop with seal-in", get valid ST that compiles via matiec
- Free tier limits prompts at 50/month; soft-block UI when reached
- Logs in production are structured JSON with PII redacted

Commit message: "Phase 1: web MVP - upload, chat, generate ST, Stripe billing"
```

#### Phase 1 Verification Checklist

- [ ] Sign-up via email works end-to-end
- [ ] PLC project upload accepts L5X, rejects other formats
- [ ] Chat streams tokens (no batched response)
- [ ] Generated ST passes matiec compile in CI
- [ ] Stripe Free + Pro tiers work; webhook handles all subscription transitions
- [ ] Audit log persists every prompt with timestamp + user ID + project ID
- [ ] Marketing site live, pricing page accurate
- [ ] Lighthouse score >90 on marketing site

---

### Phase 2 — Desktop MVP, Siemens only (Weeks 8-18)

**Goal:** ladX.ai Studio installs on Windows, runs entirely offline with Ollama, and integrates with TIA Portal via Openness for one full end-to-end flow: prompt → generate ladder → import into TIA.

This is the demo that wins SPS Nuremberg. The cable-pull moment is the entire pitch. Get it perfect.

#### Phase 2 Claude Code Prompt

```
You are implementing the ladX.ai Studio MVP at apps/desktop, with Siemens TIA Openness as the only vendor target.

Read MASTER_BUILD_SPEC.md sections 7 (Phase 2), 8 (Workflows), and the previous architecture briefs for vendor integration details. The TIA Openness integration uses COM via the windows crate.

Scope:
- Tauri 2 desktop app, Windows 10/11 only, signed installer
- Licence activation: one-time online check against /api/activation. After that, fully offline.
- Ollama lifecycle: detect on startup, prompt user if missing, list available models, default to qwen2.5-coder:14b (or 32b on workstation tier)
- Project Reader: pick a TIA Portal project file (.zap20 or open project folder), parse via TIA Openness COM into Rust structs
- Local RAG: parse extracts tags, UDTs, routines into LanceDB at %APPDATA%\ladX\rag
- Chat interface: streaming from Ollama via the local API
- Ladder Generator: prompt → ladder XML in Siemens import format → matiec validate → if pass, import into open TIA project via Openness
- Visual ladder rendering in chat: render XML as graphical ladder using the LadderView component (you'll need to build this — SVG-based, render rungs with contacts/coils)
- Audit log: SQLite at %APPDATA%\ladX\audit.db
- Settings page: model picker, vendor pack status, licence info

Stack reminder:
- Tauri 2 with Next.js 15 in SSG mode
- Rust crate ladx-vendor-siemens uses the windows crate for COM. Reference Siemens.Engineering.dll dynamically (don't bundle).
- Ollama client via reqwest to localhost:11434
- LanceDB embedded in the desktop binary
- All UI components reused from @ladx/ui where possible
- LadderView is new — build it in @ladx/ui so the web product can use it later

CRITICAL — air-gap policy:
- The ONLY allowed outbound network call is the licence activation check
- Reject any code review that adds fetch() / reqwest::get() to anything else
- Telemetry: NONE. Crash reports: optional, opt-in, only with explicit user consent each time
- Model downloads: NOT our problem. User installs Ollama and pulls models themselves.

End-to-end demo flow that must work:
1. User installs ladX Studio
2. Licence key activation (one HTTP call)
3. User opens TIA Portal with a real project (provide tests/fixtures/siemens-conveyor.zap20 as test)
4. User opens ladX Studio, points it at the open TIA project
5. ladX parses the project (~30s for a typical project)
6. User pulls network cable (visibly, on stage)
7. User types: "Generate a motor start/stop for pump P-104 with seal-in and overload latch"
8. ladX retrieves similar patterns from the project + OSCAT corpus
9. Ollama generates ladder XML
10. matiec validates
11. ladX imports into TIA Portal via Openness COM
12. User sees the new block in TIA's project tree
13. Total elapsed: <30 seconds

Out of scope:
- Other vendors (Phase 3)
- HMI (Phase 4)
- Documents (Phase 3)
- Project Memory beyond basic auto-learn into LanceDB (the Teach/Forbidden UI is Phase 3)

Verification:
- The end-to-end demo flow completes against a real TIA installation
- Network cable pull does not affect operation after activation
- Audit log records the prompt, retrieval set, model output, validator result, import action
- Installer is signed (use a self-signed cert for now; production cert is a separate task)

Commit message: "Phase 2: desktop MVP with Siemens TIA Openness, end-to-end ladder import"
```

#### Phase 2 Verification Checklist

- [ ] Installer signs and runs on a clean Windows 11 VM
- [ ] Licence activation works once, never again hits the network
- [ ] TIA Openness COM connection establishes (test against TIA V19)
- [ ] Project parse completes in <60s for a 1000-tag project
- [ ] Ollama integration handles model not running, model not pulled, slow generation
- [ ] LadderView renders XML correctly for the 10 most common patterns (motor start/stop, debounce, edge trigger, etc.)
- [ ] matiec validation runs as a subprocess, results piped back to UI
- [ ] Generated ladder imports into TIA without errors
- [ ] Cable-pull demo recorded for the marketing site

---

### Phase 3 — Multi-vendor + Memory + Documents (Weeks 18-26)

**Goal:** Add Rockwell, Beckhoff, CODESYS connectors. Ship Project Memory (auto-learn + explicit Teach + Forbidden). Ship Tier 1 documents (FDS, FAT, I/O list, BOM, software manual).

This is the phase that turns ladX.ai from a Siemens demo into a real product.

#### Phase 3 Claude Code Prompt

```
You are extending ladX.ai Studio with multi-vendor support, the Memory layer, and the Tier 1 document set.

Read MASTER_BUILD_SPEC.md sections 7 (Phase 3) and 8 (Workflows).

Scope (in priority order — ship them in this order, don't batch):

PART A — Vendor connectors (weeks 18-21)
1. Rockwell connector at ladx-vendor-rockwell. Use L5Sharp via .NET interop (netcorehost crate). Support L5X import/export end-to-end. Parse .ACD via the hutcheb/acd Python tool as a fallback.
2. Beckhoff connector at ladx-vendor-beckhoff. Use TwinCAT Automation Interface via COM (windows crate). Reference Beckhoff TwinCAT XAE Base 3.3 Type Library.
3. CODESYS connector at ladx-vendor-codesys. Subprocess to CODESYS ScriptEngine (Python). This unlocks 500+ vendor brands in one connector.
4. Each connector exposes the same trait: VendorConnector with methods open, parse, generate, import, validate.

PART B — Memory layer (weeks 21-23)
5. Auto-learn: every parsed project auto-indexes into LanceDB. This already works from Phase 2 — extend it to track accepted code as positive training pairs.
6. Teach UI: right-click a rung/routine → "Teach ladX this is a [pattern name]". Stored in a separate curated_patterns LanceDB collection with high retrieval priority.
7. Forbidden UI: right-click → "Don't generate code like this". Negative examples in forbidden_patterns collection. Retrieval explicitly avoids similar structures.
8. Project Memory settings page: review, edit, delete patterns. One-click "Forget this customer" / "Forget this project".

PART C — Document generation (weeks 23-26)
9. Documenter agent expanded to a 5-component system: template engine, section generator, traceability map, citation linker, format renderer.
10. Tier 1 document set: I/O list (Excel via exceljs binding from Rust), FDS draft (Word + PDF), FAT protocol draft, software manual, control narrative, panel BOM, network architecture diagram (SVG), commissioning checklist, cable schedule.
11. Document templates in Markdown + YAML at packages/core/crates/ladx-templates/templates/. Each template has placeholders that map to project artefacts.
12. Citation system: every generated paragraph has source citations (PLC routine, HMI screen, tag, etc.) rendered as hyperlinks in Word/PDF.
13. Change-driven regeneration: when project changes, identify affected document sections and prompt user to regenerate.

Stack reminder:
- Reuse Tauri command pattern from Phase 2
- Use docx crate (Rust) for Word output, printpdf for PDF, calamine + rust_xlsxwriter for Excel
- Memory storage uses LanceDB collections — separate collections for project context, accepted pairs, curated patterns, forbidden patterns
- Document templates pull from project context via the same retrieval pipeline as code generation

CRITICAL:
- Memory data NEVER leaves the user's machine. Cross-customer learning is opt-in only and even then anonymised. EU GDPR Art 17 right-to-erasure must be one click.
- Documents must include traceability footnotes. No clause without a source citation. Low-confidence sections marked "Review required".

Out of scope:
- Regulatory templates (GAMP 5, ISA-88) — Phase 4
- HMI generation — Phase 4
- LoRA fine-tuning — Phase 5
- Cross-vendor migration — Phase 4
- Web equivalent of these features — separate work, parallel track if BD hire is in place

Verification:
- Each vendor connector works against a real installation (Studio 5000 v37, TwinCAT XAE 3.1, CODESYS V3.5)
- Project Memory survives app restart (LanceDB persistence)
- Teach + Forbidden patterns affect generation outputs measurably
- Generate FDS for tests/fixtures/rockwell-batch.l5x — output is plausible, all sections cited, exports to Word
- Generate I/O list for a real project — Excel file with all tags, addresses, types, descriptions
- Change a routine, regenerate FDS — only affected sections marked stale

Commit message: "Phase 3: multi-vendor connectors, Memory layer, Tier 1 documents"
```

#### Phase 3 Verification Checklist

- [ ] All 4 vendor connectors load against real IDEs
- [ ] Memory auto-learn confirmed via retrieval test (search for project-specific tag → highest result is from the project)
- [ ] Teach pattern → next similar prompt uses it as few-shot
- [ ] Forbidden pattern → similar generation explicitly avoided
- [ ] All 10 Tier 1 documents generate successfully for at least 3 sample projects
- [ ] Documents export cleanly to Word, PDF, Excel
- [ ] Every paragraph in generated docs has a source citation
- [ ] Tag drift detection alerts when HMI references unknown PLC tag

---

### Phase 4 — Regulatory templates + HMI (Weeks 26-40)

**Goal:** Ship GAMP 5 / ISA / IEC template families. Ship HMI co-generation for Ignition + WinCC Unified + TwinCAT HMI. Launch Site tier (£15k/yr).

#### Phase 4 Claude Code Prompt (high level — split into sub-prompts when executing)

```
You are extending ladX.ai with regulatory template families and HMI co-generation.

Sub-tasks (run as separate Claude Code sessions):

4A. GAMP 5 templates: URS, FS, DS, FAT, SAT, IQ, OQ, PQ, VMP. Each as Markdown overlay on top of base FDS/FAT templates. ALCOA+ audit trail export. 21 CFR Part 11 electronic signature support (PDF with timestamp + user identity).

4B. ISA template families: ISA-88 batch, ISA-95 enterprise integration, ISA-106 procedural automation, ISA-18.2 alarm philosophy. Each as overlays.

4C. IEC 61511 / 61508 / ISO 13849 safety templates. Auto-extract safety logic from PLC code (look for safety FB calls, redundancy patterns, diagnostic coverage). Generate SIL/PL evidence pack.

4D. IEC 62443 cybersecurity baseline. Asset inventory from project parse + control mapping + gap analysis.

4E. Loop diagram auto-generation (industry problem #5). Generate loop diagrams from I/O list + instrument index.

4F. HMI Generator agent. New crate ladx-hmi.
  - Ignition Perspective JSON (easiest, ship first)
  - WinCC Unified XML (Siemens HMI, second)
  - TwinCAT HMI HTML5 (Beckhoff, third)
  - FactoryTalk View ME/SE XML (Rockwell, fourth)
  - Multimodal sketch input: user uploads photo/sketch, vision model produces layout
  - Cross-validator: every HMI tag must exist in PLC

4G. Site tier launch: licence activation supports per-site licences with seat counts. Admin UI for site licence management.

For each sub-task, write a focused Claude Code prompt that:
- Explicitly references the relevant section of MASTER_BUILD_SPEC.md
- Specifies which crate(s) to modify
- Includes verification steps
- Has a clear "out of scope" list

Don't try to do all of 4A-4G in one session. Each is its own session.
```

---

### Phase 5 — Enterprise add-ons (Weeks 40+)

**Goal:** LoRA fine-tuning for enterprise. Doc-Pack Standalone SKU. Cross-vendor migration tool. EPLAN integration (stretch).

This phase is more open-ended. Treat each item as its own mini-roadmap.

- **5A. LoRA fine-tuning** — Background trainer using `unsloth` or `axolotl` Python subprocess. qLoRA on Qwen 14B. 4-12 hour overnight runs. Adapter file loaded by Ollama via Modelfile. £15-30k engagement per customer.
- **5B. Doc-Pack Standalone** — A separate SKU at `docpack.ladx.ai`. Web upload-only product, no code generation, just document generation. £19/mo Web, £39/mo Desktop. Targets pharma QA buyers.
- **5C. Cross-vendor migration** — Tool that takes a Rockwell L5X and produces a Siemens TIA project (or vice versa). Side-by-side migration document with deltas.
- **5D. EPLAN integration (stretch)** — Read EPLAN AML files for electrical schematics. Generate panel layouts from BOMs.
- **5E. SPS Nuremberg launch** — All marketing assets, demo videos, conference booth materials. November 2026.

---

## 8. Workflows

The four major end-to-end workflows. These are what the test suite exercises and what the docs describe.

### 8.1 Workflow: PLC Code Generation

```
User input
    ↓
Reader agent parses current project (cached if recent)
    ↓
Planner classifies intent: code-gen / explain / debug / migrate
    ↓
Multi-stage retrieval against:
  - Vendor instruction manifest
  - OSCAT pattern library  
  - Project context (current project's tags, UDTs, routines)
  - User history (accepted patterns from past projects)
    ↓
Top 8 results re-ranked by cross-encoder
    ↓
Prompt construction: system prompt + retrieved context + user query
    ↓
Inference (Claude API or Ollama)
    ↓
Constrained decoding for ladder XML (PLCopen schema grammar)
    ↓
Validator: matiec compile + iec-checker + schema check
    ↓
If validator fails: feedback to model with error, retry up to 3 times
    ↓
If passes: render in UI (LadderView for ladder, syntax-highlighted for ST)
    ↓
On user "Accept": import via vendor connector, log to audit, store as accepted pair
On user "Reject": log rejection reason, optional Forbidden pattern flag
```

### 8.2 Workflow: HMI Co-generation

```
User input ("Add operator screen for conveyor section")
    ↓
Planner identifies HMI intent (or co-generation: PLC + HMI)
    ↓
Both PLC Generator and HMI Generator share the project's tag dictionary
    ↓
HMI Generator retrieves:
  - Vendor's screen control library
  - User's existing screen templates (style consistency)
  - Pattern library (industry-standard layouts)
    ↓
Generator emits vendor-native format (Ignition JSON / WinCC XML / TwinCAT HTML / FT View XML)
    ↓
Cross-validator: every HMI tag binding must exist in the PLC tag dictionary
    ↓
If PLC code is also being generated: ensure consistency between new tags and HMI bindings
    ↓
Schema validation per platform
    ↓
Render in UI: HMIPreview component shows the screen as it will appear
    ↓
On Accept: import via vendor connector
```

### 8.3 Workflow: Document Generation

```
User selects document type (FDS / FAT / I/O list / etc.) and regulatory regime (GAMP 5 / ISA-88 / none)
    ↓
Documenter loads:
  - Base template (Markdown + YAML)
  - Regulatory overlay (if any)
  - Customer overlay (logo, header, numbering, boilerplate)
    ↓
For each template section:
  - Determine source: extract / generate / prompt user
  - If extract: pull from project artefacts directly
  - If generate: section-level retrieval + LLM with grounding
  - If prompt user: collect input via dialog
    ↓
Traceability map records source for every clause
    ↓
Citation linker embeds references (rendered as hyperlinks in Word/PDF)
    ↓
Format renderer outputs Word (.docx) / PDF / Excel
    ↓
User reviews, edits, signs off
    ↓
Audit log records sign-off with user identity + timestamp
    ↓
On project change: identify affected document sections, mark "Review required"
```

### 8.4 Workflow: Memory / Learning

```
Project opened in ladX
    ↓
Reader parses project
    ↓
Auto-learn: tags, UDTs, routines, common patterns indexed into LanceDB
    ↓
User generates code → accepts → pair stored in accepted_pairs collection
    ↓
User right-clicks rung → "Teach ladX this is a [name]"
    ↓
Curated pattern stored in curated_patterns collection with high retrieval priority
    ↓
User right-clicks bad rung → "Don't generate like this"
    ↓
Negative example stored in forbidden_patterns collection
    ↓
Future prompts:
  - Retrieve from all collections in parallel
  - Curated patterns get +50% weight
  - Forbidden patterns explicitly subtracted from candidates
  - User-history collection grows the user's personal "moat"
    ↓
At 100+ accepted pairs, offer LoRA fine-tune (Enterprise tier)
    ↓
LoRA training runs locally overnight (4-12h on RTX 4090)
    ↓
Adapter file loaded by Ollama via Modelfile
    ↓
Generation now uses adapter alongside base model — closer to user's style
    ↓
"Forget" operations: per-project, per-customer, or full wipe — one click each
```

---

## 9. Build / Test / Deploy Commands

The canonical command list. Add to root `package.json` and root `CLAUDE.md`.

### Development

```bash
# Install everything
pnpm install

# Run all dev servers (Turbo orchestrates)
pnpm dev

# Run individual surfaces
pnpm dev --filter=web       # Next.js dev at localhost:3000
pnpm dev --filter=desktop   # Tauri dev (opens window)
pnpm dev --filter=marketing # Marketing site at localhost:3001

# Rust workspace
cd packages/core && cargo check --workspace
cd packages/core && cargo test --workspace
```

### Testing

```bash
pnpm test                  # All TypeScript tests (Vitest)
pnpm test:rust             # Rust tests + regenerate TS bindings
pnpm test:e2e              # Playwright E2E
pnpm test:e2e:web          # Web only
pnpm test:e2e:desktop      # Tauri E2E (uses webdriver)
pnpm test:integration      # Integration tests against fixture PLC projects
pnpm test:golden           # Golden output regression tests
```

### Code quality

```bash
pnpm lint                  # Biome check
pnpm format                # Biome format
pnpm typecheck             # tsc --noEmit across workspace
pnpm typecheck:strict      # Including no-implicit-any
```

### Database (web only)

```bash
pnpm --filter=web db:generate   # Drizzle generate migrations
pnpm --filter=web db:migrate    # Apply migrations
pnpm --filter=web db:studio     # Drizzle Studio UI
```

### Build

```bash
pnpm build                       # Build everything (Turbo orchestrates)
pnpm build --filter=web          # Web production build
pnpm build --filter=marketing    # Marketing site build
pnpm tauri:build                 # Tauri production build (signed installer)
```

### Release

```bash
pnpm release:web                 # Vercel deploy
pnpm release:marketing           # Vercel deploy
pnpm release:desktop             # GitHub release with signed Windows installer
pnpm changelog                   # Update CHANGELOG.md from commits
```

### CI

GitHub Actions runs on every PR:
- `lint` (Biome)
- `typecheck` (tsc)
- `test` (Vitest)
- `test:rust` (cargo test, regenerate bindings, fail if drift)
- `build` (production build for all surfaces)
- `test:e2e` (Playwright)

Release workflow runs on tag push:
- `release:web` → Vercel
- `release:marketing` → Vercel
- `release:desktop` → GitHub release with signed `.msi` and `.exe`

---

## 10. Risk Register

The risks that will actually bite. Track these. Update when status changes.

| ID | Risk | Severity | Likelihood | Mitigation | Status |
|---|---|---|---|---|---|
| R1 | TIA Openness licence cost / version sprawl | High | High | Vendor-pack abstraction; document required versions; price into Site/Enterprise tiers | Open |
| R2 | Local LLM quality on ladder generation insufficient | Medium | Medium | Heavy retrieval grounding + few-shot library + compile-and-fix loop; cloud fallback for power users (web product) | Mitigated by architecture |
| R3 | Solo founder timeline doubles if protected hours <25/week | High | High | First hire (UK BD) by month 6; pace phases realistically; ship web before desktop to start revenue | Open |
| R4 | PLCAutoPilot ships full offline+IDE first | High | Medium | Speed on Phase 1-2; differentiate on depth and ladder quality; SPS Nuremberg launch positioning | Watch |
| R5 | COM interop instability on Windows version variance | Medium | Medium | Test matrix: Win10 LTSC, Win11 22H2, Win11 24H2; per-version conditional code where needed | Open |
| R6 | Hallucination in regulated industry documents | High | Medium | Citations on every clause; confidence scoring; human sign-off required; never auto-publish | Mitigated by architecture |
| R7 | EU AI Act provider obligations on fine-tuned LoRA | Medium | Medium | EULA clarity: customer is provider of fine-tuned model; ladX provides base model + tooling | Open |
| R8 | Stripe webhook outage breaks subscription state | Low | Low | Retry queue; daily reconciliation job against Stripe API | Open |
| R9 | Ollama Windows performance regression breaks demo | Medium | Low | Pin recommended Ollama version; provide one-click model selection optimised for hardware | Open |
| R10 | Audit log corruption | High | Low | Append-only SQLite with WAL mode; nightly integrity check; immutable backup | Open |
| R11 | Customer template fragmentation | Medium | High | Layered overlay architecture; Enterprise onboarding service charges separately for template translation | Mitigated |
| R12 | Build complexity exceeds solo capacity | High | Medium | Strict phasing; ship Phase 1 web before starting Phase 2 desktop; first hire month 6 | Open |
| R13 | Code signing certificate cost and lead time | Low | Medium | Use self-signed for early customers; production EV cert via Sectigo or DigiCert (~£300-500/yr) | Open |

---

## 11. Appendix — Starter Snippets

### A. Root `package.json`

```json
{
  "name": "ladx",
  "private": true,
  "packageManager": "pnpm@9.12.0",
  "scripts": {
    "build": "turbo build",
    "dev": "turbo dev",
    "lint": "biome check .",
    "format": "biome format --write .",
    "typecheck": "turbo typecheck",
    "test": "turbo test",
    "test:rust": "cd packages/core && cargo test --workspace",
    "test:e2e": "turbo test:e2e",
    "tauri:dev": "pnpm --filter=desktop tauri dev",
    "tauri:build": "pnpm --filter=desktop tauri build",
    "release:web": "pnpm --filter=web build && vercel deploy --prod apps/web",
    "release:marketing": "pnpm --filter=marketing build && vercel deploy --prod apps/marketing",
    "release:desktop": "pnpm tauri:build"
  },
  "devDependencies": {
    "@biomejs/biome": "^1.9.0",
    "turbo": "^2.0.0",
    "typescript": "^5.5.0"
  }
}
```

### B. `pnpm-workspace.yaml`

```yaml
packages:
  - "apps/*"
  - "packages/*"
  - "tools/*"
```

### C. Root `Cargo.toml` (workspace)

```toml
[workspace]
resolver = "2"
members = [
    "packages/core/crates/ladx-types",
    "packages/core/crates/ladx-parsers",
    "packages/core/crates/ladx-vendor",
    "packages/core/crates/ladx-agents",
    "packages/core/crates/ladx-rag",
    "packages/core/crates/ladx-validator",
    "packages/core/crates/ladx-templates",
    "packages/core/crates/ladx-inference",
    "packages/core/crates/ladx-audit",
    "packages/core/crates/ladx-hmi",
    "packages/core/crates/ladx-vendor-siemens",
    "packages/core/crates/ladx-vendor-rockwell",
    "packages/core/crates/ladx-vendor-beckhoff",
    "packages/core/crates/ladx-vendor-codesys",
    "apps/desktop/src-tauri",
]

[workspace.package]
edition = "2021"
rust-version = "1.80"
license = "Proprietary"
authors = ["Wartens Ltd <hello@ladx.ai>"]

[workspace.dependencies]
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
ts-rs = { version = "10.0", features = ["serde-compat", "chrono-impl"] }
tokio = { version = "1.40", features = ["full"] }
anyhow = "1.0"
thiserror = "1.0"
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["json"] }
reqwest = { version = "0.12", features = ["json", "stream"] }
quick-xml = { version = "0.36", features = ["serialize"] }
zip = "2.1"
chrono = { version = "0.4", features = ["serde"] }
uuid = { version = "1.10", features = ["v4", "serde"] }
windows = "0.58"  # COM interop, desktop only
lancedb = "0.10"
rusqlite = { version = "0.32", features = ["bundled"] }

[profile.release]
opt-level = 3
lto = "fat"
codegen-units = 1
strip = true
panic = "abort"
```

### D. `turbo.json`

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "dist/**", "out/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {},
    "typecheck": {
      "dependsOn": ["^build"]
    },
    "test": {
      "dependsOn": ["^build"]
    },
    "test:e2e": {
      "dependsOn": ["build"]
    }
  }
}
```

### E. Root `CLAUDE.md` (production version)

See section 5 above. Copy verbatim into the repo root.

### F. ts-rs example for `Project` type

```rust
// packages/core/crates/ladx-types/src/project.rs

use serde::{Deserialize, Serialize};
use ts_rs::TS;
use chrono::{DateTime, Utc};

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../packages/types/src/generated/")]
pub struct Project {
    pub id: String,
    pub name: String,
    pub vendor: VendorKind,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub stats: ProjectStats,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../packages/types/src/generated/")]
pub enum VendorKind {
    Siemens,
    Rockwell,
    Beckhoff,
    Codesys,
    Mitsubishi,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../packages/types/src/generated/")]
pub struct ProjectStats {
    pub tag_count: u32,
    pub routine_count: u32,
    pub udt_count: u32,
    pub aoi_count: u32,
    pub hmi_screen_count: u32,
}
```

### G. Tauri command pattern

```rust
// apps/desktop/src-tauri/src/commands/projects.rs

use ladx_types::Project;
use ladx_parsers::parse_project_file;
use crate::state::AppState;

#[tauri::command]
pub async fn parse_project(
    state: tauri::State<'_, AppState>,
    path: String,
) -> Result<Project, String> {
    let parsed = parse_project_file(&path)
        .await
        .map_err(|e| e.to_string())?;
    
    state.audit_log
        .log_event("project_parsed", &parsed.id)
        .await
        .map_err(|e| e.to_string())?;
    
    Ok(parsed)
}
```

### H. Frontend invoke wrapper

```typescript
// apps/desktop/lib/invoke.ts

import { invoke as tauriInvoke } from '@tauri-apps/api/core';
import type { Project } from '@ladx/types';

export async function parseProject(path: string): Promise<Project> {
  return await tauriInvoke<Project>('parse_project', { path });
}

// Repeat for every Tauri command. Generated via codegen if it grows large.
```

### I. Surface-aware API client (`lib/api.ts`)

```typescript
// Same file in both apps/web/lib/api.ts and apps/desktop/lib/api.ts
// The implementation differs but the public API is identical.

// In apps/web/lib/api.ts:
export const api = {
  parseProject: async (path: string): Promise<Project> => {
    const res = await fetch('/api/projects/parse', {
      method: 'POST',
      body: JSON.stringify({ path }),
    });
    return res.json();
  },
  // ... more methods
};

// In apps/desktop/lib/api.ts:
import { invoke } from '@tauri-apps/api/core';
export const api = {
  parseProject: async (path: string): Promise<Project> => {
    return await invoke<Project>('parse_project', { path });
  },
  // ... same method names, Tauri impl
};

// In packages/ui components:
import { api } from '@/lib/api'; // resolves to per-app file at build time
```

This way the same UI components work on both surfaces. The compiler and bundler resolve the import at build time per app.

### J. CI workflow (`.github/workflows/ci.yml`)

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:

jobs:
  ci:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest]
    steps:
      - uses: actions/checkout@v4
      
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          
      - uses: pnpm/action-setup@v4
        with:
          version: 9
          
      - uses: dtolnay/rust-toolchain@stable
      
      - uses: Swatinem/rust-cache@v2
        with:
          workspaces: 'packages/core'
          
      - run: pnpm install --frozen-lockfile
      
      - run: pnpm lint
      - run: pnpm typecheck
      
      - run: pnpm test:rust
        working-directory: packages/core
        
      - name: Verify TS bindings up to date
        run: |
          if ! git diff --exit-code packages/types/src/generated/; then
            echo "Generated types are out of date. Run 'pnpm test:rust' and commit."
            exit 1
          fi
          
      - run: pnpm test
      - run: pnpm build
      
      - name: Tauri build (Windows only)
        if: matrix.os == 'windows-latest'
        run: pnpm tauri:build
```

---

## End

This is the canonical build spec. Treat it as code: review it when something goes wrong, prune sections that don't pull weight, add ADRs when decisions get made.

The single most important habit: **before starting a Claude Code session for a new feature, paste the relevant phase prompt and reference this file. Don't ad-lib.**

Good luck.

— prepared for JBC, April 2026

