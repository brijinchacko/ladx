// A tag list as somebody actually has it: a column out of a spreadsheet.
//
// Asking for a file format would mean asking people to make one, and the HMI
// exports that matter are a name per line with maybe a description and an
// address beside it. So the parsing is deliberately forgiving about layout and
// deliberately strict about one thing: a line that yields no tag name is
// dropped rather than turned into a tag called "".
//
// That single rule matters more than it looks. An empty tag name compared
// against a program matches nothing, so every one of them becomes a "missing
// from the PLC" finding, and a report with forty of those in it is a report
// nobody reads to the end.

import type { ExternalTag, TagSource } from "@ladx/types";

/** One pasted list, as the drift check wants it. */
export function parseTagList(text: string, name = "Pasted list"): TagSource[] {
  const tags = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    // A leading # or // is how people annotate a pasted column.
    .filter((line) => !line.startsWith("#") && !line.startsWith("//"))
    .map(toTag)
    .filter((t): t is ExternalTag => t !== null);

  return tags.length > 0 ? [{ name, tags }] : [];
}

function toTag(line: string): ExternalTag | null {
  // Commas, then tabs, then any run of two or more spaces: the three ways a
  // column arrives from a spreadsheet.
  const parts = (
    line.includes(",")
      ? line.split(",")
      : line.includes("\t")
        ? line.split("\t")
        : line.split(/ {2,}/)
  ).map((p) => p.trim());

  const name = stripQuotes(parts[0] ?? "");
  if (!name) return null;

  return {
    name,
    description: stripQuotes(parts[1] ?? "") || null,
    address: stripQuotes(parts[2] ?? "") || null,
  };
}

function stripQuotes(s: string): string {
  const t = s.trim();
  if (
    t.length >= 2 &&
    ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'")))
  ) {
    return t.slice(1, -1).trim();
  }
  return t;
}
