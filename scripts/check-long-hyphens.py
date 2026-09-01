#!/usr/bin/env python3
"""No long hyphens, anywhere.

A house style rule, and one that is easy to reintroduce without noticing:
an em dash reads almost the same as a colon in an editor, and it arrives by
habit rather than by decision. It has already come back twice.

Checked here rather than trusted, because the places it matters most are
generated documents and drawing templates, where nobody looks at the source
again after it is written.

Scoped to code and to the strings it produces. The prose documents,
MASTER_BUILD_SPEC.md, CLAUDE.md, the README and the ADRs, were written by hand
and carry about ninety of these between them; sweeping those is an edit to
somebody's writing rather than a lint, and belongs in its own decision.
"""
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
LONG = {"—": "em dash", "–": "en dash", "―": "horizontal bar"}
SUFFIXES = {".ts", ".tsx", ".rs", ".js", ".mjs", ".json", ".css", ".html"}
SKIP = {"node_modules", "target", ".next", ".next-build", ".git", ".turbo", "generated", "out"}

found = []
for path in ROOT.rglob("*"):
    if path.suffix not in SUFFIXES or not path.is_file():
        continue
    if any(part in SKIP for part in path.parts):
        continue
    try:
        text = path.read_text(encoding="utf-8")
    except (UnicodeDecodeError, OSError):
        continue
    for n, line in enumerate(text.splitlines(), 1):
        for char, name in LONG.items():
            if char in line:
                found.append((path.relative_to(ROOT), n, name, line.strip()[:90]))

if found:
    for rel, n, name, line in found:
        print(f"{rel}:{n}  {name}")
        print(f"    {line}")
    print(f"\n{len(found)} long hyphen(s). Use a colon, a comma, or a plain hyphen.")
    sys.exit(1)

print("ok  (no long hyphens)")
