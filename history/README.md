# history/ — your finished videos (private, git-ignored)

Created on your machine by `./sv setup` and kept up to date by `./sv render <slug> --final`:

```
history/
  STORIES.md                 every finished video: date · title · source · look · narrator · length · hook
                             + a backlog of story ideas (add your own)
  videos/<date>_<slug>.mp4   every final video
```

Agents read `STORIES.md` before choosing a story, so no story is ever made twice, and no look (theme) or
narrator repeats the previous two videos. Only this README is published; your log and videos stay local.
