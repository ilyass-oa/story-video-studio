# START — find a new story and make the whole video

**Trigger**: the user says `start` (optionally with a hint: `start scary`, `start true fact`, `start atelier`,
`start about the sea`…). Then you run everything below **on your own, from story hunt to final video**, with
no checkpoint questions. Stop only for a real blocker (missing key, quota error, broken install) and say
exactly what the user must do. A hint narrows the hunt; it never lowers the bar.

You are the whole studio: story hunter, writer, voice director, editor and reviewer. The goal is one
video people cannot scroll past — and cannot stop thinking about after the last line.

---

## 0 · Prepare (2 minutes, every time)
1. Read `AGENTS.md`, then `skills/KNOWN-MISTAKES.md` (every mistake already made here — don't repeat one).
2. `./sv doctor` — everything must be ✓ except optional keys.
3. Know whether image generation is available, but use bank + found images first. Generate only when
   necessary under skill 05, not merely because the tool exists. You cannot hear audio: never claim you did.
4. Read `history/STORIES.md` **completely**: the table (stories already made, their look and narrator) and
   the backlog (ideas).

## 1 · Hunt the story (the most important step — take the time)
**What we want**: a public-domain story with a **wow twist** — the kind that makes someone say *"wait, what?"*
and send it to a friend. One of:
- **the scary reveal** — the truth is worse than what we feared (gothic tales, folk horror, cursed objects);
- **the fact nobody knows** — a true detail that re-frames something famous ("the rats were added 300 years later");
- **the cruel irony** — the wish, the plan or the kindness that destroys the one who made it;
- **the unsolved or unsettling true event** — records exist, the explanation doesn't (ships, disappearances, trials);
- **the moral reversal** — the villain was right, the hero was the monster, the victim did it.

**Where** (public domain only — both rules: published in 1930 or earlier, **and** the author died more than
70 years ago): Poe, Maupassant, Chekhov, Saki, Bierce, Dickens, Le Fanu, M. R. James, W. W. Jacobs, Andersen,
Grimm, Perrault, Aesop, O. Henry, Lovecraft's early tales…; myths and folk legends of any culture; true
historical events told from records (write the sources). Translations: use your own words, not a modern
copyrighted translation. Prefer the less-told: a famous author's lesser-known story, a legend's forgotten
original version, a true event most people never heard of.

**Never**: a story, source or core twist already in the `history/STORIES.md` table; a story still under
copyright (film versions, modern retellings, living authors); inventing facts to make it wilder.

**How**
1. Longlist **10 candidates** from at least 4 different kinds above (and different cultures / centuries).
   Drop any already in the history table.
2. Score each 1–5 on the six criteria below. Be harsh — a 3 is ordinary.

   | criterion | 5 means |
   |---|---|
   | **hook** | a ≤ 8-word first line that opens a question the viewer *needs* answered |
   | **twist** | surprising **and** inevitable — it re-frames everything before it; best if it loops to the first line |
   | **psychology** | a strong pull: dread, curiosity gap, moral discomfort, "I never knew that", something that lingers |
   | **pictures** | every beat is concrete and showable (objects, places, actions — not abstract feelings) |
   | **fits 45–60 s** | compressible to 120–160 spoken words without losing the setup or the twist |
   | **truth** | public domain confirmed; true facts checkable in 2+ sources; legend clearly framed as legend |

3. Pick the highest total (ties → the one fewer people know). Write the full score table and why the winner
   won under `## Sources / notes` in the brief — it must be auditable.
4. Verify: public-domain status (author + year) and every factual claim (2 sources, noted in the brief).
5. Add the 3 best runners-up to the backlog in `history/STORIES.md` (title — source — pack), so the next
   `start` has a head start.

## 2 · Choose the look and the voice (vary them)
- **First re-watch the last 2–3 videos quickly**: open a frame from each (`ffmpeg -ss 5 -i history/videos/<file>.mp4
  -frames:v 1 /tmp/last.jpg` or the episode's `06-render/review/stills.jpg`) and note their colour, background
  and energy. The new video must look **visibly different** — another theme *and* another backdrop.
- Match the **energy** of the story, not just its genre: cold dread → `abyss`/mist · rot, plague, poison → `venom` ·
  greed, power → `gilded`/rays · archive truth → `bone`/void · dream, madness, doomed love → `violet` ·
  blood, fire, violence → `ember` · warmth, childhood → `cream` · calm wisdom → `sage` · love, letters → `blush`
  · science, investigation → `slate`. `ember`/smoke is **not** a default: use it only when the story is truly red.
- **Pack + theme** by the story's feeling (`./sv looks`, `engine/gallery/looks.jpg`), **not the theme of either
  of the last two videos** in the history table. A colour that matters to the story must survive the theme.
- **Narrator** cast for this story (who would tell it? age, gender, temperament, accent of the place) —
  **not the narrator of either of the last two videos**. `config/voices.json`.
- `./sv new <slug> --title "…" --source "<author (year), public domain / records + sources>" --pack <pack> --theme <theme>`

## 3 · Write it (skill 01 + the craft library — all of it)
Follow `skills/01-story-script/SKILL.md` and use `skills/_library/`: `hook-writer` (write **5 hooks**, score
them, keep the best), `short-form-video-script` + `tiktok-script` (retention shape, a micro-hook every 5–8 s),
`viral-reverse-engineering` (why things spread), then `stop-slop` and `humanizer` on the final text.
- **Hook** ≤ 8 words · **setup** with one sensory detail · **turn** · **escalation** that raises the stakes
  · **twist in the last 15 %**, stated in the shortest line · a last line that **loops** to the first.
- Every sentence gives the editor a picture. 120–160 words. Facts said plainly, legend framed as legend.
- Performance tags only where the delivery turns (~1 per 25 words, documented tags only).
- Fill `01-script/brief.md` (creative direction, hook, beats, sources + the score table) and `script.txt`.
- Self-check (skill 01) — harsh. Anything weak: rewrite before moving on; words are expensive to change later.

## 4 · Voice → timing → scenes (skills 02, 03, 04, 06)
- Direction in `02-voice/direction.md` (persona, scene, performance — no flattening words).
  `./sv voice-audition <slug> --voices A,B,C` (2–3 candidates fitting the cast), choose by fit + measures,
  `./sv voice <slug> --voice <Name> --pace <profile>` → `./sv align <slug>` must say **100 %**, pace in range.
- `./sv draft <slug>`, then write `04-edit/edit.json` yourself (skill 04): merge micro-scenes, one idea per
  scene, a precise `see` brief per image, the template that shows it best, accents on the words that carry
  the image, big words that rise when spoken, story sounds on their words (skill 06), silence (`quiet`) where
  the story goes silent. Mark `"gen": true` only for justified exceptions under skill 05. `./sv check <slug>`.

Before sourcing, plan photos for most concrete beats and limit text-only scenes to intentional pacing
or reveals. Vary full photos, framed photos and isolated subjects without adding cuts merely to raise
image count. Reuse the established workflow and current task context; focus effort on composition.

## 5 · Images (skill 05) — accurate, anonymous, never slop
- Use the bank and licensed/public-domain images first. Generate only when an essential visual cannot
  be shown with suitable existing assets; document why in `05-assets/review.md`. If generation is needed,
  `./sv img style <slug>` → fill `05-assets/ART.md`. Keep real evidence found, never generated.
- `./sv assets <slug>` → **look at every image** next to its words (`05-assets/review.jpg`), read the title of
  every person image (characters are anonymous, never famous), run the 8-point check on generated ones, fix
  misfits by refining the search, changing the shot/template, or using text-only; generation remains a
  justified exception. Write a real ✓ verdict per image.

## 6 · Render and review (skill 07)
`./sv stills` → look at every scene, fix layout/text/crop issues → `./sv render <slug>` → `./sv review <slug>`
→ check the contact sheet second by second (images on their words, big words on their words, nothing
covering a face, no accidental subject cropping at the strongest zoom or camera movement) → fill the director's scorecard in `06-render/review/report.md` (every line ≥ 4, voice and
sound = "user to check") → `./sv render <slug> --final` (logs the story in history, copies the video).

## 7 · Publish (skill 09) — YouTube Shorts + Instagram Reels
Unless the user said `start no-post`: follow `skills/09-publish/SKILL.md` — fill `06-render/post/post.json`
(title, description, tags, caption, hashtags written for reach), `./sv post check <slug>` (0 errors), post with
the Composio YouTube and Instagram tools, then `./sv post done <slug> --youtube <url> --instagram <url>`.
Tools not connected → leave the pack ready and say which account to connect.

## 8 · Report to the user (short)
- The story, its source and **why it won** (the winning scores, one line on the twist) + the runners-up added
  to the backlog.
- Look (pack/theme/backdrop) and narrator, and why they fit.
- The video path (`history/videos/<date>_<slug>.mp4`), its length, what you verified by looking, and the
  YouTube + Instagram links (or why not posted).
- What only the user can check: the voice and the sound (you cannot hear), plus anything you were unsure of.

**The bar**: a stranger watches it on a phone with sound on, stops scrolling in the first second, feels the
twist land, and wants to watch it again. If any step falls short of that, fix it before moving on.
