// Episode folder layout — numbered so any agent can see where it is in the pipeline.
import fs from 'node:fs';
import path from 'node:path';
import {P, fail, readJSON, rel} from './env.mjs';

export const LAYOUT = {
	brief: '01-script/brief.md',
	script: '01-script/script.txt',
	voiceDir: '02-voice',
	voice: '02-voice/narration.wav',
	voiceMeta: '02-voice/voice.json',
	words: '03-timing/words.json',
	edit: '04-edit/edit.json',
	assets: '05-assets',
	manifest: '05-assets/manifest.json',
	renders: '06-render',
	props: '06-render/props.json',
};

export const episode = (slug, {mustExist = true} = {}) => {
	if (!slug || !/^[a-z0-9][a-z0-9-]*$/.test(slug)) fail(`bad episode slug "${slug}" (use kebab-case, e.g. tell-tale-heart)`);
	const dir = path.join(P.episodes, slug);
	if (mustExist && !fs.existsSync(dir)) fail(`episode "${slug}" does not exist — run: ./sv new ${slug}`);
	const f = (k) => path.join(dir, LAYOUT[k]);
	return {slug, dir, f};
};

export const BRIEF_TEMPLATE = (slug, pack, meta = {}) => `# ${meta.title ?? slug}

title: ${meta.title ?? '<story title>'}
source: ${meta.source ?? '<original | author (year), public domain | factual — list sources below>'}
pack: ${pack}            # noir (dark cinematic) | atelier (light editorial)
duration: 40-60s        # target; the narration decides the real length
audience: TikTok / Reels / Shorts, sound on

## One-sentence creative direction
<the feeling the whole video must leave — writing, voice, visuals and sound all serve this>

## Hook (first 2 seconds)
<the exact opening line>

## Beats
1. hook —
2. setup —
3. turn —
4. escalation —
5. payoff / loop —

## Sources / notes (never spoken)
`;

/** Image slots still waiting for ./sv assets (objects with "find" but no "id"). */
export const unresolved = (edit) => {
	let n = 0;
	for (const sc of edit.scenes ?? []) for (const v of Object.values(sc.slots ?? {})) for (const it of Array.isArray(v) ? v : [v]) if (it && typeof it === 'object' && (it.find || it.gen) && !it.id) n++;
	return n;
};

/** Every image in 05-assets/review.md carries a ✓ verdict. */
const reviewed = (ep) => {
	const f = path.join(ep.dir, '05-assets', 'review.md');
	if (!fs.existsSync(f)) return false;
	const rows = fs.readFileSync(f, 'utf8').split('\n').filter((l) => /^\|\s*\d+\s*\|/.test(l));
	return rows.length > 0 && rows.every((l) => /^\s*(✓|ok\b)/i.test(l.split('|')[10] ?? ''));
};

export const status = (slug) => {
	const ep = episode(slug);
	const has = (k) => fs.existsSync(ep.f(k));
	const editDoc = has('edit') ? readJSON(ep.f('edit')) : null;
	const steps = [
		{key: 'script', name: '01 script', done: has('script') && fs.readFileSync(ep.f('script'), 'utf8').trim().length > 0, next: `write ${LAYOUT.brief} + ${LAYOUT.script} (spoken words only)`, skill: 'skills/01-story-script/SKILL.md'},
		{key: 'voice', name: '02 voice', done: has('voice'), next: `./sv voice ${slug}`, skill: 'skills/02-voice-narration/SKILL.md'},
		{key: 'timing', name: '03 timing', done: has('words'), next: `./sv align ${slug}`, skill: 'skills/03-timing-alignment/SKILL.md'},
		{key: 'edit', name: '04 edit', done: !!editDoc && !editDoc.scenes?.some((s) => !s.template || s.template === '?'), next: editDoc ? `fill every scene in ${LAYOUT.edit}, then ./sv check ${slug}` : `./sv draft ${slug}`, skill: 'skills/04-scene-assembly/SKILL.md'},
		{key: 'assets', name: '05 assets', done: !!editDoc && unresolved(editDoc) === 0 && reviewed(ep), next: `./sv assets ${slug} → LOOK at 05-assets/review.jpg and write a verdict for every image in review.md`, skill: 'skills/05-image-sourcing/SKILL.md'},
		{key: 'render', name: '06 render', done: fs.existsSync(path.join(ep.dir, '06-render', 'final.mp4')), next: `./sv stills ${slug} → ./sv render ${slug} → ./sv render ${slug} --final`, skill: 'skills/07-render-review/SKILL.md'},
	];
	const todo = steps.find((s) => !s.done);
	return {slug, dir: rel(ep.dir), steps, todo, next: todo ? `${todo.next}   (read ${todo.skill})` : 'done — the video is in history/videos/ and logged in history/STORIES.md'};
};
