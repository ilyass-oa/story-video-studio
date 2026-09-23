---
name: 05-image-sourcing
description: Get the right image for every scene — search the reusable bank and free/licensed sources, rank and cut out automatically (BiRefNet, GroundingDINO), or — if you have your own image tool (e.g. Codex $imagegen) — generate story-specific moments in one consistent art direction; then LOOK at every image and judge if it truly fits the words (anti-slop checklist for generated ones); replace misfits. Use whenever a scene needs a picture, a cutout or a device, or after `./sv assets`.
---

# 05 · Images

**First: can you generate images yourself?** (Codex `$imagegen` or any image tool of your own — this studio
calls no image API.)
- **No** → bank + found images only (§1–3). Plenty for any story.
- **Yes** → generation is a *normal* source, not a last resort (§4): real things (records, artifacts,
  places, real people of a true story) are **found**; story-specific moments (an action, a fictional object,
  a legend scene, a recurring character, the hook and the climax) are **generated** in one art direction.
  One search round per slot at most: no exact fit on the sheet → generate, don't hunt for hours.
Every file gets a provenance record in `episodes/<slug>/05-assets/manifest.json`.

## 1 · Resolve all slots
`./sv assets <slug>` — for every slot `{"see": …, "find": …}` in edit.json: search every `find` query →
rank against the `see` brief (CLIP relevance, clean background, licence, clipart penalty) → cut out
(BiRefNet + halo removal) → quality gates (cropped, fragmented, background left, low resolution) → retry
with element selection → next candidate. A source image already used in this video is never offered again,
and two slots with the same brief are refused. The slot keeps its brief and gains `"id"`.
It ends with **`05-assets/review.jpg`** (every image labelled with its scene words; clips shown as a frame)
and **`05-assets/review.md`**: time · spoken words · brief · *fit brief* · *fit words* · flags · **verdict**.

## 2 · LOOK and judge — mandatory, every image, every time
Open `review.jpg` next to `review.md`. The scores are CLIP similarities (≈0.26+ on-topic): a flag or a
low score means *look twice*; a high score is **not** a pass — only your eyes are. For each image:
1. **Does it show what the words say?** ("the old man's eye" → an old eye, not a child's; "a vulture" → a vulture, not a crow.)
2. **Same world as the story?** Era, place, mood (no modern objects in 1843, no cartoon in a photographic pack).
3. **Clean?** Cutout: one whole object, no halo, not cut by the frame. Photo: sharp, no text, no watermark, no border.
4. **Works in its template?** object-hero/word-behind want one strong silhouette; photo-full wants a calm area for text; card-stack wants varied faces/moments.
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
| **no exact fit on the first sheet, and you can generate images** | generate it (§4) — don't run a third search |
| the object itself doesn't exist in any bank (a second, different monkey's paw) | show the line's **action** instead: "He dropped to the floor, found the paw" → a hand reaching down into light on a dark floor (new slot id, `photo-full`) |
| nothing fits and you cannot generate | choose the closest honest image and say what is off in the verdict, or change the scene to `type-center` (no image) — never a random "close enough" |

After any change: `./sv img review <slug>` and look again.

## 4 · Generate (agents with their own image tool — e.g. Codex `$imagegen`)
Generation makes the video *more* accurate and immersive when it shows exactly what is said at that moment
— the thing no bank has. It is also faster than hunting. It must never look like AI slop.

**Plan it in the edit (skill 04).** Mark the slots to generate with `"gen": true` (keep a precise `see`):
- moments no camera saw: legend and fiction scenes, actions ("a hand closing on the paw on the floorboards"),
  fictional objects, a specific character doing a specific thing;
- the 2–4 beats that carry the video: the hook image, the turn, the climax, the ending;
- a recurring character (consistent across shots through `ART.md`);
- anything the first search sheet did not show exactly.
Keep **found** images for real evidence: documents, records, artifacts, maps, real places and real people
of a true story. **Never generate fake evidence** (a "medieval chronicle page", "the 1592 watercolour", a
"real" coin) and never a real or famous person's likeness.
Typical mix: fiction / legend 40–70 % generated; true story mostly found, generated only for re-enactments.

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
