import type { ExternalTag } from "@ladx/types";
import { describe, expect, it } from "vitest";
import { parseTagList } from "./tag-list";

/** The single source, asserting there is one, so the tests read as intended. */
function only(text: string, name?: string) {
  const sources = parseTagList(text, name);
  expect(sources).toHaveLength(1);
  const source = sources[0];
  if (!source) throw new Error("unreachable: just asserted one source");
  return source;
}

/** The first tag of a source, asserting there is one. */
function firstTag(source: { tags: ExternalTag[] }): ExternalTag {
  const tag = source.tags.at(0);
  if (!tag) throw new Error("expected at least one tag");
  return tag;
}

describe("parseTagList", () => {
  it("reads a plain column of names", () => {
    const source = only("Start_PB\nStop_PB\nMotor_Run");
    expect(source.tags.map((t) => t.name)).toEqual(["Start_PB", "Stop_PB", "Motor_Run"]);
    expect(firstTag(source).description).toBeNull();
  });

  it("reads a description and an address beside the name", () => {
    const source = only("Start_PB, Start button, I0.0");
    expect(firstTag(source)).toEqual({
      name: "Start_PB",
      description: "Start button",
      address: "I0.0",
    });
  });

  it("takes tabs and column spacing as well as commas", () => {
    const tabbed = only("Start_PB\tStart button\tI0.0");
    expect(firstTag(tabbed).address).toBe("I0.0");

    const spaced = only("Start_PB    Start button    I0.0");
    expect(firstTag(spaced).description).toBe("Start button");
  });

  it("strips the quotes a spreadsheet adds", () => {
    const source = only('"Start_PB","Start button, green","I0.0"');
    expect(firstTag(source).name).toBe("Start_PB");
  });

  // The rule that matters. A blank line becoming a tag called "" matches
  // nothing in the program, so every one of them turns into a "missing from
  // the PLC" finding and buries the real ones.
  it("drops lines that yield no name rather than making a tag called nothing", () => {
    const source = only("Start_PB\n\n   \n,,\nStop_PB\n");
    expect(source.tags.map((t) => t.name)).toEqual(["Start_PB", "Stop_PB"]);
    expect(source.tags.every((t) => t.name.length > 0)).toBe(true);
  });

  it("ignores the notes people leave in a pasted column", () => {
    const source = only("# from the HMI export\nStart_PB\n// checked 2026-08-30\nStop_PB");
    expect(source.tags.map((t) => t.name)).toEqual(["Start_PB", "Stop_PB"]);
  });

  it("an empty box is no source at all, not an empty one", () => {
    // An empty list compared against a program reports every wired point as
    // missing, which reads as forty findings rather than as nothing pasted.
    expect(parseTagList("")).toEqual([]);
    expect(parseTagList("\n\n   \n")).toEqual([]);
    expect(parseTagList("# just a note")).toEqual([]);
  });

  it("keeps a missing middle column as missing rather than shifting the address up", () => {
    const source = only("Start_PB,,I0.0");
    expect(firstTag(source).description).toBeNull();
    expect(firstTag(source).address).toBe("I0.0");
  });

  it("names the source, so a finding says where it came from", () => {
    const source = only("Start_PB", "HMI export");
    expect(source.name).toBe("HMI export");
  });
});
