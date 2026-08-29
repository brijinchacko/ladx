#!/usr/bin/env python3
"""
The LADX icon family, generated from the X in the wordmark.

Run by hand when the mark changes, not by the build: these are brand artwork
and they live in the repository the same way `wordmark.png` does, so nothing in
CI needs an image toolchain.

    python3 packages/ui/assets/brand/build-icons.py

The geometry is the same X that `packages/ui/src/components/brand/x-mark.tsx`
draws, and the two are meant to stay identical. It was measured off the
wordmark: 195 by 140, strokes 34 wide horizontally, mirror images about x=97.5.
The ends are cut horizontally rather than square to the stroke, which is why
each one is a polygon rather than a line with a stroke width.

Two things are set by eye rather than by rule, and both are optical rather
than arbitrary:

* The X is 64% of the tile. Smaller reads as lost inside the ground at 180 and
  vanishes at 16; larger starts crowding the corners once a platform lays its
  own rounding over the top.
* The corner radius is 22% of the tile above 48 pixels and 18% below. 22% of a
  16 pixel tile is three and a half pixels, which turns the square into
  something closer to a circle at exactly the size where the shape is all the
  reader has to go on.
"""

import os
import subprocess
import sys

try:
    from PIL import Image, ImageDraw
except ImportError:
    sys.exit("This needs Pillow: pip3 install Pillow")

W, H = 195, 140
DOWN_RIGHT = [(1, 0), (35, 0), (195, 140), (161, 140)]
DOWN_LEFT = [(160, 0), (194, 0), (34, 140), (0, 140)]

INK = (15, 26, 36, 255)      # --ladx-ink  #0F1A24
TEAL = (53, 182, 186, 255)   # --ladx-teal #35B6BA

X_FRACTION = 0.64
SUPERSAMPLE = 8              # drawn this many times over, then shrunk, for clean edges

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))


def radius_fraction(size: int) -> float:
    return 0.18 if size <= 48 else 0.2227


def tile(size: int) -> Image.Image:
    """One icon: the ground, then the X centred on it."""
    s = size * SUPERSAMPLE
    im = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, s - 1, s - 1], radius=radius_fraction(size) * s, fill=INK)

    k = size * X_FRACTION / W * SUPERSAMPLE
    ox = (s - W * k) / 2
    oy = (s - H * k) / 2
    for poly in (DOWN_RIGHT, DOWN_LEFT):
        d.polygon([(ox + x * k, oy + y * k) for x, y in poly], fill=TEAL)

    return im.resize((size, size), Image.LANCZOS)


def bare_x(height: int, colour=TEAL) -> Image.Image:
    """The glyph with no ground, for anywhere that has its own."""
    w = round(height * W / H)
    s = SUPERSAMPLE
    im = Image.new("RGBA", (w * s, height * s), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    k = w * s / W
    for poly in (DOWN_RIGHT, DOWN_LEFT):
        d.polygon([(x * k, y * (height * s / H)) for x, y in poly], fill=colour)
    return im.resize((w, height), Image.LANCZOS)


def svg_master() -> str:
    """The editable master. Every raster below is this shape."""
    k = 512 * X_FRACTION / W
    ox, oy = (512 - W * k) / 2, (512 - H * k) / 2
    pts = lambda p: " ".join(f"{x},{y}" for x, y in p)
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <title>LADX</title>
  <rect width="512" height="512" rx="114" ry="114" fill="#0F1A24"/>
  <g transform="translate({ox:.4f} {oy:.4f}) scale({k:.6f})" fill="#35B6BA">
    <polygon points="{pts(DOWN_RIGHT)}"/>
    <polygon points="{pts(DOWN_LEFT)}"/>
  </g>
</svg>
"""


def write(path: str, im: Image.Image) -> None:
    full = os.path.join(ROOT, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    im.save(full)
    print(f"  {path}  {im.size[0]}x{im.size[1]}")


def main() -> None:
    print("brand master")
    master = os.path.join(HERE, "icon.svg")
    with open(master, "w", encoding="utf-8") as f:
        f.write(svg_master())
    print(f"  {os.path.relpath(master, ROOT)}")
    write("packages/ui/assets/brand/icon-192.png", tile(192))
    write("packages/ui/assets/brand/icon-512.png", tile(512))
    write("packages/ui/assets/brand/icon-1024.png", tile(1024))
    write("packages/ui/assets/brand/x-mark.png", bare_x(280))

    print("web")
    write("apps/web/public/favicon-16.png", tile(16))
    write("apps/web/public/favicon-32.png", tile(32))
    write("apps/web/public/apple-touch-icon.png", tile(180))
    # A .ico as well as the PNGs: some feed readers and older browsers ask for
    # /favicon.ico by name and never look at the link tags.
    ico = os.path.join(ROOT, "apps/web/app/favicon.ico")
    tile(48).save(ico, sizes=[(16, 16), (32, 32), (48, 48)])
    print("  apps/web/app/favicon.ico  16/32/48")

    print("desktop")
    for name, size in [
        ("32x32.png", 32),
        ("64x64.png", 64),
        ("128x128.png", 128),
        ("128x128@2x.png", 256),
        ("icon.png", 512),
        ("Square30x30Logo.png", 30),
        ("Square44x44Logo.png", 44),
        ("Square71x71Logo.png", 71),
        ("Square89x89Logo.png", 89),
        ("Square107x107Logo.png", 107),
        ("Square142x142Logo.png", 142),
        ("Square150x150Logo.png", 150),
        ("Square284x284Logo.png", 284),
        ("Square310x310Logo.png", 310),
        ("StoreLogo.png", 50),
    ]:
        write(f"apps/desktop/src-tauri/icons/{name}", tile(size))

    ico = os.path.join(ROOT, "apps/desktop/src-tauri/icons/icon.ico")
    tile(256).save(ico, sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    print("  apps/desktop/src-tauri/icons/icon.ico  16..256")

    # .icns through iconutil, which is the only thing that produces one macOS
    # is happy with. Falls back loudly rather than leaving a stale icon behind.
    iconset = os.path.join(ROOT, "apps/desktop/src-tauri/icons/icon.iconset")
    os.makedirs(iconset, exist_ok=True)
    for name, size in [
        ("icon_16x16.png", 16), ("icon_16x16@2x.png", 32),
        ("icon_32x32.png", 32), ("icon_32x32@2x.png", 64),
        ("icon_128x128.png", 128), ("icon_128x128@2x.png", 256),
        ("icon_256x256.png", 256), ("icon_256x256@2x.png", 512),
        ("icon_512x512.png", 512), ("icon_512x512@2x.png", 1024),
    ]:
        tile(size).save(os.path.join(iconset, name))
    try:
        subprocess.run(
            ["iconutil", "-c", "icns", iconset, "-o",
             os.path.join(ROOT, "apps/desktop/src-tauri/icons/icon.icns")],
            check=True, capture_output=True,
        )
        print("  apps/desktop/src-tauri/icons/icon.icns")
    except (FileNotFoundError, subprocess.CalledProcessError) as e:
        sys.exit(f"iconutil failed, so icon.icns was NOT rebuilt: {e}")
    finally:
        for f in os.listdir(iconset):
            os.remove(os.path.join(iconset, f))
        os.rmdir(iconset)


if __name__ == "__main__":
    main()
