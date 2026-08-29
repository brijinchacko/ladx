# Golden output

Generated from `tests/fixtures`. Do not edit by hand.

Two sets, regenerated separately:

```bash
# .st.txt, structured text from the IR
UPDATE_GOLDEN=1 cargo test -p ladx-ir --test golden

# .L5X, what an export writes
UPDATE_GOLDEN=1 cargo test -p ladx-parsers --test l5x_golden
```

The `.L5X` files live here rather than under `tests/fixtures` on purpose: they
are output, not input. The fixtures are the IR documents; these are what LADX
produces from them, and freezing that is what makes a change in the exporter
visible.

These files assert that nothing changed, including the parts nobody thought to
check. That is what a unit test cannot do: a unit test asserts what its author
already considered, and the failure mode of the IR consolidation work is not a
crash but a conversion that still runs and quietly produces different output.

A diff here in a commit that was not meant to change output is a bug, not a
file to refresh.
