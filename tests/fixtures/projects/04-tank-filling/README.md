# 04, tank filling

Set/reset state rather than a seal-in, which is the other way this is written
and the one that converts least predictably.

Exercises:

- `setCoil` and `resetCoil` as a matched pair, so a reviewer can tell this apart
  from fixture 03 where the pair is deliberately incomplete
- a top-level parallel as the whole condition side, no series wrapper
- a maintained selector, where fixture 01 has momentary buttons
