// Asset pipeline: search → rank (CLIP) → contact sheet → pick → process (cutout / photo / video) → register.
// Priority order is fixed: episode assets → reusable bank → free/licensed sources → image generation (last resort).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {P, config, download, fail, ffprobe, log, py, readJSON, rel, sh, slugify, writeJSON} from './env.mjs';
import {search} from './sources.mjs';
import {episode} from './episode.mjs';
import {namedMisfit} from './people.mjs';

const manifestPath = (ep) => path.join(ep.dir, '05-assets', 'manifest.json');
export const loadManifest = (ep) => readJSON(manifestPath(ep), {assets: {}});
const saveManifest = (ep, m) => writeJSON(manifestPath(ep), m);

const pool = async (items, n, fn) => {
	const out = new Array(items.length);
	let i = 0;
	await Promise.all(
		Array.from({length: Math.min(n, items.length)}, async () => {
			while (i < items.length) {
				const k = i++;
				out[k] = await fn(items[k], k).catch((e) => ({error: e.message}));
			}
		}),
	);
	return out;
};

const extOf = (url, type) => {
	if (/png/i.test(type ?? '') || /\.png(\?|$)/i.test(url)) return '.png';
	if (/webp/i.test(type ?? '') || /\.webp(\?|$)/i.test(url)) return '.webp';
	if (/mp4|video/i.test(type ?? '') || /\.mp4(\?|$)/i.test(url)) return '.mp4';
	return '.jpg';
};

/** Episode-wide: source URLs already used by other assets (an image may appear only once per video). */
export const usedSources = (ep, exceptId) =>
	new Set(
		Object.entries(loadManifest(ep).assets)
			.filter(([k]) => k !== exceptId)
			.map(([, a]) => a.source?.url)
			.filter(Boolean),
	);

/**
 * Search (one or several queries) + rank against the visual brief + sheet.
 * `queries`: what to type into search engines. `see`: what must be visible (used for ranking).
 */
export const findCandidates = async (slug, id, queries, {kind = 'cutout', n = 10, providers, see} = {}) => {
	const ep = episode(slug);
	const dir = path.join(ep.dir, '05-assets', 'candidates', id);
	fs.rmSync(dir, {recursive: true, force: true});
	fs.mkdirSync(dir, {recursive: true});
	const list = (Array.isArray(queries) ? queries : [queries]).filter(Boolean);
	const brief = see ?? list[0];
	const searchKind = kind === 'video' ? 'video' : kind;
	let candidates = [];
	let errors = [];
	let used = [];
	for (const q of list) {
		log.info(`searching "${q}" (${kind}) …`);
		const r = await search(q, {kind: searchKind, n, providers});
		candidates.push(...r.candidates);
		errors.push(...r.errors);
		used = [...new Set([...used, ...r.providers])];
	}
	// thin results → broaden the first query (drop trailing modifiers) and merge
	const STOP = new Set(['a', 'an', 'the', 'of', 'in', 'on', 'with', 'and', 'at', 'for', 'close', 'up', 'photograph', 'photo', 'portrait', 'dark', 'old']);
	const words = list[0].split(/\s+/);
	for (let keep = words.length - 1; candidates.length < 10 && keep >= 2; keep--) {
		const broader = words.slice(0, keep).join(' ');
		if (words.slice(0, keep).every((w) => STOP.has(w.toLowerCase()))) break;
		log.dim(`  only ${candidates.length} results — broadening to "${broader}"`);
		const more = await search(broader, {kind: searchKind, n, providers});
		candidates.push(...more.candidates);
		errors.push(...more.errors);
	}
	[...new Set(errors)].forEach((e) => log.dim(`  provider error: ${e}`));
	const taken = usedSources(ep, id);
	const seen = new Set();
	const uniq = candidates.filter((c) => !taken.has(c.full) && (seen.has(c.full) ? false : seen.add(c.full)));
	if (!uniq.length) return {id, queries: list, see: brief, kind, dir, ranked: [], providers: used};
	log.info(`${uniq.length} candidates from ${used.join(', ')} — downloading previews`);
	const thumbs = await pool(uniq, 8, async (c, k) => {
		const f = path.join(dir, `t${String(k).padStart(2, '0')}${c.video ? '.jpg' : extOf(c.thumb)}`);
		try {
			await download(c.thumb, f, {timeoutMs: 30000});
		} catch (e) {
			if (c.video) throw e;
			await download(c.full, f, {timeoutMs: 60000}); // thumbnail endpoint failed / rate-limited → full image
		}
		return f;
	});
	const ok = uniq.map((c, k) => ({...c, thumbFile: typeof thumbs[k] === 'string' ? thumbs[k] : null})).filter((c) => c.thumbFile);
	if (!ok.length) {
		log.warn(`no preview could be downloaded for "${list[0]}" (providers down or rate-limited) — retry later or change the query`);
		return {id, queries: list, see: brief, kind, dir, ranked: [], providers: used};
	}
	const scores = py('imagekit.py', ['rank', '--query', brief, '--kind', kind === 'video' ? 'photo' : kind, ...ok.map((c) => c.thumbFile)], {quiet: true});
	const byFile = new Map(scores.map((s) => [s.path, s]));
	// licence preference: CC0 / public domain / Pexels-style first, share-alike last (or excluded by config)
	const allowSA = config().licenses?.allowShareAlike !== false;
	const lic = (l = '') => (/cc0|public domain|pdm|pexels|pixabay|unsplash|open access/i.test(l) ? 0.15 : /sa\b|share/i.test(l) ? -0.25 : /by/i.test(l) ? 0 : -0.1);
	const ranked = ok
		.filter((c) => allowSA || !/sa\b|share/i.test(c.license ?? ''))
		.map((c) => ({...c, rank: byFile.get(c.thumbFile)}))
		.filter((c) => c.rank)
		.map((c) => ({...c, named: namedMisfit(brief, c.title, c.desc) ?? undefined}))
		// a generic character ("a man", "his wife") must be an anonymous person — named sitters sink to the bottom
		.map((c) => ({...c, rank: {...c.rank, score: +(c.rank.score + lic(c.license) - (c.named ? 2 : 0)).toFixed(4)}}))
		.sort((a, b) => b.rank.score - a.rank.score);
	const top = ranked.slice(0, 16);
	py('imagekit.py', ['sheet', path.join(dir, 'sheet.jpg'), ...top.map((c) => c.thumbFile), '--labels', top.map((c) => `${c.provider.split(':')[0]} ${c.rank.relevance.toFixed(2)}${c.named ? ' NAMED' : ''}`).join('|')], {quiet: true});
	writeJSON(path.join(dir, 'candidates.json'), {id, query: list.join(' | '), queries: list, see: brief, kind, ranked: top});
	const named = top.filter((c) => c.named);
	if (named.length) log.dim(`  ${named.length} candidate(s) show a named, real person (${named.slice(0, 3).map((c) => c.named).join('; ')}) — labelled NAMED, ranked last`);
	log.ok(`ranked → ${rel(path.join(dir, 'sheet.jpg'))}`);
	return {id, queries: list, see: brief, kind, dir, ranked: top, providers: used};
};

/** Turn a downloaded source file into a registered episode asset. */
export const processAsset = (ep, id, srcFile, {kind, select, source, query}) => {
	const outDir = path.join(ep.dir, '05-assets');
	let out;
	let report = {};
	if (kind === 'cutout') {
		out = path.join(outDir, `${id}.png`);
		const args = ['cutout', srcFile, out];
		if (select) args.push('--prompt', select);
		report = py('imagekit.py', args, {quiet: true});
		if (report.error) return {ok: false, report};
	} else if (kind === 'video') {
		out = path.join(outDir, `${id}.mp4`);
		sh('ffmpeg', ['-v', 'error', '-y', '-i', srcFile, '-an', '-vf', "scale='if(gt(iw,ih),-2,min(1080,iw))':'if(gt(iw,ih),min(1080,ih),-2)',fps=30", '-c:v', 'libx264', '-crf', '18', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out]);
		const m = ffprobe(out);
		report = {ok: true, width: m.width, height: m.height, duration: m.duration};
	} else {
		out = path.join(outDir, `${id}.jpg`);
		sh(P.py, ['-c', `from PIL import Image,ImageOps;im=ImageOps.exif_transpose(Image.open(${JSON.stringify(srcFile)})).convert('RGB');im.thumbnail((2400,2400));im.save(${JSON.stringify(out)},quality=92)`]);
		report = py('imagekit.py', ['inspect', out], {quiet: true});
		report.ok = Math.min(report.width, report.height) >= 600;
		if (!report.ok) report.flags = ['low-resolution'];
	}
	if (report.ok === false) {
		fs.rmSync(out, {force: true});
		return {ok: false, report, file: out};
	}
	const m = loadManifest(ep);
	m.assets[id] = {
		file: rel(out),
		kind,
		width: report.width,
		height: report.height,
		...(report.duration ? {duration: report.duration} : {}),
		...(report.luma !== undefined ? {luma: report.luma} : {}),
		query,
		source,
		quality: {ok: report.ok, flags: report.flags ?? [], coverage: report.coverage},
		created: new Date().toISOString(),
	};
	saveManifest(ep, m);
	return {ok: report.ok !== false, report, file: out};
};

/** Download candidate #n (1-based, sheet order) and process it. */
export const pick = async (slug, id, n, {select} = {}) => {
	const ep = episode(slug);
	const dir = path.join(ep.dir, '05-assets', 'candidates', id);
	const c = readJSON(path.join(dir, 'candidates.json'));
	const cand = c.ranked[n - 1];
	if (!cand) fail(`no candidate #${n} for ${id} (have ${c.ranked.length})`);
	const file = path.join(dir, `full-${n}${cand.video ? '.mp4' : extOf(cand.full)}`);
	if (!fs.existsSync(file)) {
		log.info(`downloading #${n} from ${cand.provider} …`);
		await download(cand.full, file, {timeoutMs: 180000});
	}
	const source = {provider: cand.provider, title: cand.title, ...(cand.desc ? {desc: cand.desc} : {}), page: cand.page, url: cand.full, license: cand.license, attribution: cand.attribution};
	if (cand.named) log.warn(`#${n} depicts a real, named person ("${cand.named}") — a story character must be an anonymous person. Pick another, unless the story is about this person (then name them in "see").`);
	const res = processAsset(ep, id, file, {kind: c.kind, select, source, query: c.see ?? c.query});
	if (res.ok) log.ok(`${id} ← #${n} ${cand.provider} → ${rel(res.file)} ${res.report.flags?.length ? `(flags: ${res.report.flags})` : ''}`);
	else log.warn(`${id} #${n} failed quality: ${JSON.stringify(res.report.flags ?? res.report.error)}`);
	return res;
};

/** Fully automatic: find, then try the best candidates until one passes the quality gates. */
export const autoAsset = async (slug, id, queries, {kind = 'cutout', select, providers, see, tries = 5} = {}) => {
	const f = await findCandidates(slug, id, queries, {kind, providers, see});
	const best = f.ranked[0]?.rank.relevance ?? 0;
	// CLIP ViT-B/32: on-topic ≈ 0.28–0.40, off-topic ≈ 0.18–0.26. Stay close to the best match.
	const floor = Math.max(0.255, best - 0.05);
	const target = select ?? (Array.isArray(queries) ? queries[0] : queries);
	for (let k = 1; k <= Math.min(tries, f.ranked.length); k++) {
		if (f.ranked[k - 1].rank.relevance < floor) break;
		if (f.ranked[k - 1].named) continue;
		try {
			let r = await pick(slug, id, k, {select});
			// cluttered / multi-object / cropped → retry by *selecting* the named element first
			if (!r.ok && kind === 'cutout' && !select && (r.report.flags ?? []).some((x) => /fragmented|background-not-removed|cropped/.test(x))) {
				log.info(`retrying #${k} with element selection "${target}"`);
				r = await pick(slug, id, k, {select: target});
			}
			if (r.ok) return {ok: true, id, pick: k, relevance: f.ranked[k - 1].rank.relevance};
		} catch (e) {
			log.warn(`candidate #${k} failed: ${e.message.split('\n')[0]}`);
		}
	}
	return {ok: false, id, reason: f.ranked.length ? 'no candidate passed relevance + quality gates' : 'no search results'};
};

/** Register a file or URL you already have: your own photo, or an image YOU generated with your own image tool. */
export const addAsset = async (slug, id, input, {kind = 'cutout', select, license, note, generated = false} = {}) => {
	const ep = episode(slug);
	let file = input;
	if (/^https?:/.test(input)) {
		file = path.join(ep.dir, '05-assets', 'candidates', id, `added${extOf(input)}`);
		await download(input, file, {timeoutMs: 180000});
	}
	if (!fs.existsSync(file)) fail(`file not found: ${input}`);
	const source = generated
		? {provider: 'generated', license: license ?? 'AI-generated by the agent — check your image tool terms, disclose if required', prompt: note}
		: {provider: 'local', url: input, license: license ?? 'own / unknown — verify before publishing', note};
	const res = processAsset(ep, id, path.resolve(file), {kind, select, source, query: note ?? id});
	(res.ok ? log.ok : log.warn)(`${id} → ${rel(res.file)} ${res.report.flags?.length ? `flags: ${res.report.flags}` : ''}`);
	return res;
};

/** Pack-matched prompts for agents that can generate images themselves (e.g. Codex $imagegen). */
// ───────────────────────── image generation (agents with their own image tool, e.g. Codex $imagegen) ─────────────────────────
// One art direction per episode (05-assets/ART.md): every generated image shares its style block, so the
// video looks like one series, not a pile of unrelated AI images. Styles follow the episode's theme.
export const ART_STYLES = {
	ember: {photo: 'cinematic 35mm film still, low-key chiaroscuro lighting, deep blacks, one warm practical light (candle or fire), muted desaturated colours with blood-red accents, fine film grain, realistic, period-accurate', art: 'dark oil painting in the manner of 17th-century Dutch chiaroscuro, heavy black shadows, warm candlelight, visible brushwork, muted earth palette with deep reds'},
	abyss: {photo: 'cinematic 35mm film still, cold blue moonlight, deep navy shadows, drifting mist, desaturated teal palette, fine film grain, realistic, period-accurate', art: 'moody nocturne oil painting, cold blue and silver palette, soft fog, tonal atmosphere, visible brushwork'},
	venom: {photo: 'cinematic film still, sickly green gaslight, deep shadows, damp textures, desaturated olive palette with toxic green highlights, film grain, realistic, period-accurate', art: 'dark gothic etching tinted with sickly green washes, dense crosshatching, ominous'},
	gilded: {photo: 'cinematic film still, candlelit amber and gold light, deep black shadows, rich velvet and metal textures, warm desaturated palette, film grain, realistic, period-accurate', art: 'baroque oil painting with Caravaggio chiaroscuro, gold and umber palette, dramatic light from one side'},
	bone: {photo: 'authentic-looking antique photograph, sepia albumen print, soft focus at the edges, faded contrast, dust and fine scratches, realistic period detail', art: '19th-century steel engraving, fine black linework and crosshatching on aged paper, monochrome'},
	violet: {photo: 'cinematic film still, violet dusk light, deep purple shadows, dreamlike haze, soft glow, film grain, realistic', art: 'symbolist oil painting, dreamlike violet and indigo palette, soft glowing light, mysterious'},
	paper: {photo: 'clean editorial photograph, soft window light from the left, muted natural colours, simple composition, realistic', art: 'minimal editorial illustration, flat muted colours, fine black outline, generous empty space'},
	cream: {photo: 'warm nostalgic photograph, soft golden window light, cream and brown palette, gentle film grain, realistic', art: 'gentle gouache storybook illustration, warm cream and burnt-orange palette, soft textured paper'},
	sage: {photo: 'soft natural-light photograph, muted greens, calm and airy, realistic', art: 'delicate ink and watercolour illustration, sage-green washes, botanical-print feel'},
	blush: {photo: 'soft romantic film photograph, rose and wine tones, window light, gentle grain, realistic', art: 'watercolour and ink illustration, rose and wine washes, tender loose brushwork'},
	slate: {photo: 'crisp documentary photograph, cool blue-grey palette, clean light, realistic', art: 'precise technical ink drawing with cool blue washes, blueprint-like clarity'},
};
const CUTOUT_TPL = new Set(['object-hero', 'object-side', 'word-behind', 'scatter', 'outro-hold', 'pinned-note', 'figure-spotlight']);
const COMPOSE = {
	cutout: {size: 'square 1024x1024', text: 'a single {subject}; the entire subject visible with a generous margin, nothing cropped; isolated on a plain flat mid-grey seamless background; no other objects, no floor clutter; one directional key light'},
	figure: {size: 'portrait 1024x1536', text: 'full-length figure of {subject}, head to toe visible with margin, standing; isolated on a plain flat mid-grey seamless background; one directional key light'},
	'photo-full': {size: 'portrait 1024x1536', text: 'vertical full-frame composition of {subject}; the subject large in the upper two-thirds; the lower third darker and simpler (captions go there)'},
	'photo-framed': {size: 'portrait 1024x1536', text: 'vertical composition of {subject}, subject centred with a clear readable silhouette'},
	'split-panel': {size: 'portrait 1024x1536', text: 'tall narrow vertical composition of {subject}, subject centred horizontally'},
	'card-stack': {size: 'portrait 1024x1536', text: 'vertical composition of {subject}, subject centred, readable at small size'},
	'tv-screen': {size: 'landscape 1536x1024', text: 'horizontal composition of {subject}, as if filmed for an old screen'},
};
const NEGATIVE = 'No text, no letters, no numbers, no fake writing, no watermark, no signature, no logo, no frame, no border. Natural anatomy (five fingers per hand, symmetric eyes). No modern objects unless the story is modern.';
const PEOPLE = 'Any person is anonymous and ordinary — not a real, famous or recognisable person; the face may be partly in shadow or turned away.';
export const GEN_CHECKLIST = [
	'Fit — it shows exactly the brief ("see") and what is SAID at that moment; muted, would the image alone tell the line?',
	'Style — same medium, palette and light as ART.md and the other generated images (compare them side by side in review.jpg).',
	'Anatomy — hands (five fingers), eyes, limbs, faces: nothing melted, doubled or missing.',
	'No text — no letters, fake writing, numbers, watermarks, signatures, logos anywhere.',
	'Era & setting — no zips, plastic, modern shoes, electric light in 1284…; clothing and objects of the right century and place.',
	'No AI gloss — no plastic skin, HDR glow, over-sharp symmetry, fantasy clichés or "epic" lighting the story does not ask for.',
	'Composition — the subject sits where the template shows it (text space free; a cutout fully inside the frame with margin).',
	'People — anonymous; a recurring character matches its description in ART.md.',
];

const artFile = (ep) => path.join(ep.dir, '05-assets', 'ART.md');

/** Create / read the episode's art direction. The agent fills era, setting and characters once. */
export const artDirection = (slug, {style} = {}) => {
	const ep = episode(slug);
	const f = artFile(ep);
	if (fs.existsSync(f) && !style) {
		const md = fs.readFileSync(f, 'utf8');
		const block = (name) => (md.match(new RegExp('```' + name + '\\n([\\s\\S]*?)```')) ?? [])[1]?.trim() ?? '';
		return {file: f, style: block('style'), world: block('world'), characters: block('characters')};
	}
	const meta = readJSON(path.join(ep.dir, 'episode.json'), {});
	const edit = readJSON(ep.f('edit'), {});
	const pack = edit.pack ?? meta.pack ?? 'noir';
	const theme = edit.theme ?? meta.theme ?? readJSON(P.looks).defaults[pack];
	const family = style ?? 'photo';
	const text = (ART_STYLES[theme] ?? ART_STYLES.ember)[family] ?? ART_STYLES.ember.photo;
	if (fs.existsSync(f)) {
		// switching style keeps the world and characters the agent already wrote
		const md = fs.readFileSync(f, 'utf8').replace(/```style\n[\s\S]*?```/, '```style\n' + text + '\n```').replace(/style family: \*\*\w+\*\*/, `style family: **${family}**`);
		fs.writeFileSync(f, md);
		log.ok(`art direction → ${rel(f)} (${theme} · ${family})`);
		return artDirection(slug);
	}
	const md = `# Art direction — ${meta.title ?? slug}

Every generated image of this episode uses the blocks below (\`./sv img brief\` inserts them). One series,
one style: never mix a painting with a photo, never change the palette mid-video.
Theme: **${theme}** · style family: **${family}** (\`./sv img style ${slug} --style photo|art\` to switch — only before generating).

## Style
\`\`\`style
${text}
\`\`\`

## World — era, place, materials (fill in once, precisely)
\`\`\`world
<e.g. Hamelin, Lower Saxony, 1284: timber-framed houses, cobbled lanes, wool and linen clothing, tallow candles, no glass windows in poor homes>
\`\`\`

## Characters — recurring people, described once, reused word for word
\`\`\`characters
<e.g. THE PIPER: tall thin man, patchwork coat of red, green and yellow, pointed hat, long wooden pipe; face mostly in shadow>
\`\`\`
`;
	fs.mkdirSync(path.dirname(f), {recursive: true});
	fs.writeFileSync(f, md);
	log.ok(`art direction → ${rel(f)} (${theme} · ${family}) — fill "world" and "characters" before generating`);
	return {file: f, style: text, world: '', characters: ''};
};

/** Find a slot by its asset id (explicit "id" or the default <scene>-<slot>[-n]) in edit.json. */
const slotById = (ep, id) => {
	const edit = readJSON(ep.f('edit'), {scenes: []});
	for (const sc of edit.scenes)
		for (const [slot, v] of Object.entries(sc.slots ?? {})) {
			const items = Array.isArray(v) ? v : [v];
			for (let k = 0; k < items.length; k++) {
				const it = items[k];
				const def = `${sc.id}-${slot}${Array.isArray(v) ? `-${k + 1}` : ''}`;
				if (it && typeof it === 'object' && (it.id ?? def) === id) return {scene: sc, slot, item: it};
			}
		}
	return null;
};

/**
 * The exact generation brief for one slot: composition for its template + the episode's art direction +
 * the precise subject + negatives + the self-review checklist. Written to candidates/<id>/GENERATE.md.
 */
export const brief = (slug, id, subject, {kind} = {}) => {
	const ep = episode(slug);
	const hit = slotById(ep, id);
	const see = subject ?? hit?.item?.see ?? (Array.isArray(hit?.item?.find) ? hit.item.find[0] : hit?.item?.find);
	if (!see) fail(`no subject for ${id}: pass "<subject>" or give the slot a "see" brief in edit.json`);
	const tpl = hit?.scene?.template;
	const k = kind ?? hit?.item?.kind ?? (CUTOUT_TPL.has(tpl) ? 'cutout' : 'photo');
	const shape = k === 'cutout' ? (tpl === 'figure-spotlight' ? 'figure' : 'cutout') : (COMPOSE[tpl] ? tpl : 'photo-full');
	const c = COMPOSE[shape];
	const art = artDirection(slug);
	const person = /\b(man|woman|men|women|boy|girl|child|children|person|people|figure|piper|soldier|wife|husband|stranger|mother|father|king|queen|hands?|face)\b/i.test(see);
	const world = art.world && !art.world.startsWith('<') ? ` Setting: ${art.world.replace(/\s+/g, ' ')}.` : '';
	// only the recurring characters this shot names ("THE PIPER: …" is used when the brief says "piper")
	const cast = art.characters.startsWith('<') ? [] : art.characters.split('\n').map((l) => l.trim()).filter((l) => /^[^:]{2,40}:/.test(l));
	const inShot = cast.filter((l) => new RegExp(`\\b${l.split(':')[0].replace(/^the\s+/i, '').trim().toLowerCase()}\\b`, 'i').test(see));
	const chars = inShot.length ? ` Character (keep exactly this look): ${inShot.join(' ').replace(/\s+/g, ' ')}.` : '';
	const prompt = `${c.text.replace('{subject}', see)}. Style: ${art.style}.${world}${chars} ${person ? PEOPLE + ' ' : ''}${NEGATIVE}`.replace(/\s+/g, ' ').trim();
	const dir = path.join(ep.dir, '05-assets', 'candidates', id);
	fs.mkdirSync(dir, {recursive: true});
	let n = 1;
	while (fs.existsSync(path.join(dir, `generated-${n}.png`))) n++;
	const save = path.join(dir, `generated-${n}.png`);
	const words = hit ? String(hit.scene.text).replace(/[*_~^{}/]/g, '').replace(/\s+/g, ' ').trim() : '';
	const md = `# Generate: ${id}${hit ? ` — ${hit.scene.id} (${tpl})` : ''}

${words ? `Spoken at this moment: "${words}"\n` : ''}- kind: ${k} · size: ${c.size}${k === 'cutout' ? ' (the background is removed automatically)' : ''}
- save to: ${rel(save)}   (attempt ${n})
- register: ./sv img add ${slug} ${id} ${rel(save)} --kind ${k} --generated --note "${see.replace(/"/g, "'")}"
- then LOOK: ./sv img review ${slug} → 05-assets/review.jpg

## Prompt
${prompt}

## Before you accept it — check every line (a single "no" = regenerate with the fix written into the prompt)
${GEN_CHECKLIST.map((x, i) => `${i + 1}. ${x}`).join('\n')}
Three failed attempts → use a found image or make the scene a text beat. Never keep slop.
`;
	fs.writeFileSync(path.join(dir, 'GENERATE.md'), md);
	return {prompt, save, md, file: path.join(dir, 'GENERATE.md')};
};

const REVIEW_KEY = (r) => `${r.scene}|${r.slot}|${r.asset}`;

/** Parse verdicts already written in review.md so regenerating the sheet never erases the agent's judgement. */
export const readVerdicts = (ep) => {
	const f = path.join(ep.dir, '05-assets', 'review.md');
	const out = new Map();
	if (!fs.existsSync(f)) return out;
	for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
		const c = line.split('|').map((x) => x.trim());
		if (c.length < 12 || !/^\d+$/.test(c[1])) continue;
		out.set(`${c[2]}|${c[4]}|${c[5]}`, c[10]);
	}
	return out;
};

/**
 * review.jpg + review.md: every chosen image with its scene time, spoken words and brief, two fit scores
 * (image↔brief, image↔spoken words), near-duplicate detection, and a verdict column the agent MUST fill.
 */
export const reviewSheet = (slug) => {
	const ep = episode(slug);
	const edit = readJSON(ep.f('edit'));
	const man = loadManifest(ep);
	const bank = readJSON(P.imageIndex, {assets: {}}).assets;
	const words = readJSON(ep.f('words'), {words: []}).words;
	const clean = (t) => String(t).replace(/\[[^\]]*\]/g, '').replace(/[*_~^{}/]/g, '').replace(/\s+/g, ' ').trim();
	// scene time ranges from the narration (approximate: first/last word of the scene's text)
	let wi = 0;
	const range = {};
	for (const sc of edit.scenes) {
		const n = clean(sc.text).split(' ').filter(Boolean).length;
		const ws = words.slice(wi, wi + n);
		if (ws.length) range[sc.id] = `${(ws[0].start / 1000).toFixed(1)}–${(ws[ws.length - 1].end / 1000).toFixed(1)}s`;
		wi += n;
	}
	const rows = [];
	for (const sc of edit.scenes) {
		for (const [slot, v] of Object.entries(sc.slots ?? {})) {
			for (const item of Array.isArray(v) ? v : [v]) {
				const ref = typeof item === 'string' ? item : item?.id;
				if (!ref || ref.startsWith('device:')) continue;
				const a = ref.startsWith('bank:') ? bank[ref.slice(5)] : man.assets[ref];
				if (!a || !fs.existsSync(path.join(P.root, a.file))) continue;
				let f = path.join(P.root, a.file);
				if (a.kind === 'video') {
					const frame = path.join(ep.dir, '05-assets', 'candidates', `${ref}-frame.jpg`);
					sh('ffmpeg', ['-v', 'error', '-y', '-ss', String((a.duration ?? 2) / 2), '-i', f, '-frames:v', '1', frame]);
					f = frame;
				}
				const brief = (typeof item === 'object' && (item.see ?? item.find)) || a.query || '';
				const b1 = Array.isArray(brief) ? brief[0] : brief;
				const named = namedMisfit(b1, a.source?.title, a.source?.desc);
				// the verdict belongs to THIS image: a replaced image (new pick / new file) gets a new version → "?" again
				const ver = crypto.createHash('sha1').update(`${a.source?.url ?? a.file}|${a.created ?? ''}`).digest('hex').slice(0, 6);
				rows.push({scene: sc.id, slot, asset: `${ref}@${ver}`, file: f, time: range[sc.id] ?? '', words: clean(sc.text), brief: b1, source: a.source?.provider ?? '', named});
			}
		}
	}
	if (!rows.length) return null;
	const pairs = path.join(ep.dir, '05-assets', 'candidates', '.match.json');
	fs.mkdirSync(path.dirname(pairs), {recursive: true});
	writeJSON(pairs, rows.map((r) => ({image: r.file, texts: [r.brief, r.words]})));
	const m = py('imagekit.py', ['match', pairs], {quiet: true});
	fs.rmSync(pairs, {force: true});
	const dupOf = new Map();
	for (const d of m.duplicates) dupOf.set(d.b, d.a);
	const verdicts = readVerdicts(ep);
	rows.forEach((r, i) => {
		const [fb, fw] = m.items[i].scores;
		r.fitBrief = fb;
		r.fitWords = fw;
		r.flags = [fb < 0.24 ? 'weak vs brief' : '', fw < 0.18 ? 'weak vs words' : '', dupOf.has(i) ? `looks like #${dupOf.get(i) + 1}` : '', r.source === 'generated' ? 'GENERATED — verdict must confirm: fit, style = ART.md, anatomy, no text, era, no AI gloss' : '', r.named ? `NAMED PERSON "${r.named}" — a character must be anonymous` : ''].filter(Boolean).join(', ');
		r.verdict = verdicts.get(REVIEW_KEY(r)) ?? '?';
	});
	const out = path.join(ep.dir, '05-assets', 'review.jpg');
	py('imagekit.py', ['sheet', out, ...rows.map((r) => r.file), '--labels', rows.map((r) => `${r.scene} ${r.words}`.slice(0, 36)).join('|')], {quiet: true});
	const flagged = rows.filter((r) => r.flags && !/^GENERATED/.test(r.flags)).length;
	const open_ = rows.filter((r) => !/^\s*(✓|ok\b)/i.test(r.verdict)).length;
	const md = [
		`# Image review — ${slug}`,
		'',
		'Open `review.jpg` and judge EVERY row. Replace `?` in the verdict column with `✓ <why it fits these exact words>` or fix the image',
		'(skill 05 §3) and re-run `./sv img review`. The final render refuses while a verdict is `?` or `✗`.',
		'Scores are CLIP similarities (≈0.26+ = on-topic): a low score or a flag means *look twice*, a high score is not a pass.',
		'',
		'| # | scene | time | slot | asset | spoken words | brief | fit brief | fit words | verdict | flags |',
		'|---|---|---|---|---|---|---|---|---|---|---|',
		...rows.map((r, i) => `| ${i + 1} | ${r.scene} | ${r.time} | ${r.slot} | ${r.asset} | ${r.words} | ${String(r.brief).replace(/\|/g, '/')} | ${r.fitBrief.toFixed(2)} | ${r.fitWords.toFixed(2)} | ${r.verdict} | ${r.flags} |`),
		'',
	].join('\n');
	fs.writeFileSync(path.join(ep.dir, '05-assets', 'review.md'), md);
	log.ok(`image review → ${rel(out)} + review.md  (${rows.length} images, ${flagged} flagged, ${open_} verdict(s) to write)`);
	if (m.duplicates.length) log.warn(`${m.duplicates.length} near-duplicate pair(s) — every scene needs a visibly different image`);
	return {out, rows, open: open_};
};

/** Promote an episode asset into the reusable bank (banks/images). */
export const promote = (slug, id, tags = []) => {
	const ep = episode(slug);
	const m = loadManifest(ep);
	const a = m.assets[id];
	if (!a) fail(`no asset ${id} in ${slug}`);
	const bankId = slugify(tags[0] ?? id);
	const dest = path.join(P.banks, 'images', a.kind === 'cutout' ? 'cutouts' : a.kind === 'video' ? 'clips' : 'photos', `${bankId}${path.extname(a.file)}`);
	fs.mkdirSync(path.dirname(dest), {recursive: true});
	fs.copyFileSync(path.join(P.root, a.file), dest);
	const idx = readJSON(P.imageIndex, {assets: {}});
	idx.assets[bankId] = {...a, file: rel(dest), tags: [...new Set([...tags, ...(a.query ?? '').split(/\s+/)])].filter(Boolean), from: slug};
	writeJSON(P.imageIndex, idx);
	log.ok(`bank:${bankId} ← ${slug}/${id}`);
	return bankId;
};

export const bankSearch = (query) => {
	const idx = readJSON(P.imageIndex, {assets: {}});
	const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
	return Object.entries(idx.assets)
		.map(([k, a]) => ({id: `bank:${k}`, kind: a.kind, file: a.file, score: terms.filter((t) => [k, ...(a.tags ?? [])].join(' ').toLowerCase().includes(t)).length / terms.length}))
		.filter((r) => r.score > 0)
		.sort((a, b) => b.score - a.score);
};
