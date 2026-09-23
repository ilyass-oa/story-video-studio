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
3. **Music** (optional): `"music": {"id": "<group>", "volume": 0.14}`. Many creators add a trending
   sound in-app instead — then leave `music: null`.

## Taste rules
- ≤ 1 story cue per 2 scenes; silence before a reveal makes the reveal louder.
- Sound follows meaning: the heartbeat grows as the guilt grows; it stops at the confession.
- Never put a cue on every word; never stack three sounds on one frame.

## Finding & adding sounds
- `./sv sfx list` (groups by category) · `./sv sfx search "creak wood"` (ids, durations).
- Missing something? `./sv sfx fetch "ship horn" --category objects --n 2 [--loop]` pulls CC0 sounds
  (Openverse→Freesound, or the Freesound API when `FREESOUND_API_KEY` is set), trims, normalises,
  indexes and adds it to `wishlist.json` so the bank can be rebuilt anywhere with `./sv sfx build`.
- Bigger libraries you can drop in (free, royalty-free): Sonniss GDC bundles (gdc.sonniss.com). Put
  files in `banks/sfx/<category>/` and add entries to wishlist/index (see skill 08).
