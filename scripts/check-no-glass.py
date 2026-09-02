#!/usr/bin/env python3
"""No glassy or translucent surfaces.

A house rule: surfaces are solid, or a gradient. Not frosted, not tinted
through to whatever is behind them.

The reason it is checked rather than trusted is that translucency is the
easiest thing in Tailwind to add by habit: `bg-ink-100/70` is one character
different from `bg-ink-100`, reads the same in review, and looks fine on the
light theme where the ground behind it is white anyway. On a dark ground it
turns every panel into a slightly different colour from every other panel.

The one exception is a modal scrim. It is not a surface, it is the dimming over
the page behind a dialog, and a solid one would hide the context the dialog is
about rather than dimming it.

A scrim has to be black, though, and that is checked too, because making the
scrims solid is how this rule went wrong the first time. Seven of them were
written as `bg-ink-900/40`, the sweep took the alpha off all seven, and nobody
looked at them in the dark theme. The ink scale reverses there: ink-900 is
237 241 244, so every one of those dialogs opened onto a sheet of near white
with the page hidden behind it. A contrast audit does not catch it either, since
the panel on top is opaque and its own text reads fine.

So a scrim is black at an alpha, and only that. Both shapes are checked: the
`backdrop:` of a native <dialog>, and a `fixed inset-0` element painted with an
ink. `bg-white` and the surface tokens are left alone, because those mean the
same thing in both themes; it is the ink scale that flips under you.
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SKIP = {"node_modules", "target", ".next", ".next-build", ".git", ".turbo", "out", "generated"}
SUFFIXES = {".ts", ".tsx", ".css", ".js", ".jsx"}

# A scrim: black or a near-black, covering the viewport.
SCRIM = re.compile(r"\bbg-black/\d{1,3}\b")
TRANSLUCENT = re.compile(
    r"\b(?:bg|border|from|to|via|divide|ring)-"
    r"(?:ink|teal|white|page|action|danger|warning|success|neon-green)"
    r"(?:-(?:50|100|200|300|400|500|600|700|800|900|bg|border))?/\d{1,3}\b"
)
BLUR = re.compile(r"\bbackdrop-blur(?:-[a-z]+)?\b|backdrop-filter\s*:")
# A native <dialog> backdrop painted with anything but black.
BACKDROP = re.compile(r"\bbackdrop:bg-(?!black/)[\w/-]+")
# A full screen scrim painted from the ink scale, which reverses in dark.
INK_SCRIM = re.compile(r"fixed inset-0[^\"']*?\b(bg-ink-\d{2,3})\b")

found = []
for path in sorted(ROOT.rglob("*")):
    if path.suffix not in SUFFIXES or not path.is_file():
        continue
    if any(part in SKIP for part in path.parts):
        continue
    try:
        text = path.read_text(encoding="utf-8")
    except (UnicodeDecodeError, OSError):
        continue
    for n, line in enumerate(text.splitlines(), 1):
        rel = path.relative_to(ROOT)
        for m in BLUR.finditer(line):
            found.append((rel, n, f"frosted glass: {m.group(0)}", line.strip()[:88]))
        for m in TRANSLUCENT.finditer(line):
            found.append((rel, n, f"translucent surface: {m.group(0)}", line.strip()[:88]))
        for m in BACKDROP.finditer(line):
            found.append((rel, n, f"scrim that flips with the theme: {m.group(0)}", line.strip()[:88]))
        for m in INK_SCRIM.finditer(line):
            found.append((rel, n, f"scrim that flips with the theme: {m.group(1)}", line.strip()[:88]))
        # bg-black/NN scrims are allowed and deliberately not reported

if found:
    for rel, n, what, line in found:
        print(f"{rel}:{n}  {what}")
        print(f"    {line}")
    print(f"\n{len(found)} translucent or frosted surface(s).")
    print("Use the solid token instead, or a gradient. A modal scrim is bg-black/NN, and only that.")
    sys.exit(1)

print("ok  (no glassy or translucent surfaces)")
