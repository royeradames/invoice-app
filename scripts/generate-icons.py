"""Render this project's original 96-unit receipt mark; no external assets."""
from pathlib import Path
import math
import struct
import zlib

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
BACKGROUND = (81, 53, 183)
WHITE = (255, 255, 255)
POLYGON = [(28, 20), (68, 20), (68, 78), (58, 72), (48, 78), (38, 72), (28, 78)]

def inside(x, y):
    hit = False
    previous = POLYGON[-1]
    for current in POLYGON:
        a, b = previous, current
        if (a[1] > y) != (b[1] > y) and x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]:
            hit = not hit
        previous = current
    return hit

def color(x, y):
    cx, cy = min(max(x, 20), 76), min(max(y, 20), 76)
    if math.hypot(x - cx, y - cy) > 20:
        return (0, 0, 0, 0)
    for end, yy in [(58, 35), (58, 46), (50, 57)]:
        if math.hypot(x - min(max(x, 38), end), y - yy) <= 2.5:
            return (*BACKGROUND, 255)
    return (*(WHITE if inside(x, y) else BACKGROUND), 255)

def chunk(kind, data):
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xffffffff)

def png(size):
    scan = bytearray()
    for y in range(size):
        scan.append(0)
        for x in range(size):
            samples = [color((x + (sx + .5) / 4) * 96 / size, (y + (sy + .5) / 4) * 96 / size) for sy in range(4) for sx in range(4)]
            alpha = sum(c[3] for c in samples)
            rgb = [round(sum(c[k] * c[3] for c in samples) / alpha) if alpha else 0 for k in range(3)]
            scan.extend([*rgb, round(alpha / 16)])
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(scan, 9)) + chunk(b"IEND", b"")

PUBLIC.mkdir(exist_ok=True)
for name, size in [("favicon-32.png", 32), ("favicon-96.png", 96), ("apple-touch-icon.png", 180)]:
    (PUBLIC / name).write_bytes(png(size))
small = png(32)
(PUBLIC / "favicon.ico").write_bytes(struct.pack("<HHH", 0, 1, 1) + struct.pack("<BBBBHHII", 32, 32, 0, 0, 1, 32, len(small), 22) + small)
