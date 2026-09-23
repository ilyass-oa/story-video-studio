#!/usr/bin/env python3
"""align — word-level timestamps for an approved narration against its exact script.

  align.py AUDIO SCRIPT OUT [--language en] [--model small.en]

1. faster-whisper (via WhisperX) transcribes roughly, with word times.
2. The *script* words are mapped onto the rough words (difflib), giving sentence time windows.
3. WhisperX wav2vec2 forced alignment aligns each script sentence inside its window.
4. Any word that still has no time is interpolated between neighbours and flagged — never silently invented.
Output words.json: {"words":[{"i","text","start","end","score","source"}], "durationMs", "issues":[...]}
All times in milliseconds from the start of AUDIO.
"""
from __future__ import annotations

import argparse
import difflib
import json
import os
import re
import sys

import numpy as np
from pathlib import Path

HERE = Path(__file__).resolve().parent
os.environ.setdefault("HF_HOME", str(HERE / "models" / "hf"))
os.environ.setdefault("TORCH_HOME", str(HERE / "models" / "torch"))


def norm(w: str) -> str:
    return re.sub(r"[^a-z0-9]", "", w.lower().replace("’", "'"))


ONES = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split()
TENS = "_ _ twenty thirty forty fifty sixty seventy eighty ninety".split()


def num_words(n: int) -> list[str]:
    if n < 20:
        return [ONES[n]]
    if n < 100:
        return [TENS[n // 10]] + ([ONES[n % 10]] if n % 10 else [])
    if n < 1000:
        return [ONES[n // 100], "hundred"] + (num_words(n % 100) if n % 100 else [])
    if 1100 <= n <= 1999:  # years are read in pairs: nineteen sixty-two, nineteen oh two
        hi, lo = divmod(n, 100)
        return num_words(hi) + (["hundred"] if lo == 0 else ["oh"] + num_words(lo) if lo < 10 else num_words(lo))
    if n < 1_000_000:
        return num_words(n // 1000) + ["thousand"] + (num_words(n % 1000) if n % 1000 else [])
    return [str(n)]


ORD = {"one": "first", "two": "second", "three": "third", "five": "fifth", "eight": "eighth", "nine": "ninth", "twelve": "twelfth"}


def ordinal(n: int) -> list[str]:
    w = num_words(n)
    last = w[-1]
    w[-1] = ORD.get(last) or (last[:-1] + "ieth" if last.endswith("y") else last + "th")
    return w


def expand(tokens: list[str]) -> list[str]:
    """Normalise spoken/written tokens into comparable words (digits, ordinals, currency, hyphens, case, punctuation)."""
    out = []
    for t in tokens:
        t = t.lower().replace("’", "'")
        mo = re.fullmatch(r"[\"'(]*(\d+)(?:st|nd|rd|th)[\"'.,!?;:)…]*", t)
        if mo:
            out += ordinal(int(mo.group(1)))
            continue
        m = re.fullmatch(r"[\"'(]*([£$€]?)(\d[\d,]*)(%?)[\"'.,!?;:)…]*", t)
        if m:
            words = num_words(int(m.group(2).replace(",", "")))
            out += words + (["pounds"] if m.group(1) == "£" else ["dollars"] if m.group(1) == "$" else ["euros"] if m.group(1) == "€" else []) + (["percent"] if m.group(3) else [])
            continue
        for part in re.split(r"[-—–]", t):
            w = norm(part)
            if w:
                out.append(w)
    # spoken numbers: "a hundred and thirty" == "one hundred thirty" (as digits are expanded)
    fixed = []
    for i, w in enumerate(out):
        nxt = out[i + 1] if i + 1 < len(out) else ""
        if w == "a" and nxt in ("hundred", "thousand"):
            w = "one"
        if w == "and" and fixed and fixed[-1] in ("hundred", "thousand") and nxt in ONES + TENS[2:]:
            continue
        fixed.append(w)
    return fixed


def _mask(a: list[str], b: list[str]):
    sm = difflib.SequenceMatcher(a=a, b=b, autojunk=False)
    ok, extra, changed = [False] * len(a), [], {}
    for op, i1, i2, j1, j2 in sm.get_opcodes():
        if op == "equal":
            ok[i1:i2] = [True] * (i2 - i1)
        elif op == "insert":
            extra.append(" ".join(b[j1:j2]))
        elif op == "replace":  # spelling variants (shrivelled/shriveled) count as matched
            aa, bb = a[i1:i2], b[j1:j2]
            if len(aa) == len(bb) and all(difflib.SequenceMatcher(a=x, b=y).ratio() >= 0.75 for x, y in zip(aa, bb)):
                ok[i1:i2] = [True] * (i2 - i1)
            else:
                changed[i1] = " ".join(bb)
    return ok, extra, changed


def compare(script_words: list[str], *heard_passes: list[str]) -> dict:
    """What the voice really said vs the script: match ratio + missing / extra / changed words.
    Several transcription passes may be given: a script word counts as said if ANY pass heard it
    (a script-primed pass skips passages, an unprimed pass garbles fast speech — together they are reliable)."""
    a = expand(script_words)
    ok, extras, changes = [False] * len(a), [], []
    for heard in heard_passes:
        m, ex, ch = _mask(a, expand(heard))
        ok = [x or y for x, y in zip(ok, m)]
        extras += [e for e in ex if e not in extras]
        changes.append(ch)
    missing, changed, i = [], [], 0
    while i < len(a):
        if ok[i]:
            i += 1
            continue
        j = i
        while j < len(a) and not ok[j]:
            j += 1
        heard_as = next((ch[i] for ch in changes if i in ch), None)
        (changed.append(f"{' '.join(a[i:j])} → {heard_as}") if heard_as else missing.append(" ".join(a[i:j])))
        i = j
    return {"matchRatio": round(sum(ok) / max(1, len(a)), 3), "missing": missing, "extra": extras, "changed": changed}


def split_sentences(text: str) -> list[str]:
    parts = re.split(r"(?<!\bMr\.)(?<!\bMrs\.)(?<!\bDr\.)(?<!\bMs\.)(?<!\bSt\.)(?<=[.!?…])\s+|\n+", text.strip())
    return [p.strip() for p in parts if p.strip()]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("audio")
    ap.add_argument("script")
    ap.add_argument("out")
    ap.add_argument("--language", default="en")
    ap.add_argument("--model", default="small.en")
    ap.add_argument("--check", action="store_true", help="only verify what was said vs the script (no timings)")
    a = ap.parse_args()

    import whisperx

    device = "cpu"
    audio = whisperx.load_audio(a.audio)
    dur = len(audio) / 16000.0
    # Whisper drops words that end right at the end of the file (a final line after a dramatic pause):
    # pad with silence so the last words are heard. Timings are unaffected; `dur` stays the real length.
    audio = np.concatenate([audio, np.zeros(int(16000 * 1.5), dtype=audio.dtype)])
    # inline performance tags like [whispers] are TTS cues, not spoken words
    script = re.sub(r"\[[^\]]*\]", " ", Path(a.script).read_text(encoding="utf-8"))
    script = re.sub(r"[ \t]+", " ", script)
    sentences = split_sentences(script)
    script_words = [w for s in sentences for w in s.split()]

    # 1) rough transcription with word times (primed with the script's vocabulary: names, rare words)
    model = whisperx.load_model(a.model, device, compute_type="int8", language=a.language, asr_options={"initial_prompt": " ".join(script_words)[:900]})
    rough = model.transcribe(audio, batch_size=4, language=a.language)
    # second pass without the script prompt: priming makes Whisper skip whole passages it "already saw"
    import dataclasses
    model.options = dataclasses.replace(model.options, initial_prompt=None) if dataclasses.is_dataclass(model.options) else model.options._replace(initial_prompt=None)
    plain = model.transcribe(audio, batch_size=4, language=a.language)
    if a.check:
        heard = " ".join(seg["text"] for seg in rough["segments"]).split()
        heard2 = " ".join(seg["text"] for seg in plain["segments"]).split()
        res = compare(script_words, heard, heard2)
        tags = {norm(t) for t in re.findall(r"\[([^\]]*)\]", Path(a.script).read_text(encoding="utf-8")) for t in t.split()}
        # common performance-tag words too (a tag read aloud is never a script word)
        tags |= {"whisper", "whispers", "whispering", "panicked", "sigh", "sighs", "laughing", "laughs", "trembling", "serious", "shouting", "uhm", "excited", "warmly", "thoughtfully", "sarcastically", "crying"}
        tags -= {norm(w) for w in script_words}
        res["tagsSpoken"] = sorted({w for x in res["extra"] + [c.split(" → ")[-1] for c in res["changed"]] for w in x.split() if w in tags})
        res["heard"] = " ".join(heard)
        res["heard2"] = " ".join(heard2)
        Path(a.out).parent.mkdir(parents=True, exist_ok=True)
        Path(a.out).write_text(json.dumps(res, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
        print(json.dumps({k: res[k] for k in ("matchRatio", "missing", "extra", "changed", "tagsSpoken")}))
        return
    amodel, meta = whisperx.load_align_model(language_code=a.language, device=device)
    passes = []
    for rp in (plain, rough):
        al = whisperx.align(rp["segments"], amodel, meta, audio, device, return_char_alignments=False)
        passes.append([w for seg in al["segments"] for w in seg.get("words", []) if "start" in w])
    rw = passes[0]

    # 2) map script words → rough words. Timings come from the UNPRIMED pass (it follows the audio); a primed
    # pass that skipped a passage squeezes its remaining words into the wrong place, so it only fills holes
    # whose time fits between the neighbours already placed.
    def times_from(pw):
        out: list[tuple[float, float] | None] = [None] * len(script_words)
        sm = difflib.SequenceMatcher(a=[norm(w) for w in script_words], b=[norm(w["word"]) for w in pw], autojunk=False)
        for blk in sm.get_matching_blocks():
            for k in range(blk.size):
                r = pw[blk.b + k]
                out[blk.a + k] = (r["start"], r["end"])
        return out

    approx = times_from(passes[0])
    for i, t in enumerate(times_from(passes[1])):
        if approx[i] is None and t:
            lo = max((x[1] for x in approx[:i] if x), default=0.0)
            hi = min((x[0] for x in approx[i + 1 :] if x), default=dur)
            if lo - 0.05 <= t[0] and t[1] <= hi + 0.05:
                approx[i] = t
    match_ratio = compare(script_words, *[[w["word"] for w in pw] for pw in passes])["matchRatio"]

    # sentence windows
    segs = []
    idx = 0
    for s in sentences:
        n = len(s.split())
        times = [t for t in approx[idx : idx + n] if t]
        if times:
            st, en = times[0][0], times[-1][1]
            # words the rough pass missed at the sentence's edges: let the window reach the neighbours,
            # never squeeze them into the gap next to the last heard word
            if not approx[idx + n - 1]:
                nxt = next((t[0] for t in approx[idx + n :] if t), None)
                en = max(en, (nxt - 0.1) if nxt else dur)
            if not approx[idx]:
                st = min(st, segs[-1]["end"] if segs else 0.0)
        else:
            prev_end = segs[-1]["end"] if segs else 0.0
            st, en = prev_end, min(dur, prev_end + 0.4 * n)
        segs.append({"text": s, "start": max(0.0, st - 0.25), "end": min(dur, en + 0.35), "_i": idx, "_n": n})
        idx += n

    if os.environ.get("SV_ALIGN_DEBUG"):
        for s_ in segs[-3:]:
            print("SEG", round(s_["start"], 2), round(s_["end"], 2), s_["text"], [approx[j] for j in range(s_["_i"], s_["_i"] + s_["_n"])], file=sys.stderr)
    # 3) forced alignment of the exact script, sentence by sentence
    fa = whisperx.align([{"text": s["text"], "start": s["start"], "end": s["end"]} for s in segs], amodel, meta, audio, device, return_char_alignments=False)
    words = []
    issues = []
    fa_segs = fa["segments"]
    for s, f in zip(segs, fa_segs if len(fa_segs) == len(segs) else [None] * len(segs)):
        fw = f.get("words", []) if f else []
        toks = s["text"].split()
        for k, tok in enumerate(toks):
            w = fw[k] if k < len(fw) else None
            i = s["_i"] + k
            if w and "start" in w and "end" in w:
                words.append({"i": i, "text": tok, "start": round(w["start"] * 1000), "end": round(w["end"] * 1000), "score": round(float(w.get("score", 0)), 3), "source": "forced"})
                if float(w.get("score", 0)) < 0.02:
                    issues.append(f"word {i} '{tok}': aligned with near-zero confidence — check its timing")
            elif approx[i]:
                st, en = approx[i]
                words.append({"i": i, "text": tok, "start": round(st * 1000), "end": round(en * 1000), "score": 0.0, "source": "rough"})
                issues.append(f"word {i} '{tok}': forced alignment failed, used rough transcription time")
            else:
                words.append({"i": i, "text": tok, "start": None, "end": None, "score": 0.0, "source": "missing"})

    # 4) interpolate holes between known neighbours (flagged)
    for k, w in enumerate(words):
        if w["start"] is None:
            prev = next((words[j] for j in range(k - 1, -1, -1) if words[j]["start"] is not None), None)
            nxt = next((words[j] for j in range(k + 1, len(words)) if words[j]["start"] is not None), None)
            p = prev["end"] if prev else 0
            q = nxt["start"] if nxt else round(dur * 1000)
            w["start"], w["end"], w["source"] = p, max(p + 60, (p + q) // 2), "interpolated"
            issues.append(f"word {k} '{w['text']}': not heard in audio — interpolated; listen to confirm it was spoken")
    # snap to speech: an aligner may stretch a word back across a dramatic pause ("The children … were not"),
    # so it would appear on screen before it is heard. Move such starts to the real onset of the voice.
    hop = 160  # 10 ms at 16 kHz
    x = audio[: int(dur * 16000)]
    frames = len(x) // hop
    rms_db = 20 * np.log10(np.sqrt(np.mean(x[: frames * hop].reshape(frames, hop).astype(np.float64) ** 2, axis=1)) + 1e-9)
    thr = max(-45.0, float(np.percentile(rms_db, 95)) - 32.0)
    for w in words:
        if w["start"] is None or w["end"] - w["start"] < 250:
            continue
        a0, a1 = w["start"] // 10, min(frames, w["end"] // 10)
        v = rms_db[a0:a1] > thr
        # a silent run of ≥ 150 ms in the first half of the word (the previous word's tail may precede it)
        k, run = 0, 0
        while k < len(v) and k < len(v) // 2 + 15:
            run = 0 if v[k] else run + 1
            if run >= 15:
                break
            k += 1
        if run >= 15:
            after = np.nonzero(v[k:])[0]
            if len(after) and len(v) - (k + after[0]) >= 8:  # real speech follows (≥ 80 ms)
                w["start"] = int((a0 + k + after[0]) * 10 - 20)
                w["snapped"] = True
    # monotonic clean-up
    for k in range(1, len(words)):
        if words[k]["start"] < words[k - 1]["start"]:
            words[k]["start"] = words[k - 1]["start"]
        if words[k]["end"] < words[k]["start"]:
            words[k]["end"] = words[k]["start"] + 40

    rough_text = " ".join(w["word"] for w in rw)
    out = {
        "audio": a.audio,
        "durationMs": round(dur * 1000),
        "language": a.language,
        "engine": f"whisperx {getattr(whisperx, '__version__', '')} + {a.model}".strip(),
        "scriptMatchRatio": round(match_ratio, 3),
        "roughTranscript": rough_text,
        "issues": issues,
        "words": words,
    }
    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    Path(a.out).write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({"words": len(words), "matchRatio": out["scriptMatchRatio"], "issues": len(issues), "durationMs": out["durationMs"]}))


if __name__ == "__main__":
    sys.exit(main())
