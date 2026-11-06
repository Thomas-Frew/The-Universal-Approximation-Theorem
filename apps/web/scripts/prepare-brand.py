#!/usr/bin/env python3
"""
Makes everything the browser shows of the logo from the master,
apps/web/brand/logo.png (1024 px, the owl on cream). Run after changing the
logo, from the repo root:

    pnpm --filter @uat/web brand

It:
1. writes brand/logo-dark.png, the logo inverted for the Coffee theme: its two
   colours swapped (owl brown for cream and back), not a photographic
   negative, which would turn the brown blue. The soft edges between the two
   are blends of them, so each pixel is placed by how far it lies from cream
   towards the owl, and moved the same distance from the owl towards cream;
2. makes the 32 px tab icons, public/favicon.png and public/favicon-dark.png
   (swapped with the theme by `brand` in src/lib/theme.ts), and the 180 px iOS
   home-screen icon, public/apple-touch-icon.png, and the 512 px link-preview
   picture, public/og-image.png, with macOS's sips.

CREAM and OWL are the logo's two colours, and are also Paper's Vellum and the
Coffee theme's Vellum in index.css: change them together. Needs macOS (for
sips) and an 8-bit, non-interlaced RGB or RGBA PNG; nothing else is installed.
"""

import struct
import subprocess
import zlib
from pathlib import Path

WEB = Path(__file__).resolve().parent.parent
MASTER = WEB / "brand" / "logo.png"
DARK = WEB / "brand" / "logo-dark.png"

CREAM = (0xEF, 0xE6, 0xD8)
OWL = (0x29, 0x21, 0x1C)

# (source, size in px, output in public/)
ICONS = [
    (MASTER, 32, "favicon.png"),
    (DARK, 32, "favicon-dark.png"),
    (MASTER, 180, "apple-touch-icon.png"),
    # The picture in link previews (Discord, Slack, iMessage): og:image in index.html.
    (MASTER, 512, "og-image.png"),
]


def read_png(path: Path) -> tuple[int, int, list[list[tuple[int, ...]]]]:
    """The pixels as rows of (r, g, b, a). Python's zlib does the decompressing; the rest is PNG's row filters."""
    data = path.read_bytes()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise SystemExit(f"{path} is not a PNG")
    pos, idat = 8, b""
    width = height = bpp = 0
    while pos < len(data):
        length, kind = struct.unpack(">I4s", data[pos : pos + 8])
        body = data[pos + 8 : pos + 8 + length]
        pos += 12 + length
        if kind == b"IHDR":
            width, height, depth, colour, _, _, interlace = struct.unpack(">IIBBBBB", body)
            if depth != 8 or colour not in (2, 6) or interlace != 0:
                raise SystemExit(f"{path}: needs an 8-bit, non-interlaced RGB or RGBA PNG")
            bpp = 4 if colour == 6 else 3
        elif kind == b"IDAT":
            idat += body

    raw = zlib.decompress(idat)
    stride = width * bpp
    rows: list[list[tuple[int, ...]]] = []
    previous = bytearray(stride)
    at = 0
    for _ in range(height):
        kind, line = raw[at], bytearray(raw[at + 1 : at + 1 + stride])
        at += 1 + stride
        for x in range(stride):
            left = line[x - bpp] if x >= bpp else 0
            up = previous[x]
            corner = previous[x - bpp] if x >= bpp else 0
            if kind == 1:
                line[x] = (line[x] + left) & 255
            elif kind == 2:
                line[x] = (line[x] + up) & 255
            elif kind == 3:
                line[x] = (line[x] + (left + up) // 2) & 255
            elif kind == 4:
                guess = left + up - corner
                near = min((abs(guess - left), 0, left), (abs(guess - up), 1, up), (abs(guess - corner), 2, corner))
                line[x] = (line[x] + near[2]) & 255
        rows.append([tuple(line[x * bpp : x * bpp + bpp]) + ((255,) if bpp == 3 else ()) for x in range(width)])
        previous = line
    return width, height, rows


def write_png(path: Path, width: int, height: int, rows: list[list[tuple[int, ...]]]) -> None:
    raw = b"".join(b"\x00" + bytes(value for pixel in row for value in pixel) for row in rows)

    def chunk(kind: bytes, body: bytes) -> bytes:
        return struct.pack(">I", len(body)) + kind + body + struct.pack(">I", zlib.crc32(kind + body))

    path.write_bytes(
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )


def invert(rows: list[list[tuple[int, ...]]]) -> list[list[tuple[int, ...]]]:
    span = [owl - cream for cream, owl in zip(CREAM, OWL)]
    norm = sum(step * step for step in span)
    out = []
    for row in rows:
        line = []
        for pixel in row:
            # 0 at cream, 1 at the owl: how far along the line between them this pixel lies.
            t = sum((value - cream) * step for value, cream, step in zip(pixel, CREAM, span)) / norm
            t = max(0.0, min(1.0, t))
            line.append(tuple(round(owl + (cream - owl) * t) for cream, owl in zip(CREAM, OWL)) + (pixel[3],))
        out.append(line)
    return out


def main() -> None:
    width, height, rows = read_png(MASTER)
    write_png(DARK, width, height, invert(rows))
    print(f"wrote {DARK.relative_to(WEB)}")
    for source, size, name in ICONS:
        out = WEB / "public" / name
        subprocess.run(["sips", "-z", str(size), str(size), str(source), "--out", str(out)], check=True, capture_output=True)
        print(f"wrote {out.relative_to(WEB)} ({size} px)")


if __name__ == "__main__":
    main()
