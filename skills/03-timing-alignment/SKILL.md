---
name: 03-timing-alignment
description: Get word-level timestamps for the narration (WhisperX forced alignment against the exact script) and fix alignment problems. Use after any new or changed narration, or when words appear on screen too early/late.
---

# 03 · Timing & alignment

`./sv align <slug>` → `03-timing/words.json`: every script word with `start`/`end` in ms from the
start of `narration.wav`, a `source` (`forced` | `rough` | `interpolated`) and a score.

How it works: faster-whisper transcribes twice (primed with the script, and unprimed — priming makes
Whisper skip passages, no priming garbles fast speech; together they are reliable) → the script is
matched to the rough words (timings from the unprimed pass) → WhisperX wav2vec2 aligns each script
sentence inside its window → a word stretched back over a dramatic pause is snapped to the real onset
of the voice → any word still missing is interpolated **and reported**. Nothing is invented silently.

Before alignment, `./sv voice` has already verified each take against the script (the same two-pass
transcription: a word counts as said if either pass heard it) and re-taken it if a word was skipped or
changed or a `[tag]` was read aloud.

## Read the report
- `script match 100%` → the voice said exactly the script. Anything below 100 % → a word was skipped or
  changed: listen to it, re-voice (never patch timings around a wrong word).
- `issues` → words that needed fallback timing; usually harmless for one-syllable words; if a key word
  (an accent word) is interpolated, listen around it or re-voice.

## Downstream contract
- The compiler converts ms → frames (30 fps) from absolute times (no rounding drift), starts the
  voice at frame 6, and places: scene cuts slightly *before* the first word of each scene, each word's
  reveal on its own start, accent typing across the word's duration, each image's entrance on the word
  that names it, camera punch-ins on accents, sound cues on words.
- Changing `script.txt` or the audio invalidates `words.json` and `04-edit/edit.json` word mapping —
  re-run align, then `./sv check` shows which scenes no longer match.
