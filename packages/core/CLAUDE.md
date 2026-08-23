# packages/core, Rust workspace

Shared Rust crates used by both `apps/web` (via subprocess or WASM) and `apps/desktop` (via Tauri).

## Workspace members
See root `Cargo.toml`. Each crate has its own `CLAUDE.md` once it has real code.

## Type-sharing rule

Every Rust struct/enum that crosses the FFI boundary to TypeScript MUST:
1. Live in `ladx-types`, **or** in `ladx-ir`, which owns the intermediate
   representation and is big enough to be its own crate
2. Derive `serde::Serialize`, `serde::Deserialize`, `ts_rs::TS`
3. Carry an `#[ts(export, export_to = ...)]` attribute pointing at the right
   output directory (4 `..` from `crates/<crate>/`, no leading `packages/`):
   - `ladx-types` → `"../../../../types/src/generated/"`
   - `ladx-ir` → `"../../../../types/src/generated/ir/"`

**The subdirectory is not cosmetic.** ts-rs writes one file per type name into a
flat directory, so two crates exporting a type of the same name silently
overwrite each other, last writer wins, no error, no warning. That happened
once already: `ladx-ir::Tag` clobbered `ladx-types::Tag`, and the only symptom
was a TypeScript type quietly changing shape. Any new crate that exports types
gets its own subdirectory.

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
Audit log is separate, see `ladx-audit` crate.

## Don't do

- Don't add a Python dependency. We tried, the Windows packaging story is awful.
- Don't add a PostgreSQL dependency to crates that desktop uses. Desktop is SQLite + LanceDB.
- Don't put long-lived state in crate-level `static` variables. Pass state through the Tauri State container.
