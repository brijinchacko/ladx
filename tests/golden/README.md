# Golden output

Generated from `tests/fixtures`. Do not edit by hand.

```bash
UPDATE_GOLDEN=1 cargo test -p ladx-ir --test golden
```

These files assert that nothing changed, including the parts nobody thought to
check. That is what a unit test cannot do: a unit test asserts what its author
already considered, and the failure mode of the IR consolidation work is not a
crash but a conversion that still runs and quietly produces different output.

A diff here in a commit that was not meant to change output is a bug, not a
file to refresh.
