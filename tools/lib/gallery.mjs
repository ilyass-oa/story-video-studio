// Template gallery: every locked template rendered in every pack with sample bank content,
// so agents and humans SEE the menu before choosing. Output: engine/gallery/<pack>.jpg + <pack>/<template>.jpg
import fs from 'node:fs';
import path from 'node:path';
import {P, log, py, readJSON, rel} from './env.mjs';
import {assignLines, display, parseMarkup, resolveAsset} from './compile.mjs';
import {renderStills} from './render.mjs';

const SAMPLES = {
	'type-center': {text: 'Some stories / *never* _end_', slots: {bigWord: 'END'}},
	'object-hero': {text: 'It started with / a *watch*', slots: {object: 'bank:pocket-watch-gold'}},
	'object-side': {text: "It's not / just / *what*", slots: {object: 'bank:oil-lantern'}},
	'word-behind': {text: 'the *heart* never lies', slots: {object: 'bank:anatomical-heart', bigWord: 'HEART'}},
	'photo-full': {text: 'Behind the / *door*', slots: {photo: 'bank:dark-door-hallway'}},
	'photo-framed': {text: 'the old man / *woke*', slots: {photo: 'bank:old-man-portrait'}},
	'card-stack': {text: 'every *face* / told a story', slots: {photos: ['bank:old-man-portrait', 'bank:eye-closeup', 'bank:wooden-floorboards']}},
	'tv-screen': {text: 'You turn / *viewers*', slots: {screen: 'bank:eye-closeup', device: 'device:tv-vintage'}},
	'phone-screen': {text: 'Scroll past / *or stay*', slots: {screenText: 'Stay and Watch'}},
	'pinned-note': {text: 'Tired of / *hunting*', slots: {object: 'bank:pocket-watch-gold'}},
	'split-panel': {text: 'the one / you _admire_', slots: {photo: 'bank:old-man-portrait'}},
	scatter: {text: 'the *pieces* / fit together', slots: {objects: ['bank:pocket-watch-gold', 'bank:oil-lantern', 'bank:mantel-clock', 'bank:anatomical-heart']}},
	'figure-spotlight': {text: 'He was / *perfect*', slots: {figure: 'bank:victorian-gentleman'}},
	'outro-hold': {text: 'and it is / still *ticking*', slots: {object: 'bank:mantel-clock'}},
};

const DUR = 70;
const fake = {slug: 'gallery'};

/** One sample scene of a template, filled with bank content, starting at frame `from`. */
const sampleScene = (tpl, spec, from) => {
	const sample = SAMPLES[tpl];
	const toks = parseMarkup(sample.text).map((t) => (t.br ? t : {...t, text: display(t.text)}));
	let k = 0;
	const words = [];
	assignLines(toks, spec.maxLineChars ?? 16).forEach((ln, li) =>
		ln.forEach((t) => {
			words.push({text: t.text, style: t.style, line: li, start: 8 + k * 6, end: 16 + k * 6});
			k++;
		}),
	);
	const slots = {};
	for (const [name, sspec] of Object.entries(spec.slots)) {
		const v = sample.slots[name] ?? sspec.default;
		if (v === undefined) continue;
		if (sspec.kind === 'string') slots[name] = v;
		else if (Array.isArray(v)) slots[name] = v.map((r) => resolveAsset(fake, {assets: {}}, r, sspec.kind === 'cutouts' ? 'cutout' : 'photo'));
		else slots[name] = resolveAsset(fake, {assets: {}}, v, sspec.kind === 'cutout' ? 'cutout' : sspec.kind === 'device' ? 'device' : 'photo');
	}
	return {id: tpl, template: tpl, from, duration: DUR, exit: 0, transitionIn: 'cut', transitionOut: 'cut', transitionFrames: 9, camera: 'push', variant: 0, words, slots};
};
// settled frame to show: the outro fades its image into the background at the very end → capture before that
const shot = (s) => s.from + DUR - (s.template === 'outro-hold' ? 30 : 3);
const baseProps = (pack, scenes, extra = {}) => ({pack, ...extra, fps: 30, width: 1080, height: 1920, durationInFrames: scenes.length * DUR, voice: null, speech: [], beds: [], sfx: [], scenes});

/**
 * The LOOKS menu: every theme (palette, accent font, atmosphere, backdrop) shown on two templates →
 * engine/gallery/looks.jpg. `outDir` lets a test render every template in every theme elsewhere.
 */
export const looks = async ({only, templates = ['word-behind', 'photo-framed'], outDir} = {}) => {
	const catalog = readJSON(P.catalog);
	const LOOKS = readJSON(P.looks);
	const dir = outDir ?? path.join(P.engine, 'gallery', 'looks');
	fs.mkdirSync(dir, {recursive: true});
	const files = [];
	const labels = [];
	for (const [id, th] of Object.entries(LOOKS.themes)) {
		if (only && !only.includes(id)) continue;
		const scenes = templates.map((tpl, i) => sampleScene(tpl, catalog.templates[tpl], i * DUR));
		log.info(`look ${id} (${th.pack} · ${th.backdrop}) …`);
		const out = await renderStills(baseProps(th.pack, scenes, {theme: id, backdrop: th.backdrop}), scenes.map((s) => ({frame: shot(s), name: `${id}-${s.template}`})), dir, {scale: 0.4});
		out.forEach((f, i) => {
			files.push(f);
			labels.push(`${id} · ${th.backdrop}${i ? '' : ` · ${th.pack}`}`);
		});
	}
	const sheet = path.join(outDir ?? path.join(P.engine, 'gallery'), 'looks.jpg');
	py('imagekit.py', ['sheet', sheet, ...files, '--labels', labels.join('|')], {quiet: true});
	log.ok(`${rel(sheet)}`);
	return sheet;
};

export const gallery = async ({packs = ['noir', 'atelier'], only} = {}) => {
	const catalog = readJSON(P.catalog);
	for (const pack of packs) {
		const scenes = [];
		for (const [tpl, spec] of Object.entries(catalog.templates)) {
			if (only && !only.includes(tpl)) continue;
			if (!SAMPLES[tpl]) continue;
			scenes.push(sampleScene(tpl, spec, scenes.length * DUR));
		}
		const props = baseProps(pack, scenes);
		const dir = path.join(P.engine, 'gallery', pack);
		if (!only) fs.rmSync(dir, {recursive: true, force: true});
		log.info(`rendering ${scenes.length} templates in ${pack} …`);
		await renderStills(props, scenes.map((s) => ({frame: shot(s), name: s.id})), dir, {scale: 0.5});
		// sheet always shows the whole bank in catalog order (partial runs only refresh their own frames)
		const all = Object.keys(catalog.templates).filter((t) => fs.existsSync(path.join(dir, `${t}.jpg`)));
		const sheet = path.join(P.engine, 'gallery', `${pack}.jpg`);
		py('imagekit.py', ['sheet', sheet, ...all.map((t) => path.join(dir, `${t}.jpg`)), '--labels', all.join('|')], {quiet: true});
		log.ok(`${rel(sheet)}`);
	}
};
