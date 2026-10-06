// Measurable editorial checks, not a substitute for watching or listening.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {P} from './env.mjs';

export const spokenTokens = (s) => String(s).replace(/\[[^\]]*\]/g, ' ').split(/\s+/)
	.map((w) => w.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]/g, '')).filter(Boolean);
const media = (v) => Array.isArray(v) ? v.flatMap(media) : v && typeof v === 'object' && ['image', 'video'].includes(v.kind) ? [v] : [];
export const assetVersion = (a) => {
	const hash = crypto.createHash('sha256').update(`${a.source?.url ?? a.file}|${a.created ?? ''}|`);
	const file = path.resolve(P.root, a.file);
	if (fs.existsSync(file)) hash.update(fs.readFileSync(file));
	else hash.update('missing');
	return hash.digest('hex').slice(0, 12);
};
export async function hashFile(file) {
	const hash = crypto.createHash('sha256');
	for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
	return hash.digest('hex');
}

export function auditEpisode({props, edit, wordsDoc, script, assets = {}, soundIndex = {}}) {
	const errors = [], warnings = [];
	const seconds = props.durationInFrames / props.fps;
	if (seconds < 60) errors.push(`final duration ${seconds.toFixed(2)}s is below the required 60s; add earned content, not silence`);
	if (wordsDoc.scriptMatchRatio !== 1) errors.push('alignment must report 100% script match before final export');
	const a = spokenTokens(script), b = wordsDoc.words.map((w) => spokenTokens(w.text).join('')) .filter(Boolean);
	if (JSON.stringify(a) !== JSON.stringify(b)) errors.push('script has changed since alignment, or aligned words differ; re-voice/re-align');
	if (!props.voice) errors.push('narration file is missing');
	const byFile = new Map(Object.values(assets).map((v) => [v.file, v]));
	const used = new Map();
	let imageFrames = 0, textRun = 0, longestText = 0;
	const scenes = props.scenes.map((sc) => {
		const images = Object.values(sc.slots).flatMap(media);
		images.forEach((im) => used.set(im.src, byFile.get(im.src)));
		if (images.length) { imageFrames += sc.duration; textRun = 0; }
		else { textRun += sc.duration; longestText = Math.max(longestText, textRun); }
		return {id: sc.id, template: sc.template, seconds: sc.duration / props.fps, images: images.length,
			firstImageAnchorSeconds: images.length ? Math.max(0, Math.min(...Object.entries(sc.slots).filter(([, v]) => media(v).length).map(([k]) => sc.anchors?.[k] ?? 0))) / props.fps : null};
	});
	const sourced = [...used.values()].filter((v) => v?.source?.provider && v.source.provider !== 'generated').length;
	const generated = [...used.values()].filter((v) => v?.source?.provider === 'generated').length;
	const unknown = used.size - sourced - generated;
	if (!used.size || sourced <= used.size / 2) errors.push(`sourced media must be a majority of used assets (${sourced}/${used.size}; ${unknown} unknown)`);
	const coverage = imageFrames / props.durationInFrames;
	if (coverage <= .5) errors.push(`image-bearing scenes occupy only ${(coverage * 100).toFixed(1)}% of runtime; imagery must carry most of the episode`);
	if (longestText / props.fps > 6) warnings.push(`${(longestText / props.fps).toFixed(1)}s continuous text-only stretch: use concrete evidence or document an intentional pause`);
	if (!scenes[0]?.images || scenes[0].firstImageAnchorSeconds > .5) warnings.push('opening has no immediate image cue; inspect encoded frame 0 and the first second for a recognizable subject');
	if (scenes.filter((s) => s.seconds < 1.2).length > scenes.length / 4) warnings.push('more than a quarter of scenes last under 1.2s; inspect rushed cuts and consider sustained imagery');
	const activeSounds = [...props.sfx, ...props.beds];
	for (const cue of activeSounds) {
		const s = soundIndex[cue.src];
		if (/cymbal/i.test([cue.src, s?.title, s?.group, ...(s?.tags ?? [])].join(' '))) errors.push(`prohibited cymbal sound: ${cue.src}`);
	}
	return {errors: [...new Set(errors)], warnings, metrics: {durationSeconds: seconds, scenes: scenes.length,
		usedAssets: used.size, sourced, generated, unknown, imageSceneCoverage: coverage,
		longestTextOnlySeconds: longestText / props.fps, sfx: props.sfx.length, beds: props.beds.length}, scenes,
		limits: 'Coverage counts authored scene duration, not visible pixels or entrance opacity. Crop, relevance, licensing, voice and first-frame quality require human/editor review.'};
}

export function selectReviewFile(dir, {file, final = false, preview = false} = {}) {
	if (final && preview) throw new Error('choose --final or --preview, not both');
	if (file) return path.resolve(file);
	if (final) return path.join(dir, 'final.mp4');
	const candidates = fs.readdirSync(dir).filter((f) => (preview ? /^preview(?:-.+)?\.mp4$/ : /^(final|preview(?:-.+)?)\.mp4$/).test(f))
		.map((f) => ({file: path.join(dir, f), mtime: fs.statSync(path.join(dir, f)).mtimeMs}));
	candidates.sort((a, b) => b.mtime - a.mtime || a.file.localeCompare(b.file));
	if (!candidates.length) throw new Error('nothing rendered yet');
	return candidates[0].file;
}
