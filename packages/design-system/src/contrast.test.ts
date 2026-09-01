// Every colour pair the app actually puts together, in both themes.
//
// Measured in a browser once and found 21 failures in light and 2 in dark, all
// real: the muted grey had been below AA on light surfaces since before there
// was a dark theme, and the primary call to action was light-on-teal at 2.7 to
// 1 once the ink scale flipped.
//
// A browser is not needed to keep it that way. The pairs are known, the token
// values are known, and the arithmetic is the same arithmetic. This runs in
// milliseconds and fails on the token, which is where the fix goes anyway.

import { describe, expect, it } from "vitest";
import { DARK, LIGHT, type ThemeName, contrast, token } from "./contrast";

/** Text token, the surface it sits on, and what it is. */
const PAIRS: { fg: string; bg: string; what: string; large?: boolean }[] = [
  { fg: "ink-900", bg: "page", what: "body text on the page" },
  { fg: "ink-900", bg: "raised", what: "body text on a panel" },
  { fg: "ink-900", bg: "ink-50", what: "body text on a subtle fill" },
  { fg: "ink-700", bg: "raised", what: "secondary text on a panel" },
  { fg: "ink-600", bg: "raised", what: "secondary text on a panel" },
  { fg: "ink-500", bg: "raised", what: "muted text on a panel" },
  { fg: "ink-500", bg: "ink-50", what: "muted text on a subtle fill" },
  { fg: "ink-400", bg: "raised", what: "the muted grey, used 312 times" },
  { fg: "ink-400", bg: "page", what: "the muted grey on the page" },
  { fg: "ink-400", bg: "ink-50", what: "the muted grey on a subtle fill" },
  { fg: "ink-400", bg: "teal-50", what: "a small label on a teal chip" },
  { fg: "raised", bg: "ink-900", what: "the label on a primary button" },
  { fg: "on-accent", bg: "teal-400", what: "the label on a teal button" },
  { fg: "on-accent", bg: "teal-500", what: "the label on a teal button" },
  { fg: "teal-700", bg: "raised", what: "a teal link on a panel" },
  { fg: "teal-800", bg: "teal-50", what: "teal text on a teal chip" },
  { fg: "danger", bg: "raised", what: "an error message" },
  { fg: "success", bg: "raised", what: "a success message" },
  { fg: "warning", bg: "raised", what: "a warning" },
];

const THEMES: [ThemeName, Record<string, string>][] = [
  ["light", LIGHT],
  ["dark", DARK],
];

describe("colour contrast", () => {
  for (const [name, theme] of THEMES) {
    describe(name, () => {
      for (const pair of PAIRS) {
        const need = pair.large ? 3 : 4.5;
        it(`${pair.what}: ${pair.fg} on ${pair.bg}`, () => {
          const ratio = contrast(token(theme, pair.fg), token(theme, pair.bg));
          expect(
            ratio,
            `${ratio.toFixed(2)}:1, needs ${need}:1 in the ${name} theme`,
          ).toBeGreaterThanOrEqual(need);
        });
      }
    });
  }

  it("defines the same tokens in both themes", () => {
    expect(Object.keys(LIGHT).sort()).toEqual(Object.keys(DARK).sort());
  });

  // The whole reason the scale can flip without touching markup: low numbers
  // are surfaces and high numbers are text, in both themes. If a theme broke
  // that ordering, `text-ink-900` would stop meaning "strongest text".
  it("keeps the scale ordered, so the same class means the same thing", () => {
    for (const [name, theme] of THEMES) {
      const steps = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900];
      const lums = steps.map((s) => relative(token(theme, `ink-${s}`)));
      const towardsText = name === "light" ? -1 : 1;
      for (let i = 1; i < lums.length; i++) {
        const delta = (lums[i] as number) - (lums[i - 1] as number);
        expect(Math.sign(delta), `ink-${steps[i]} breaks the ramp in the ${name} theme`).toBe(
          towardsText,
        );
      }
    }
  });
});

function relative(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
