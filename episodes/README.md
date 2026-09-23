# episodes/ — one folder per video, in the order it is made (private, git-ignored)

`./sv new <slug>` creates the folder; each numbered step fills the next folder:

```
episodes/<slug>/
  episode.json          title · source · pack · theme · voice · pace
  01-script/            brief.md (the plan) · script.txt (the exact spoken words + [performance tags])
  02-voice/             direction.md · auditions/ · takes/ · narration.wav (mastered) · voice.json (measures)
  03-timing/            words.json (every word with its start/end, 100 % script match)
  04-edit/              edit.json (look + scenes: template · emphasis · images · sounds)
  05-assets/            the images (found or generated) · manifest.json (provenance) · ART.md (style for generated ones)
                        candidates/<id>/ (search sheets, generation briefs) · review.jpg + review.md (verdicts)
  06-render/            review/ (stills, contact sheet, scorecard) · preview.mp4 · final.mp4 · credits.txt
```

`./sv status <slug>` tells you where an episode is and the exact next command. Work in progress stays on
your machine; only this README is published.
