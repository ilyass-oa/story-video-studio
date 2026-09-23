---
name: 00-story-director
description: Make a complete voice-over story video (TikTok/Reels/Shorts, 9:16) end to end with this studio — pick a story that was never made before, script, narration, timing, scene assembly from the locked template bank, images, sound, render, review. Use when asked to "make a video", "do an episode", "find a story and make it", or to resume an unfinished episode.
---

# 00 · Story director

The studio is an assembly line with a locked look. You choose and write; the engine designs, times,
mixes and renders. Quality comes from choosing well and **looking** at every result.

## 0 · Before anything
- Read `skills/KNOWN-MISTAKES.md` (every error already made in this studio and how to avoid it).
- Know your tools: **can you generate images yourself** (Codex `$imagegen` or similar)? That decides how
  step 5 goes (skill 05). You cannot hear audio — the user judges the voice.

## 0 · Pick the story and its look (never repeat either)
1. Read `history/STORIES.md` completely: the table = stories already made (with their look and narrator);
   the backlog = ideas.
2. Choose a story that is **not** in the table (not the same source, not the same hook). Backlog ideas
   are good candidates; so are public-domain classics, myths, true stories you can source.
3. Choose the look by the story's feeling (`./sv looks` → `engine/gallery/looks.jpg`), **not the theme of
   either of the last two videos**. Pack: `noir` for horror, mystery, crime, dark history; `atelier` for
   reflective, educational, uplifting, parables. Theme inside it: see skill 04 "The look of this video".
4. `./sv new <slug> --title "<Title>" --source "<author (year) / original / sources>" --pack noir --theme <theme>`
   (it warns if the story, the look or the narrator repeats recent videos).

## 1 → 7 · Run the pipeline
`./sv go <slug>` executes every mechanical step and stops at each checkpoint with the exact next action
and the skill to read. Run it again after each checkpoint. The steps:

| Step | Your job | Skill |
|---|---|---|
| script | brief + exact spoken words | `skills/01-story-script/SKILL.md` |
| voice | cast the narrator for THIS story (`./sv voice-audition`), direction + tags, `./sv voice` | `skills/02-voice-narration/SKILL.md` |
| timing | `./sv align` must report 100 % | `skills/03-timing-alignment/SKILL.md` |
| edit | per scene: precise `see` brief, template, emphasis, sounds | `skills/04-scene-assembly/SKILL.md` |
| images | look at every image, fix misfits, ✓ verdict per image in `review.md` | `skills/05-image-sourcing/SKILL.md` |
| sound | story cues + ambience | `skills/06-sound-design/SKILL.md` |
| render | stills → preview → director's scorecard all ≥ 4 → `--final` | `skills/07-render-review/SKILL.md` |

`./sv render <slug> --final` puts the video in `history/videos/` and logs the story in `history/STORIES.md`.

## Checkpoints with the user (unless told to run on your own)
- **A** after the script — words are expensive to change later.
- **B** after the narration — the user listens to `02-voice/narration.wav`; you cannot hear, never claim you did.
- **C** after the stills — show `06-render/review/stills.jpg`.
On your own: still do every self-check, then report what you verified and what you could not (audio).

## The standard
Read the anti-laziness contract in `AGENTS.md` before starting and hold every step to it: think per
scene, unique and accurate images landing on their words, a cast and directed human voice, proof in
review.md and the scorecard.

## Non-negotiables
1. Words change → re-voice → re-align. Only visuals change → just re-render.
2. Never edit `engine/` or `banks/` while making an episode (bank changes = skill 08, separate task).
3. Open and judge every sheet and still you produce.
4. No paid APIs. Quota error = stop that step and tell the user.
5. Report honestly: what you rendered, what you looked at, what is unverified.
