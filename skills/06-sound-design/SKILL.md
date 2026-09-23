---
name: 06-sound-design
description: Sound design for story videos — use the local SFX bank (transitions, impacts, heartbeats, creaks, rain, drones…), place story sound cues on exact words, add ambience beds and optional music (auto-ducked under the narration), and grow the bank with new CC0 sounds. Use when filling sfx/ambience/music in edit.json or when a needed sound is missing.
---

# 06 · Sound design

The bank lives in `banks/sfx/` (≈110 CC0 sounds in 12 categories, trimmed, loudness-normalised,
with the *peak time* of each sound measured so hits land exactly on cuts/words) and `banks/music/`.
Every file has source + licence in `index.json`.

## What happens automatically (don't duplicate it)
- **Every transition** gets a matching whoosh/swish/glitch/paper sound, peak-aligned to the cut,
  with variants rotated so it never sounds like the same whoosh twice.
- **Template entrances**: pin (pinned-note), TV power-on (tv-screen), shutter (photo cards), a deep hit
  when a giant word lands (word-behind), notification (phone-screen).
- **`^pop^` words** get a deep impact.
- **Ducking**: beds and music dip under the narration automatically (attack 0.2 s, release 0.5 s).

## What you add (edit.json)
1. **Story cues** — only sounds the story *names or implies* (a door, a heartbeat, a clock, thunder):
   `"sfx": [{"id": "door-creak", "at": "opened", "volume": 0.6}]`
   - `at`: a word of this scene (its start), `"start"`, `"end"`, `"#3"` (3rd word); `offsetMs` shifts it.
   - `align: "peak"` puts the loudest moment on the anchor (for booms/hits); default `start`.
   - Volumes: story cue 0.4–0.9, texture 0.2–0.4. Narration always wins.
2. **Ambience beds** — one continuous bed sets the world: `"ambience": [{"sfx": "rain-heavy", "from": "start", "to": "end", "volume": 0.18}]`.
   Layer at most 2. A tension bed (heartbeat-slow → heartbeat-fast, drone) can start at a scene id to
   mark an escalation.
3. **Music — always** (no dead air): `"music": {"id": "<group>", "volume": 0.09–0.14}`, chosen for THIS story
   (see "The sound bed" below). `music: null` only if the user will add a trending sound in the app.

## The sound bed — never silent, never crowded
Every second has three layers under the voice, each quieter than the last:
1. **Music** (0.09–0.14) — matches the story's emotion, not just its genre. Listen to the choice through
   its metadata: `./sv music search "<mood>"` (dark-ambient, horror-score, suspense, mystery, sad-piano,
   calm-ambient, epic-cinematic, uplifting…). Horror/curse → dark-ambient or horror-score; mystery / true
   unsolved → mystery or suspense; tragedy / love / loss → sad-piano; legend with wonder → mystery or
   epic-cinematic (low); parable / gentle → calm-ambient or lofi; hopeful twist → uplifting. Nothing fits?
   `./sv music fetch "<precise mood> instrumental" --category <mood>` and pick the best. **Never** a track
   with vocals, a strong beat that fights the narration, or a mood that contradicts the story.
2. **Ambience** (0.12–0.25) — the place: wind, rain, fire, sea, crowd, church, forest, room tone. Change it
   when the story moves (`from`/`to` scene ids). At least one bed from start to end.
3. **Story cues** (0.3–0.9) — what the words name, on their word, in the gaps (`offsetMs`), long ones cut
   with `durMs`. Aim for **one meaningful cue every ~2–3 s of action**, fewer in calm stretches.
A motif makes it memorable: one signature sound for the story's object (the pipe's flute, the clock's tick)
that returns and grows, then stops. Planned silence (`quiet: true`) is the only silence — once, at the peak.

## Taste rules
- Enough to be cinematic, never so much the voice fights it: max 2 beds + music, never 3 cues on one frame.
- Silence before a reveal makes the reveal louder — as a *planned* beat, never as a gap.
- Sound follows meaning: the heartbeat grows as the guilt grows; it stops at the confession.
- Never put a cue on every word; never stack three sounds on one frame.

## Finding & adding sounds
- `./sv sfx list` (groups by category) · `./sv sfx search "creak wood"` (ids, durations).
- Missing something? `./sv sfx fetch "ship horn" --category objects --n 2 [--loop]` pulls CC0 sounds
  (Openverse→Freesound, or the Freesound API when `FREESOUND_API_KEY` is set), trims, normalises,
  indexes and adds it to `wishlist.json` so the bank can be rebuilt anywhere with `./sv sfx build`.
- Bigger libraries you can drop in (free, royalty-free): Sonniss GDC bundles (gdc.sonniss.com). Put
  files in `banks/sfx/<category>/` and add entries to wishlist/index (see skill 08).
