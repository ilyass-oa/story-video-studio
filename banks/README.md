# Banks — reusable, indexed, licensed media

Everything here is shared by every episode. Each bank has an `index.json` (what exists, tags, licence,
source) and, where it can be rebuilt, a `wishlist.json` (the recipe).

| Bank | Contents | Grow it with |
|---|---|---|
| `sfx/` | ~140 CC0 sound effects in 12 categories (transitions, impacts, text-ui, paper, body, horror, ambience, objects, tension, cinematic, nature, crowd). Trimmed, loudness-normalised, with the **peak time** of each sound measured (so hits land on cuts). | `./sv sfx fetch "<query>" --category <cat>` · `./sv sfx build` (rebuild from wishlist) |
| `music/` | mood beds (dark, tension, emotional, mystery, calm, epic, uplifting), CC-licensed — many CC BY → credit via `./sv credits` | `./sv music fetch "<query>"` · `./sv music build` |
| `images/` | reusable cutouts (`cutouts/`) and photos (`photos/`) promoted from episodes, with tags + licence | `./sv img promote <slug> <id> --tags "…"` · search `./sv img bank "<words>"` · use as `"bank:<id>"` |
| `devices/` | objects with a screen (vintage TV …) + the screen rectangle, for `tv-screen` | `./sv device add <id> <cutout.png> --screen-prompt "screen"` · use as `"device:<id>"` |
| `textures/` | procedural, seeded: film grain, smoke, paper, window-light shadows, dust | `tools/py/make_textures.py` |

Licences: SFX are CC0 (Freesound via Openverse). Images keep their original licence in the index;
CC BY / BY-SA need credit (the credits file lists them). Nothing here is scraped from paid libraries.
Big free add-on: the Sonniss GDC bundles (royalty-free, commercial, no attribution) — see skill 08.
