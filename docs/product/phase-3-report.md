# Phase 3 completion report

Commits `66c1426`..`7880ca9`.

## Implemented

**The dependency graph** (`ladx_ir::graph`). What refers to what, computed from
the IR rather than inferred. Read against write is the distinction that does
the work: "which blocks write this output" and "where is this interlock used"
are different questions, and an index that only knows "mentioned here" cannot
tell them apart. Member references resolve to their tag, so `Jam_Timer.DN`
counts as reading `Jam_Timer`.

**The health report** (`ladx_ir::health`). Five checks, each written to know
what it is not: two plain coils on one bit is reported, a set and reset pair is
a latch and is not, a step register moved into from six rungs is a sequence and
is not. Checks that did not run are listed, because silence about a routine
nobody examined reads as a pass.

**The trace** (`ladx_ir::trace`). "Why won't it start", answered from the
program. Alternatives are marked as alternatives rather than requirements, and
the flat check-list deliberately stops at the first rung.

**Retrieval** (`ladx_ir::context`). The rungs a question is about, and nothing
else. Asking about one alarm in the alarm fixture sends three rungs of seven,
each naming where it came from.

**Both bridges.** `ladxProgramFromIr` and `ladxProgramToIr`, so the graph can
be pointed at programs in the editor rather than only at imported files. The
editor-to-IR direction loses nothing, which is the argument for the IR being
what everything converges on.

**Reachable and visible.** `analyse_project`, `project_health` and `why_not`
behind `engineering.analysis`. Ladder → Tools → *Look this program over*, and
*Why won't X come on?* on an element's right-click menu, both writing to the
output window.

**Prompt budgeting.** The generator listed every tag in the program; it now
caps at sixty, names the ones the request mentions first, and says what it left
out.

## Not implemented

- **Sequence extraction.** The IR has what it needs; the work is not started.
- **The web has none of the analysis UI.** The commands are desktop only.
- **Structured text is not analysed.** It is carried as source. Reading it
  would mean a second parser, and a half-right one puts wrong answers into the
  graph, which is worse than an absent one that is declared.

## Tests

| | Phase 2 end | Now | Change |
|---|---|---|---|
| Rust core | 156 | 217 | +61 |
| JavaScript | 897 | 915 | +18 |
| Desktop crate | 65 | 65 | 0 |
| **Total** | **1,118** | **1,197** | **+79** |

## Regressions

None. All 51 original Tauri commands present; 59 now.

## Bugs found by running it rather than reading it

- **An empty tag read as a tag named "".** Found on the program actually stored
  on this machine, not a fixture. A contact placed and not yet filled in
  produced `CRITICAL   is used but never declared`. It is the ordinary state of
  a rung being drawn, and reporting it as a missing tag is the false positive
  that gets a checker switched off.
- **The flat check-list inverted its own logic.** Following a condition that
  must be OFF inverts everything beneath it, so the first version said "check
  PE_Discharge is on" when the conveyor needs it clear. It would have sent
  somebody to the wrong end of the machine.
- **A comment describing behaviour the code did not have.** Cycles were cut a
  step earlier than documented, so a seal-in terminated but was never reported.
- **A member reference did not find its tag**, so a question about
  `Jam_Timer.DN` matched nothing.
- **The whole tag table went to the model** on every generate call.

## Vendor software tested

**None.** Unchanged from Phase 2. Nothing here has met TIA Portal or Studio
5000.

## Manual tests required

1. Ladder → Tools → *Look this program over* on a real program.
2. Right-click a coil → *Why won't X come on?*
3. Convert → *Open an L5X* with a project exported from Studio 5000.

## Next recommended phase

Phase 4, Siemens, which is the plan's priority 1 and the reason TIA Portal
access was confirmed. It is also the first phase where the work can be
validated against real vendor software rather than against LADX's own
fixtures, which is the thing every phase so far has been unable to do.
