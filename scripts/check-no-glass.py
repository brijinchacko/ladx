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
        # scrims are allowed and deliberately not reported

if found:
    for rel, n, what, line in found:
        print(f"{rel}:{n}  {what}")
        print(f"    {line}")
    print(f"\n{len(found)} translucent or frosted surface(s).")
    print("Use the solid token instead, or a gradient. A modal scrim (bg-black/NN) is exempt.")
    sys.exit(1)

print("ok  (no glassy or translucent surfaces)")
