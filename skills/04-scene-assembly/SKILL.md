---
name: 04-scene-assembly
description: Fill an episode's 04-edit/edit.json scene by scene — a precise visual brief for what the viewer must see at that exact moment, the locked template that shows it best, emphasis marks, one unique image per scene anchored to the word that names it, and story sounds. Use after `./sv draft <slug>` and before `./sv assets`. This is careful assembly, never design and never filler.
---

# 04 · Scene assembly

You don't design (layout, motion, timing, grade are locked). You decide **what the viewer sees while
each line is spoken** — and that decision is the whole video. A generic picture is a skip; the exact
picture is why people stay.

## The standard (anti-laziness contract — read before filling anything)
1. **Every scene is thought through on its own.** Read its words, the lines before and after, and ask:
   *what exactly is being told right now, and what single image makes the viewer feel it?*
2. **One scene = one unique image.** The same picture never appears twice in a video (the compiler
   rejects it). A recurring motif (the heart, the watch) is shown **differently each time** — another
   angle, a close-up, a different object that carries the same idea, or a text-only beat.
3. **Literal and specific beats vague and pretty.** "the old man's pale blue eye with a milky film" → an
   old man's clouded eye, not "an eye", not "a creepy face". If the line names a thing, show that thing.
   If it names a feeling, show the concrete thing that causes it.
4. **The image lands when its word is spoken.** Images anchor to the word that names them (automatic
   when your brief shares a word with the line; set `"at"` otherwise).
5. **No filler, no decoration.** If no image truly serves the line, use `type-center` — powerful words on
   the backdrop are better than a wrong picture.
6. **Right world.** Era, place, weather, social class, mood must match the story (no smartphones in 1843,
   no sunny beach in a horror night).

## Input → output
- Input: `04-edit/edit.json` from `./sv draft` (scenes split on the real narration timing, `template: "?"`).
- Output: every scene filled; `./sv check <slug>` prints ✓ (it also counts images still to fetch or generate).

## The look of this video (top of edit.json) — vary it
```json
{"pack": "noir", "theme": "abyss", "backdrop": "mist", "music": {…}, "ambience": […], "scenes": […]}
```
- **theme** = palette + accent font + atmosphere, chosen by the story's feeling from `engine/src/looks.json`
  (visual menu: `./sv looks` → `engine/gallery/looks.jpg`). noir: `ember` horror/blood/fire · `abyss` sea,
  ghosts, cold · `venom` plague, poison, witches · `gilded` greed, kings, treasure · `bone` history, records,
  true mysteries · `violet` dreams, supernatural, tragic love. atelier: `paper` explainers · `cream`
  nostalgia, family · `sage` nature, wisdom · `blush` love, letters · `slate` science, investigations.
- **backdrop** (optional) overrides the theme's moving background: noir `smoke | rays | mist | void`,
  atelier `grid | plain | lines`.
- The theme's grade changes every image: `bone` turns photos sepia, `abyss` blue, `venom` green. If a colour
  is part of the story ("a coat of many colours", "a red door"), choose a theme that keeps it.
- **Never the same theme as the last two videos** (`history/STORIES.md` → look column). Same story mood
  twice in a row? pick the second-best theme, or the same theme with another backdrop.

## The scene object
```json
{
  "id": "s05",
  "text": "A pale blue *eye,* / with a _film_ over it.",
  "template": "tv-screen",
  "slots": {
    "screen": {
      "see": "an old man's pale blue eye clouded by a milky cataract film, extreme close-up",
      "find": ["cataract eye close up", "old man eye macro"],
      "kind": "photo",
      "at": "eye"
    }
  },
  "sfx": [{"id": "tv-static", "at": "film", "volume": 0.3}]
}
```
- `see` = **the visual brief**: what must be visible, precisely (subject, detail, era, framing, mood). It
  ranks the candidates and scores the final pick, so write it carefully.
- `find` = 1–3 short search-engine queries (different wordings widen the choice).
- `kind` = `cutout` (one object/person, background removed) · `photo` (full rectangle) · `video` (b-roll).
- `at` = the spoken word the image lands on (`"start"` = visible from the scene's start). Omit when the
  brief already shares a word with the line (auto-anchor).
- `"gen": true` (only if you can generate images — Codex `$imagegen` or your own tool) = don't search, this
  moment is generated in the episode's art direction (skill 05 §4); keep the precise `see`, drop `find`.
  Use it for what no bank has — legend/fiction scenes, a specific action, a fictional object, a recurring
  character — and for the 2–4 beats that carry the video (hook, turn, climax, ending). Never for real
  evidence (records, artifacts, real places or people of a true story): those are found.
- `focus` / `zoom` (full-bleed photo/video only) = framing after you have LOOKED at the still: when the
  subject is small in its frame (a fire far away, a face in a crowd), `"focus": [x, y]` (0..1, where the
  subject is) + `"zoom": 1.3–2` fills the screen with it. Above ~2× a photo gets soft — pick a closer image instead.
Optional per scene: `variant`, `transition`, `camera` (push|pull|drift|still), `quiet: true` (a beat of
silence: no auto sfx, music and ambience drop to near-nothing, anything still ringing is cut — use it
once, on the line where the sound *stops*: "The knocking stopped.").

## Text & emphasis (never change the words)
`text` = the narration words in order, all of them (punctuation may differ; tags like `[whispers]` are
not part of it). Marks: `*accent*` (huge, glowing, typed on as spoken — THE word of the scene, 1 per
scene, max 2) · `_script_` (handwritten, for tender/soft words) · `^pop^` (shock colour + impact +
camera punch, max 3 per video) · `~muted~` (small, for crowded lines) · `/` (line break) · `{hidden}`.
Accent the noun/verb that carries the image, not "very" or "the". Accented words also get an automatic
camera punch-in — so choose them like an editor chooses cuts.

## Choosing the template
Look at `engine/gallery/<pack>.jpg` first, then the `use` field in `engine/src/templates/catalog.json`.
| The line is about… | Template |
|---|---|
| a hook, a statement, an emotion with nothing concrete to show | `type-center` (+ `bigWord`) |
| one concrete thing (object, animal, body part) | `object-hero` |
| a rhythmic 3–4 part line, a list | `object-side` |
| THE key word of a beat, a reveal | `word-behind` (`bigWord` = that word; it rises exactly when it is spoken — "£200" on "two", "3" on "third" — so it never spoils the reveal; only the first scene shows it from frame 0) |
| a place, a room, weather, a face, an atmosphere | `photo-full` (photo or video) |
| a memory, evidence, "a photo of…" | `photo-framed` |
| many people/moments piling up | `card-stack` (2–4 different photos) |
| watching, being watched, a broadcast, a memory replaying | `tv-screen` |
| phones, messages, modern life | `phone-screen` |
| a clue, a note, a letter, a record | `pinned-note` |
| introducing a character | `split-panel` (photo) or `figure-spotlight` (full-body cutout) |
| several related objects around one idea | `scatter` (2–5 different cutouts) |
| the last line | `outro-hold` |

Rhythm: never 3 identical templates in a row; alternate image beats with text beats (about 1 in 3
scenes text-only); each scene ≥ its `minSeconds` (merge tiny scenes: join their texts); respect `maxWords`.

## Sound (sparing)
Transitions, entrances, pops, the hook impact and ducking are automatic. Add a cue only where the story
makes a sound: `{"id": "<group>", "at": "<word>", "volume": 0.3–0.9, "offsetMs": 0}` (`./sv sfx search "…"`).
Put hits in the gaps between words (`offsetMs`) so they never mask a word; `"durMs": 2500` plays only the
first part of a long sound (one phrase of a melody). Build tension by letting a
sound *repeat and grow* across scenes (knock 0.6 → 0.75 → 0.9) and then cut it with a `quiet` scene.
Ambience beds in `"ambience"`. See skill 06.

## Before you run `./sv assets` — self-check every scene
For each scene, answer in your head: *If I muted the audio, would this image alone tell me what the
line says?* If not, rewrite `see`/`find` or change the template. Then `./sv check <slug>` → `./sv assets
<slug>` → skill 05 (look at every pick and write its verdict).

Examples written to this standard (every slot has its own brief, anchored where it matters):
`examples/tell-tale-heart.edit.json` (noir, 24 scenes) · `examples/the-clockmaker.edit.json` (atelier, 9 scenes)
· `examples/the-monkeys-paw.edit.json` (noir showcase) · `examples/the-pied-piper.edit.json` (noir, legend
+ true record: anonymous people only, a real object for every noun, a musical motif that stops dead).
