# ADR 0001 — Studio enters the monorepo under its original strictness contract

**Date:** 2026-08-23
**Status:** Accepted, time-limited

## Context

LADX Mini was built inside the Edwartens India CRM and has been running there in
front of students: a ladder editor, a scan-accurate simulator, exercises,
marking, and PDF export. Roughly 14,900 lines across 40 files.

Making it the canvas of the LADX web app means moving it into this repo as
`packages/studio` (`@ladx/studio`). The CRM and this monorepo do not enforce the
same rules:

| | CRM | LADX monorepo |
|---|---|---|
| TypeScript | `strict` | `strict` + `noUncheckedIndexedAccess` |
| Linter | ESLint (Next defaults) | Biome, `recommended` + extras |

Compiled and linted unchanged under this repo's settings, the migrated code
produced **81 type errors** and **217 lint diagnostics**.

The type errors were measured, not estimated: turning `noUncheckedIndexedAccess`
off dropped the count from 81 to 0, so every single one is the same shape —
`arr[i]` used as `T` where the flag types it `T | undefined`. They cluster in
`lib/tree.ts` (29) and `components/LadxStudio.tsx` (20).

## Decision

Bring Studio in **compiling and linting under the contract it was written
against**, and tighten afterwards.

Fixed during the migration, because these are mechanical and provably safe:

- formatting and import order (Biome's safe fixes)
- `node:` protocol on Node builtins in `lib/pdf.ts`
- `valueOf` → `operandValue` in `lib/engine.ts` (module-local, unexported, 16 call sites)
- `type="button"` on all 102 buttons — verified safe: the package contains no
  `<form>`, so no button was relying on implicit submit
- four string/optional-chain style fixes in `HelpDialog`, `tree.ts`, `portable.ts`
- ambient CSS-module types, so bundler-resolved `.module.css` imports typecheck
- removed the `next/link` dependency so the package no longer assumes a Next.js host
- replaced the two CRM imports with parameters: PDF letterhead became a
  `Branding` argument; `FloatingWindow` came across with the package

Deferred, and recorded here:

- `packages/studio/tsconfig.json` sets `noUncheckedIndexedAccess: false`
- `biome.json` has one `overrides` entry for `packages/studio/**` disabling
  `useExhaustiveDependencies`, `noArrayIndexKey`, `noNonNullAssertion`,
  `useSingleVarDeclarator`, `noParameterAssign`, and three `a11y` rules

`noAutofocus` is the one entry not expected to come back on: focusing the input
when an inline rung editor opens is the correct behaviour for a keyboard-driven
editor, and the rule is aimed at page-load autofocus. The rest are debt.

## Why not just fix them

Every deferred rule requires changing behaviour, not formatting:

- **`useExhaustiveDependencies`** is the dangerous one. It governs when effects
  re-run, and in this package effects drive the simulator's timers. "Just add the
  missing dependency" can change scan timing — the one thing this code exists to
  get right.
- **`noArrayIndexKey`** changes how React reconciles rung and branch lists.
  Different keys, different component identity, different state retention while
  editing a rung.
- **`noNonNullAssertion`** needs real null handling designed into the editor
  paths, not `?.` sprinkled until the linter stops complaining.
- **`noUncheckedIndexedAccess`** touches the hot paths of the scan engine and the
  series/parallel normaliser.

A migration commit should change where code lives, not how it behaves. Mixing a
move with 300 behavioural edits to working, unbenchmarked, student-facing code
means that when something breaks, there is no way to tell which change did it.

## Consequences

- Studio compiles and lints today; CI stays green; the rest of the repo keeps the
  strict settings unchanged. New code in the package is held to the root config —
  only the listed rules are off, and only for this path.
- We carry real debt. It is bounded (one package, one enumerated list) and
  visible (this ADR, plus comments at both config sites).
- **Paying it down needs tests first.** `lib/engine.ts` is pure — state in, state
  out, no React, no DOM, no clock of its own — so it can be covered cheaply and
  thoroughly. That suite is the precondition for touching `lib/tree.ts`, which
  feeds it and holds the largest share of the errors.
- Order of work: engine tests → `tree.ts` → `LadxStudio.tsx` → the rest → delete
  both exceptions and this ADR's "time-limited" status.

## Note

The CRM copy at `/var/www/edwartens-india` is untouched and still serving
students. This was a copy, not a move. Divergence between the two is now
possible and is a known cost of the split; if the CRM keeps its own copy
long-term, it should eventually consume `@ladx/studio` instead.
