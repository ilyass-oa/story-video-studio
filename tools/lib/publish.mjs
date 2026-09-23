// Publishing: a posting pack per video (YouTube Shorts + Instagram Reels), checked against platform limits,
// a temporary public URL for the video (Instagram fetches videos from a URL), and a log of what was posted.
// The agent writes the words (skill 09); posting itself goes through the agent's own tools (e.g. Composio).
import fs from 'node:fs';
import path from 'node:path';
import {P, fail, log, readJSON, rel, sh, writeJSON} from './env.mjs';
import {episode} from './episode.mjs';

const dir = (ep) => path.join(ep.dir, '06-render', 'post');
const packFile = (ep) => path.join(dir(ep), 'post.json');
const postedFile = (ep) => path.join(dir(ep), 'posted.json');

const briefField = (md, heading) => (md.match(new RegExp(`## ${heading}[^\\n]*\\n([\\s\\S]*?)(\\n## |$)`)) ?? [])[1]?.trim() ?? '';

/**
 * Credits a post description must carry: every CC BY / BY-SA item of 06-render/credits.txt
 * (lines "id: work — licence — url"; CC0, public domain and generated images need none).
 * `who` = the author to name (or the work's title when no author is recorded).
 */
const creditLines = (ep) => {
	const f = path.join(ep.dir, '06-render', 'credits.txt');
	if (!fs.existsSync(f)) return [];
	const out = [];
	for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
		const m = line.match(/^[\w.-]+:\s*(.+?)\s+—\s+([^—]+?)(?:\s+—\s+(\S*))?$/);
		if (!m || /GENERATED/.test(line)) continue;
		const [, work, licence, url] = m;
		if (!/\bBY\b/.test(licence) || /CC0|public domain/i.test(licence)) continue;
		const by = work.match(/\bby\s+([^()—]+?)\s*(?:\(|$)/);
		out.push({credit: `${work.replace(/\s*\((CC )?BY[^)]*\)/, '')} — ${licence.trim()}`, who: (by ? by[1] : work.replace(/"/g, '')).trim(), url: url ?? ''});
	}
	return out;
};

/** Write 06-render/post/: post.json (facts + empty fields for the agent) and cover.jpg (the hook frame). */
export const postPack = (slug, {force = false} = {}) => {
	const ep = episode(slug);
	const final = path.join(ep.dir, '06-render', 'final.mp4');
	if (!fs.existsSync(final)) fail(`no final video yet — ./sv render ${slug} --final`);
	fs.mkdirSync(dir(ep), {recursive: true});
	const meta = readJSON(path.join(ep.dir, 'episode.json'), {});
	const props = readJSON(ep.f('props'), null);
	const brief = fs.existsSync(ep.f('brief')) ? fs.readFileSync(ep.f('brief'), 'utf8') : '';
	const manifest = readJSON(ep.f('manifest'), {assets: {}});
	const generated = Object.values(manifest.assets).filter((a) => a.source?.provider === 'generated').length;
	// cover = the hook frame: the whole first line on screen (just after its last word lands, before the cut)
	let coverMs = 1500;
	if (props?.scenes?.length) {
		const s0 = props.scenes[0];
		const last = Math.max(0, ...s0.words.map((w) => w.end));
		coverMs = Math.round(((s0.from + Math.min(last + 8, s0.duration - 2)) / props.fps) * 1000);
	}
	const cover = path.join(dir(ep), 'cover.jpg');
	sh('ffmpeg', ['-v', 'error', '-y', '-ss', String(coverMs / 1000), '-i', final, '-frames:v', '1', '-q:v', '2', cover]);
	if (fs.existsSync(packFile(ep)) && !force) {
		log.info(`${rel(packFile(ep))} already exists (kept — --force to rebuild); cover refreshed`);
		return readJSON(packFile(ep));
	}
	const duration = props ? +(props.durationInFrames / props.fps).toFixed(1) : null;
	const pack = {
		_doc: 'Fill youtube.* and instagram.* (skill 09), then ./sv post check <slug>. facts are read-only context.',
		facts: {
			title: meta.title ?? slug,
			source: meta.source ?? '',
			hook: briefField(brief, 'Hook'),
			direction: briefField(brief, 'One-sentence creative direction'),
			durationSeconds: duration,
			look: ((pk) => `${pk}/${props?.theme ?? meta.theme ?? readJSON(P.looks, {defaults: {}}).defaults[pk] ?? ''}`)(props?.pack ?? meta.pack ?? 'noir'),
			creditsRequired: creditLines(ep),
			generatedImages: generated,
			aiNarration: readJSON(ep.f('voiceMeta'), {}).provider !== 'imported',
		},
		video: rel(final),
		cover: {file: rel(cover), offsetMs: coverMs},
		youtube: {
			title: '',
			description: '',
			tags: [],
			categoryId: '24',
			privacyStatus: 'public',
			madeForKids: false,
			defaultLanguage: 'en',
			containsSyntheticMedia: false,
			playlist: '',
			pinnedComment: '',
		},
		instagram: {caption: '', shareToFeed: true, thumbOffsetMs: coverMs, firstComment: ''},
		publicVideoUrl: null,
	};
	writeJSON(packFile(ep), pack);
	log.ok(`posting pack → ${rel(packFile(ep))} + ${rel(cover)} — write titles, captions and hashtags (skills/09-publish)`);
	return pack;
};

const hashtags = (s) => (String(s).match(/#[\p{L}\p{N}_]+/gu) ?? []).map((h) => h.toLowerCase());

/** Validate the filled pack against platform limits and the visibility rules of skill 09. */
export const checkPost = (slug) => {
	const ep = episode(slug);
	const p = readJSON(packFile(ep), null);
	if (!p) fail(`no posting pack — ./sv post pack ${slug}`);
	const errors = [];
	const warns = [];
	const y = p.youtube ?? {};
	const ig = p.instagram ?? {};
	// YouTube
	if (!y.title) errors.push('youtube.title is empty');
	if ((y.title ?? '').length > 100) errors.push(`youtube.title is ${y.title.length} chars (max 100)`);
	else if ((y.title ?? '').length > 60) warns.push(`youtube.title is ${y.title.length} chars — keep ≤ 60 so it is not cut on phones`);
	if (/[<>]/.test(y.title ?? '') || /[<>]/.test(y.description ?? '')) errors.push('youtube title/description may not contain < or >');
	if (!y.description) errors.push('youtube.description is empty');
	if ((y.description ?? '').length > 5000) errors.push('youtube.description > 5000 chars');
	const yTags = hashtags(y.description);
	if (yTags.length > 15) errors.push(`youtube.description has ${yTags.length} hashtags (YouTube ignores all past 60; use 3–5)`);
	else if (yTags.length < 2 || yTags.length > 6) warns.push(`youtube.description has ${yTags.length} hashtags — use 3–5 specific ones`);
	if (JSON.stringify(y.tags ?? []).length > 500) errors.push('youtube.tags exceed 500 characters in total');
	if (y.madeForKids !== false) errors.push('youtube.madeForKids must be false (dark stories are not made for kids; it also disables comments)');
	if (!['24', '27', '22', '1'].includes(String(y.categoryId))) warns.push(`youtube.categoryId ${y.categoryId}: stories = 24 Entertainment, true history = 27 Education`);
	// Instagram
	if (!ig.caption) errors.push('instagram.caption is empty');
	if ((ig.caption ?? '').length > 2200) errors.push('instagram.caption > 2200 chars');
	const first = String(ig.caption ?? '').split('\n')[0];
	if (first.length > 125) warns.push(`instagram first line is ${first.length} chars — only ~125 show before "more": put the hook there`);
	const igTags = hashtags(ig.caption);
	if (igTags.length > 30) errors.push(`instagram.caption has ${igTags.length} hashtags (max 30)`);
	else if (igTags.length < 3 || igTags.length > 5) warns.push(`instagram.caption has ${igTags.length} hashtags — Instagram recommends 3–5 relevant ones`);
	if (/https?:\/\//.test(ig.caption ?? '')) warns.push('instagram.caption contains a link (not clickable on Reels) — move sources to a short text line');
	// both: credits + honesty
	for (const c of p.facts?.creditsRequired ?? []) {
		if (!String(y.description).includes(c.who)) errors.push(`youtube.description must credit "${c.who}" (${c.credit})`);
		if (!String(ig.caption).includes(c.who)) errors.push(`instagram.caption must credit "${c.who}" (${c.credit})`);
	}
	if ((p.facts?.generatedImages ?? 0) > 0 && !y.containsSyntheticMedia) warns.push(`${p.facts.generatedImages} generated image(s): if any looks realistic, set youtube.containsSyntheticMedia true (and use Instagram's AI label)`);
	if (p.facts?.hook && !String(y.title + first).toLowerCase().split(/\W+/).some((w) => w.length > 4 && p.facts.hook.toLowerCase().includes(w)))
		warns.push('neither the YouTube title nor the Instagram first line echoes the hook — the words that stop the scroll should appear in both');
	for (const e of errors) log.err(e);
	for (const w of warns) log.warn(w);
	if (!errors.length) log.ok(`posting pack valid (${warns.length} warning(s)) — ${rel(packFile(ep))}`);
	return {errors, warns, pack: p};
};

/** Upload final.mp4 to a temporary public host (Instagram fetches videos from a URL). Returns the URL. */
export const host = async (slug, {hours = 24} = {}) => {
	const ep = episode(slug);
	const final = path.join(ep.dir, '06-render', 'final.mp4');
	if (!fs.existsSync(final)) fail(`no final video — ./sv render ${slug} --final`);
	const time = [1, 12, 24, 72].includes(Number(hours)) ? `${hours}h` : '24h';
	const form = new FormData();
	form.append('reqtype', 'fileupload');
	form.append('time', time);
	form.append('fileToUpload', new Blob([fs.readFileSync(final)], {type: 'video/mp4'}), `${slug}.mp4`);
	const res = await fetch('https://litterbox.catbox.moe/resources/internals/api.php', {method: 'POST', body: form});
	const url = (await res.text()).trim();
	if (!res.ok || !/^https:\/\//.test(url)) fail(`temporary upload failed (${res.status}): ${url.slice(0, 120)}`);
	const p = readJSON(packFile(ep), null);
	if (p) writeJSON(packFile(ep), {...p, publicVideoUrl: url, publicVideoExpires: new Date(Date.now() + parseInt(time) * 3600e3).toISOString()});
	log.ok(`public video URL (expires in ${time}): ${url}`);
	return url;
};

/** Record what was published (never post the same video twice) and log it in history/STORIES.md. */
export const posted = async (slug, links) => {
	const ep = episode(slug);
	const prev = readJSON(postedFile(ep), {});
	const now = {...prev, ...Object.fromEntries(Object.entries(links).filter(([, v]) => v).map(([k, v]) => [k, {url: v, at: new Date().toISOString()}]))};
	writeJSON(postedFile(ep), now);
	const H = await import('./history.mjs');
	H.setPosted(slug, Object.entries(now).map(([k, v]) => `${k === 'youtube' ? 'YT' : k === 'instagram' ? 'IG' : k}: ${v.url}`).join(' · '));
	log.ok(`posted → ${rel(postedFile(ep))} + history`);
	return now;
};

export const alreadyPosted = (slug) => readJSON(postedFile(episode(slug)), {});
