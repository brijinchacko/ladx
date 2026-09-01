# Current capability audit

Taken on 2026-08-29 at commit `9654d99`, by reading the running code rather
than `MASTER_BUILD_SPEC.md`. Where the two disagree, this file follows the
code.

Scale: `IMPLEMENTED` works and is tested. `PARTIAL` works for a narrower case
than the name suggests. `SKELETON` exists as a name with no behaviour.
`MOCKED` returns something plausible without doing the work. `PLANNED` is
written down only. `MISSING` is absent.

## The headline

Two findings shape everything else.

**The intelligence is in TypeScript; the Rust core the plan assumes is mostly
empty.** Seven crates, `ladx-agents`, `ladx-rag`, `ladx-templates`,
`ladx-vendor`, `ladx-vendor-siemens`, `ladx-vendor-rockwell` and `ladx-hmi`,
are six lines each: a doc comment and a function returning the crate version.
Meanwhile `packages/studio` is 25,098 lines, `packages/hmi` 17,359 and
`packages/cad` 9,365. The product is real. The Rust scaffolding underneath the
vendor and agent story is not.

**The project index is name-only.** `ladx-parsers/src/l5x.rs` is 159 lines and
extracts `TagRef { name, data_type }`, `RoutineRef { name, language }`, and
bare strings for UDTs and AOIs. No rung logic, no routine source, no comments,
no addresses, no descriptions, no programs, no tasks, no AOI parameters, no
modules, no alarms. Everything in the plan that depends on understanding a
project, dependency graphs, troubleshooting, sequence extraction, health
checks, provenance, tag drift, rests on a parser that today knows names and
nothing else.

## By area

### Core, Rust

| Component | Lines | State | Notes |
|---|---|---|---|
| `ladx-ir` | 1,993 | **IMPLEMENTED** | Real IR: `IrProject`, `Pou`, `Rung`, `Logic`, `Instruction`, `Operand`, `OpCode`, `Tag`, `DataTypeDef`. Has `VendorDetail`, the hook for preserving what the IR cannot model. 51 tests. Exports to ST, neutral text and a PLCopen graph. |
| `ladx-validator` | 463 | **PARTIAL** | `light.rs` structural checks plus a `matiec.rs` bridge. 4 tests. |
| `ladx-parsers` | 380 | **PARTIAL** | L5X and PLCopen readers, names only. 3 tests. |
| `ladx-inference` | 362 | **IMPLEMENTED** | Ollama and OpenRouter with streaming. |
| `ladx-types` | 239 | **IMPLEMENTED** | Source of truth, `ts-rs` generated bindings. 21 tests. |
| `ladx-audit` | 68 | **PARTIAL** | Append-only log. No provenance fields from the plan. |
| `ladx-agents` | 6 | **SKELETON** | |
| `ladx-rag` | 6 | **SKELETON** | |
| `ladx-templates` | 6 | **SKELETON** | |
| `ladx-vendor` | 6 | **SKELETON** | |
| `ladx-vendor-siemens` | 6 | **SKELETON** | |
| `ladx-vendor-rockwell` | 6 | **SKELETON** | |
| `ladx-hmi` | 6 | **SKELETON** | |
| `ladx-vendor-beckhoff`, `-codesys` | 6 each | **SKELETON** | |

### Product surfaces

| Feature | State | Notes |
|---|---|---|
| Ladder editor | **IMPLEMENTED** | The largest single thing in the repo. Editing, simulation, instruction bar, drag placement, PDF. 175 tests with Convert. |
| Monitor | **IMPLEMENTED** | Scan engine, live tag values. |
| HMI/SCADA | **IMPLEMENTED** | 17,359 lines. Screens, widgets, bindings, alarms, faceplates, historian, expressions. 317 tests. |
| CAD | **IMPLEMENTED** | Drafting, snapping, DXF and PDF writers. 91 tests. |
| Convert | **PARTIAL** | Targets are ST, SCL, neutral text and PLCopen. **No L5X export and no Siemens export.** Cross-vendor conversion in the plan's sense does not exist. |
| Documents | **PARTIAL** | 27 tests. Document kinds exist (FDS, SDS, URS, FAT, SAT, CN, BOM, ALM, HO and more) but are driven by an interview, not by project entities. No provenance, no selective regeneration. |
| Chat / assistant | **IMPLEMENTED** | Ollama on desktop, provider-backed on web. |
| Workspace, projects | **IMPLEMENTED** | Folders on disk (desktop), Postgres (web). |
| Settings | **IMPLEMENTED** | Models, storage, licence, updates. |
| Validation | **PARTIAL** | Structural and matiec. No vendor compilation, no validation levels. |
| Autofix | **IMPLEMENTED** | ST autofix through the validator. |
| Audit log | **PARTIAL** | Events logged; the plan's provenance record is not. |
| Project Memory | **MOCKED** | `memory_get`/`memory_set`/`memory_remove` exist and are a plain key/value store for chat threads. `MemoryEntry` and `MemoryCollection` types exist in `ladx-types` and are referenced by nothing but their own generated bindings. None of project/company/user scoping, forbidden or approved patterns, retrieval scoring, versioning or attribution exists. |

### Against the plan's fifteen priorities

| # | Priority | State |
|---|---|---|
| 1 | Siemens TIA Portal | **MISSING** (skeleton crate) |
| 2 | Allen-Bradley / Studio 5000 | **PARTIAL** (L5X read, names only; no write) |
| 3 | Full project understanding | **PARTIAL** (names only) |
| 4 | AI project memory | **MOCKED** |
| 5 | Cross-vendor conversion | **PARTIAL** (no vendor target formats) |
| 6 | HMI/SCADA | **IMPLEMENTED** for LADX's own format; vendor export **MISSING** |
| 7 | Automatic documentation | **PARTIAL** (not project-derived) |
| 8 | I/O and hardware | **MISSING** |
| 9 | Alarm engineering | **PARTIAL** (HMI alarms exist; discovery from logic does not) |
| 10 | AI testing and validation | **MISSING** |
| 11 | Project comparison / diff | **MISSING** |
| 12 | Standards and reusable libraries | **MISSING** |
| 13 | Project health checks | **MISSING** |
| 14 | Handover package | **MISSING** |
| 15 | Multi-agent workflows | **MISSING** |

## Two structural problems the plan has to answer

### There are two IRs, and they are not connected

`ladx-ir::IrProject` is the Rust vendor-neutral IR with 51 tests.
`LadxProgram` in `packages/studio/src/lib/types.ts` is a hand-written
TypeScript model, and it is the one the ladder editor, Monitor and Convert
actually use. `packages/studio/src/lib/convert.ts` (612 lines) and
`import-l5x.ts` (472 lines) are a second, independent import and conversion
stack in TypeScript that never touches the Rust IR.

So there are two parsers for L5X and two conversion paths, in two languages,
sharing nothing. The plan requires that all conversion go source → parser → IR
→ exporter, and forbids hand-written TypeScript mirrors of Rust types. Neither
holds today. This is the single most important decision in the programme and
it cannot be deferred, because every later phase either widens the gap or
closes it.

### There is no fixture layer

`tests/fixtures`, `tests/golden` and `tests/e2e` hold three `.gitkeep` files.
Every one of the 999 tests is a unit test next to its own source. There is no
golden-file layer, so there is nothing that would catch a conversion whose
output silently changes shape, which is exactly the regression this programme
is most likely to cause.

## What is genuinely strong

Worth saying, because the table above is mostly deficits and that is a
misleading impression of the repository. The ladder editor, the HMI builder
and CAD are substantial, tested, working products. `ladx-ir` is a properly
designed IR with a preservation hook already in it. The surface-injection
pattern (`StudioStorage`, `CadStore`, `askModel`, `CadRoutes`, `AssistantStore`)
is a good seam and is the right place to add vendor and engineering capability
without forking web and desktop. The plan should build on these rather than
around them.

## Addendum, 2026-09-01: a second duplication, deliberately left standing

There are now two SCL generators, and this is written down rather than fixed
because fixing it now would be the wrong call.

`packages/studio/src/lib/convert.ts` has produced Siemens SCL since before any
of this work. It is shipped, it is in front of users, and checking it rather
than assuming showed it is not naive: it writes real TIME literals and it emits
declarations. `ladx-vendor-siemens::scl` is richer, mapping Rockwell timer
members onto the S7 ones and naming edge instances after their tags, and it
carries a conversion report.

Neither has been imported by TIA Portal. Replacing a shipped generator with an
unvalidated one is not an improvement, it is a change of which unknown you are
running, so the Rust one stays behind `vendor.siemens` until a real project has
been through it.

The condition for consolidating is the same one set for the two L5X readers: a
real file, through real vendor software. Until then, two implementations that
each work is a better position than one that has never been checked.

This is the second such pair, after the L5X readers. Two is a pattern rather
than an accident: building the Rust path beside a working TypeScript one is
how this codebase has been able to keep shipping, and every pair carries a
stated condition for collapsing it. A third without one would be drift.

## Addendum: why the web has no capability switches

The desktop gates every unfinished capability behind a flag that is off until
somebody turns it on. The web does not, and that is a decision rather than an
omission.

What reached the web divides cleanly, and the division is about what each thing
claims rather than how finished it is:

**Analysis, the trace and Standards make no claim about anybody else's
software.** They read the engineer's own program and their own written rules,
and they are either right about it or they are a bug. There is nothing for a
switch to protect somebody from, and a toggle would only ask them to opt in to
something that already works.

**Reading an L5X does make a claim**, and an unvalidated one: it has never been
run against a file exported by Studio 5000. So that one says so, in the notes
panel, at the moment somebody uses it.

A switch on a settings page would have been the wrong instrument for that. It
does not make the claim any truer, it puts the caveat somewhere nobody reads,
and it asks an engineer to opt in to a risk that has not been described to
them. A line where the file is opened is smaller, harder to miss, and says the
thing that is actually true.

The desktop keeps its flags because they carry maturity per capability and
because a desktop build cannot be rolled back the way a deploy can. When
Siemens arrives on the web it will need the same treatment as the L5X reader,
and if the web ever gains something genuinely destructive, it will need a real
gate rather than a note.
