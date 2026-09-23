---
name: 07-render-review
description: Render and review a story video — settled-frame stills for design review, fast half-res previews (whole or scene ranges), final 1080x1920 export, contact sheets and loudness checks, and the fix loop that maps each defect to the right edit. Use after assets are resolved, or whenever a render looks or sounds wrong.
---

# 07 · Render & review

## Loop (cheap → expensive)
1. `./sv stills <slug>` → `06-render/review/stills.jpg`: one settled frame per scene (~30 s).
   **Open it.** Judge every scene before rendering motion.
2. `./sv render <slug>` → `06-render/preview.mp4` (540×960, fast). `--scenes s05-s09` renders a range;
   `--debug` burns scene id/time into the frame.
3. `./sv review <slug>` → `review/contact.jpg` (1 frame/s with timecodes) + loudness report.
4. Fix (table below) → repeat only what changed (stills for one scene: `--scenes s07`).
5. `./sv render <slug> --final` → `06-render/final.mp4` (1080×1920, h264 CRF 17, AAC 256k, -14 LUFS) +
   `credits.txt`, copied to `history/videos/<date>_<slug>.mp4` and logged in `history/STORIES.md`.
Repair until every scorecard line is ≥ 4 (at most three passes), then report what remains to the user.

Reference for "what should this template look like": `engine/gallery/<pack>/<template>.jpg`.

## Defect → fix (always the smallest change, never engine code)
| You see / hear | Fix in |
|---|---|
| wrong or ugly image, off-topic, watermark | new `find` query or `./sv img pick <slug> <id> <#>` |
| halo / cropped cutout / two objects | `./sv img pick … --select "the object"` or another candidate |
| subject tiny in a full-bleed photo/video (lots of empty frame) | slot `"focus": [x, y]` + `"zoom": 1.3–2` (skill 04) |
| a key sound moment feels crowded | `"quiet": true` on the scene where the sound stops: beds drop, ringing sfx cut |
| scene too busy, text small, 4+ lines | split the scene (edit.json), or `type-center` |
| same layout 3× in a row | change template or `variant` |
| accent on the wrong word / too much yellow | move/remove `*marks*` |
| scene flashes by (< 1 s) | merge it with a neighbour |
| a sound is late/early | change `at` word or `offsetMs`; booms use `"align": "peak"` |
| too many whooshes | `"quiet": true` on some scenes, or `"transition": "cut"` |
| voice buried / beds loud | lower bed `volume`, raise its `duck` strength (lower number) |
| words appear before/after they're spoken | re-run `./sv align`; if script changed, re-voice |
| loudness far from -14 LUFS | every render is auto-mastered to -14 LUFS / -1.2 dBTP; if the voice feels buried, lower bed/sfx volumes |
| text on a busy photo is hard to read | choose a calmer photo, or a template where text sits on the backdrop (object-hero, split-panel) |

## Director's scorecard — before `--final`, score honestly 1–5 (write it in `06-render/review/report.md`)
Watch the preview at full speed at least twice (once for picture, once for sync), and step through
`review/contact.jpg` + `review/stills.jpg`. Anything below **4** gets fixed before the final render.
| # | Criterion | 5 means |
|---|---|---|
| 1 | Hook (0–1.5 s) | a striking image or word lands with the first key word; you would not scroll |
| 2 | Voice (user's ear + `./sv align` metrics) | human, gripping, pace in range, emphasis on the image words |
| 3 | Image accuracy | every image shows exactly what its line says (review.md all ✓ with real reasons) |
| 4 | Variety | no repeated or look-alike images; template rhythm alternates; motifs shown differently |
| 5 | Sync | each image lands on the word that names it; accents type on as spoken; no image lingers on the wrong line |
| 6 | Readability | every settled frame readable on a phone; text never covers the subject's key detail; safe zones clear |
| 7 | Sound | story sounds on the right words, sparse; narration always on top; loudness -14 LUFS |
| 8 | Ending | the last line lands and holds; nothing cut off |
If you cannot verify one (audio), write "user to check" — never a guessed score.
