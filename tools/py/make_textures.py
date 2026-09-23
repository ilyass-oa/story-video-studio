#!/usr/bin/env python3
"""Generate the procedural texture pack used by the engine's look packs.

Deterministic (seeded) so every machine produces identical textures.
Outputs into banks/textures/ and is symlinked into engine/public/banks.

  grain/grain-00..11.png   256px tileable film grain (luma noise, mid-gray centred)
  smoke/smoke-a.png, smoke-b.png   1536px soft fractal smoke (white on transparent)
  paper/paper-light.png    1080x1920 subtle paper fibre texture (gray, for multiply)
  shadows/window-*.png     1080x1920 window-light shadows (dark on transparent, for multiply)
  dust/dust-*.png          sparse specks and hairs (white on transparent, for screen)
"""
from __future__ import annotations

import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "banks" / "textures"
W, H = 1080, 1920


def save(img: Image.Image, rel: str) -> None:
    p = OUT / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    img.save(p, optimize=True)
    print("wrote", p.relative_to(ROOT))


def fbm(h: int, w: int, rng: np.random.Generator, octaves: int = 6, base: int = 4) -> np.ndarray:
    """Tileable-ish fractal value noise via upscaled random grids (smooth, cheap)."""
    acc = np.zeros((h, w), np.float32)
    amp, total = 1.0, 0.0
    for o in range(octaves):
        gh, gw = base * 2**o, base * 2**o
        grid = rng.random((gh, gw)).astype(np.float32)
        layer = np.asarray(Image.fromarray((grid * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC), np.float32) / 255
        acc += layer * amp
        total += amp
        amp *= 0.55
    acc /= total
    return (acc - acc.min()) / (acc.max() - acc.min() + 1e-6)


def grain(rng: np.random.Generator) -> None:
    for i in range(12):
        n = rng.normal(0.0, 1.0, (256, 256)).astype(np.float32)
        # slight clumping like real film grain
        img = Image.fromarray(np.clip(128 + n * 38, 0, 255).astype(np.uint8), "L").filter(ImageFilter.GaussianBlur(0.55))
        save(img.convert("RGB"), f"grain/grain-{i:02d}.png")


def smoke(rng: np.random.Generator) -> None:
    for name in ("a", "b"):
        s = 1536
        n = fbm(s, s, rng, octaves=7, base=3)
        # ridge + threshold into wispy smoke
        n = np.clip((n - 0.42) / 0.5, 0, 1) ** 1.8
        # soft radial falloff so edges never show a hard border
        yy, xx = np.mgrid[0:s, 0:s].astype(np.float32) / s - 0.5
        n *= np.clip(1.0 - (np.sqrt(xx**2 + yy**2) / 0.62) ** 3, 0, 1)
        a = (n * 255).astype(np.uint8)
        rgba = np.dstack([np.full_like(a, 255)] * 3 + [a])
        img = Image.fromarray(rgba, "RGBA").filter(ImageFilter.GaussianBlur(6))
        save(img, f"smoke/smoke-{name}.png")


def paper(rng: np.random.Generator) -> None:
    n = fbm(H, W, rng, octaves=8, base=6)
    fibres = rng.normal(0, 1, (H, W)).astype(np.float32)
    fibres = np.asarray(Image.fromarray(np.clip(128 + fibres * 30, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8)), np.float32) / 255
    v = 0.93 + (n - 0.5) * 0.06 + (fibres - 0.5) * 0.05
    img = Image.fromarray(np.clip(v * 255, 0, 255).astype(np.uint8), "L")
    save(img.convert("RGB"), "paper/paper-light.png")


def window_shadow(rng: np.random.Generator, name: str, cols: int, rows: int, skew: float, leaves: int) -> None:
    """Soft window-frame shadow cast across the frame + optional leaf shadows (multiply layer)."""
    big = Image.new("L", (W * 2, H * 2), 0)
    d = ImageDraw.Draw(big)
    # window panes are lit; we draw the *shadow*: mullions, plus soft darkness outside the window
    x0, y0, x1, y1 = int(W * 0.25), int(H * 0.05), int(W * 1.85), int(H * 1.75)
    bar = int(W * 0.11)
    for c in range(cols + 1):
        x = x0 + (x1 - x0) * c // cols
        d.rectangle([x - bar // 2, y0, x + bar // 2, y1], fill=200)
    for r in range(rows + 1):
        y = y0 + (y1 - y0) * r // rows
        d.rectangle([x0, y - bar // 2, x1, y + bar // 2], fill=200)
    outside = Image.new("L", big.size, 0)
    od = ImageDraw.Draw(outside)
    od.rectangle([0, 0, x0, H * 2], fill=150)
    od.rectangle([x1, 0, W * 2, H * 2], fill=150)
    od.rectangle([0, 0, W * 2, y0], fill=150)
    big = Image.fromarray(np.maximum(np.asarray(big), np.asarray(outside.filter(ImageFilter.GaussianBlur(90)))))
    for _ in range(leaves):  # blurred house-plant silhouette on one side
        cx, cy = rng.uniform(0.0, 0.35) * W * 2, rng.uniform(0.5, 1.4) * H
        for _k in range(rng.integers(9, 15)):
            ang = rng.uniform(-math.pi, 0)
            ln = rng.uniform(0.3, 0.55) * W
            wd = ln * rng.uniform(0.28, 0.4)
            lx, ly = cx + math.cos(ang) * ln * 0.55, cy + math.sin(ang) * ln * 0.55
            leaf = Image.new("L", (int(ln * 2), int(ln * 2)), 0)
            ImageDraw.Draw(leaf).ellipse([ln - ln / 2, ln - wd / 2, ln + ln / 2, ln + wd / 2], fill=255)
            leaf = leaf.rotate(math.degrees(ang), resample=Image.BICUBIC)
            big.paste(210, (int(lx - ln), int(ly - ln)), leaf)
    # perspective-ish skew, then heavy blur for soft window light
    big = big.transform(big.size, Image.AFFINE, (1, skew, -skew * H, 0.1, 1, -W * 0.2), resample=Image.BICUBIC)
    big = big.resize((W, H), Image.LANCZOS).filter(ImageFilter.GaussianBlur(38))
    a = np.asarray(big, np.float32) / 255
    a = (np.clip(a, 0, 1) * 0.62 * 255).astype(np.uint8)
    rgba = np.dstack([np.full_like(a, 40), np.full_like(a, 36), np.full_like(a, 32), a])
    save(Image.fromarray(rgba, "RGBA"), f"shadows/window-{name}.png")


def dust(rng: np.random.Generator) -> None:
    for i in range(4):
        img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        for _ in range(rng.integers(40, 70)):
            x, y = rng.uniform(0, W), rng.uniform(0, H)
            r = rng.choice([0.8, 1.2, 1.6, 2.2, 3.0], p=[0.35, 0.3, 0.2, 0.1, 0.05])
            a = int(rng.uniform(60, 200))
            d.ellipse([x - r, y - r, x + r, y + r], fill=(255, 250, 240, a))
        for _ in range(rng.integers(1, 3)):  # a hair or scratch
            x, y = rng.uniform(0.1, 0.9) * W, rng.uniform(0.1, 0.9) * H
            pts = [(x, y)]
            ang = rng.uniform(0, math.pi * 2)
            for _k in range(8):
                ang += rng.normal(0, 0.35)
                x, y = x + math.cos(ang) * 9, y + math.sin(ang) * 9
                pts.append((x, y))
            d.line(pts, fill=(255, 250, 240, 110), width=1)
        save(img.filter(ImageFilter.GaussianBlur(0.4)), f"dust/dust-{i}.png")


def main() -> None:
    rng = np.random.default_rng(20260923)
    grain(rng)
    smoke(rng)
    paper(rng)
    window_shadow(rng, "a", cols=2, rows=3, skew=-0.28, leaves=2)
    window_shadow(rng, "b", cols=3, rows=2, skew=0.22, leaves=0)
    window_shadow(rng, "c", cols=2, rows=2, skew=-0.12, leaves=3)
    dust(rng)


if __name__ == "__main__":
    main()
