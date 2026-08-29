# 08, multi-step sequence

The only fixture with more than one POU, and the one sequence extraction and
the dependency graph will be built against.

Exercises:

- a `call` between POUs, so `entry_point` means something and a call graph has
  an edge to find
- an integer step register driven by `move` with literal sources, the most
  common sequence idiom on both platforms
- `equal` comparisons on the condition side, where fixture 06 uses one as well
  but against a float
- a transition guarded by a timer done bit
- a reset path that jumps the sequence straight to idle from anywhere, which is
  what "which faults reset the sequence?" has to be able to answer
