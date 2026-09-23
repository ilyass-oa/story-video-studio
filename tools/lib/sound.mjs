// SFX + music banks: build from CC0/CC sources, index, search, and deterministic variant rotation.
import fs from 'node:fs';
import path from 'node:path';
import {P, download, getJSON, log, py, readJSON, rel, slugify, writeJSON} from './env.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const enc = encodeURIComponent;

let lastOpenverse = 0;
const openverseAudio = async (q, {license = 'cc0', licenseType, pageSize = 20} = {}) => {
	const wait = lastOpenverse + 3300 - Date.now(); // anonymous limit ≈ 20 req/min
	if (wait > 0) await sleep(wait);
	lastOpenverse = Date.now();
	const lic = licenseType ? `license_type=${licenseType}` : `license=${license}`;
	const d = await getJSON(`https://api.openverse.org/v1/audio/?q=${enc(q)}&${lic}&page_size=${pageSize}`);
	return d.results.map((r) => ({
		provider: `openverse:${r.source}`,
		title: r.title ?? '',
		url: r.url,
		duration: (r.duration ?? 0) / 1000,
		license: `${r.license.toUpperCase()} ${r.license_version ?? ''}`.trim(),
		author: r.creator,
		page: r.foreign_landing_url,
		tags: (r.tags ?? []).map((t) => t.name),
	}));
};

const freesound = async (q, [dmin, dmax]) => {
	const filter = `license:"Creative Commons 0" duration:[${dmin} TO ${dmax}]`;
	const d = await getJSON(
		`https://freesound.org/apiv2/search/text/?query=${enc(q)}&filter=${enc(filter)}&fields=id,name,previews,duration,username,url,license,avg_rating,num_downloads,tags&sort=rating_desc&page_size=20&token=${process.env.FREESOUND_API_KEY}`,
	);
	return d.results.map((r) => ({provider: 'freesound', title: r.name, url: r.previews['preview-hq-mp3'], duration: r.duration, license: 'CC0 1.0', author: r.username, page: r.url, tags: r.tags ?? [], rating: r.avg_rating, downloads: r.num_downloads}));
};

const BAD = /\b(music|song|beat ?tape|remix|vocal|singing|speech|talk|podcast|interview|lecture|melody|track)\b/i;

const score = (c, want, bank = 'sfx') => {
	const title = `${c.title} ${(c.tags ?? []).join(' ')}`.toLowerCase();
	const terms = want.query.toLowerCase().split(/\s+/);
	let s = terms.filter((t) => title.includes(t)).length / terms.length;
	if (bank === 'sfx' && BAD.test(c.title)) s -= 0.6;
	if (bank === 'music' && /\b(vocal|lyrics|singing|feat|rap|speech)\b/i.test(c.title)) s -= 0.6;
	if (!want.loop && /\bloop\b/i.test(c.title)) s -= 0.15;
	if (want.loop && /\bloop|ambien|atmos|bed\b/i.test(c.title)) s += 0.15;
	const [a, b] = want.dur;
	if (c.duration < a || c.duration > b) s -= 1;
	if (c.rating) s += (c.rating - 3) * 0.05;
	if (c.downloads) s += Math.min(0.2, Math.log10(1 + c.downloads) * 0.04);
	return s;
};

export const loadIndex = (p = P.sfxIndex) => readJSON(p, {sounds: {}});

/** Build/extend the SFX bank from wishlist.json. Idempotent: skips ids already complete. */
export const buildSfx = async ({only, force = false, bank = 'sfx'} = {}) => {
	const dir = path.join(P.banks, bank);
	const wl = readJSON(path.join(dir, 'wishlist.json'));
	const idxPath = path.join(dir, 'index.json');
	const idx = loadIndex(idxPath);
	const items = wl.sounds.filter((w) => !only || only.some((o) => w.id === o || w.category === o));
	let added = 0;
	for (const want of items) {
		const have = Object.values(idx.sounds).filter((s) => s.group === want.id).length;
		if (have >= want.n && !force) continue;
		let cands = [];
		try {
			cands = process.env.FREESOUND_API_KEY && bank === 'sfx' ? await freesound(want.query, want.dur) : await openverseAudio(want.query, bank === 'music' ? {licenseType: 'commercial,modification'} : {});
		} catch (e) {
			log.warn(`${want.id}: search failed (${e.message})`);
			continue;
		}
		const ranked = cands.map((c) => ({...c, s: score(c, want, bank)})).filter((c) => c.s > 0 && c.url).sort((a, b) => b.s - a.s);
		let k = have;
		for (const c of ranked) {
			if (k >= want.n) break;
			const vid = `${want.id}-${String(k + 1).padStart(2, '0')}`;
			const raw = path.join(dir, '_raw', `${vid}${path.extname(new URL(c.url).pathname) || '.mp3'}`);
			const out = path.join(dir, want.category, `${vid}.mp3`);
			try {
				await download(c.url, raw, {timeoutMs: 120000});
				fs.mkdirSync(path.dirname(out), {recursive: true});
				const a = py('audiokit.py', ['sfx', raw, out, '--max', String(want.loop ? 90 : Math.min(12, want.dur[1])), ...(want.loop ? ['--loop'] : [])], {quiet: true});
				if (a.duration < 0.05) throw new Error('silent after trim');
				idx.sounds[vid] = {
					group: want.id,
					category: want.category,
					file: rel(out),
					tags: [...new Set([...want.tags, ...(c.tags ?? []).slice(0, 8).map((t) => t.toLowerCase())])],
					duration: a.duration,
					peak: a.peak,
					lufs: a.lufs,
					loop: !!want.loop,
					title: c.title,
					license: c.license,
					source: {provider: c.provider, url: c.url, page: c.page, author: c.author},
				};
				fs.rmSync(raw, {force: true});
				k++;
				added++;
				log.ok(`${vid.padEnd(26)} ${a.duration.toFixed(2)}s  ${c.title.slice(0, 50)}`);
			} catch (e) {
				log.warn(`${vid}: ${e.message.split('\n')[0]}`);
			}
		}
		if (k < want.n) log.warn(`${want.id}: only ${k}/${want.n} found — refine its query in wishlist.json`);
		writeJSON(idxPath, idx);
	}
	fs.rmSync(path.join(dir, '_raw'), {recursive: true, force: true});
	log.ok(`${bank} bank: +${added}, total ${Object.keys(idx.sounds).length}`);
	return idx;
};

/** Search the local bank by words (id, group, tags, title). */
export const searchBank = (query, {category, bank = 'sfx', limit = 12} = {}) => {
	const idx = loadIndex(path.join(P.banks, bank, 'index.json'));
	const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
	return Object.entries(idx.sounds)
		.filter(([, s]) => !category || s.category === category)
		.map(([id, s]) => {
			const hay = `${id} ${s.group} ${s.tags.join(' ')} ${s.title}`.toLowerCase();
			const hit = terms.filter((t) => hay.includes(t)).length;
			return {id, group: s.group, category: s.category, duration: s.duration, loop: s.loop, file: s.file, score: hit / terms.length + (s.group === query ? 1 : 0)};
		})
		.filter((r) => r.score > 0)
		.sort((a, b) => b.score - a.score)
		.slice(0, limit);
};

/**
 * Resolve an sfx reference to one indexed sound.
 *  "heartbeat-single-02" exact variant · "heartbeat-single" group (variant rotates by seed) · "heartbeat" best tag match
 */
export const resolveSfx = (ref, seed = 0, bank = 'sfx') => {
	const idx = loadIndex(path.join(P.banks, bank, 'index.json'));
	if (idx.sounds[ref]) return {id: ref, ...idx.sounds[ref]};
	const group = Object.entries(idx.sounds).filter(([, s]) => s.group === ref);
	if (group.length) {
		const [id, s] = group[seed % group.length];
		return {id, ...s};
	}
	const hit = searchBank(ref, {bank})[0];
	return hit ? {id: hit.id, ...idx.sounds[hit.id]} : null;
};

export const listBank = (bank = 'sfx') => {
	const idx = loadIndex(path.join(P.banks, bank, 'index.json'));
	const by = {};
	for (const s of Object.values(idx.sounds)) (by[s.category] ??= new Set()).add(s.group);
	return Object.fromEntries(Object.entries(by).map(([c, g]) => [c, [...g]]));
};

export const fetchOne = async (query, {category = 'misc', n = 2, id, loop = false, dur = [0.2, 20], bank = 'sfx'} = {}) => {
	const dir = path.join(P.banks, bank);
	const wlPath = path.join(dir, 'wishlist.json');
	const wl = readJSON(wlPath, {categories: {}, sounds: []});
	const wid = id ?? slugify(query);
	if (!wl.sounds.find((s) => s.id === wid)) {
		wl.sounds.push({id: wid, category, query, tags: query.toLowerCase().split(/\s+/), dur: loop ? [8, 300] : dur, n, ...(loop ? {loop: true} : {})});
		writeJSON(wlPath, wl);
	}
	return buildSfx({only: [wid], bank});
};
