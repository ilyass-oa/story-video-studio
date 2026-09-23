#!/usr/bin/env python3
"""imagekit — local image intelligence for the story pipeline (all CPU, all offline after first model download).

  cutout  IN OUT [--prompt "red apple"] [--model birefnet-general] [--pad 0.08]
          Remove the background (BiRefNet). With --prompt, first *selects the element* named by the
          prompt (GroundingDINO open-vocabulary detection), crops to it, then cuts it out.
          Colour-decontaminates edges (no halos on dark/light packs), trims to the alpha bbox,
          prints a JSON quality report (coverage, cropped edges, fragments).
  detect  IN --prompt "..."         -> JSON boxes
  rank    --query "..." [--kind cutout|photo] IMG...   -> JSON scores (CLIP relevance + suitability)
  sheet   OUT IMG... [--labels a,b,c]                 -> numbered contact sheet for visual picking
  match   PAIRS.json [--dup 0.93]                       -> image↔brief / image↔words scores + near-duplicate pairs
  inspect IN                                           -> JSON dims / alpha stats / luma
  crop    IN OUT --aspect 9:16 [--focus x,y]           -> smart crop for full-bleed use

Models live in tools/py/models (U2NET_HOME / HF_HOME), never in system dirs.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
MODELS = HERE / "models"
os.environ.setdefault("U2NET_HOME", str(MODELS / "rembg"))
os.environ.setdefault("HF_HOME", str(MODELS / "hf"))
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

import numpy as np  # noqa: E402
from PIL import Image, ImageDraw, ImageFont, ImageOps  # noqa: E402

Image.MAX_IMAGE_PIXELS = 200_000_000


def load_rgb(path: str) -> Image.Image:
    img = Image.open(path)
    img = ImageOps.exif_transpose(img)
    if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
        rgba = img.convert("RGBA")
        bg = Image.new("RGBA", rgba.size, (255, 255, 255, 255))
        bg.alpha_composite(rgba)
        return bg.convert("RGB")
    return img.convert("RGB")


# ───────────────────────── detection (select an element by text) ─────────────────────────
_DINO = None


def detect_boxes(img: Image.Image, prompt: str, threshold: float = 0.3):
    global _DINO
    import torch
    from transformers import AutoModelForZeroShotObjectDetection, AutoProcessor

    if _DINO is None:
        mid = "IDEA-Research/grounding-dino-tiny"
        _DINO = (AutoProcessor.from_pretrained(mid), AutoModelForZeroShotObjectDetection.from_pretrained(mid).eval())
    proc, model = _DINO
    text = prompt.lower().strip().rstrip(".") + "."
    inputs = proc(images=img, text=text, return_tensors="pt")
    with torch.no_grad():
        out = model(**inputs)
    res = proc.post_process_grounded_object_detection(out, inputs.input_ids, threshold=threshold, text_threshold=0.25, target_sizes=[img.size[::-1]])[0]
    boxes = []
    for box, score, label in zip(res["boxes"].tolist(), res["scores"].tolist(), res.get("text_labels", res.get("labels", []))):
        boxes.append({"box": [round(v, 1) for v in box], "score": round(float(score), 3), "label": str(label)})
    boxes.sort(key=lambda b: -b["score"])
    return boxes


# ───────────────────────── cutout ─────────────────────────
_SESS: dict = {}


def remove_bg(img: Image.Image, model: str) -> np.ndarray:
    from rembg import new_session, remove

    if model not in _SESS:
        _SESS[model] = new_session(model)
    mask = remove(img, session=_SESS[model], only_mask=True)
    return np.asarray(mask.convert("L"), np.float32) / 255.0


def decontaminate(rgb: np.ndarray, alpha: np.ndarray) -> np.ndarray:
    """Estimate true foreground colours at soft edges so no background colour bleeds (halo removal)."""
    try:
        from pymatting import estimate_foreground_ml

        return np.clip(estimate_foreground_ml(rgb, alpha), 0, 1)
    except Exception:
        return rgb


def quality(alpha: np.ndarray) -> dict:
    import cv2

    solid = (alpha > 0.5).astype(np.uint8)
    h, w = solid.shape
    cov = float(solid.mean())
    edges = {
        "top": float(solid[0, :].mean()),
        "bottom": float(solid[-1, :].mean()),
        "left": float(solid[:, 0].mean()),
        "right": float(solid[:, -1].mean()),
    }
    n, _lab, stats, _c = cv2.connectedComponentsWithStats(solid, 8)
    areas = sorted([int(s[cv2.CC_STAT_AREA]) for s in stats[1:]], reverse=True)
    total = max(1, sum(areas))
    frags = [a for a in areas if a / total > 0.01]
    soft = float(((alpha > 0.05) & (alpha < 0.95)).mean() / max(cov, 1e-6))
    flags = []
    if cov < 0.02:
        flags.append("empty-or-tiny")
    if cov > 0.92:
        flags.append("background-not-removed")
    if any(v > 0.08 for k, v in edges.items() if k != "bottom"):
        flags.append("subject-cropped-by-frame")
    if len(frags) > 2:
        flags.append(f"fragmented({len(frags)})")
    if soft > 0.35:
        flags.append("very-soft-edges")
    return {"coverage": round(cov, 4), "edgeTouch": {k: round(v, 3) for k, v in edges.items()}, "fragments": len(frags), "softEdgeRatio": round(soft, 3), "flags": flags, "ok": not flags}


def cmd_cutout(a) -> dict:
    img = load_rgb(a.input)
    crop_box = None
    det = None
    if a.prompt:
        boxes = detect_boxes(img, a.prompt, a.threshold)
        if not boxes:
            return {"ok": False, "error": f"nothing matching '{a.prompt}' detected", "flags": ["not-detected"]}
        det = boxes[0]
        x0, y0, x1, y1 = det["box"]
        pw, ph = (x1 - x0) * a.pad, (y1 - y0) * a.pad
        crop_box = (max(0, int(x0 - pw)), max(0, int(y0 - ph)), min(img.width, int(x1 + pw)), min(img.height, int(y1 + ph)))
        img = img.crop(crop_box)
    # keep work size sane for CPU; BiRefNet runs at 1024 internally anyway
    max_side = a.max_side
    if max(img.size) > max_side:
        s = max_side / max(img.size)
        img = img.resize((round(img.width * s), round(img.height * s)), Image.LANCZOS)
    alpha = remove_bg(img, a.model)
    rgb = np.asarray(img, np.float32) / 255.0
    fg = decontaminate(rgb, alpha) if not a.no_decontaminate else rgb
    q = quality(alpha)
    rgba = np.dstack([fg, alpha])
    out = Image.fromarray((rgba * 255).round().astype(np.uint8), "RGBA")
    bbox = out.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
    if bbox:
        m = int(max(out.size) * 0.01)
        bbox = (max(0, bbox[0] - m), max(0, bbox[1] - m), min(out.width, bbox[2] + m), min(out.height, bbox[3] + m))
        out = out.crop(bbox)
    Path(a.output).parent.mkdir(parents=True, exist_ok=True)
    out.save(a.output, optimize=True)
    return {"ok": q["ok"], "output": a.output, "width": out.width, "height": out.height, "luma": round(luma(out), 4), "model": a.model, "selected": det, "cropBox": crop_box, **q}


# ───────────────────────── ranking ─────────────────────────
_CLIP = None


def clip_scores(query: str, images: list[Image.Image]) -> list[float]:
    global _CLIP
    import torch
    from transformers import CLIPModel, CLIPProcessor

    if _CLIP is None:
        mid = "openai/clip-vit-base-patch32"
        _CLIP = (CLIPProcessor.from_pretrained(mid), CLIPModel.from_pretrained(mid).eval())
    proc, model = _CLIP
    prompts = [f"a photo of {query}", f"{query}"]
    with torch.no_grad():
        inp = proc(text=prompts, images=images, return_tensors="pt", padding=True)
        out = model(**inp)
        ie = out.image_embeds / out.image_embeds.norm(dim=-1, keepdim=True)
        te = out.text_embeds / out.text_embeds.norm(dim=-1, keepdim=True)
        sims = (ie @ te.T).max(dim=1).values
    return [float(s) for s in sims]


def isolation(img: Image.Image) -> float:
    """How plain the border is (0..1). Plain borders = easy, clean cutouts."""
    g = np.asarray(img.convert("L").resize((256, 256)), np.float32) / 255
    border = np.concatenate([g[:12].ravel(), g[-12:].ravel(), g[:, :12].ravel(), g[:, -12:].ravel()])
    centre = g[64:192, 64:192]
    std = float(border.std())
    contrast = abs(float(centre.mean()) - float(border.mean()))
    return float(np.clip(1.0 - std * 4.0, 0, 1) * 0.75 + np.clip(contrast * 3, 0, 1) * 0.25)


def graphicness(img: Image.Image) -> float:
    """0..1 — how much the image looks like flat clipart/icon/vector art (few flat colours)."""
    rgba = img.convert("RGBA")
    a = np.asarray(rgba.getchannel("A"))
    rgb = img.convert("RGB").resize((128, 128))
    q = rgb.quantize(colors=32, method=Image.Quantize.MEDIANCUT)
    hist = sorted(q.histogram()[:32], reverse=True)
    share = sum(hist[:5]) / max(1, sum(hist))
    transparent = float((a < 10).mean()) if img.mode in ("RGBA", "LA", "P") else 0.0
    return float(np.clip((share - 0.7) / 0.25, 0, 1) * 0.8 + (0.2 if transparent > 0.2 else 0))


def cmd_rank(a) -> list:
    imgs, keep = [], []
    for p in a.images:
        try:
            raw = Image.open(p)
            raw.load()
            im = load_rgb(p)
            im.thumbnail((512, 512))
            im.info["graphic"] = graphicness(raw)
            imgs.append(im)
            keep.append(p)
        except Exception as e:  # unreadable download
            print(f"skip {p}: {e}", file=sys.stderr)
    if not imgs:
        return []
    rel = clip_scores(a.query, imgs)
    out = []
    for p, im, r in zip(keep, imgs, rel):
        iso = isolation(im)
        gfx = im.info.get("graphic", 0.0)
        w, h = Image.open(p).size
        res = min(1.0, (w * h) / (1600 * 1600))
        if a.kind == "cutout":
            score = r * 6.0 + iso * 0.8 + res * 0.25
        else:
            portrait = 1.0 if h >= w else 0.6
            score = r * 6.0 + res * 0.4 + portrait * 0.2
        score -= gfx * 1.5  # clipart / icons / flat vector art never match a photographic pack
        out.append({"path": p, "relevance": round(r, 4), "isolation": round(iso, 3), "graphic": round(gfx, 3), "resolution": [w, h], "score": round(score, 4)})
    out.sort(key=lambda x: -x["score"])
    return out


def cmd_match(a) -> dict:
    """For each chosen image: CLIP similarity to its brief and to its spoken words; plus near-duplicates."""
    import torch
    from transformers import CLIPModel, CLIPProcessor

    global _CLIP
    if _CLIP is None:
        mid = "openai/clip-vit-base-patch32"
        _CLIP = (CLIPProcessor.from_pretrained(mid), CLIPModel.from_pretrained(mid).eval())
    proc, model = _CLIP
    items = json.load(open(a.pairs))
    imgs = []
    for it in items:
        im = load_rgb(it["image"])
        im.thumbnail((448, 448))
        imgs.append(im)
    with torch.no_grad():
        ie = model.get_image_features(**proc(images=imgs, return_tensors="pt"))
        ie = ie / ie.norm(dim=-1, keepdim=True)
        out = []
        for k, it in enumerate(items):
            texts = [t[:300] for t in it["texts"] if t]
            te = model.get_text_features(**proc(text=[f"a photo of {t}" for t in texts], return_tensors="pt", padding=True, truncation=True))
            te = te / te.norm(dim=-1, keepdim=True)
            out.append({"image": it["image"], "scores": [round(float(s), 4) for s in (te @ ie[k])]})
        sim = (ie @ ie.T).numpy()
    dups = []
    for i in range(len(items)):
        for j in range(i + 1, len(items)):
            if sim[i, j] > a.dup:
                dups.append({"a": i, "b": j, "similarity": round(float(sim[i, j]), 3)})
    return {"items": out, "duplicates": dups}


# ───────────────────────── contact sheet ─────────────────────────
def cmd_sheet(a) -> dict:
    labels = a.labels.split("|") if a.labels else [str(i + 1) for i in range(len(a.images))]
    cell, cols = 300, min(4, max(1, len(a.images)))
    rows = (len(a.images) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * cell, rows * (cell + 34)), (30, 30, 30))
    d = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype("DejaVuSans-Bold.ttf", 16)
    except Exception:
        font = ImageFont.load_default()
    for i, p in enumerate(a.images):
        try:
            im = Image.open(p)
            if im.mode == "RGBA":  # show cutouts on a checkerboard so edges are judgeable
                bg = Image.new("RGBA", im.size, (200, 200, 200, 255))
                ck = ImageDraw.Draw(bg)
                s = max(8, max(im.size) // 24)
                for y in range(0, im.height, s):
                    for x in range((y // s % 2) * s, im.width, 2 * s):
                        ck.rectangle([x, y, x + s - 1, y + s - 1], fill=(150, 150, 150, 255))
                bg.alpha_composite(im)
                im = bg
            im = im.convert("RGB")
            im.thumbnail((cell - 8, cell - 8))
        except Exception:
            im = Image.new("RGB", (cell - 8, cell - 8), (90, 0, 0))
        x, y = (i % cols) * cell, (i // cols) * (cell + 34)
        sheet.paste(im, (x + (cell - im.width) // 2, y + 4 + (cell - 8 - im.height) // 2))
        d.rectangle([x, y + cell, x + cell, y + cell + 34], fill=(0, 0, 0))
        d.text((x + 8, y + cell + 5), f"#{i + 1} {labels[i] if i < len(labels) else ''}"[:38], fill=(255, 230, 40), font=font)
    Path(a.output).parent.mkdir(parents=True, exist_ok=True)
    sheet.save(a.output, quality=88)
    return {"output": a.output, "count": len(a.images)}


def luma(im: Image.Image) -> float:
    """Mean perceived brightness 0..1 (alpha-weighted for cutouts) — used for exposure matching."""
    small = im.copy()
    small.thumbnail((256, 256))
    l = np.asarray(small.convert("L"), np.float32) / 255
    if small.mode == "RGBA":
        w = np.asarray(small.getchannel("A"), np.float32) / 255
        return float((l * w).sum() / max(w.sum(), 1e-6))
    return float(l.mean())


def cmd_inspect(a) -> dict:
    im = Image.open(a.input)
    info = {"path": a.input, "width": im.width, "height": im.height, "mode": im.mode, "luma": round(luma(im), 4)}
    if im.mode == "RGBA":
        info.update(quality(np.asarray(im.getchannel("A"), np.float32) / 255))
    return info


def cmd_crop(a) -> dict:
    im = load_rgb(a.input)
    aw, ah = (float(v) for v in a.aspect.split(":"))
    fx, fy = (float(v) for v in a.focus.split(",")) if a.focus else (0.5, 0.45)
    target = aw / ah
    w, h = im.size
    if w / h > target:
        nw = int(h * target)
        x = int(np.clip(fx * w - nw / 2, 0, w - nw))
        box = (x, 0, x + nw, h)
    else:
        nh = int(w / target)
        y = int(np.clip(fy * h - nh / 2, 0, h - nh))
        box = (0, y, w, y + nh)
    out = im.crop(box)
    out.save(a.output, quality=94)
    return {"output": a.output, "box": box, "width": out.width, "height": out.height}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sp = ap.add_subparsers(dest="cmd", required=True)
    c = sp.add_parser("cutout")
    c.add_argument("input")
    c.add_argument("output")
    c.add_argument("--prompt")
    c.add_argument("--model", default="birefnet-general")
    c.add_argument("--pad", type=float, default=0.08)
    c.add_argument("--threshold", type=float, default=0.3)
    c.add_argument("--max-side", type=int, default=2048)
    c.add_argument("--no-decontaminate", action="store_true")
    d = sp.add_parser("detect")
    d.add_argument("input")
    d.add_argument("--prompt", required=True)
    d.add_argument("--threshold", type=float, default=0.3)
    r = sp.add_parser("rank")
    r.add_argument("--query", required=True)
    r.add_argument("--kind", default="photo", choices=["photo", "cutout"])
    r.add_argument("images", nargs="+")
    s = sp.add_parser("sheet")
    s.add_argument("output")
    s.add_argument("images", nargs="+")
    s.add_argument("--labels")
    mt = sp.add_parser("match")
    mt.add_argument("pairs", help='JSON file: [{"image": path, "texts": [brief, spoken words]}]')
    mt.add_argument("--dup", type=float, default=0.93)
    i = sp.add_parser("inspect")
    i.add_argument("input")
    k = sp.add_parser("crop")
    k.add_argument("input")
    k.add_argument("output")
    k.add_argument("--aspect", default="9:16")
    k.add_argument("--focus")
    a = ap.parse_args()
    if a.cmd == "cutout":
        res = cmd_cutout(a)
    elif a.cmd == "detect":
        res = detect_boxes(load_rgb(a.input), a.prompt, a.threshold)
    elif a.cmd == "rank":
        res = cmd_rank(a)
    elif a.cmd == "sheet":
        res = cmd_sheet(a)
    elif a.cmd == "match":
        res = cmd_match(a)
    elif a.cmd == "inspect":
        res = cmd_inspect(a)
    else:
        res = cmd_crop(a)
    print(json.dumps(res, indent=1))


if __name__ == "__main__":
    main()
