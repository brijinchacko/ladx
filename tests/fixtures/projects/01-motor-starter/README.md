# 01, motor starter

The seal-in, which is the first circuit anybody learns and the smallest one
that is not trivial.

Exercises:

- a parallel branch inside a series chain, the shape a flat model cannot hold
- a coil feeding back into its own condition side
- an NC-wired stop examined with a normally-open contact, which is correct and
  looks wrong to anyone reading the tag name alone. `Stop_PB` is
  `pushbuttonNc`, so the signal is 1 while the button is not pressed. A
  converter that "helpfully" negates it produces a machine that cannot be
  stopped.
