// Shared paths, secrets and process helpers for the `sv` CLI.
import {spawnSync, spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const P = {
	root: ROOT,
	engine: path.join(ROOT, 'engine'),
	catalog: path.join(ROOT, 'engine', 'src', 'templates', 'catalog.json'),
	looks: path.join(ROOT, 'engine', 'src', 'looks.json'),
	episodes: path.join(ROOT, 'episodes'),
	banks: path.join(ROOT, 'banks'),
	sfxIndex: path.join(ROOT, 'banks', 'sfx', 'index.json'),
	musicIndex: path.join(ROOT, 'banks', 'music', 'index.json'),
	imageIndex: path.join(ROOT, 'banks', 'images', 'index.json'),
	deviceIndex: path.join(ROOT, 'banks', 'devices', 'index.json'),
	config: path.join(ROOT, 'config', 'studio.json'),
	secrets: path.join(ROOT, 'config', 'secrets.env'),
	py: path.join(ROOT, 'tools', 'py', '.venv', 'bin', 'python'),
	pyDir: path.join(ROOT, 'tools', 'py'),
};

// secrets.env → process.env (never printed)
if (fs.existsSync(P.secrets)) {
	for (const line of fs.readFileSync(P.secrets, 'utf8').split('\n')) {
		const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
		if (m && m[2] && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
	}
}

export const config = () => (fs.existsSync(P.config) ? JSON.parse(fs.readFileSync(P.config, 'utf8')) : {});

// Image hosts (Wikimedia above all) rate-limit anonymous clients: a User-Agent must carry a contact URL.
// Set "contact" in config/studio.json to your repository URL or a contact page.
const UA = () => `StoryVideosGenerator/2.0 (+${config().contact || 'https://github.com'}; open-source local video tool)`;

export const readJSON = (p, fallback) => {
	if (!fs.existsSync(p)) {
		if (fallback !== undefined) return fallback;
		throw new Error(`missing file: ${rel(p)}`);
	}
	return JSON.parse(fs.readFileSync(p, 'utf8'));
};
export const writeJSON = (p, v) => {
	fs.mkdirSync(path.dirname(p), {recursive: true});
	fs.writeFileSync(p, JSON.stringify(v, null, 2) + '\n');
};
export const rel = (p) => path.relative(ROOT, p);

const C = {dim: '\x1b[2m', red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m', bold: '\x1b[1m', off: '\x1b[0m'};
export const log = {
	info: (...a) => console.log(`${C.cyan}›${C.off}`, ...a),
	ok: (...a) => console.log(`${C.green}✓${C.off}`, ...a),
	warn: (...a) => console.log(`${C.yellow}!${C.off}`, ...a),
	err: (...a) => console.error(`${C.red}✗${C.off}`, ...a),
	dim: (...a) => console.log(C.dim + a.join(' ') + C.off),
	head: (s) => console.log(`\n${C.bold}${s}${C.off}`),
};

export class UserError extends Error {}
export const fail = (msg) => {
	throw new UserError(msg);
};

/** Run the project Python with a script from tools/py; returns parsed JSON stdout when possible. */
export const py = (script, args, {json = true, quiet = false} = {}) => {
	if (!fs.existsSync(P.py)) fail(`Python env missing at ${rel(P.py)} — run ./sv setup`);
	const r = spawnSync(P.py, [path.join(P.pyDir, script), ...args], {encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', quiet ? 'pipe' : 'inherit'], env: {...process.env, TQDM_DISABLE: '1', HF_HUB_DISABLE_PROGRESS_BARS: '1', PYTHONWARNINGS: 'ignore'}});
	if (r.status !== 0) fail(`${script} ${args[0] ?? ''} failed (exit ${r.status})${r.stderr ? `\n${r.stderr.slice(-2000)}` : ''}`);
	if (!json) return r.stdout;
	const out = r.stdout.trim();
	const start = out.search(/[[{]/);
	return JSON.parse(out.slice(start));
};

export const sh = (cmd, args, opts = {}) => {
	const r = spawnSync(cmd, args, {encoding: 'utf8', maxBuffer: 1 << 28, ...opts});
	if (r.status !== 0) fail(`${cmd} failed: ${(r.stderr || '').slice(-1500)}`);
	return r.stdout;
};

export const shAsync = (cmd, args, opts = {}) =>
	new Promise((resolve, reject) => {
		const p = spawn(cmd, args, {stdio: 'inherit', ...opts});
		p.on('exit', (code) => (code === 0 ? resolve() : reject(new UserError(`${cmd} exited ${code}`))));
	});

export const slugify = (s) =>
	s
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[^\w\s-]/g, '')
		.trim()
		.replace(/[\s_]+/g, '-')
		.replace(/-+/g, '-')
		.slice(0, 48);

export const ffprobe = (file) => {
	const out = sh('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=width,height,codec_type,sample_rate,channels', '-of', 'json', file]);
	const j = JSON.parse(out);
	const v = j.streams?.find((s) => s.codec_type === 'video');
	const a = j.streams?.find((s) => s.codec_type === 'audio');
	return {duration: Number(j.format?.duration ?? 0), width: v?.width, height: v?.height, hasAudio: !!a, sampleRate: a ? Number(a.sample_rate) : undefined};
};

export const download = async (url, dest, {headers = {}, timeoutMs = 60000, tries = 4} = {}) => {
	const ctl = new AbortController();
	const t = setTimeout(() => ctl.abort(), timeoutMs);
	try {
		let res;
		// rate-limited (Wikimedia, Openverse…) → wait as asked (Retry-After) or back off 3 s, 8 s, 15 s
		for (let k = 1; ; k++) {
			res = await fetch(url, {headers: {'User-Agent': UA(), ...headers}, signal: ctl.signal, redirect: 'follow'});
			if ((res.status !== 429 && res.status !== 503) || k >= tries) break;
			const wait = Math.min(30, Number(res.headers.get('retry-after')) || [3, 8, 15][k - 1] || 15);
			await new Promise((r) => setTimeout(r, wait * 1000));
		}
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const buf = Buffer.from(await res.arrayBuffer());
		fs.mkdirSync(path.dirname(dest), {recursive: true});
		fs.writeFileSync(dest, buf);
		return {bytes: buf.length, type: res.headers.get('content-type')};
	} finally {
		clearTimeout(t);
	}
};

export const getJSON = async (url, headers = {}) => {
	const res = await fetch(url, {headers: {'User-Agent': UA(), Accept: 'application/json', ...headers}});
	if (!res.ok) throw new Error(`HTTP ${res.status} ${url.replace(/key=[^&]+/, 'key=***')}`);
	return res.json();
};
