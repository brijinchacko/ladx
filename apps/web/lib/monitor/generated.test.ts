import { type LadxProgram, resetTags, scan, seedPresets } from "@ladx/studio";
import { describe, expect, it } from "vitest";
import { GENERATED_MOTOR } from "./fixtures/generated-motor";

/**
 * A program the AI actually wrote, run.
 *
 * Not a fixture somebody hand-tuned until it passed. This is the JSON that came
 * back from the generate endpoint, driven through the real engine, checking the
 * three things a motor circuit has to do. It exists because "the validator
 * found nothing" says almost nothing: the two mistakes this caught in
 * development, a seal-in branch missing the stop conditions and a contact on a
 * timer rather than on its done bit, both pass validation and both produce a
 * machine that does the wrong thing.
 */
describe("a generated motor circuit", () => {
  const p: LadxProgram = GENERATED_MOTOR;

  function runner() {
    let tags = seedPresets(p, resetTags(p.tags));
    let edges: Record<string, boolean> = {};
    const named = (kind: "input" | "output", i: number) =>
      tags.filter((t) => (kind === "input" ? t.isInput : t.isOutput))[i]?.name ?? "";
    return {
      set: (name: string, v: number) => {
        tags = tags.map((t) => (t.name === name ? { ...t, value: v } : t));
      },
      get: (name: string) => tags.find((t) => t.name === name)?.value ?? 0,
      named,
      names: () => tags.map((t) => t.name),
      step: (dt: number) => {
        const r = scan(p, tags, edges, dt);
        tags = r.tags;
        edges = r.edges;
      },
    };
  }

  // The tag names are the model's choice, so they are found by role.
  const inputs = p.tags.filter((t) => t.isInput);
  const start = inputs.find((t) => t.device === "PUSHBUTTON_NO")?.name ?? "";
  const stops = inputs.filter((t) => t.device === "PUSHBUTTON_NC").map((t) => t.name);
  const motor = p.tags.find((t) => t.device === "MOTOR")?.name ?? "";
  const lamp = p.tags.find((t) => t.device === "LAMP")?.name ?? "";

  it("names a start, a normally closed stop, and a motor", () => {
    expect(start).not.toBe("");
    expect(stops.length).toBeGreaterThanOrEqual(1);
    expect(motor).not.toBe("");
  });

  it("latches on a momentary press and stays on when it is released", () => {
    const r = runner();
    for (const s of stops) r.set(s, 1);

    r.step(100);
    expect(r.get(motor)).toBe(0);

    r.set(start, 1);
    r.step(100);
    expect(r.get(motor)).toBe(1);

    // The button springs back. Only the seal-in holds it now.
    r.set(start, 0);
    for (let i = 0; i < 10; i++) r.step(100);
    expect(r.get(motor), "the seal-in does not hold").toBe(1);
  });

  it("stops when the stop button is pressed", () => {
    // The failure this catches: a seal-in leg without the stop conditions in
    // it latches the motor on and the stop button does nothing whatsoever.
    for (const stop of stops) {
      const r = runner();
      for (const s of stops) r.set(s, 1);
      r.set(start, 1);
      r.step(100);
      r.set(start, 0);
      r.step(100);
      expect(r.get(motor)).toBe(1);

      r.set(stop, 0);
      r.step(100);
      expect(r.get(motor), `pressing ${stop} did not stop the motor`).toBe(0);
    }
  });

  it("brings the lamp on after the delay, and not before", () => {
    // The other failure: a contact on the timer tag rather than on its done
    // bit reads a value that is always zero, so the lamp never comes on.
    const r = runner();
    for (const s of stops) r.set(s, 1);
    r.set(start, 1);
    r.step(100);
    r.set(start, 0);

    for (let i = 0; i < 20; i++) r.step(100);
    expect(r.get(lamp), "the lamp came on early").toBe(0);

    for (let i = 0; i < 40; i++) r.step(100);
    expect(r.get(lamp), "the lamp never came on").toBe(1);
  });
});
