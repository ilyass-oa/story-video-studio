# Story Video Studio — agent guide

You make faceless, voice-over **kinetic-typography story videos** (TikTok / Reels / Shorts,
1080×1920, 30 fps). The look = a locked **pack** × a **theme** × a **backdrop**:
- **noir** (dark cinematic: glowing words typed on as spoken, graded cutouts, grain) — themes `ember`
  (blood red/yellow), `abyss` (midnight blue/ice), `venom` (toxic green), `gilded` (black & gold), `bone`
  (sepia archive), `violet` (night purple); backdrops smoke · rays · mist · void.
- **atelier** (light editorial: paper, window light, soft shadows) — themes `paper`, `cream`, `sage`,
  `blush`, `slate`; backdrops grid · plain · lines.
Menu with pictures: `./sv looks` → `engine/gallery/looks.jpg`. Choose by the story's mood; **never the same
theme or narrator as the previous two videos** (`history/STORIES.md` logs both).

**If the user says `start`** (or asks for a new video without details): follow [`START.md`](START.md) — hunt an
unused public-domain story with a wow twist and make the whole video on your own.

**Before starting any episode, read `skills/KNOWN-MISTAKES.md`** — every mistake already made here, and how
to avoid it.

## Prime directive: assemble, don't design
The look, layouts, motion, sync and sound mix are **locked** in `engine/` and `banks/`. You only:
1. choose and write the story, 2. direct the voice, 3. fill `edit.json` (template + emphasis + images +
story sounds per scene), 4. **look** at what was produced and fix what doesn't fit.
Never write CSS/JSX, fonts, colours or effects for an episode. Missing capability → tell the user
(extending the bank is a separate task: `skills/08-bank-builder/SKILL.md`).

## Map
```
AGENTS.md       you are here                 README.md   human quick start
START.md        "start" = find a new story + make the whole video, autonomously
sv              the only command you need    ./sv help · ./sv go <slug> · ./sv status <slug>
config/         studio.json (defaults) · secrets.env (keys — never print or copy)
skills/         00…08 = the pipeline, in order · KNOWN-MISTAKES.md · _library/ = writing craft references
engine/         renderer + LOCKED templates: src/templates/catalog.json (the menu), gallery/<pack>.jpg (how each looks)
                src/looks.json (themes + backdrops), gallery/looks.jpg (how each theme looks)
banks/          sfx/ music/ images/ devices/ textures/ — reusable, indexed, licensed
tools/          sv.mjs + lib/ (pipeline) · py/ (image AI, audio, alignment)
episodes/<slug> 01-script → 02-voice → 03-timing → 04-edit → 05-assets → 06-render   (work in progress)
history/        STORIES.md (every finished story + backlog) · videos/ (every final video)
references/     optional, local only (not in the repo): style references you collected — look, never copy
```

## The pipeline — `./sv go <slug>` runs it and stops at every checkpoint
| # | Step | You | Command | Read |
|---|---|---|---|---|
| 0 | pick a story + look | read `history/STORIES.md` — **never repeat a story**; theme ≠ last two | `./sv new <slug> --title "…" --source "…" --pack noir --theme abyss` | skills/00-story-director |
| 1 | script | brief + exact spoken words | edit `01-script/brief.md`, `script.txt` | skills/01-story-script |
| 2 | voice | cast by the story, audition, direct, tag the script | `./sv voice-audition` → `./sv voice <slug>` | skills/02-voice-narration |
| 3 | timing | — | `./sv align <slug>` (must be 100 % match) | skills/03-timing-alignment |
| 4 | edit | per scene: precise visual brief (`see`), template, emphasis, sounds | `./sv draft` → fill `04-edit/edit.json` → `./sv check` | skills/04-scene-assembly |
| 5 | images | found **and/or generated** (if you have an image tool); **look at every image**, fix misfits, ✓ verdict per image | `./sv img style` → `./sv assets <slug>` → `05-assets/review.jpg` + `review.md` | skills/05-image-sourcing |
| 6 | sound | story cues + ambience (transitions are automatic) | in edit.json | skills/06-sound-design |
| 7 | render | **look at the stills**, score the preview (director's scorecard ≥ 4), render | `./sv stills` → `./sv render` → `./sv render --final` | skills/07-render-review |

`--final` also copies the video to `history/videos/` and logs the story in `history/STORIES.md`.
Checkpoints with the user (unless told to run on your own): **A** script · **B** narration (they listen — you can't) · **C** stills.

## The standard (anti-laziness contract)
Every video must feel made by a meticulous human editor. Concretely:
1. **Think per scene.** For every line: what exactly is said *now*, and what exact image makes the viewer feel it?
2. **One unique image per scene.** Never reuse a picture in a video (the compiler rejects it); show a motif differently each time.
3. **Accurate over pretty.** The image must depict what the words say, in the story's era and mood. No generic stock filler — a text-only beat beats a wrong picture. **A character is nobody famous:** "a man" is an anonymous man (hands, back, silhouette, a model) — never a named historical portrait (skill 05).
4. **In sync.** Images land on the word that names them; emphasis sits on the word that carries the meaning.
5. **Human voice.** Cast the narrator for this story, direct with feeling not adjectives, tag the turns, hit the pace target, 100 % script match.
6. **Sound tells the story.** A sound only where the story makes one, on that word, in a gap between words; let tension repeat and grow, and go silent (`quiet`) where the story goes silent.
7. **Prove it.** Verdicts in `05-assets/review.md`, scorecard in `06-render/review/report.md`. The final render refuses unreviewed images.
8. **Every video its own.** Theme, backdrop and narrator chosen for THIS story — never the same as the last two videos.

## Rules
- **Look, then judge.** Open every image, sheet and still you produce and check it against the words it
  illustrates. A rendered file is not a reviewed file. Report what you checked and what you could not
  (you cannot hear audio).
- **More photos, purposeful composition.** Illustrate most concrete story beats with relevant photos;
  keep text-only scenes for deliberate pauses, emphasis or withheld reveals, not as an easy default.
  Alternate well-framed photographs with clean background-removed subjects where isolation helps.
  Preserve the setting when it matters; follow skills 04–05 for shot choice and cutout review.
- **Use the workflow efficiently.** Reuse context, known commands and established assets already checked
  in this task. Read only changed or newly relevant guidance; batch independent sourcing work and review
  stills before rendering. Spend the saved time on image choice and composition, never skip visual checks.
- **Images — found first, generate only when needed.** Use the reusable bank and licensed/public-domain
  sources first, including for fiction. Generate only an essential visual that suitable existing assets
  cannot show; record the specific need in `05-assets/review.md` (skill 05). Tool availability, a hook or
  climax, convenience, and an unsuccessful first search are not sufficient reasons. No generated-image
  quota or target percentage. Real evidence must remain real; generated exceptions follow ART.md and
  the 8-point check.
- **Framing must survive the render.** Check each image in its actual template, including the strongest
  zoom/punch and camera movement. No accidental cut-off heads, hands, feet or story-critical objects.
  Use a fitting template, reduce zoom, reposition or replace the asset; a clean source image is not proof
  of a clean rendered crop (skills 04, 07).
- **Order matters**: words → voice → timing → edit. Changed words ⇒ re-voice + re-align. Changed
  images/templates only ⇒ re-render.
- **No paid APIs.** Gemini TTS free tier with the user's key, free/CC0 sources. Quota errors stop the step.
- **Licences**: every asset/sound carries its source; `./sv credits <slug>` lists what needs credit.
  No watermarked stock, film screenshots or scraped paid content.
- **Keep the folder clean**: episode files stay inside `episodes/<slug>/`; nothing is written elsewhere
  except `history/` (automatic) and `banks/` (only via `./sv img promote`, `./sv sfx fetch`, skill 08).

## How the engine behaves (to read renders correctly)
- A scene cuts in ~0.2 s before its first spoken word; each word appears on its own timestamp; accent
  words type on across their spoken duration; transitions overlap 9–12 frames.
- Each image enters on the word that names it (its `at`, or the word it shares with its brief); every
  accent/pop word triggers a short camera punch-in; noir adds a barely-there handheld drift; the hook's
  key word gets an impact.
- Every photo/cutout is exposure-matched and graded by the pack + theme, so mixed sources look like one film.
- Automatic sound: whooshes peak on the cuts, entrance sounds per template, impacts on `^pop^` words,
  ambience/music ducked under the voice, final mix mastered to -14 LUFS / -1.2 dBTP.

`./sv doctor` = health report · `./sv setup` = install everything (idempotent).
