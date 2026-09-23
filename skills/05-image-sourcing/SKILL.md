---
name: 05-image-sourcing
description: Source and review scene images from the reusable bank and licensed sources, generating only necessary exceptions. Use when a scene needs a photo, cutout or device, or to review resolved assets and their framing.
---

# 05 · Images

**Found first; generate only when needed.** Check the reusable bank and licensed/public-domain sources,
including for fiction. Prefer an existing image that honestly shows the line's subject or action; it
need not recreate every detail of an imagined cinematic shot. Do not weaken era, identity or factual fit.
If a search fails, refine the query or choose a simpler accurate shot, a better-fitting template, or a
text-only beat. Generation is reserved for an essential visual these options cannot adequately show.
Having an image tool, wanting matching aesthetics, saving search time, or illustrating a hook/climax
is not enough. Record the specific need and why existing options fail in `05-assets/review.md` before
marking a slot `"gen": true`. Without an image tool, use found assets or text-only.
Every file gets a provenance record in `episodes/<slug>/05-assets/manifest.json`.

## 1 · Resolve all slots
`./sv assets <slug>` — for every slot `{"see": …, "find": …}` in edit.json: search every `find` query →
rank against the `see` brief (CLIP relevance, clean background, licence, clipart penalty) → cut out
(BiRefNet + halo removal) → quality gates (cropped, fragmented, background left, low resolution) → retry
with element selection → next candidate. A source image already used in this video is never offered again,
and two slots with the same brief are refused. The slot keeps its brief and gains `"id"`.
It ends with **`05-assets/review.jpg`** (every image labelled with its scene words; clips shown as a frame)
and **`05-assets/review.md`**: time · spoken words · brief · *fit brief* · *fit words* · flags · **verdict**.

## Choose photos and cutouts deliberately
Use more relevant photos across concrete story beats (skill 04). Remove backgrounds for selected
objects or people when isolation makes the subject clearer and suits a locked object/figure template;
keep full photos when the surroundings tell the story. Do not strip every background or force a cutout
just for variety. Inspect the processed result against the original: preserve hands, feet, hair, thin
parts and meaningful objects, with clean edges and no halos or leftover background. If removal damages
the subject, retry selection or retain the intact photo in a fitting frame. Check the actual rendered
crop and motion before approving either treatment. Generate some images when needed under the
necessity rule above; more photos does not mean more generated images by default.

## 2 · LOOK and judge — mandatory, every image, every time
Open `review.jpg` next to `review.md`. The scores are CLIP similarities (≈0.26+ on-topic): a flag or a
low score means *look twice*; a high score is **not** a pass — only your eyes are. For each image:
1. **Does it show what the words say?** ("the old man's eye" → an old eye, not a child's; "a vulture" → a vulture, not a crow.)
2. **Same world as the story?** Era, place, mood (no modern objects in 1843, no cartoon in a photographic pack).
3. **Clean?** Cutout: one whole object, no halo, not cut by the frame. Photo: sharp, no text, no watermark, no border.
4. **Works in its template?** Inspect the actual rendered crop, not just the source or asset sheet. Keep the intended subject and story-critical details visible, with margin for camera movement and punch-ins; no accidental cut-off heads, hands, feet or objects. Deliberate detail shots must be specified in `see`. Wide images usually need `photo-framed`, not `photo-full`. Finish the motion framing check in skill 07.
5. **Variety:** no image repeats and none looks like another (`looks like #n` flag); a recurring motif is shown differently each time (another angle, a detail, a related object).
Then write the verdict in `review.md`: replace `?` with `✓ <why it fits these exact words>` — e.g.
`✓ clouded blue eye, old skin, matches "pale blue eye with a film"`. Anything that fails → fix it (below),
re-run `./sv img review <slug>` (verdicts are kept), judge the new image. `./sv render --final` refuses
while any verdict is `?` or `✗`. A lazy ✓ on a wrong image is the worst failure of this studio.

## People — a character is nobody famous
A story's man, wife, soldier, mayor or stranger is an **anonymous person**. Never show a real, named
person for them: museum and Wikimedia portraits almost always depict someone famous ("Colonel Mowbray
Thomson", "Portrait of Lord Byron") — viewers may recognise the face, and it is not the character.
(Measured failure: "an old soldier" was once illustrated by a named colonel — the title said so.)
- **Read the title** of every person image you pick (`candidates/<id>/candidates.json`: `title`, `desc`).
  The tools help: named sitters are labelled `NAMED` on the sheet and ranked last, `img auto` skips them,
  `review.md` flags them and `render --final` refuses them.
- Prefer, in this order: (1) **partial views** that keep the character universal — hands, feet, a back,
  a silhouette, a shadow — often the most cinematic shot; (2) anonymous models in period dress (Pexels,
  Unsplash); (3) period photos catalogued as "unidentified" / "unknown".
- A **recurring character** shows a face at most once; afterwards hands, silhouette or their objects —
  never "a different man" for the same person.
- Match age, era, gender, class and the emotion of the line ("an *old* soldier" → old; "laughed" → laughing).
- A legend's own illustrations of a fictional character (the Pied Piper by an illustrator) are fine.
- Only when the story IS about a real person show them — and name them in `see`, which lifts the flag.

## 3 · Fix a misfit
| Situation | Do |
|---|---|
| a better candidate is on the sheet | open `05-assets/candidates/<id>/sheet.jpg`, then `./sv img pick <slug> <id> <#>` (replaces the image, keeps the slot) |
| right photo, but busy / several objects | `./sv img pick <slug> <id> <#> --select "the pocket watch"` |
| nothing good on the sheet | new, more concrete queries, ranked against the brief — look, then pick: `./sv img find <slug> <id> "<q1> \| <q2> \| <q3>" --see "<what must be visible>" --kind cutout` (or change `find` in edit.json and re-run `./sv assets`) |
| a reusable asset exists | `./sv img bank "watch"` → put `"bank:<id>"` in the slot |
| you have your own file / URL | `./sv img add <slug> <id> <file-or-url> --kind cutout --license "…"` |
| no suitable fit on the first sheet | refine the query or simplify the shot; generate only if the essential visual still requires it (§4) |
| the object itself doesn't exist in any bank (a second, different monkey's paw) | show the line's **action** instead: "He dropped to the floor, found the paw" → a hand reaching down into light on a dark floor (new slot id, `photo-full`) |
| nothing fits and you cannot generate | choose the closest honest image and say what is off in the verdict, or change the scene to `type-center` (no image) — never a random "close enough" |

After any change: `./sv img review <slug>` and look again.

## 4 · Generate (agents with their own image tool — e.g. Codex `$imagegen`)
Use generation only after the necessity check above. Mark only those justified slots `"gen": true`,
with a precise `see`; do not preselect fiction, recurring characters, hooks or endings for generation.
There is no target percentage or minimum number of generated images. Use only as many as the story
actually requires. Keep found images for real documents, records, artifacts, maps, places and people;
never generate fake evidence or a real or famous person's likeness.

**Workflow**
1. `./sv img style <slug> [--style photo|art]` → `05-assets/ART.md`: the style block for the episode's theme
   (photo = period film still; art = painting / engraving / illustration matching the theme). Fill **world**
   (era, place, materials) and **characters** (each recurring person described once, word for word). One
   style per video: never mix a painting with a photograph.
2. `./sv assets <slug>` → searches the found slots and writes, for every `"gen": true` slot, the brief in
   `candidates/<id>/GENERATE.md`: the words spoken at that moment, the size, the composition for its
   template (cutout on flat grey for object templates — the background is removed automatically;
   full-frame vertical with a calm lower third for photo-full; full-length figure for figure-spotlight),
   the ART.md style, world, the characters named in the shot, anonymity and negatives.
   Any other slot: `./sv img brief <slug> <id> ["<subject>"]`.
3. Generate **one image** with that prompt and size; save it to the path given.
4. `./sv img add <slug> <id> <path> --kind cutout|photo --generated --note "<subject>"`.
5. `./sv img review <slug>` → look at it **next to the other images** and run the checklist:

| # | Check — a single "no" = regenerate with the fix written into the prompt |
|---|---|
| 1 | **Fit**: exactly the `see` brief and what is SAID at that moment (muted, would the image alone tell the line?) |
| 2 | **Style**: same medium, palette, light and grain as ART.md and the other generated images |
| 3 | **Anatomy**: hands (five fingers), eyes, limbs, faces — nothing melted, doubled or missing |
| 4 | **No text**: no letters, fake writing, numbers, signatures, watermarks, logos |
| 5 | **Era & place**: no zips, plastic, modern shoes, electric light in 1284; right clothing and objects |
| 6 | **No AI gloss**: no plastic skin, HDR glow, perfect symmetry, fantasy clichés, "epic" light the story doesn't ask for |
| 7 | **Composition**: subject where the template shows it; text area calm; a cutout whole, with margin |
| 8 | **People**: anonymous; a recurring character matches ART.md |

Write the verdict as `✓ gen: <why it fits> — checks 1–8 ok`. Three failed attempts → a found image or a
text-only beat. Generated images are recorded as generated in `credits.txt` (disclose if a platform asks).

## Writing queries that work
- Cutouts: one physical thing + material/era: `"antique brass oil lantern"`, `"anatomical heart model"`,
  `"victorian gentleman standing full length photograph"`. Museums (Met, Cleveland, AIC, Smithsonian) excel
  at antiques and portraits on plain backgrounds.
- Photos: a place or a light: `"dark attic wooden beams"`, `"foggy street night gas lamp"`.
- Video b-roll (Pexels/Pixabay key): `{"find": "rain on window at night", "kind": "video"}`.
- Never abstract words (fear, guilt): the picture shows *something*; the words carry the abstraction.

## Commands
`img find` (sheet only) · `img pick` · `img auto` · `img add` · `img style` · `img brief` · `img review` ·
`img promote <slug> <id> --tags "…"` (keep a great asset for future videos) · `img bank "<words>"` ·
`device add <id> <cutout.png> --screen-prompt "screen"` (object with a screen, for `tv-screen`). `./sv help` for flags.

## Sources & licences
No key: Openverse, Wikimedia Commons, The Met, Cleveland Museum, Art Institute of Chicago, Smithsonian.
With keys in `config/secrets.env`: Pexels (+video), Pixabay (+video), Unsplash. Openverse allows ~20
requests/min — on "HTTP 429" wait a minute or use `--providers`. CC0/public domain/Pexels-style licences
rank first, share-alike last (`config/studio.json → licenses`). CC BY/BY-SA need credit:
`./sv credits <slug>`. Never use watermarked stock, film screenshots or images of unknown origin.
