# Phase 2 completion report

12 commits, `debb0e4`..`f8c4796`. 49 files, +4,215 / −16.

## Implemented

**L5X read for its content.** `ladx_parsers::l5x_ir` reads controller, UDTs
(dropping Rockwell's hidden padding members), controller and program tags kept
apart, routines in RLL and ST, rung logic, rung comments, and Add-On
Instructions with their interface. The name-only reader is untouched and still
backs the project picker.

**L5X written back.** `ladx_parsers::l5x_write`, with all eight fixtures
round-tripping through a real file: same tags, same routines, same rung text,
same comments, PID intact on the far side. The exported L5X is golden.

**Conversion reports.** `ladx_ir::fidelity`, with EXACT, APPROXIMATE,
UNSUPPORTED, PRESERVED and MANUAL REVIEW. `PRESERVED` counts as a success:
content LADX has no opinion about and passes through untouched has been handled
correctly.

**Reachable on both surfaces.** Desktop: `l5x_import`, `l5x_export`,
`pick_and_import_l5x`. Web: `GET /api/projects/:id/ir`, and `--ir` on the
parser binary. All gated on `vendor.rockwell`.

**Switchable.** Settings lists every capability with its maturity, built from
the Rust registry so the screen cannot fall behind the code.

**Visible.** Convert grows a second way in when the capability is on, and shows
the conversion report through the notes panel it already had.

**Compared.** Both L5X readers run over the same bytes and the differences are
named and asserted rather than assumed away.

## Partially implemented

- Only L5X reads into the IR. PLCopen still produces the manifest shape only.
- `l5x_export` exists as a command but nothing in the UI calls it yet.
- The web has the route but no UI uses it; the desktop is where this is visible.

## Not implemented

**Retiring the TypeScript reader**, which the plan lists as the end of this
phase. It should not happen yet, and the reasons are worth stating rather than
carrying as a silent omission:

1. **No real exported L5X has been through the Rust reader.** Everything is
   validated against LADX's own fixtures and three synthetic demo files. The
   TypeScript reader has been in front of users; the Rust one has not.
2. **A product decision is open.** On a `REAL`, the two readers make different
   and both defensible choices: TypeScript omits the tag and says so, Rust
   keeps it as an INT and says so. Picking one quietly during a consolidation
   is how a behaviour nobody chose becomes permanent.
3. **The structural difference runs the other way.** The Rust reader is better
   here, keeping the branch tree where TypeScript repeats shared contacts, but
   that means retirement changes what users see, not just what runs.

Retiring it is a decision, not a cleanup. It needs a real project through the
new path first.

## Tests

| | Phase 1 end | Now | Change |
|---|---|---|---|
| Rust core | 110 | 156 | +46 |
| JavaScript | 860 | 897 | +37 |
| Desktop crate | 62 | 65 | +3 |
| **Total** | **1,032** | **1,118** | **+86** |

All green. Lint clean over 544 files, typecheck 10/10, build 3/3.

## Regressions

None. All 51 original Tauri commands are still registered, checked by name;
there are 56 now. `pick_and_parse_project`, the project picker and the existing
Convert file input are untouched.

## Bugs found and fixed during the phase

Worth listing, because most were found by running the code rather than reading
it:

- **Self-closing XML elements were silently dropped.** quick-xml reports
  `<Tag .../>` as `Empty` with no closing event, and most tags in an L5X are
  self-closing. Every program tag vanished.
- **AOIs were missing entirely** from the IR reader, which the old reader
  lists. Found by pointing it at the files on this machine.
- **A POU's name changed when the file was written.** The program was folded
  into the name, so a POU arriving without one had it invented by the exporter
  and came home under a different name. Now `Pou::container`.
- **Undeclared data types were read as BOOL silently**, which on the demo files
  is every tag including one called `Conveyor1_Speed`.
- **A REAL became an INT silently** in the IR-to-editor bridge.
- **A gate with no key**: the flags gated real commands for four commits with
  no way to switch one on.

## Security impact

One new authenticated route, protected by the existing default-closed rule and
verified with a 401. No new outbound call; the desktop network policy is
unchanged and the build guard still passes.

## Performance impact

The IR path holds a whole project in memory where the manifest path held names.
That is the point of it, but it is why the desktop uses a native dialog and
passes a path rather than moving bytes across the IPC boundary.

## Vendor software tested

**None.** No Studio 5000, no TIA Portal. `vendor.rockwell` reports
`Not built yet` and the Settings row says "Not yet tested against Studio 5000",
held there by a test.

## Manual tests required

1. Turn on **Studio 5000 and L5X** in Settings, open Convert, and use
   **Open an L5X**. Nobody has clicked this; it is verified in pieces only.
2. Feed it a real project exported from Studio 5000:
   `cargo run -p ladx-parsers --example read_l5x -- <file> --write`.
3. Take what `l5x_export` writes and try to import it into Studio 5000. That is
   the test that decides whether any of this is real.

## Next recommended phase

Phase 3, project understanding. The IR now holds enough to build on: rung
logic, tags with scope, calls between POUs. The dependency graph and the
retrieval that answers "what controls Motor_101" are the next thing, and they
are what most of the later phases read from.
