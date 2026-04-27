# packages/core — Rust workspace

Shared Rust crates used by both `apps/web` (via subprocess or WASM) and `apps/desktop` (via Tauri).

## Workspace members
See root `Cargo.toml`. Each crate has its own `CLAUDE.md` once it has real code.

## Type-sharing rule

Every Rust struct/enum that crosses the FFI boundary to TypeScript MUST:
1. Live in `ladx-types` crate
2. Derive `serde::Serialize`, `serde::Deserialize`, `ts_rs::TS`
3. Have `#[ts(export, export_to = "../../../../types/src/generated/")]` attribute (4 `..` from `crates/ladx-types/`, no leading `packages/`)

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
