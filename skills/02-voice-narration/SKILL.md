---
name: 02-voice-narration
description: Cast and direct the narrator so the read sounds 100 % human and keeps people watching — choose the voice by the story (config/voices.json), write the audio profile / scene / performance direction, place inline performance tags in the script, audition, generate with Gemini TTS, and check the measured pace, pauses and intonation. Use for any narration, voice-over, re-take or narrator change.
---

# 02 · Voice — casting, direction, pace

The voice decides whether people stay. A great read has **momentum** (150–170 words per minute for
short-form, pauses only where the story turns), **intonation** (it rises, falls, leans on the image words)
and **character** (a person you believe). Measured problems in past episodes: 40 % of the audio was
silence and the pace was 105–122 wpm — it sounded slow, not "calm". Everything below prevents that.

## 1 · Cast the voice by the story (never by habit)
Read `config/voices.json` (30 voices: gender, character, what each suits).
- Who is telling this story? Age, gender, temperament. A first-person confession → that person's gender
  and age; a folk tale → an elder; a true crime → a firm investigator; a fable → warm.
- Pick 2–3 candidates that fit and audition them on the opening lines:
  `./sv voice-audition <slug> --voices Algenib,Charon,Gacrux`
  → `02-voice/auditions/<Voice>.wav` + a table (pace, pitch, intonation). **The user listens and chooses**;
  if they can't, pick the best fit by the story + the measurements, and say so.
- **Vary across episodes**: `history/STORIES.md` logs every narrator (voice column) and `./sv new … --voice`
  warns when it voiced one of the last two videos. Alternate gender, age and temperament across videos.
- Vary the **persona and accent** too, by the story's origin and teller: the archivist who found the records
  (true history), the grandmother by the fire (folk tale), the witness who was there (first person), the
  detective reading the file (crime), the sailor (sea), the priest (religious horror); accents that fit the
  place — neutral British, Scottish, Irish, American Southern, neutral American… (never a caricature).

## 2 · Pick the pace profile
`config/voices.json → pace`: `tense` (horror, thriller, crime · 150–170 wpm), `story` (folklore, history,
drama), `reflective` (parables, emotional · 138–155), `energetic` (facts, motivation · 165–190).
Set it once: `./sv new … --pace tense` or `./sv voice <slug> --pace tense`.
Mastering then tightens dead pauses like an editor (ordinary pauses → ~0.4 s, dramatic beats → ~0.7 s)
and, if still below ~30 % into the range, speeds up pitch-safely (max ×1.10) — it aims inside the range,
not at its floor.

## 3 · Write the direction — `02-voice/direction.md`
Structure (Google's documented format; the tool adds the preamble and `#### TRANSCRIPT` itself):
```
# AUDIO PROFILE: <name of the persona>
## "<what they are to the listener>"
{person} in {his} <age> with <texture of the voice>, <who they are and why they tell this story>

## THE SCENE: <concrete place>
<sensory detail: where the narrator is, who they speak to, why this story matters to them>

### PERFORMANCE
Style: <the emotional colour, the way a real storyteller does it — "captivating, intimate, gripped by it">
Pace: <momentum — "sentences flow into each other and tighten as tension rises; one held beat before the reveal">
Accent: <precise: "neutral American English", "soft Irish, as heard in Galway">
```
Write the persona with gender tokens — `{person}` (A man / A woman), `{his}`, `{he}`, `{him}` — so the same
direction works for every voice you audition.

Rules that make it human (from Google's and practitioners' guidance):
- Describe *how it feels*, never quote lines of the script in the direction.
- Never use flattening words: quiet, calm, careful, slow, no rush, whispered, unhurried → they produce
  monotone, slow reads. Say *intimate*, *gripping*, *warm*, *sincere*, *forward momentum* instead.
- Coherence: persona, scene, style and the story must agree.
- Don't over-specify: 3–5 strong lines beat 20 adjectives. Leave the model room to act.

## 4 · Put performance tags INSIDE the script (at the exact moment)
In `01-script/script.txt`, square-bracket tags change the delivery where they sit. They are sent to the
voice and removed everywhere else (alignment, captions, history).
```
He hid the body beneath the floorboards. [whispers] Not a drop of blood.
But the sound grew. [very fast] Louder. Louder. [panicked] Louder!
```
Tags documented by Google (most reliable — prefer these): `[whispering]` `[sigh]` `[laughing]` `[uhm]`
`[extremely fast]` `[very slowly]` `[serious]` `[trembling]` `[curious]` `[warmly]` `[thoughtfully]`.
Measured failure: `[whispers]` and `[panicked]` were once read aloud as words — every take is now
auto-checked (`./sv voice` re-takes up to twice and reports "tag read aloud", skipped or changed words).
- 1 tag per ~25 words at most, only on turns, reveals and emotional peaks. Tag density kills naturalness.
- Rhythm through punctuation: commas connect (flow), full stops land, `…` trails off, `—` is a micro-beat.
  Periods between tiny fragments sound robotic — join fragments with commas unless the beat is intended.
- Numbers, names, dates: write them as they must be said ("nineteen sixty-two" if that is the read).

## 5 · Generate and check
`./sv voice <slug> [--voice Name] [--pace tense]` → take in `02-voice/takes/`, master in `narration.wav`,
report: duration · wpm vs target · pauses tightened · tempo · intonation (semitones).
Then `./sv align <slug>` prints the definitive measures:
- **script match must be 100 %** (the voice said exactly the words). Anything less → listen to the flagged
  words; re-voice. Never "fix" timing around a wrong word.
- **pace** in the profile's range · **pauses >1 s** ≤ 1 per 40 words · **intonation ≥ 3 st** (below 2 st =
  monotone → rewrite the direction with more colour, add a tag at the turns, or recast).
If a metric fails, change ONE thing (direction line, a tag, the voice, the pace profile) and re-voice.
Older takes stay in `takes/`; `./sv voice-use <slug> <n>` restores one.

## 6 · The user's ear is the final judge
You cannot hear. Say which metrics passed and ask the user to listen to `02-voice/narration.wav` for
checkpoint B (pronunciation, emphasis on the right words, emotion that fits). A human recording is always
welcome: `./sv voice-import <slug> file.wav` (mastered the same way).
