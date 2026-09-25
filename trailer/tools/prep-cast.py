"""Cuts the master-reference cast renders to transparent 720px PNGs in assets/cast/."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter
SRC = Path(__file__).resolve().parents[2] / "astra-man rework" / "original rework renders"
OUT = Path(__file__).resolve().parents[1] / "assets" / "cast"
OUT.mkdir(parents=True, exist_ok=True)
CAST = {"claude": "claude-master-reference.png", "muse": "muse-meta-master-reference.png",
        "grok": "grok-master-reference.png", "gemini": "9a570eb4-2396-493f-9389-7e80a8a6a0bb.png"}
for name, file in CAST.items():
    im = Image.open(SRC / file).convert("RGBA")
    if name == "gemini":  # white studio background: flood-fill it from the corners into a mask
        rgb = im.convert("RGB")
        w, h = rgb.size
        for seed in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
            ImageDraw.floodfill(rgb, seed, (255, 0, 255), thresh=40)
        mask = Image.eval(rgb.split()[0], lambda v: 0)  # placeholder
        px, mp = rgb.load(), Image.new("L", (w, h), 255)
        m = mp.load()
        for y in range(h):
            for x in range(w):
                if px[x, y] == (255, 0, 255): m[x, y] = 0
        mp = mp.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(1.2))
        im.putalpha(mp)
    im = im.crop(im.getbbox())
    im.thumbnail((720, 720), Image.LANCZOS)
    im.save(OUT / f"{name}.png")
    print(name, im.size)
