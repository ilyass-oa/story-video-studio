#!/usr/bin/env python3
"""audiokit — audio prep/analysis for the story pipeline (ffmpeg + numpy).

  sfx    IN OUT [--max 12] [--loop]   trim silence, normalise (peak -1 dBFS), fade tails, encode mp3.
                                       prints {duration, peak (s, loudest moment), lufs, loop}
  voice  IN OUT [--max-pause .45] [--dramatic .7] [--tempo 1]
                                       narration master: 48 kHz mono, high-pass, gentle compression, trimmed,
                                       editor-style pause tightening, optional pitch-safe tempo, -16 LUFS
  analyze IN [--words words.json]      pace (wpm), pauses, pitch register + expressiveness, verdicts
  stats  IN                            integrated LUFS, true peak, duration
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys

import numpy as np


def ff(*args: str) -> None:
    r = subprocess.run(["ffmpeg", "-v", "error", "-y", *args], capture_output=True, text=True)
    if r.returncode:
        sys.exit(f"ffmpeg failed: {r.stderr[-800:]}")


def decode(path: str, sr: int = 48000, mono: bool = True) -> np.ndarray:
    r = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-f", "f32le", "-ac", "1" if mono else "2", "-ar", str(sr), "-"], capture_output=True)
    if r.returncode:
        sys.exit(f"decode failed: {r.stderr.decode()[-500:]}")
    a = np.frombuffer(r.stdout, np.float32)
    return a if mono else a.reshape(-1, 2)


def lufs(x: np.ndarray, sr: int) -> float:
    try:
        import pyloudnorm as pyln

        if len(x) < sr * 0.5:
            x = np.pad(x, (0, int(sr * 0.5) - len(x)))
        return float(pyln.Meter(sr).integrated_loudness(x.astype(np.float64)))
    except Exception:
        rms = np.sqrt(np.mean(x**2) + 1e-12)
        return float(20 * np.log10(rms) - 0.7)


def active_bounds(x: np.ndarray, sr: int, thresh_db: float = -45.0) -> tuple[int, int]:
    win = max(1, sr // 100)
    n = len(x) // win
    if n == 0:
        return 0, len(x)
    env = np.sqrt(np.mean(x[: n * win].reshape(n, win) ** 2, axis=1) + 1e-12)
    db = 20 * np.log10(env / (env.max() + 1e-12))
    on = np.where(db > thresh_db)[0]
    if len(on) == 0:
        return 0, len(x)
    return on[0] * win, min(len(x), (on[-1] + 1) * win)


def cmd_sfx(a) -> dict:
    sr = 48000
    x = decode(a.input, sr)
    s, e = active_bounds(x, sr, -50 if a.loop else -42)
    s = max(0, s - int(0.01 * sr))
    e = min(len(x), e + int(0.12 * sr))
    maxlen = int(a.max * sr)
    x = x[s:e][:maxlen] if not a.loop else x[s:e][: int(max(a.max, 60) * sr)]
    dur = len(x) / sr
    # loudest 50 ms window → where the "hit" is (used to put whoosh peaks exactly on cuts)
    win = int(0.05 * sr)
    if len(x) > win:
        env = np.convolve(x**2, np.ones(win) / win, mode="valid")
        peak_t = float(np.argmax(env) + win / 2) / sr
    else:
        peak_t = 0.0
    start_s = s / sr
    fade_out = min(0.35 if not a.loop else 1.5, dur * 0.3)
    ff(
        "-ss", f"{start_s:.4f}", "-t", f"{dur:.4f}", "-i", a.input,
        "-af", f"afade=t=in:d=0.005,afade=t=out:st={max(0, dur - fade_out):.3f}:d={fade_out:.3f},loudnorm=I={-20 if a.loop else -16}:TP=-1.5:LRA=11,aresample=48000",
        "-ac", "2", "-c:a", "libmp3lame", "-q:a", "2", a.output,
    )
    y = decode(a.output, sr)
    return {"output": a.output, "duration": round(len(y) / sr, 3), "peak": round(peak_t, 3), "lufs": round(lufs(y, sr), 1), "loop": bool(a.loop)}


def tighten_pauses(x: np.ndarray, sr: int, max_pause: float, dramatic: float) -> tuple[np.ndarray, dict]:
    """Shorten silences like an editor would: gaps longer than `max_pause` are cut down to it; very long
    gaps (>1 s, usually intentional beats) keep `dramatic` seconds. Cuts are crossfaded (no clicks)."""
    hop = int(0.01 * sr)
    n = len(x) // hop
    env = np.sqrt(np.mean(x[: n * hop].reshape(n, hop) ** 2, axis=1) + 1e-12)
    db = 20 * np.log10(env + 1e-12)
    speech_level = np.percentile(db, 90)
    silent = db < speech_level - 32
    runs, i = [], 0
    while i < n:
        if silent[i]:
            j = i
            while j < n and silent[j]:
                j += 1
            runs.append((i, j))
            i = j
        else:
            i += 1
    out, pos, removed, cut = [], 0, 0.0, 0
    fade = int(0.012 * sr)
    for a_, b_ in runs:
        length = (b_ - a_) * hop / sr
        if a_ == 0 or b_ >= n or length <= max_pause:
            continue
        keep = dramatic if length > 1.0 else max_pause
        keep_s = int(keep * sr)
        start, end = a_ * hop, b_ * hop
        head = start + keep_s // 2  # keep half the pause after the phrase…
        tail = end - (keep_s - keep_s // 2)  # …and half before the next one
        seg = x[pos:head].copy()
        if out and len(seg) > fade:
            seg[:fade] *= np.linspace(0, 1, fade)
        if len(seg) > fade:
            seg[-fade:] *= np.linspace(1, 0, fade)
        out.append(seg)
        pos = tail
        removed += (tail - head) / sr
        cut += 1
    last = x[pos:].copy()
    if out and len(last) > fade:
        last[:fade] *= np.linspace(0, 1, fade)
    out.append(last)
    return np.concatenate(out), {"pausesShortened": cut, "silenceRemoved": round(removed, 2)}


def cmd_voice(a) -> dict:
    sr = 48000
    tmp = a.output + ".tmp.wav"
    chain = "highpass=f=70,acompressor=threshold=-20dB:ratio=2.2:attack=8:release=120:makeup=2"
    if a.tempo and abs(a.tempo - 1) > 0.005:
        chain += f",atempo={a.tempo:.3f}"  # pitch-preserving speed change
    ff("-i", a.input, "-ac", "1", "-ar", str(sr), "-af", chain, tmp)
    x = decode(tmp, sr)
    s, e = active_bounds(x, sr, -48)
    s = max(0, s - int(0.15 * sr))
    e = min(len(x), e + int(0.3 * sr))
    x = x[s:e]
    tight = {}
    if a.max_pause > 0:
        x, tight = tighten_pauses(x, sr, a.max_pause, a.dramatic)
    import os

    import soundfile as sf

    sf.write(tmp, x, sr, subtype="FLOAT")
    # EBU R128 normalisation with true-peak limiting (dynamic mode keeps timing sample-exact)
    ff("-i", tmp, "-af", "loudnorm=I=-16:TP=-1.5:LRA=9,aresample=48000", "-ac", "1", "-c:a", "pcm_s24le", a.output)
    os.remove(tmp)
    x = decode(a.output, sr)
    return {"output": a.output, "duration": round(len(x) / sr, 3), "lufs": round(lufs(x, sr), 1), "trimmedHead": round(s / sr, 3), "tempo": a.tempo, "maxPause": a.max_pause, **tight}


def cmd_stats(a) -> dict:
    sr = 48000
    x = decode(a.input, sr, mono=False)
    m = x.mean(axis=1)
    tp = float(20 * np.log10(np.abs(x).max() + 1e-12))
    return {"input": a.input, "duration": round(len(m) / sr, 3), "lufs": round(lufs(x if x.ndim == 1 else x, sr), 1), "truePeakDb": round(tp, 2)}


def pitch_track(x: np.ndarray, sr: int = 16000) -> np.ndarray:
    """F0 per 10 ms frame (Hz, 0 = unvoiced) via normalised autocorrelation, 60–400 Hz."""
    frame, hop = 640, 160
    lo, hi = sr // 400, sr // 60
    n = max(0, (len(x) - frame) // hop)
    if n == 0:
        return np.zeros(0)
    idx = np.arange(frame)[None, :] + hop * np.arange(n)[:, None]
    fr = x[idx] * np.hanning(frame)[None, :]
    energy = (fr**2).sum(axis=1)
    thr = np.percentile(energy, 60) * 0.1
    spec = np.fft.rfft(fr, 2 * frame, axis=1)
    ac = np.fft.irfft(np.abs(spec) ** 2, axis=1)[:, :frame]
    ac = ac / (ac[:, :1] + 1e-12)
    seg = ac[:, lo:hi]
    lag = seg.argmax(axis=1) + lo
    peak = seg.max(axis=1)
    f0 = sr / lag
    f0[(peak < 0.45) | (energy < thr)] = 0
    return f0


def cmd_analyze(a) -> dict:
    """Voice-performance metrics: pace, pauses, pitch register and expressiveness."""
    x16 = decode(a.input, 16000)
    dur = len(x16) / 16000
    f0 = pitch_track(x16)
    voiced = f0[f0 > 0]
    res: dict = {"input": a.input, "duration": round(dur, 2)}
    if len(voiced) > 20:
        st = 12 * np.log2(voiced / np.median(voiced))
        res.update({
            "pitchMedianHz": round(float(np.median(voiced)), 1),
            "pitchRangeSt": round(float(np.percentile(st, 95) - np.percentile(st, 5)), 2),
            "pitchStdSt": round(float(st.std()), 2),
        })
    if a.words:
        W = json.load(open(a.words))["words"]
        n = len(W)
        gaps = [max(0, (W[i + 1]["start"] - W[i]["end"]) / 1000) for i in range(n - 1)]
        speaking = sum(max(0, (w["end"] - w["start"]) / 1000) for w in W) + sum(g for g in gaps if g < 0.25)
        span = (W[-1]["end"] - W[0]["start"]) / 1000 if n else dur
        res.update({
            "words": n,
            "wpm": round(n / span * 60, 1) if span else 0,
            "articulationWpm": round(n / speaking * 60, 1) if speaking else 0,
            "pauses": {
                ">0.6s": sum(g > 0.6 for g in gaps),
                ">1.0s": sum(g > 1.0 for g in gaps),
                "max": round(max(gaps) if gaps else 0, 2),
                "totalSilence": round(sum(g for g in gaps if g >= 0.25), 2),
            },
        })
    verdict = []
    if "wpm" in res:
        w = res["wpm"]
        verdict.append("pace: SLOW for short-form (<140 wpm)" if w < 140 else "pace: FAST (>185 wpm) — check clarity" if w > 185 else "pace: good")
        if res["pauses"][">1.0s"] > max(1, res["words"] // 40):
            verdict.append("too many long pauses (>1 s) — tighten (--max-pause) or remove '…' / [very slowly] tags")
    if "pitchStdSt" in res:
        s = res["pitchStdSt"]
        verdict.append("intonation: MONOTONE (<2 st)" if s < 2 else "intonation: moderate" if s < 3 else "intonation: expressive")
    res["verdict"] = verdict
    return res


def cmd_master(a) -> dict:
    """Two-pass EBU R128 loudness normalisation of a rendered video's audio (video stream copied)."""
    r = subprocess.run(["ffmpeg", "-hide_banner", "-i", a.input, "-vn", "-af", f"loudnorm=I={a.lufs}:TP={a.tp}:LRA=11:print_format=json", "-f", "null", "-"], capture_output=True, text=True)
    txt = r.stderr[r.stderr.rfind("{") :]
    m = json.loads(txt[: txt.find("}") + 1])
    flt = (
        f"loudnorm=I={a.lufs}:TP={a.tp}:LRA=11:measured_I={m['input_i']}:measured_TP={m['input_tp']}:"
        f"measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true,aresample=48000"
    )
    ff("-i", a.input, "-c:v", "copy", "-af", flt, "-c:a", "aac", "-b:a", "256k", "-movflags", "+faststart", a.output)
    y = decode(a.output, 48000, mono=False)
    return {"output": a.output, "before": {"lufs": float(m["input_i"]), "tp": float(m["input_tp"])}, "lufs": round(lufs(y, 48000), 1), "truePeakDb": round(float(20 * np.log10(np.abs(y).max() + 1e-12)), 2)}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sp = ap.add_subparsers(dest="cmd", required=True)
    s = sp.add_parser("sfx")
    s.add_argument("input")
    s.add_argument("output")
    s.add_argument("--max", type=float, default=12)
    s.add_argument("--loop", action="store_true")
    v = sp.add_parser("voice")
    v.add_argument("input")
    v.add_argument("output")
    v.add_argument("--max-pause", type=float, default=0.45, help="cap for ordinary pauses in seconds (0 = keep all)")
    v.add_argument("--dramatic", type=float, default=0.7, help="length kept for pauses that were > 1 s")
    v.add_argument("--tempo", type=float, default=1.0, help="pitch-preserving speed factor (0.9–1.15)")
    t = sp.add_parser("stats")
    t.add_argument("input")
    z = sp.add_parser("analyze")
    z.add_argument("input")
    z.add_argument("--words")
    m = sp.add_parser("master")
    m.add_argument("input")
    m.add_argument("output")
    m.add_argument("--lufs", type=float, default=-14.0)
    m.add_argument("--tp", type=float, default=-1.2)
    a = ap.parse_args()
    res = {"sfx": cmd_sfx, "voice": cmd_voice, "stats": cmd_stats, "master": cmd_master, "analyze": cmd_analyze}[a.cmd](a)
    print(json.dumps(res))


if __name__ == "__main__":
    main()
