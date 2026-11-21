#!/usr/bin/env python3
"""Lifts the HUD off a capture: BARE (HUD hidden) and FULL (HUD shown) of the same frame give a
HUD-only RGBA picture that lays back over BARE as FULL.

    python3 $KIT/hudsplit.py BARE.png FULL.png OUT.png

A capture tool can run this for every shot. Per pixel it takes the smallest alpha that explains
FULL over BARE in every channel, then un-premultiplies, so HUD over BARE gives FULL back to within
NOISE levels. The two captures must be the same frame; a world that moved between them shows up as
HUD, and the script fails when more than MAX_MOVED of the frame changed.
"""

import sys

import numpy as np
from PIL import Image

MAX_MOVED = 0.5  # share of pixels that may differ before the pair is called two different frames
NOISE = 1  # levels; 1-level steps covered about 9% of the outer-hazards pairs, outside the HUD too


def split(bare: Image.Image, full: Image.Image) -> Image.Image:
    if bare.size != full.size:
        raise SystemExit(f"sizes differ: {bare.size} vs {full.size}")
    b = np.asarray(bare.convert("RGB"), dtype=np.float64) / 255
    f = np.asarray(full.convert("RGB"), dtype=np.float64) / 255
    d = f - b
    d[np.abs(d).max(axis=2) <= NOISE / 255] = 0
    if (d != 0).any(axis=2).mean() > MAX_MOVED:
        raise SystemExit("most of the frame differs: the two captures are not the same frame")
    with np.errstate(divide="ignore", invalid="ignore"):
        up = np.where(d > 0, d / (1 - b), 0)
        down = np.where(d < 0, -d / b, 0)
    a = np.nan_to_num(np.maximum(up, down)).max(axis=2)
    a = np.clip(a, 0, 1)
    with np.errstate(divide="ignore", invalid="ignore"):
        c = b + d / a[..., None]
    c = np.where(a[..., None] > 0, np.clip(c, 0, 1), 0)
    rgba = np.concatenate([c, a[..., None]], axis=2)
    return Image.fromarray(np.round(rgba * 255).astype(np.uint8), "RGBA")


def main() -> None:
    if len(sys.argv) != 4:
        raise SystemExit(__doc__)
    bare, full, out = sys.argv[1:]
    split(Image.open(bare), Image.open(full)).save(out, optimize=True)


if __name__ == "__main__":
    main()
