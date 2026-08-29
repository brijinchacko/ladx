# 06, PID loop

The preservation fixture, and the most important one in the set.

`PID` is not in the IR's instruction list. It imports as `unsupported` with the
mnemonic and all five tuning parameters kept verbatim in `vendor`. That is the
contract the whole conversion story rests on: LADX must be able to carry a
project through import and export without silently dropping the part it cannot
read.

A conversion of this fixture must report the PID as UNSUPPORTED or PRESERVED
and must not lose `Kp`, `Ki`, `Kd`, `UpdateTime` or `ControlMode`. If a golden
diff ever shows those gone, the export is destroying customer projects.

Also exercises:

- REAL tags and an analog comparison against a float literal
- a tag with an initial value
- `source_vendor` set, which is what an exporter reads to pick a dialect
