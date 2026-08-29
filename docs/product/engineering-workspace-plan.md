# Plan: LADX as an engineering workspace

Written after `current-capability-audit.md` and `regression-baseline.md`, and
following their findings rather than `MASTER_BUILD_SPEC.md`.

Two decisions are settled and everything here depends on them.

**`ladx-ir` is the one source of truth.** The TypeScript `LadxProgram` model
and the TypeScript L5X and conversion stack converge onto it. This costs a
phase before any new feature ships, and it is the only option that satisfies
the rule against hand-written TypeScript mirrors of Rust types.

**TIA Portal V21 is available on a licensed Windows machine.** Siemens can
therefore be built and actually verified rather than scaffolded, and stays
priority 1.

## The rules this plan works under

Taken from the brief, restated as things that constrain the work rather than
aspirations:

- The 999 tests in the baseline stay green. A red result is this programme's
  fault until proven otherwise.
- No existing route, Tauri command, or persisted shape is renamed or removed.
  51 Tauri commands and the web's API surface are frozen; new capability
  arrives as new commands.
- The desktop makes no outbound network call. Vendor bridges are local
  processes; Ollama on loopback is not outbound.
- Nothing is called VALIDATED without a real vendor test. Mock tests prove
  architecture and nothing else.
- Additive and flagged. Existing behaviour stays the default until a flag is
  deliberately turned on.
- No page appears in the navigation until it does something.

## The spine

The brief asks for fifteen capabilities, and the thing that decides whether
they feel like one product or fifteen bolt-ons is whether they read from a
shared model. They do:

```
  vendor project  ──parser──▶  ladx-ir  ──▶  Engineering Project Index
                                               (entities + dependency graph)
                                                      │
        ┌───────────────┬───────────────┬─────────────┼───────────┬──────────┐
        ▼               ▼               ▼             ▼           ▼          ▼
     agents         analysis         documents       HMI      I/O + alarms  diff
     memory         sequence         provenance    bindings    hardware    handover
```

Every later feature is a reader of the index, not a parser of its own. That is
the cross-functionality requirement, and it is an architectural property
rather than an integration effort at the end.

## Phases

Each phase ends with the full baseline suite green, a completion report in the
format the brief asks for, and no feature described as more finished than it
is.

### Phase 1, foundations

The safety net, before touching anything that works.

- **Golden fixture layer first.** `tests/fixtures` and `tests/golden` are empty
  today, so nothing would catch a conversion whose output quietly changes
  shape, which is the exact regression consolidation risks. Synthetic projects:
  motor starter, reversing motor, conveyor, tank fill, duty/standby pumps, PID
  loop, alarm handling, multi-step sequence. Never a customer project.
- Feature flag mechanism, and the flag names from the brief.
- **Vendor connector architecture** in `ladx-vendor`: a capability trait,
  detection, version reporting, and isolated bridge processes. A connector that
  fails, or vendor software that is absent, reports "Not installed" and cannot
  take the app down with it.
- `ladx-ir` extended where it cannot yet represent everything `LadxProgram`
  can, proven by round-tripping the ladder editor's own programs.

Nothing user-visible changes. That is the intent.

### Phase 2, one IR and a real L5X reader

- L5X parsing deepened from names to content: rungs, structured text, routine
  source, controller and program tags, UDTs, AOIs with parameters and local
  tags, modules, comments, initial values, external access, revision. Anything
  the IR cannot model is preserved through `VendorDetail` rather than dropped.
- `L5X → IR → L5X` roundtrip under golden tests.
- Conversion reports: EXACT, APPROXIMATE, UNSUPPORTED, PRESERVED, MANUAL
  REVIEW REQUIRED.
- Convert and the ladder importer migrated onto the Rust IR behind a flag, the
  TypeScript stack retired only once golden output matches.

### Phase 3, project understanding

- The Engineering Project Index over the IR: controller, hardware, programs,
  tasks, routines, blocks, tags, data types, alarms, devices, comments.
- The dependency graph, and the relationships that make it useful: calls,
  reads, writes, interlocks, permissives.
- Retrieval that answers "what controls Motor_101" by walking the graph and
  sending only the relevant slice to the model. Whole projects are never sent.
- Project-aware chat on top of it.

### Phase 4, Siemens TIA Portal

Real, because the licence exists. Openness only, never `.apXX` parsing.

Detection, version, Openness availability, authorised-user check, project
inspection, device and block enumeration, tag tables, SCL generation, official
XML export, protected and safety block detection, IR import and export,
sandbox import, compilation and compiler diagnostics, before/after diff, and
explicit approval before any modification.

Never: download to PLC, force I/O, touch an online controller, bypass know-how
protection, or modify a safety program.

Each TIA version is verified individually before it is claimed.

### Phase 5, engineering memory

Project, company and user scopes. Forbidden and approved patterns. Editable,
inspectable, deletable, attributable, versioned, project-scoped. Retrieval
scored on similarity, project relationship, entity match, recency, priority and
approval status. Local on desktop. No hidden or irreversible memory.

The existing `memory_*` key/value commands keep working untouched; this is a
new surface beside them, not a replacement.

### Phase 6, engineering intelligence

Analyse Project as one action, producing a health report graded Critical,
Warning, Suggestion, Information, every finding linked to the entity it came
from. Sequence extraction. Code review. Troubleshooting that traces command,
permissives, interlocks, faults, output. Specialised agents over the shared
index, memory, validator and audit, rather than one large prompt.

### Phase 7, cross-vendor migration

Siemens ↔ Allen-Bradley, always source → parser → IR → exporter, never direct
pairs. Timer semantics treated as genuinely different rather than mapped and
hoped for. Validation levels 0 to 5 displayed honestly, with vendor
compilation as the only route to level 4.

### Phase 8, I/O, hardware and alarms

The I/O engineering model, hardware inventory, and alarm discovery from logic,
with the duplicate, conflict and consistency checks the brief lists. All three
read the index and write back to it.

### Phase 9, HMI and SCADA vendor export

A vendor-neutral HMI IR, PLC-to-HMI tag mapping, screen generation from
standards, then exporters. Nothing claims native vendor import compatibility
without a real vendor test.

### Phase 10, documents from project data

Documents generated from actual entities with provenance recorded, missing
information marked REQUIRES ENGINEER INPUT rather than invented, and selective
regeneration when one program changes.

### Phase 11, testing, review and handover

Structured tests from logic, FAT and SAT, project diff with semantic
descriptions and risk classes, tag drift across PLC, HMI, documentation and
I/O list, and the handover pack.

## What this plan does not promise

- **Scale.** This is a multi-month programme, not a sitting. Phases 1 to 3 are
  the ones that make everything after them possible, and they produce little
  visible product on their own. That is worth knowing before starting.
- **A finish line.** Later phases will change shape as earlier ones teach us
  things. The order is a dependency order, not a schedule.
- **Vendor certainty before vendor testing.** Siemens and Rockwell work is
  EXPERIMENTAL until it is tested against real software, whatever the tests in
  this repository say.

## Method

Per the brief: inspect, design note, data model, tests, core, bridge, UI,
failure behaviour, full regression, documentation. Small commits. No
repository-wide refactor.
