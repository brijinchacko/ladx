# 07, alarm handling

Exercises:

- three latched alarms cleared by one reset rung, so an output rung with
  several instructions on it is covered
- a summary alarm built from a wide top-level parallel
- a self-silencing horn: a timer whose own done bit is in its condition, which
  is a small feedback loop and a good test of evaluation order
- the raw material for alarm discovery later, since these are exactly the
  latch-on-condition shapes that pass should find
