#!/usr/bin/env python3
"""Local, dependency-light performance ledger and guarded per-platform model."""

import argparse
import csv
import json
import random
import re
from collections import Counter
from datetime import datetime
from pathlib import Path
from statistics import median


ROOT = Path(__file__).resolve().parent.parent
LAB = ROOT / "performance"
DATA = LAB / "data"
POSTS = DATA / "posts.csv"
OBS = DATA / "observations.csv"
POST_FIELDS = [
    "slug", "platform", "url", "account_id", "date", "published_at", "title", "source",
    "pack", "theme", "backdrop", "voice", "duration_s", "word_count",
    "scene_count", "image_count", "sourced_images", "generated_images",
    "full_frame_scenes", "text_only_scenes", "sfx_count", "ambience_count",
    "narration_wpm", "music", "hook", "post_title", "caption_chars",
    "hashtag_count", "cover_offset_ms", "genre", "twist_type", "hook_type",
    "first_frame_type", "reveal_fraction", "stakes_type", "era",
    "experiment_id", "experiment_arm", "notes",
]
OBS_FIELDS = [
    "slug", "platform", "observed_at_utc", "age_hours", "views", "impressions",
    "reach", "avg_watch_s", "completion_rate", "watched_2s_rate", "likes",
    "comments", "shares", "saves", "follows", "for_you_share", "visibility",
    "ai_label", "recommendation_status", "source_note", "reels_skip_rate",
]
AUTO_FIELDS = [
    "pack", "theme", "backdrop", "voice", "word_count", "scene_count",
    "image_count", "sourced_images", "generated_images", "full_frame_scenes",
    "text_only_scenes", "sfx_count", "ambience_count", "narration_wpm",
    "music", "cover_offset_ms",
]
PLATFORMS = {"YT": "youtube", "IG": "instagram", "TT": "tiktok"}
DISPLAY = {"youtube": "YouTube", "instagram": "Instagram", "tiktok": "TikTok"}


def read_csv(path):
    if not path.exists():
        return []
    with path.open(newline="", encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


def write_csv(path, fields, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def number(value):
    try:
        return float(value) if value not in (None, "") else None
    except ValueError:
        return None


def episode_features(slug):
    base = ROOT / "episodes" / slug
    result = {key: "" for key in POST_FIELDS}
    edit_file = base / "04-edit" / "edit.json"
    if not edit_file.exists():
        return result
    edit = json.loads(edit_file.read_text(encoding="utf-8"))
    scenes = edit.get("scenes", [])
    manifest_file = base / "05-assets" / "manifest.json"
    assets = json.loads(manifest_file.read_text(encoding="utf-8")).get("assets", {}) if manifest_file.exists() else {}
    bank_file = ROOT / "banks" / "images" / "index.json"
    bank = json.loads(bank_file.read_text()).get("assets", {}) if bank_file.exists() else {}
    def refs(value):
        if isinstance(value, list):
            return [item for entry in value for item in refs(entry)]
        ref = value.get("id") if isinstance(value, dict) else value
        if not isinstance(ref, str):
            return []
        if ref in assets or (ref.startswith("bank:") and ref[5:] in bank):
            return [ref]
        return []
    scene_refs = [[ref for value in scene.get("slots", {}).values() for ref in refs(value)] for scene in scenes]
    slot_ids = set(ref for scene in scene_refs for ref in scene)
    providers = [(bank.get(ref[5:], {}) if ref.startswith("bank:") else assets.get(ref, {})).get("source", {}).get("provider", "") for ref in slot_ids]
    script_file = base / "01-script" / "script.txt"
    script = script_file.read_text(encoding="utf-8") if script_file.exists() else ""
    voice_file = base / "02-voice" / "voice.json"
    voice = json.loads(voice_file.read_text(encoding="utf-8")) if voice_file.exists() else {}
    post_file = base / "06-render" / "post" / "post.json"
    post = json.loads(post_file.read_text(encoding="utf-8")) if post_file.exists() else {}
    result.update({
        "pack": edit.get("pack", ""), "theme": edit.get("theme", ""),
        "backdrop": edit.get("backdrop", ""), "voice": voice.get("voice", ""),
        "word_count": len(re.findall(r"\b[\w’'-]+\b", re.sub(r"\[[^]]+\]", "", script))),
        "scene_count": len(scenes), "image_count": len(slot_ids),
        "sourced_images": sum(bool(p) and p != "generated" for p in providers),
        "generated_images": sum(p == "generated" for p in providers),
        "full_frame_scenes": sum(scene.get("template") == "photo-full" for scene in scenes),
        "text_only_scenes": sum(not refs for refs in scene_refs),
        "sfx_count": sum(len(scene.get("sfx", [])) for scene in scenes),
        "ambience_count": len(edit.get("ambience", [])),
        "narration_wpm": voice.get("estWpm", ""),
        "music": edit.get("music", {}).get("id", "") if isinstance(edit.get("music"), dict) else "",
        "cover_offset_ms": post.get("cover", {}).get("offsetMs", ""),
    })
    result["_post"] = post
    # Posting facts describe the finished episode; props may describe a later range preview.
    result["duration_s"] = post.get("facts", {}).get("durationSeconds", "")
    return result


def sync():
    old = {(r["slug"], r["platform"]): r for r in read_csv(POSTS)}
    rows = []
    for line in (ROOT / "history" / "STORIES.md").read_text(encoding="utf-8").splitlines():
        if not line.startswith("| 20"):
            continue
        cells = [c.strip() for c in line.strip("|").split("|")]
        if len(cells) < 10:
            continue
        date, slug, title, source, look, voice, length, hook, _video, posted = cells[:10]
        features = episode_features(slug)
        post_metadata = features.pop("_post", {})
        for abbr, platform in PLATFORMS.items():
            label = rf"(?:{abbr}|{platform})"
            match = re.search(rf"(?:^|\s·\s){label}:\s(https?://\S+)", posted, re.IGNORECASE)
            if not match:
                continue
            key = (slug, platform)
            row = {field: "" for field in POST_FIELDS}
            row.update(old.get(key, {}))  # Retain manual annotations and timestamps.
            for field in AUTO_FIELDS:
                if features.get(field) != "":
                    row[field] = features[field]
            row.update({
                "slug": slug, "platform": platform, "url": match.group(1),
                "date": date, "title": title, "source": source, "hook": hook,
                "duration_s": features.get("duration_s") or row.get("duration_s") or (re.search(r"\d+(?:\.\d+)?", length).group(0) if re.search(r"\d+(?:\.\d+)?", length) else ""),
                "voice": features.get("voice") or voice,
            })
            platform_metadata = post_metadata.get(platform, {})
            if platform == "youtube":
                caption = platform_metadata.get("description", "")
                row["post_title"] = platform_metadata.get("title", "")
            elif platform == "instagram":
                caption = platform_metadata.get("caption", "")
            else:
                caption = ""
            if caption:
                row["caption_chars"] = len(caption)
                row["hashtag_count"] = len(re.findall(r"(?<!\w)#[\w]+", caption))
            if "/" in look:
                history_pack, history_theme = look.split("/", 1)
                row["pack"] = row["pack"] or history_pack
                row["theme"] = row["theme"] or history_theme
            rows.append(row)
    # Imported/verified records may predate the history label convention. Never discard them.
    present = {(r["slug"], r["platform"]) for r in rows}
    rows.extend(row for key, row in old.items() if key not in present)
    write_csv(POSTS, POST_FIELDS, rows)
    if not OBS.exists():
        write_csv(OBS, OBS_FIELDS, [])
    print(f"Synced {len(rows)} published platform posts; observations preserved.")


def account_key(post):
    """Use recorded identity or a TikTok post URL, never infer from reach or dates."""
    explicit = (post.get("account_id") or "").strip()
    if explicit:
        return explicit
    if post.get("platform") == "tiktok":
        match = re.search(r"tiktok\.com/@([^/]+)/video/", post.get("url", ""), re.I)
        if match:
            return "@" + match.group(1).lower()
    return None


def comparable_account(posts):
    keys = {account_key(post) for post in posts}
    return bool(posts) and None not in keys and len(keys) == 1


def best_24h_observations():
    selected = {}
    for row in read_csv(OBS):
        age = number(row.get("age_hours"))
        if age is None or not 18 <= age <= 30:
            continue
        key = (row["slug"], row["platform"])
        if key not in selected or abs(age - 24) < abs(number(selected[key]["age_hours"]) - 24):
            selected[key] = row
    return selected


def report():
    posts = read_csv(POSTS)
    obs = read_csv(OBS)
    snapshots = best_24h_observations()
    lines = ["# Performance report", "", "Generated from local platform observations. Blank metrics are unavailable, not zero.", ""]
    cohorts = [(platform, account) for platform in PLATFORMS.values()
               for account in sorted({account_key(p) or "unknown" for p in posts if p["platform"] == platform} or {"unknown"})]
    for platform, account in cohorts:
        p = [r for r in posts if r["platform"] == platform and (account_key(r) or "unknown") == account]
        slugs = {r["slug"] for r in p}
        o = [r for r in obs if r["platform"] == platform and r["slug"] in slugs]
        latest = {}
        for row in o:
            if row["slug"] not in latest or row.get("observed_at_utc", "") > latest[row["slug"]].get("observed_at_utc", ""):
                latest[row["slug"]] = row
        current = list(latest.values())
        at24 = [snapshots[(r["slug"], platform)] for r in p if (r["slug"], platform) in snapshots]
        retention = []
        for post in p:
            snap = snapshots.get((post["slug"], platform))
            watch, duration = (number(snap.get("avg_watch_s")) if snap else None), number(post.get("duration_s"))
            if watch is not None and duration and duration > 0:
                retention.append((post["slug"], watch / duration))
        labels = Counter(r.get("ai_label") or "unknown" for r in current)
        eligibility = Counter(r.get("recommendation_status") or "unknown" for r in current)
        view_counts = sorted(int(v) for r in current if (v := number(r.get("views"))) is not None)
        lines += [f"## {DISPLAY[platform]} — account {account}", "", f"Published: {len(p)}; snapshots: {len(o)}; comparable 18–30h snapshots: {len(at24)}; retention samples: {len(retention)}.", ""]
        if o:
            lines += [f"Observed AI-label statuses: {dict(labels)}. Recommendation statuses: {dict(eligibility)}.", ""]
        if view_counts:
            lines += [f"Latest displayed views per post: median {median(view_counts):g}, range {view_counts[0]}–{view_counts[-1]} (different post ages; do not compare as an experiment).", ""]
        if retention and account != "unknown":
            vals = [v for _, v in retention]
            lines += [f"Median 24h watch/duration: {median(vals):.2f}. This is descriptive, not a treatment effect.", ""]
        else:
            lines += ["No comparable watch-time data yet; no creative winner can be inferred.", ""]
    lines += ["## Registered creative tests", ""]
    for experiment in read_csv(DATA / "experiments.csv"):
        exp_id, platform = experiment["id"], experiment["platform"]
        primary = experiment["primary_metric"]
        arms = {"A": [], "B": []}
        for post in posts:
            if post["platform"] != platform or post.get("experiment_id") != exp_id:
                continue
            snap = snapshots.get((post["slug"], platform))
            if not snap:
                continue
            metric = number(snap.get(primary))
            if primary == "avg_watch_ratio":
                watch, duration = number(snap.get("avg_watch_s")), number(post.get("duration_s"))
                metric = watch / duration if watch is not None and duration and duration > 0 else None
            elif primary == "shares_per_1000_views":
                shares, views = number(snap.get("shares")), number(snap.get("views"))
                metric = 1000 * shares / views if shares is not None and views and views > 0 else None
            if metric is not None and post.get("experiment_arm") in arms:
                arms[post["experiment_arm"]].append(metric)
        cohort = [p for p in posts if p["platform"] == platform and p.get("experiment_id") == exp_id]
        if not comparable_account(cohort):
            lines += [f"### {exp_id}", "", "Account identity is missing or mixed; record account_id and compare one account before judging this test.", ""]
            continue
        min_n = int(experiment.get("min_per_arm") or 6)
        lines += [f"### {exp_id}: {experiment['variable']}", "", f"Primary metric: {primary}; usable A/B: {len(arms['A'])}/{len(arms['B'])} (minimum {min_n} each).", ""]
        if min(len(arms["A"]), len(arms["B"])) >= min_n:
            a, b = arms["A"], arms["B"]
            effect = sum(b) / len(b) - sum(a) / len(a)
            rng = random.Random(20260926)
            draws = []
            for _ in range(2000):
                sample_a = [rng.choice(a) for _ in a]
                sample_b = [rng.choice(b) for _ in b]
                draws.append(sum(sample_b) / len(sample_b) - sum(sample_a) / len(sample_a))
            draws.sort()
            lines += [f"B − A mean: {effect:+.3f}; bootstrap 95% interval [{draws[50]:+.3f}, {draws[1949]:+.3f}]. This matched-story comparison is directional, not causal.", ""]
        else:
            lines += ["Waiting for registered, same-age observations; no winner.", ""]
    lines += ["## Next decision", "", "Collect 24h retention and explicit eligibility status where the platform supplies them. Keep registered creative tests directional unless assignment is genuinely randomized.", ""]
    (LAB / "report.md").write_text("\n".join(lines), encoding="utf-8")
    print("Wrote performance/report.md")


def train():
    try:
        import numpy as np
    except ImportError:
        (LAB / "model_report.md").write_text("# Model report\n\nNumPy is unavailable. Install it in the local Python environment before training.\n", encoding="utf-8")
        print("NumPy unavailable; wrote model_report.md")
        return
    snaps = best_24h_observations()
    posts = read_csv(POSTS)
    lines = ["# Model report", "", "Predictive ridge regression per platform; coefficients are not causal effects.", ""]
    numerics = ["duration_s", "word_count", "scene_count", "image_count", "sourced_images", "generated_images", "full_frame_scenes", "text_only_scenes", "sfx_count", "ambience_count", "narration_wpm", "caption_chars", "hashtag_count", "cover_offset_ms", "reveal_fraction"]
    categories = ["genre", "twist_type", "hook_type", "first_frame_type", "stakes_type", "era", "pack", "theme", "backdrop", "voice", "music"]
    for platform in PLATFORMS.values():
        samples = []
        for post in posts:
            if post["platform"] != platform or not post.get("published_at"):
                continue
            snap = snaps.get((post["slug"], platform))
            watch, duration = (number(snap.get("avg_watch_s")) if snap else None), number(post.get("duration_s"))
            if watch is not None and duration and duration > 0:
                try:
                    timestamp = datetime.fromisoformat(post["published_at"])
                    if timestamp.tzinfo is None:
                        continue
                except ValueError:
                    continue
                samples.append((timestamp, post, watch / duration))
        samples.sort(key=lambda x: x[0])
        if len({post["slug"] for _, post, _ in samples}) < 30:
            lines += [f"## {DISPLAY[platform]}", "", f"Waiting for 30 distinct episodes with timezone-aware publication times and 18–30h watch-time snapshots; available: {len(samples)}.", ""]
            continue
        if not comparable_account([post for _, post, _ in samples]):
            lines += [f"## {DISPLAY[platform]}", "", "Account identity is missing or mixed; model skipped. Record account_id and use a single account cohort.", ""]
            continue
        cut = min(max(20, int(len(samples) * .7)), len(samples) - 10)
        training, testing = samples[:cut], samples[cut:]
        if len(testing) < 10:
            lines += [f"## {DISPLAY[platform]}", "", "Insufficient chronological holdout; model skipped.", ""]
            continue
        names = list(numerics)
        vocab = {}
        for field in categories:
            vocab[field] = sorted({post.get(field) or "unknown" for _, post, _ in training})
            names += [f"{field}={value}" for value in vocab[field]]
        medians = {field: float(np.median([number(post.get(field)) for _, post, _ in training if number(post.get(field)) is not None])) if any(number(post.get(field)) is not None for _, post, _ in training) else 0.0 for field in numerics}

        def vector(post):
            vals = [number(post.get(field)) if number(post.get(field)) is not None else medians[field] for field in numerics]
            for field in categories:
                vals.extend(float((post.get(field) or "unknown") == value) for value in vocab[field])
            return vals

        x_train = np.asarray([vector(post) for _, post, _ in training], dtype=float)
        x_test = np.asarray([vector(post) for _, post, _ in testing], dtype=float)
        y_train = np.asarray([target for _, _, target in training], dtype=float)
        y_test = np.asarray([target for _, _, target in testing], dtype=float)
        means, stds = x_train.mean(axis=0), x_train.std(axis=0)
        stds[stds == 0] = 1
        z_train, z_test = (x_train - means) / stds, (x_test - means) / stds
        alpha = 10.0
        weights = np.linalg.solve(z_train.T @ z_train + alpha * np.eye(z_train.shape[1]), z_train.T @ (y_train - y_train.mean()))
        predictions = y_train.mean() + z_test @ weights
        mae = float(np.mean(np.abs(predictions - y_test)))
        baseline = float(np.mean(np.abs(np.median(y_train) - y_test)))
        useful = mae < baseline
        lines += [f"## {DISPLAY[platform]}", "", f"Training episodes: {len(training)}; later held-out episodes: {len(testing)}. Watch/duration MAE: model {mae:.3f}, median baseline {baseline:.3f}.", "", "Model beats baseline on this holdout." if useful else "Model does not beat baseline; do not use its weights for decisions.", ""]
        if useful:
            top = sorted(zip(names, weights), key=lambda item: abs(item[1]), reverse=True)[:8]
            lines += ["Largest standardized predictive weights (associations only):", ""] + [f"- {name}: {weight:+.3f}" for name, weight in top] + [""]
        artifact = {"platform": platform, "trained_through": training[-1][0].isoformat(), "train_n": len(training), "holdout_n": len(testing), "holdout_mae": mae, "baseline_mae": baseline, "beats_baseline": useful, "alpha": alpha, "features": names, "weights": weights.tolist(), "means": means.tolist(), "stds": stds.tolist(), "target_mean": float(y_train.mean()), "numeric_medians": medians, "categorical_vocabulary": vocab}
        model_dir = LAB / "models"
        model_dir.mkdir(exist_ok=True)
        (model_dir / f"{platform}.json").write_text(json.dumps(artifact, indent=2) + "\n", encoding="utf-8")
    (LAB / "model_report.md").write_text("\n".join(lines), encoding="utf-8")
    print("Wrote performance/model_report.md")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["sync", "report", "train"])
    args = parser.parse_args()
    {"sync": sync, "report": report, "train": train}[args.command]()


if __name__ == "__main__":
    main()
