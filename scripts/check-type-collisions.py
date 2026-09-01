#!/usr/bin/env python3
"""Two Rust types with the same name exporting to the same directory.

ts-rs names the generated file after the Rust type, so when two types share a
name and a destination the second one silently overwrites the first. Nothing
fails: the crate builds, the tests pass, and the wrong shape sits in the
bindings until something downstream tries to read a field that is no longer
there. That is how `hardware::Finding` quietly replaced `health::Finding`.

Checked here because there is nowhere in the Rust build it can be checked: the
two types are legal, they are in different modules, and only their generated
filenames collide.
"""
import pathlib
import re
import sys
from collections import defaultdict

root = pathlib.Path(__file__).resolve().parent.parent
pattern = re.compile(
    r'#\[ts\((?:[^\]]*?)export_to\s*=\s*"([^"]+)"[^\]]*\)\]\s*'
    r'(?:#\[[^\]]*\]\s*)*'
    r'pub\s+(?:struct|enum)\s+([A-Za-z0-9_]+)'
)

seen = defaultdict(list)
for path in sorted(root.glob("packages/core/crates/*/src/**/*.rs")):
    text = path.read_text(encoding="utf-8")
    for dest, name in pattern.findall(text):
        seen[(dest.rstrip("/"), name)].append(str(path.relative_to(root)))

clashes = {k: v for k, v in seen.items() if len(v) > 1}
if clashes:
    for (dest, name), files in sorted(clashes.items()):
        print(f"{name} is exported to {dest}/ by more than one type:")
        for f in files:
            print(f"    {f}")
        print("  One overwrites the other. Rename one of them.")
    sys.exit(1)

print(f"ok  ({len(seen)} exported types, no name collides in a shared directory)")
