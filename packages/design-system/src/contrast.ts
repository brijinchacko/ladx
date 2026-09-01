// The theme values, and the arithmetic for judging them.
//
// Generated from globals.css by hand once and kept beside it. The pairs that
// matter are asserted in contrast.test.ts; this file only holds the numbers and
// the formula, so a failure points at a token rather than at a test helper.

export type ThemeName = "light" | "dark";

export const LIGHT: Record<string, string> = {
  action: "27 111 209",
  danger: "190 59 59",
  "danger-bg": "253 239 236",
  "danger-border": "228 180 168",
  "ink-100": "228 232 236",
  "ink-200": "197 205 212",
  "ink-300": "154 166 176",
  "ink-400": "89 104 117",
  "ink-50": "244 246 248",
  "ink-500": "71 88 102",
  "ink-600": "51 66 78",
  "ink-700": "34 46 55",
  "ink-800": "21 33 43",
  "ink-900": "15 26 36",
  "on-accent": "15 26 36",
  page: "255 255 255",
  raised: "255 255 255",
  success: "31 128 56",
  "success-bg": "236 250 240",
  "success-border": "168 220 184",
  "teal-100": "205 239 236",
  "teal-200": "156 223 217",
  "teal-300": "107 207 198",
  "teal-400": "63 191 181",
  "teal-50": "234 248 247",
  "teal-500": "46 163 154",
  "teal-600": "35 133 126",
  "teal-700": "27 104 98",
  "teal-800": "17 74 70",
  "teal-900": "10 48 45",
  warning: "143 100 18",
  "warning-bg": "253 246 236",
  "warning-border": "228 201 168",
};

export const DARK: Record<string, string> = {
  action: "109 167 236",
  danger: "235 116 116",
  "danger-bg": "58 21 18",
  "danger-border": "107 42 34",
  "ink-100": "27 36 44",
  "ink-200": "42 54 64",
  "ink-300": "61 76 87",
  "ink-400": "134 148 160",
  "ink-50": "19 27 34",
  "ink-500": "150 163 173",
  "ink-600": "178 189 197",
  "ink-700": "203 212 218",
  "ink-800": "225 231 235",
  "ink-900": "237 241 244",
  "on-accent": "15 26 36",
  page: "11 17 22",
  raised: "15 23 30",
  success: "74 201 106",
  "success-bg": "14 38 20",
  "success-border": "30 74 42",
  "teal-100": "17 74 70",
  "teal-200": "27 104 98",
  "teal-300": "35 133 126",
  "teal-400": "46 163 154",
  "teal-50": "10 48 45",
  "teal-500": "63 191 181",
  "teal-600": "107 207 198",
  "teal-700": "156 223 217",
  "teal-800": "205 239 236",
  "teal-900": "234 248 247",
  warning: "240 190 100",
  "warning-bg": "46 33 9",
  "warning-border": "90 67 26",
};

/** One token as an RGB triple, failing loudly rather than defaulting to black. */
export function token(theme: Record<string, string>, name: string): [number, number, number] {
  const raw = theme[name];
  if (!raw) throw new Error(`no token called ${name}`);
  const parts = raw.split(" ").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) {
    throw new Error(`${name} is not an rgb triple: ${raw}`);
  }
  return parts as [number, number, number];
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const lin = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

/** WCAG 2.1 contrast ratio, 1 to 21. */
export function contrast(a: [number, number, number], b: [number, number, number]): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
