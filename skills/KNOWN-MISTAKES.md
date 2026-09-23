# Known mistakes — read before every episode

Every entry happened in a real episode of this studio. **→** = what the tools now do · **You** = what you
must still do. Read the section of each step before doing that step.

## Story & script
- **A detail stated as fact was only legend.** → the brief has a Sources section. **You**: facts from records
  are said plainly; legend is framed ("The legend says…"); never invent a date or a day ("on a Sunday").
- **The hook was 15 words.** **You**: hook ≤ 8 words, a consequence or a forbidden fact, not context.
- **Duplicate-story check fired on "public domain".** → generic words are ignored. **You**: still read the
  whole `history/STORIES.md` table yourself.

## Voice
- **Tags were read aloud** (`[whispers]`, `[panicked]` spoken as words). → every take is checked and
  re-taken. **You**: use the documented tags (`[whispering]`, `[extremely fast]`, `[very slowly]`,
  `[serious]`, `[trembling]`…), max ~1 per 25 words.
- **The TTS skipped whole sentences** in a take. → auto-check + retake. **You**: `./sv align` must say 100 %.
- **The read was slow** (105–122 wpm, 40 % silence). → pause tightening + pitch-safe tempo aiming *inside*
  the pace range. **You**: never write "slow, calm, quiet" in the direction.
- **An audition came out broken** (63 s for 45 words). → the table warns (< 90 wpm). **You**: re-run that
  voice before judging it; never cast from a broken sample.
- **Same narrator video after video.** → history logs the voice; `./sv new` warns. **You**: cast a different
  narrator than the last two videos unless the story truly needs the same one.
- **Claiming to have heard the audio.** **You**: you cannot hear. Report metrics; the user listens.

## Timing
- **The checker "heard" a skipped passage / missed the last words.** Priming Whisper with the script makes
  it skip text; no priming garbles fast speech. → two passes, a word counts as said if either heard it.
- **A final line after a dramatic pause appeared 0.7 s early** ("The children … were not"). → starts are
  snapped to the real onset of the voice. **You**: if an accent word sits after a long pause, check its
  frame in the contact sheet.
- **"Mr." split a sentence; a quote was split across two scenes.** → abbreviations and open quotes are
  handled by `./sv draft`. **You**: still read the draft split.

## Edit (scenes)
- **The draft made 30 micro-scenes** (< 1 s each). **You**: merge to one idea per scene; respect each
  template's `minSeconds` and `maxWords` (`./sv check` warns).
- **A big background word ("£200") appeared before it was spoken** and killed the reveal. → big words now
  rise on their own spoken word. **You**: pick bigWords that are actually said ("300" ↔ "three hundred").
- **An accent word came out tiny in split-panel.** **You**: give the accent its own line with `/`.
- **Text covered the subject's face** on a full-bleed photo. **You**: switch `variant` (text top/bottom) or
  set the slot's `focus`; check the still.
- **A wide image was cropped to a sliver** (a landscape painting in a portrait frame). → the framed card
  now follows the picture's shape. **You**: a wide picture goes in `photo-framed`, not `photo-full`.
- **Renumbering scenes silently moved ambience ranges** (`"from": "s05"` pointed at another scene). **You**:
  after renumbering, re-check every `ambience` from/to.
- **The same look every video.** → `theme` + `backdrop` (engine/gallery/looks.jpg); history logs the look.
  **You**: choose the theme by the story's mood, never the same as the last two videos.
- **Every video looked the same** (ember/smoke by default). → `./sv new` warns without `--theme`. **You**: look at
  a frame of the last videos first; choose theme + backdrop by the story's energy; justify ember like any other.
- **A theme contradicted the words**: `bone` (sepia) turned "a coat of *many colours*" grey. **You**: when a
  colour is part of the story (a red cloak, golden hair, a green light), pick a theme that keeps colour
  (`bone` desaturates most, `abyss`/`violet` tint everything) — check those scenes in the stills.

## Images (found)
- **"An old soldier" was a named colonel** (the source title said "Colonel Mowbray Thomson"). → named
  sitters are flagged NAMED, auto-pick skips them, the final render refuses them. **You**: read the title
  of every person image; characters are anonymous.
- **Auto-picks that were simply wrong**: a high chair for "cradle", an old man in Havana for "a lame boy",
  modern kids in bright jackets for 1284, a random heraldic jester for "the oldest records", a faded blank
  page for "the town wrote it down". CLIP scores ≈ 0.25–0.35 for right AND wrong images. **You**: look at
  every pick next to its words; a score is never a verdict.
- **An image carried a visible date that contradicted the story** ("1929" on a page for 1284). **You**:
  zoom on any visible text, dates, logos, signs, clothing: they must belong to the story's era.
- **A replaced image inherited the old ✓.** → verdicts are bound to the image version; a new pick resets
  to "?". **You**: judge the new image, never copy the old reason.
- **The same subject found twice** (the second "paw" moment had no second real paw). **You**: show the
  line's action instead (a hand reaching to the floor), or generate it (below).
- **Low-resolution historic image** (620 px) on a full-bleed scene. **You**: framed card, or find/generate
  a larger one; never stretch past ~2×.
- **Wikimedia downloads failed (HTTP 429).** → a contact User-Agent + automatic back-off. **You**: set
  `contact` in `config/studio.json` to your repo URL when you publish.
- **Hours spent hunting the perfect stock image.** **You**: refine an unhelpful query or simplify the shot;
  an accurate existing image or text-only beat can suffice. A failed first search does not justify generation.

## Images (generated — agents with an image tool, e.g. Codex)
- **The Interlopers used generated images for every image slot.** **You**: bank and found images first,
  even for fiction. Generate only essential visuals existing assets cannot adequately show, and record
  the reason per slot (skill 05). No automatic generation for hooks/climaxes and no target percentage.
- **Slop risks**: mismatched styles between shots, melted hands, fake lettering, modern details in a
  period story, plastic "AI" skin and glow. → every brief carries the episode's `ART.md` style, negatives
  and an 8-point checklist; review.md marks generated images. **You**: run the checklist on every image;
  one "no" = regenerate with the fix; 3 fails = found image or text beat.
- **Never generate "evidence"**: a real document, record, artifact, place or person presented as real
  (the 1592 watercolour, a real coin) must be the real image. Fictional dramatisations may be generated
  only when the necessity check in skill 05 is satisfied.

## Sound
- **A long sound ran under three scenes** (a 14 s flute riff for "He played…"). → `"durMs"` cuts it with a
  fade. **You**: set `durMs` on long one-shots.
- **A hit masked a word.** **You**: put hits in the gaps (`offsetMs`), check the words around them.
- **A silence moment was not silent.** → `"quiet": true` drops every bed and cuts ringing sounds. **You**: use
  it on the line where the sound stops.
- **Running-footsteps search found nothing.** **You**: after two queries, use a nearby sound that tells the
  same thing (distant children laughing) rather than nothing or a wrong one.

## Publishing
- **A caption came out as a 9-line paragraph and the hashtags posted as `%23DarkHistory`.** → `./sv post check`
  blocks long captions, > 3 hashtags and URL-encoded text. **You**: 3 short lines (hook, question or send-prompt,
  hashtags), plain text with real `#`, no credits, no AI notes; keep the first comment;
  read the post back — broken tags → remove them.

## Render & review
- **The Interlopers passed review despite photos appearing cut off.** **You**: source-image approval
  does not approve the rendered framing. Inspect individual scenes at entry, settled position, maximum
  zoom/punch and camera movement, and exit; fix accidental subject clipping before passing (skill 07).
- **Captions sat under the Shorts/Reels interface** (bottom ~22 %: caption, channel, audio). → every template
  keeps text above y = 1480. **You**: never rely on anything important in the bottom fifth or lower-right corner.
- **The gallery showed an empty outro** (captured during its fade). → captured before the fade.
- **Previews look fine at a glance but a frame is wrong.** **You**: check the contact sheet second by second
  and extract single frames (`ffmpeg -ss <t>`) at every fix you made.
- **Loudness/peaks**: every render is mastered to -14 LUFS / -1.2 dBTP; don't "fix" levels by ear you
  don't have.

## Process (for automated agents)
- **A wait loop never ended**: `pgrep -f "sv.mjs render x"` matched the waiting shell's own command line.
  **You**: wait on the command itself (run it in the foreground or background and wait for its exit),
  or use a pattern that cannot match itself (`pgrep -f "[s]v.mjs render"`).
- **Two commands wrote `manifest.json` at the same time.** **You**: never run `img pick/add` while
  `./sv assets` is still running for the same episode.
- **A script with nested quotes broke** (a Python heredoc with `\'`). **You**: write multi-line edits to a
  file first, or use the JSON tools (`./sv` commands) instead of hand-editing through a shell.
