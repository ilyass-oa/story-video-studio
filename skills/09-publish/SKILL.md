---
name: 09-publish
description: Publish a finished video as a YouTube Short and an Instagram Reel — write the title, description, tags, caption and hashtags for maximum reach, validate them, and post through the agent's own tools (Composio YouTube + Instagram), then log the links. Use after `./sv render <slug> --final`, at the end of START.md, or whenever asked to post / publish / upload a video.
---

# 09 · Publish — YouTube Shorts + Instagram Reels

## 0 · Before posting (all must be true)
- `06-render/final.mp4` exists and the director's scorecard has every line ≥ 4.
- `./sv post status <slug>` is empty — **never post a video twice** (it is logged in `06-render/post/posted.json`
  and in the `posted` column of `history/STORIES.md`).
- Your tools include **Composio YouTube** (upload video, update video…) and **Composio Instagram** (create
  media container, publish media). No tools / not connected → do steps 1–3, then stop and tell the user
  exactly which account to connect. Never invent a posting method.

## 1 · The posting pack
`./sv render <slug> --final` writes `06-render/post/post.json` (or `./sv post pack <slug>`): read-only `facts`
(title, source, hook, direction, duration, look, **creditsRequired**, generated images, AI narration), the
`cover` (the hook frame, `cover.jpg` — look at it) and empty `youtube` / `instagram` fields you fill.

## 2 · Write for reach — how both platforms decide
Both show a new Short/Reel to a small test audience, then push it further if people **stop** (first 1–2 s),
**watch to the end and rewatch** (our loop ending), **share / send** (Instagram's strongest signal),
**save**, **comment** and **follow**. They read your **words** (title, caption, on-screen text, speech) to
know *who* to show it to and to rank it in **search**. So every field has one job:

**YouTube `title`** (≤ 60 characters — longer is cut on phones)
- The hook's promise in words people search: the story's name or its most intriguing fact.
  *The Pied Piper Was Real* · *130 Children Vanished in 1284* · *The Wish That Killed His Son*.
- Curiosity, never a lie: the video must pay it off. No ALL CAPS, no hashtags, at most one emoji, don't spoil the twist.

**YouTube `description`** — **short: ≤ 300 characters before the credits.**
1. One sentence with the main keywords (story, author, "legend" / "true story").
2. `Source: <author> (<year>), public domain` — one line.
3. 3 hashtags max at the end. No credits, no AI notes.

**YouTube `tags`** (6–12, ≤ 500 characters): the story name, author, variants and misspellings people type
(`pied piper`, `pied piper of hamelin`, `hamelin legend`, `dark fairy tales`, `creepy history`).
**`categoryId`**: 24 Entertainment (tales, legends) · 27 Education (true history). **`madeForKids`: false**
(dark stories; it also keeps comments on). `defaultLanguage`: `en`. `privacyStatus`: `public`.
**`containsSyntheticMedia`**: true when a generated image looks realistic (people, places or events a viewer
could take for real). A fictional AI narrator alone does not require it; never imitate a real person's voice.

**Instagram `caption`** — **short: 3 lines, ≤ 220 characters before the credits.**
1. The hook as one sentence (≤ 90 characters). 2. One line: a question or a send-prompt, not both.
3. Hashtags: **3 max**, lowercase or CamelCase, specific (`#piedpiper #darkfolklore #legends`).
Nothing else: no credits, no "Source:" paragraph, no AI notes, no line about cropping or grading.
(Images needing credit are excluded at sourcing — `licenses.creditFreeOnly` — so captions stay clean.)
**`shareToFeed`: true** (also on the profile grid). **`thumbOffsetMs`** = the cover frame (already set).

**Comments** (if your tools can): YouTube `pinnedComment` / Instagram `firstComment` = a question that
splits opinions, or the one extra fact that did not fit (*"The street where they vanished still forbids music."*).
**Series**: if a playlist fits (`youtube.playlist`, e.g. "Twist Endings"), add the Short to it.

Keywords everywhere, stuffing nowhere: the story's name, author and genre in title, first lines and tags.
Never promise what the video does not deliver; never "banned", "they don't want you to know", fake urgency.

**Hashtags must arrive as `#`.** Pass the caption as plain text — never URL-encode it. After posting, open the
post (or read it back with a tool): if the tags show as `%23…` or anything but `#tag`, edit the caption to
remove the hashtags (a clean caption beats broken tags) and add to KNOWN-MISTAKES which tool did it.

## 3 · Check
`./sv post check <slug>` → **0 errors**: lengths, hashtags, `madeForKids`, every required credit present on
both platforms, the hook echoed in the title / first line. Fix warnings unless you can say why not.

## 4 · Post (Composio)
Read each tool's parameters first; map the fields of `post.json` onto them.
1. **YouTube Short** — upload `06-render/final.mp4` with title, description, tags, `categoryId`,
   `privacyStatus: public`, made-for-kids false, `defaultLanguage`, synthetic-media flag. If the upload tool
   cannot read a local file, give it the public URL from step 2. Vertical and < 3 minutes → it is a Short.
   Link: `https://youtube.com/shorts/<videoId>`. Then (if tools allow) playlist and pinned comment.
2. **Public URL for Instagram**: `./sv post host <slug>` → a direct `.mp4` link valid 24 h (the video is about
   to be public anyway). Stored in `post.json → publicVideoUrl`.
3. **Instagram Reel** — create the media container: `media_type: REELS`, `video_url` = that URL, `caption`,
   `share_to_feed: true`, `thumb_offset` = `thumbOffsetMs`. Wait until the container is processed (poll its
   status if a tool exists; otherwise wait ~60 s and retry the publish once), then **publish** it and get the
   permalink. Requires the connected account to be Instagram **Business or Creator**.
4. `./sv post done <slug> --youtube <url> --instagram <url>` — logs both links (post.json, history).
Failures: read the error, fix the one wrong parameter, retry **once**. One platform failing never blocks
the other; report what failed and the exact error. Never delete and re-upload a post to "fix" it.

## 5 · Cadence (when the user asks you to schedule)
Consistency beats volume: the same time each day, 1 video per day at most at the start. Evenings and lunch
hours of the target audience work best (US: ~11:00–14:00 and 19:00–22:00 Eastern). YouTube can schedule
(`privacyStatus: private` + `publishAt`); without a schedule request, post now.

## 6 · Report
The two links, the title and first caption line you chose (and why), the hashtags, and anything that
failed or needs the user (e.g. Instagram's AI label to add in the app when realistic generated images are used).
