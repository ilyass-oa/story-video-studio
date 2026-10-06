// history/STORIES.md — one log of every finished video (so no story is ever made twice) + a backlog.
// The table between the sv markers is maintained by `./sv render <slug> --final`; the rest is free text.
import fs from 'node:fs';
import path from 'node:path';
import {P, log, readJSON, rel} from './env.mjs';
import {episode} from './episode.mjs';

const MD = path.join(P.root, 'history', 'STORIES.md');
const VIDEOS = path.join(P.root, 'history', 'videos');
const START = '<!-- sv:stories -->';
const END = '<!-- /sv:stories -->';
// look = pack/theme, voice = narrator: logged so the next episodes vary them (never the same as the last two)
const COLS = ['date', 'slug', 'title', 'source', 'look', 'voice', 'length', 'hook', 'video', 'posted'];

const TEMPLATE = `# Story history

Every finished video is logged here automatically by \`./sv render <slug> --final\` (the video is
copied to \`history/videos/\`). **Before choosing a story, read this whole file: never repeat a story,
a source or a hook that is already in the table** (a new angle on a used source needs the user's OK).

${START}
| ${COLS.join(' | ')} |
|${COLS.map(() => '---').join('|')}|
${END}

## Backlog — ideas not made yet (add freely; produced ideas move to the table automatically)
- The Monkey's Paw — W. W. Jacobs (1902), public domain — noir
- The Tell-Tale Heart — Edgar Allan Poe (1843), public domain — noir
- The Masque of the Red Death — Edgar Allan Poe (1842), public domain — noir
- The Pied Piper of Hamelin — Hamelin records (1384) + Grimm (1816) — noir
- Bluebeard — Charles Perrault (1697), public domain — noir
- The Legend of Sleepy Hollow — Washington Irving (1820), public domain — noir
- The Signal-Man — Charles Dickens (1866), public domain — noir
- The Picture of Dorian Gray — Oscar Wilde (1890), public domain — noir
- The Mary Celeste — true story (1872), sources: contemporary reports — noir
- The Little Match Girl — H. C. Andersen (1845), public domain — atelier
- The Gift of the Magi — O. Henry (1905), public domain — atelier
- The Emperor's New Clothes — H. C. Andersen (1837), public domain — atelier
`;

/** Every clone starts with an empty log (the file is personal and git-ignored). */
export const ensureHistory = () => {
	fs.mkdirSync(VIDEOS, {recursive: true});
	if (!fs.existsSync(MD)) {
		fs.writeFileSync(MD, TEMPLATE);
		log.ok(`history → ${rel(MD)} (new, empty log with a starter backlog)`);
	}
};

const cell = (v) => String(v ?? '').replace(/\|/g, '/').replace(/\s+/g, ' ').trim();

const readHistoryFile = (file) => {
	if (!fs.existsSync(file)) return {rows: [], text: TEMPLATE};
	const text = fs.readFileSync(file, 'utf8');
	const a = text.indexOf(START);
	const b = text.indexOf(END);
	if (a < 0 || b < 0) return {rows: [], text};
	const lines = text.slice(a + START.length, b).split('\n');
	// columns are read by their header names, so older tables (e.g. with "pack") still parse
	const head = (lines.find((l) => /^\|\s*date\s*\|/.test(l)) ?? `| ${COLS.join(' | ')} |`).split('|').slice(1, -1).map((x) => x.trim());
	const rows = lines
		.filter((l) => l.startsWith('|') && !/^\|\s*-/.test(l) && !/^\|\s*date\s*\|/.test(l))
		.map((l) => {
			const c = l.split('|').slice(1, -1).map((x) => x.trim());
			const r = Object.fromEntries(head.map((k, i) => [k, c[i] ?? '']));
			if (!r.look && r.pack) r.look = r.pack;
			return r;
		});
	return {rows, text};
};

export const readHistory = () => readHistoryFile(MD);

const writeHistory = (rows, file = MD) => {
	const {text} = readHistoryFile(file);
	const base = text.includes(START) ? text : TEMPLATE;
	const table = [`| ${COLS.join(' | ')} |`, `|${COLS.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${COLS.map((k) => cell(r[k])).join(' | ')} |`)].join('\n');
	const out = base.slice(0, base.indexOf(START) + START.length) + '\n' + table + '\n' + base.slice(base.indexOf(END));
	fs.mkdirSync(path.dirname(file), {recursive: true});
	fs.writeFileSync(file, out);
};

/** Copy the final video into history/videos and upsert the story row. */
export const record = (slug) => {
	const ep = episode(slug);
	const final = path.join(ep.dir, '06-render', 'final.mp4');
	if (!fs.existsSync(final)) return null;
	const meta = readJSON(path.join(ep.dir, 'episode.json'), {});
	const script = fs.existsSync(ep.f('script')) ? fs.readFileSync(ep.f('script'), 'utf8').replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim() : '';
	const hook = (script.match(/^[^.!?…]+[.!?…]/) ?? [script.slice(0, 80)])[0];
	const props = readJSON(ep.f('props'), null);
	const date = new Date().toISOString().slice(0, 10);
	const {rows} = readHistory();
	const prev = rows.find((r) => r.slug === slug);
	const video = path.join(VIDEOS, `${prev?.date ?? date}_${slug}.mp4`);
	fs.mkdirSync(VIDEOS, {recursive: true});
	fs.copyFileSync(final, video);
	const row = {
		date: prev?.date ?? date,
		slug,
		title: meta.title ?? slug,
		source: meta.source ?? '',
		look: ((pk) => `${pk}/${props?.theme ?? meta.theme ?? readJSON(P.looks, {defaults: {}}).defaults[pk] ?? ''}`)(props?.pack ?? meta.pack ?? 'noir'),
		voice: readJSON(ep.f('voiceMeta'), {}).voice ?? meta.voice ?? '',
		length: props ? `${(props.durationInFrames / props.fps).toFixed(0)}s` : '',
		hook,
		video: rel(video),
		posted: prev?.posted ?? '',
	};
	writeHistory(prev ? rows.map((r) => (r.slug === slug ? row : r)) : [...rows, row]);
	// a produced idea leaves the backlog
	const md = fs.readFileSync(MD, 'utf8');
	const cleaned = md.split('\n').filter((l) => !(l.startsWith('- ') && md.indexOf(l) > md.indexOf(END) && row.title && l.toLowerCase().includes(String(row.title).toLowerCase()))).join('\n');
	if (cleaned !== md) fs.writeFileSync(MD, cleaned);
	log.ok(`history → ${rel(MD)} + ${rel(video)}`);
	return row;
};

const GENERIC = new Set(['public', 'domain', 'original', 'story', 'stories', 'tale', 'tales', 'parable', 'true', 'adaptation', 'from', 'with', 'smoke', 'test', 'sources', 'folk', 'legend']);
const words = (s) => new Set(String(s).toLowerCase().replace(/[^a-z ]/g, ' ').split(/\s+/).filter((w) => w.length > 3 && !GENERIC.has(w)));

/** Rows that look like the same story (title/source word overlap). */
export const similar = ({title = '', source = ''}) => {
	const q = words(`${title} ${source}`);
	if (!q.size) return [];
	return readHistory().rows.filter((r) => {
		const w = words(`${r.title} ${r.source}`);
		const hit = [...q].filter((x) => w.has(x)).length;
		return hit >= Math.min(2, q.size);
	});
};

/** The looks and voices of the most recent episodes — the next one must differ (skills 02 & 04). */
export const recent = (n = 2) => {
	const rows = readHistory().rows.slice(-n);
	return {looks: rows.map((r) => r.look).filter(Boolean), voices: rows.map((r) => r.voice).filter(Boolean)};
};

const PLATFORMS = ['youtube', 'instagram', 'tiktok'];
const validSlug = (slug) => /^[a-z0-9][a-z0-9-]*$/.test(String(slug));
const validDate = (date) => {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) return false;
	const [year, month, day] = String(date).split('-').map(Number);
	const d = new Date(Date.UTC(year, month - 1, day));
	return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
};
const verifiedUrl = (value) => {
	const url = typeof value === 'string' ? value : value?.url;
	return typeof url === 'string' && /^https?:\/\/\S+$/i.test(url);
};
const allPlatformsPosted = (posted) => posted && PLATFORMS.every((platform) => verifiedUrl(posted[platform]));

/**
 * Remove only the archive named by a well-formed history row. A missing file
 * at that exact, validated path is also safe to clear; anything uncertain
 * leaves the row pointing at its archive for manual recovery.
 */
const clearPostedArchive = (row, slug, videosDir) => {
	if (row.slug !== slug || !validSlug(slug) || !validDate(row.date)) return {clearVideo: false, reason: 'invalid story identity'};
	const video = String(row.video ?? '').trim();
	const expectedName = `${row.date}_${slug}.mp4`;
	const expectedRelative = path.posix.join('history', 'videos', expectedName);
	if (!video || video === '—' || video === '-') return {clearVideo: false, reason: 'no archive path'};
	if (path.isAbsolute(video) || path.posix.normalize(video) !== video || video !== expectedRelative) return {clearVideo: false, reason: 'archive path does not match the story'};
	try {
		if (!fs.lstatSync(videosDir).isDirectory()) return {clearVideo: false, reason: 'history/videos is not a regular directory'};
	} catch {
		return {clearVideo: false, reason: 'history/videos could not be verified'};
	}
	const root = path.resolve(videosDir);
	const target = path.resolve(root, expectedName);
	if (path.dirname(target) !== root) return {clearVideo: false, reason: 'archive path escapes history/videos'};
	try {
		const stat = fs.lstatSync(target);
		if (!stat.isFile()) return {clearVideo: false, reason: 'archive is not a regular file'};
		fs.unlinkSync(target);
		return {clearVideo: true, removed: true};
	} catch (error) {
		if (error?.code === 'ENOENT') return {clearVideo: true, removed: false};
		return {clearVideo: false, reason: 'archive could not be verified'};
	}
};

/** Log where a video was published and retire its single archive after all platforms are verified. */
export const setPosted = (slug, text, {posted, historyFile = MD, videosDir = VIDEOS} = {}) => {
	const {rows} = readHistoryFile(historyFile);
	const row = rows.find((r) => r.slug === slug);
	if (!row) return log.warn(`${slug} is not in history/STORIES.md yet (render --final first)`);
	let next = {...row, posted: text};
	if (allPlatformsPosted(posted) && next.video && !['—', '-'].includes(String(next.video).trim())) {
		const cleanup = clearPostedArchive(next, slug, videosDir);
		if (cleanup.clearVideo) next.video = '';
		else log.warn(`${slug}: all three post links are recorded, but the history archive was retained (${cleanup.reason})`);
	}
	writeHistory(rows.map((r) => (r.slug === slug ? next : r)), historyFile);
};
