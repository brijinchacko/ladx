# Fixture projects

Eight synthetic PLC projects, written as LADX IR documents. They are the input
to the golden tests in `tests/golden`, and they are the reference set every
parser, exporter and converter added from here on is measured against.

**Never commit a customer project here.** Everything in this directory is
invented. That is not only a licensing position: a fixture has to be readable
in a diff, and a real project is neither small enough nor ours to publish.

## The set

| Fixture | What it is there to catch |
|---|---|
| `01-motor-starter` | A parallel branch inside a series chain, and a coil feeding its own condition. An NC-wired stop read by a normally-open contact, which a converter must not "correct". |
| `02-reversing-motor` | Mutual interlocks. Dropping one contact here shorts a reversing contactor. |
| `03-conveyor` | Timer presets in milliseconds, a done bit read on a later rung, and a deliberately unmatched latch for a health check to find. |
| `04-tank-filling` | A matched set/reset pair, and a bare top-level parallel with no series wrapper. |
| `05-duty-standby-pumps` | A one-scan rising edge, and two near-mirror rungs for a diff to tell apart. |
| `06-pid-loop` | **Preservation.** An instruction the IR does not model, kept whole. |
| `07-alarm-handling` | Several instructions on one output rung, a wide summary parallel, and a timer whose own done bit gates it. |
| `08-multi-step-sequence` | Two POUs and a call between them, an integer step register, and a reset path from anywhere to idle. |

Each directory has a `README.md` saying what that fixture exercises and why.

## 06 is the one that matters most

`06-pid-loop` contains a `PID` instruction. The IR has no opcode for it, so it
imports as `unsupported` with the mnemonic and all five tuning parameters held
verbatim in `vendor`.

That is the contract everything else depends on: LADX must carry a project
through import and export without silently discarding the parts it cannot
read. `an_unmodelled_instruction_keeps_everything_it_arrived_with` asserts it
by name. If that test ever fails, an import is deleting tuning parameters out
of a working loop.

## Editing

The JSON is the artefact. `tools/fixtures/build_fixtures.py` regenerates the
whole set and exists so eight projects could be written without eight thousand
lines of hand-typed braces. It is deterministic, and ids are numbered per
fixture so that inserting a project does not renumber the ones after it.

Changing a fixture changes golden output. That is meant to be visible:

```bash
python3 tools/fixtures/build_fixtures.py
UPDATE_GOLDEN=1 cargo test -p ladx-ir --test golden
```

Read the golden diff before committing it. A golden diff in a commit that was
not supposed to change behaviour is the entire reason these files exist.
