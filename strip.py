#!/usr/bin/env python3
"""Stacks captured frames into one tall picture for a .flip flipbook (README: Flipbook).

    python3 $KIT/strip.py OUT.jpg FRAME.png... --record K [--w 640] [--crop x,y,w,h] [--every N]

FRAMEs are recorded frames (a capture tool's frames/*.png), in name order, each K frames of a
60 fps app apart (pass the same K the recording used). --crop cuts the same box from each (captured
pixels), --w scales the result, --every N keeps every Nth frame. Prints the data-frames and
data-fps to give the .flip.
"""
import argparse
import sys

from PIL import Image

JPEG_MAX = 65500


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('out')
    ap.add_argument('frames', nargs='+')
    ap.add_argument('--w', type=int, default=640)
    ap.add_argument('--crop')
    ap.add_argument('--every', type=int, default=1)
    ap.add_argument('--record', type=int, required=True, help='app frames between recorded frames (60 fps)')
    ap.add_argument('--q', type=int, default=82)
    a = ap.parse_args()
    paths = sorted(a.frames)[::a.every]
    box = tuple(int(v) for v in a.crop.split(',')) if a.crop else None
    tiles = []
    for p in paths:
        im = Image.open(p).convert('RGB')
        if box:
            x, y, w, h = box
            im = im.crop((x, y, x + w, y + h))
        h = round(im.height * a.w / im.width)
        tiles.append(im.resize((a.w, h), Image.LANCZOS))
    th = tiles[0].height
    if th * len(tiles) > JPEG_MAX:
        sys.exit(f'{len(tiles)} frames of {a.w}x{th} make a strip over {JPEG_MAX} px tall: lower --w or raise --every')
    out = Image.new('RGB', (a.w, th * len(tiles)))
    for i, t in enumerate(tiles):
        out.paste(t, (0, i * th))
    out.save(a.out, quality=a.q, optimize=True)
    fps = 60 / a.record / a.every
    print(f'{a.out}: data-frames="{len(tiles)}" data-fps="{fps:g}"  ({a.w}x{th} a frame)')


if __name__ == '__main__':
    main()
