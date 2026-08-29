# Regression baseline

Taken on 2026-08-29 at commit `9654d99`, before any work from the engineering
workspace programme began. Everything below passed. That is the point of the
file: from here on, a red result is something this programme did, and there is
no ambiguity about whether it was already broken.

Run on macOS 15 (arm64), Node 22, pnpm 9, Rust stable.

## Results

| Gate | Command | Result |
|---|---|---|
| Lint | `pnpm lint` | pass, 538 files |
| Types | `pnpm typecheck` | pass, 10/10 packages |
| Rust core | `pnpm test:rust:core` | **82 passed**, 0 failed |
| JS/TS | `pnpm test` | **860 passed**, 0 failed, 45 files |
| Build | `pnpm build` | pass, 3/3 |
| Desktop frontend | `pnpm --filter=@ladx/desktop build` | pass |
| Desktop crate | `cargo test -p ladx-studio` | **60 passed**, 0 failed |
| Desktop crate | `cargo check -p ladx-studio` | pass, 5 warnings |

**1,002 tests green.**

## Where the tests actually are

Rust, 82 total:

| Crate | Tests |
|---|---|
| `ladx-ir` | 54 |
| `ladx-types` | 21 (incl. binding export) |
| `ladx-validator` | 4 |
| `ladx-parsers` | 3 |
| `ladx-agents`, `ladx-rag`, `ladx-templates`, `ladx-vendor*`, `ladx-hmi` | 0 |

JavaScript, 860 total:

| Package | Tests |
|---|---|
| `@ladx/hmi` | 317 |
| `@ladx/web` | 225 |
| `@ladx/studio` | 175 |
| `@ladx/cad` | 91 |
| `@ladx/documents` | 27 |
| `@ladx/ui` | 25 |

Desktop crate: 60.

## What this baseline does not cover

Worth stating plainly, because a green run is easy to over-read.

- `tests/fixtures`, `tests/golden` and `tests/e2e` contain three `.gitkeep`
  files and nothing else. There is no golden-file or end-to-end layer at all.
- The seven skeleton crates contribute zero tests because they contain no
  behaviour to test.
- No test exercises real vendor software. Nothing here says anything about
  whether LADX output imports into TIA Portal or Studio 5000.
- The 5 `cargo check` warnings in the desktop crate are pre-existing dead code
  (`base_url`, `Folder::phase` and three others). They are not touched by this
  programme and are not counted as regressions either way.

## A correction

This file first recorded 82 as 79, and `ladx-ir` as 51 rather than 54. The
total came from summing the `test result` lines with `awk` and it undercounted;
the per-crate table was read off a garbled terminal paste. Corrected here from
a clean per-crate run.

Noted rather than quietly edited, because the whole use of a baseline is that
the numbers in it can be trusted, and one that has been silently adjusted is
worth less than one with a visible correction.

## Re-running

```bash
pnpm install --frozen-lockfile
pnpm lint && pnpm typecheck && pnpm test:rust:core && pnpm test && pnpm build
pnpm --filter=@ladx/desktop build && cargo test -p ladx-studio && cargo check -p ladx-studio
```

`pnpm --filter=@ladx/desktop build` must run before the two cargo commands on a
clean checkout: `tauri::generate_context!` reads the config while the crate
compiles and panics if `apps/desktop/out` is not on disk.
