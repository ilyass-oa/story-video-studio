# skills/ — the pipeline, in the order an agent works

Read [`KNOWN-MISTAKES.md`](KNOWN-MISTAKES.md) first, then each skill when its step comes
(`./sv status <slug>` names the next one). Codex also finds them through `.agents/skills/`.

| # | Skill | Step | Output |
|---|---|---|---|
| 00 | [story-director](00-story-director/SKILL.md) | pick a story + look, run the whole pipeline | `episodes/<slug>/` |
| 01 | [story-script](01-story-script/SKILL.md) | hook, beats, exact spoken words | `01-script/` |
| 02 | [voice-narration](02-voice-narration/SKILL.md) | cast, direct, narrate, verify | `02-voice/` |
| 03 | [timing-alignment](03-timing-alignment/SKILL.md) | every word's start/end | `03-timing/` |
| 04 | [scene-assembly](04-scene-assembly/SKILL.md) | template, emphasis, image brief, sounds per scene | `04-edit/edit.json` |
| 05 | [image-sourcing](05-image-sourcing/SKILL.md) | find / generate, look, verdict per image | `05-assets/` |
| 06 | [sound-design](06-sound-design/SKILL.md) | story cues, ambience, music | `edit.json` |
| 07 | [render-review](07-render-review/SKILL.md) | stills → preview → scorecard → final | `06-render/` |
| 08 | [bank-builder](08-bank-builder/SKILL.md) | extend templates, themes, sounds (separate task) | `engine/`, `banks/` |

[`_library/`](_library/) holds writing-craft references (hooks, retention, de-slopping) used by skill 01.
