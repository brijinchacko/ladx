import type { LadxProgram } from "@ladx/studio";

/**
 * The seal-in mistake, caught before it reaches the editor.
 *
 * A leg of a rung runs from the left rail to the output, so a seal-in leg that
 * contains only the coil's own contact latches the output on and leaves the
 * stop conditions with nothing to break. It looks right on the canvas, it
 * simulates as a motor that will not stop, and it is the commonest thing a
 * model gets wrong here. The editor's validator checks structure and tags, not
 * intent, so this is checked separately and reported alongside.
 */
export function sealInWarnings(program: LadxProgram): string[] {
  const out: string[] = [];
  for (const rung of program.rungs) {
    const coils = rung.outputs.filter((o) => o.type === "OTE").map((o) => o.tag);
    if (coils.length === 0 || rung.branches.length < 2) continue;

    for (const coil of coils) {
      const sealIn = rung.branches.find((leg) => leg.some((el) => el.tag === coil));
      if (!sealIn) continue;
      const others = rung.branches.filter((leg) => leg !== sealIn);
      const shortest = Math.min(...others.map((leg) => leg.length));
      if (sealIn.length < shortest) {
        out.push(
          `The seal-in branch on "${coil}" has fewer conditions than the branch beside it, so once it latches the stop conditions cannot break it. Check that branch before running this.`,
        );
      }
    }
  }
  return out;
}
