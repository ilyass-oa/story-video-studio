// edit.json + words.json + banks → props.json (frame-exact, fully resolved). Deterministic.
// The agent decides WHAT (template, emphasis, which image, which story sound). This file decides
// WHEN and HOW MUCH (frames, line breaks, transitions, auto sound design) so it can never drift.
import fs from 'node:fs';
import path from 'node:path';
import {P, fail, py, readJSON, rel} from './env.mjs';
import {episode} from './episode.mjs';
import {resolveSfx} from './sound.mjs';

export const FPS = 30;
const STYLE_MARKS = {'*': 'accent', _: 'script', '~': 'muted', '^': 'pop'};

export const norm = (w) =>
	String(w)
		.toLowerCase()
		.replace(/[’']/g, '')
		.replace(/[^a-z0-9]/g, '');

const lev = (a, b) => {
	const d = Array.from({length: a.length + 1}, (_, i) => [i, ...Array(b.length).fill(0)]);
	for (let j = 1; j <= b.length; j++) d[0][j] = j;
	for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
	return d[a.length][b.length];
};
const same = (a, b) => a === b || (a.length >= 4 && b.length >= 4 && lev(a, b) <= 1);

/** Parse scene markup → tokens [{text, style, hidden, br}] */
export const parseMarkup = (text) => {
	const out = [];
	let style = 'normal';
	let hidden = false;
	for (const raw of String(text).split(/\s+/).filter(Boolean)) {
		if (raw === '/') {
			out.push({br: true});
			continue;
		}
		let t = raw;
		let s = style;
		let h = hidden;
		// opening marks
		while (t.length && (STYLE_MARKS[t[0]] || t[0] === '{')) {
			if (t[0] === '{') h = true;
			else s = STYLE_MARKS[t[0]];
			t = t.slice(1);
		}
		const tokStyle = s;
		const tokHidden = h;
		// closing marks (possibly followed by punctuation)
		let closeStyle = false;
		let closeHidden = false;
		const m = t.match(/^(.*?)([*_~^}]+)([^\w]*)$/);
		if (m && m[1]) {
			for (const c of m[2]) {
				if (c === '}') closeHidden = true;
				else closeStyle = true;
			}
			t = m[1] + m[3];
		}
		out.push({text: t, style: tokStyle, hidden: tokHidden});
		style = closeStyle ? 'normal' : s;
		hidden = closeHidden ? false : h;
	}
	return out;
};

export const display = (t) => t.replace(/^["“”'(]+/, '').replace(/[,;:."”)]+$/g, '').replace(/\.{3}$/, '…');

const kindOf = (t) => (t.style === 'accent' || t.style === 'pop' ? 'accent' : t.style === 'script' ? 'script' : 'normal');
const len = (arr) => arr.reduce((s, t) => s + t.text.length + 1, -1);
const SMALL = /^(a|an|the|of|in|on|at|to|by|his|her|my|it|is|and|or|so|no|not|he|she|we|i|you|its)$/i;

/**
 * Typographic line builder (deterministic):
 * - `/` in the scene text = explicit break (auto-wrapping inside a segment is relaxed ×1.4)
 * - accent words form their own line; a tiny function word next to them ("the", "a", "of his") joins that
 *   line as a small prefix/suffix instead of dangling alone
 * - script words get their own line (drawn overlapping the line above)
 * - normal words are packed to the template's maxLineChars; no single-word orphans
 */
export const assignLines = (toks, maxChars) => {
	const hasExplicit = toks.some((t) => t.br);
	const segments = [[]];
	for (const t of toks) (t.br ? segments.push([]) : segments[segments.length - 1].push(t));
	const lines = [];
	const segOf = []; // explicit segment index of each line (orphan fixes never cross a "/")
	for (const [si, seg] of segments.filter((s) => s.length).entries()) {
		// runs of same kind
		const runs = [];
		for (const t of seg) {
			const k = kindOf(t);
			if (runs.length && runs[runs.length - 1].kind === k) runs[runs.length - 1].toks.push(t);
			else runs.push({kind: k, toks: [t]});
		}
		// tiny normal runs glue onto a neighbouring accent run
		for (let i = 0; i < runs.length; i++) {
			const r = runs[i];
			// a short lead-in shares the accent's line ("monkey's PAW", "only LAUGHED", "found the PAW")
			const tiny = r.kind === 'normal' && r.toks.length <= 2 && len(r.toks) <= 10;
			if (!tiny) continue;
			const next = runs[i + 1];
			const prev = runs[i - 1];
			if ((next?.kind === 'accent' || next?.kind === 'script') && (!prev || prev.kind !== 'normal')) {
				next.toks.unshift(...r.toks);
				next.glued = true;
				runs.splice(i--, 1);
			} else if (prev?.kind === 'accent' && !next) {
				prev.toks.push(...r.toks);
				runs.splice(i--, 1);
			}
		}
		const relax = hasExplicit ? 1.4 : 1;
		for (const r of runs) {
			const limit = r.kind === 'accent' ? Math.max(9, Math.round(maxChars * 0.8)) : r.kind === 'script' ? Math.round(maxChars * 1.1) : Math.round(maxChars * relax);
			let cur = [];
			for (const t of r.toks) {
				const accentWords = [...cur, t].filter((x) => kindOf(x) === 'accent');
				const over = r.kind === 'accent' ? accentWords.length > 1 && len(accentWords) > limit : len([...cur, t]) > limit;
				if (cur.length && over) {
					lines.push(cur);
					segOf.push(si);
					cur = [];
				}
				cur.push(t);
			}
			if (cur.length) {
				lines.push(cur);
				segOf.push(si);
			}
		}
	}
	// no single-word orphan at the end of a normal block
	for (let i = lines.length - 1; i > 0; i--) {
		const a = lines[i - 1];
		const b = lines[i];
		const isNormal = (l) => l.every((t) => kindOf(t) === 'normal');
		if (segOf[i] === segOf[i - 1] && isNormal(a) && isNormal(b) && b.length === 1 && a.length >= 3 && len([a[a.length - 1], ...b]) <= maxChars * 1.2) b.unshift(a.pop());
	}
	return lines;
};

const loadCatalog = () => readJSON(P.catalog);

const stem = (w) => norm(w).replace(/(ies)$/, 'y').replace(/(es|s)$/, '');
const STOPWORDS = new Set(['the', 'a', 'an', 'of', 'and', 'or', 'with', 'in', 'on', 'at', 'to', 'for', 'photo', 'photograph', 'image', 'picture', 'close', 'up', 'closeup', 'old', 'antique', 'vintage', 'dark', 'black', 'white', 'isolated', 'background', 'model', 'full', 'length', 'century', 'his', 'her', 'its']);
/** Which spoken word does this image illustrate? explicit "at" > word shared with the brief > accent > none. */
const anchorFor = (slotVal, toks) => {
	const it = Array.isArray(slotVal) ? null : slotVal;
	const spoken = toks.filter((t) => t.w);
	if (it && typeof it === 'object' && it.at === 'start') return null;
	if (it && typeof it === 'object' && it.at) {
		const hit = spoken.find((t) => norm(t.text) === norm(it.at));
		return hit ? {word: hit, how: 'at'} : {miss: it.at};
	}
	if (it && typeof it === 'object' && (it.see || it.find)) {
		const brief = [it.see, ...(Array.isArray(it.find) ? it.find : [it.find])].filter(Boolean).join(' ');
		const keys = new Set(brief.split(/[^A-Za-z0-9']+/).map(stem).filter((k) => k.length > 2 && !STOPWORDS.has(k)));
		const hit = spoken.find((t) => keys.has(stem(t.text)));
		if (hit) return {word: hit, how: 'brief'};
	}
	return null;
};

/** "£200" → "two" (hundred pounds), "3" → "third"/"three", "III" → "three", "HEART" → "heart"; else the scene's key word. */
const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const ORD = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth'];
const ROMAN = {II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10, XI: 11, XII: 12};
const firstNumberWord = (n) => (n < 20 ? ONES[n] : n < 100 ? TENS[Math.floor(n / 10)] : n < 1000 ? ONES[Math.floor(n / 100)] : n >= 1100 && n < 2100 ? firstNumberWord(Math.floor(n / 100)) : ONES[Math.floor(n / 1000)] ?? '');
const bigWordAnchor = (big, toks) => {
	const spoken = toks.filter((t) => t.w);
	const core = String(big).replace(/[^A-Za-z0-9]/g, '');
	const n = /^\d+$/.test(core) ? Number(core) : ROMAN[core.toUpperCase()];
	// "130" may be said "a hundred and thirty": accept "hundred"/"thousand" too (the first match in speech order wins)
	const want = new Set(n !== undefined ? [firstNumberWord(n), ORD[n], n >= 100 && n < 1000 ? 'hundred' : '', n >= 1000 && n < 1100 ? 'thousand' : ''].filter(Boolean) : [stem(core)]);
	return spoken.find((t) => want.has(norm(t.text)) || want.has(stem(t.text))) ?? spoken.find((t) => t.style === 'accent' || t.style === 'pop') ?? null;
};

export const resolveAsset = (ep, manifest, ref0, want) => {
	const ref = ref0 && typeof ref0 === 'object' && !Array.isArray(ref0) && ref0.id ? ref0.id : ref0;
	if (typeof ref !== 'string') {
		if (ref && ref.gen) fail(`image not generated yet ("${ref.see ?? ''}") — ./sv assets ${ep.slug} writes its brief (candidates/<id>/GENERATE.md); generate, then ./sv img add … --generated`);
		if (ref && ref.find) fail(`image not fetched yet ${JSON.stringify(ref.find)} — run: ./sv assets ${ep.slug}`);
		fail(`bad asset reference ${JSON.stringify(ref)}`);
	}
	let a;
	if (ref.startsWith('bank:')) a = readJSON(P.imageIndex, {assets: {}}).assets[ref.slice(5)];
	else if (ref.startsWith('device:')) a = readJSON(P.deviceIndex, {devices: {}}).devices[ref.slice(7)];
	else a = manifest.assets[ref];
	if (!a) fail(`asset "${ref}" not found (episode manifest, bank:<id> or device:<id>)`);
	if (want === 'cutout' && a.kind !== 'cutout' && a.kind !== 'device') fail(`asset "${ref}" is a ${a.kind}, this slot needs a cutout (transparent PNG). Re-run: ./sv img auto ${ep.slug} ${ref} "<query>" --kind cutout`);
	if (want === 'photo' && a.kind === 'cutout') fail(`asset "${ref}" is a cutout; slot needs a rectangular photo/clip`);
	if (!fs.existsSync(path.join(P.root, a.file))) fail(`asset file missing on disk: ${a.file}`);
	if (a.luma === undefined && a.kind !== 'video') a.luma = py('imagekit.py', ['inspect', path.join(P.root, a.file)], {quiet: true}).luma;
	// framing set in the edit (slot "focus": [x, y] 0..1, "zoom": 1–2.5) wins over the asset's own focus
	const o = ref0 && typeof ref0 === 'object' && !Array.isArray(ref0) ? ref0 : {};
	const focus = o.focus ?? a.focus;
	const zoom = typeof o.zoom === 'number' ? Math.min(2.5, Math.max(1, o.zoom)) : undefined;
	const base = {src: a.file, width: a.width, height: a.height, ...(a.luma !== undefined ? {luma: a.luma} : {}), ...(focus ? {focus} : {}), ...(zoom ? {zoom} : {})};
	if (a.kind === 'video') return {kind: 'video', ...base, durationFrames: Math.round((a.duration ?? 5) * FPS)};
	if (a.kind === 'device') return {kind: 'image', cutout: true, ...base, screen: a.screen};
	return {kind: 'image', cutout: a.kind === 'cutout', ...base};
};

// Automatic sound design (restrained). Groups are resolved against the SFX bank; missing ones are skipped.
const TRANSITION_SFX = {
	'blur-zoom': ['whoosh-soft', 0.42],
	'blur-dissolve': ['whoosh-soft', 0.22],
	'whip-left': ['swish', 0.5],
	'whip-right': ['swish', 0.5],
	'whip-up': ['whoosh-fast', 0.45],
	flash: ['whoosh-deep', 0.5],
	'zoom-through': ['whoosh-fast', 0.45],
	'slide-up': ['paper-slide', 0.4],
	glitch: ['glitch', 0.35],
};
const TEMPLATE_SFX = {
	'pinned-note': [['pin-stick', 14, 0.5, 'start']],
	'tv-screen': [['tv-switch-on', 8, 0.35, 'start']],
	'word-behind': [['hit-deep', 2, 0.4, 'peak']],
	'card-stack': [['camera-shutter', 6, 0.25, 'start']],
	'photo-framed': [['camera-shutter', 4, 0.25, 'start']],
	'phone-screen': [['notification', 16, 0.25, 'start']],
};

export const compile = (slug, {debug = false, range, pendingOk = false} = {}) => {
	let pending = 0; // {"find": …} slots not resolved yet (allowed for ./sv check, not for rendering)
	const ep = episode(slug);
	const edit = readJSON(ep.f('edit'));
	const wordsDoc = readJSON(ep.f('words'));
	const manifest = readJSON(ep.f('manifest'), {assets: {}});
	const catalog = loadCatalog();
	const epMeta = readJSON(path.join(ep.dir, 'episode.json'), {});
	const pack = edit.pack ?? epMeta.pack ?? 'noir';
	const PACK_TR = {noir: {rot: ['blur-zoom', 'whip-up', 'flash', 'blur-zoom', 'zoom-through', 'whip-left'], frames: 9}, atelier: {rot: ['blur-dissolve', 'slide-up', 'blur-dissolve', 'whip-left', 'blur-zoom'], frames: 12}}[pack];
	if (!PACK_TR) fail(`unknown pack "${pack}" (noir | atelier)`);
	// look = pack + theme (palette, accent font, atmosphere) + backdrop — all from the locked menu in looks.json
	const LOOKS = readJSON(P.looks);
	const theme = edit.theme ?? epMeta.theme ?? LOOKS.defaults[pack];
	const th = LOOKS.themes[theme];
	if (!th) fail(`unknown theme "${theme}" — choose one of: ${Object.keys(LOOKS.themes).filter((k) => LOOKS.themes[k].pack === pack).join(', ')} (./sv looks)`);
	if (th.pack !== pack) fail(`theme "${theme}" belongs to the ${th.pack} pack, this episode is ${pack}`);
	const backdrop = edit.backdrop ?? epMeta.backdrop ?? th.backdrop;
	if (!LOOKS.backdrops[pack][backdrop]) fail(`unknown backdrop "${backdrop}" for ${pack} (${Object.keys(LOOKS.backdrops[pack]).join(' | ')})`);
	const voiceFrom = 6; // narration starts 0.2 s in
	const W = wordsDoc.words;
	if (!W?.length) fail('words.json has no words — run ./sv align');
	const fr = (ms) => Math.round((ms / 1000) * FPS) + voiceFrom;
	const errors = [];
	const warnings = [];

	// ── 1. map scene markup onto spoken words, in order ──
	let wp = 0;
	const scenes = edit.scenes.map((sc, si) => {
		const id = sc.id ?? `s${String(si + 1).padStart(2, '0')}`;
		const tpl = catalog.templates[sc.template];
		if (!tpl) errors.push(`${id}: unknown template "${sc.template}" (see engine/src/templates/catalog.json)`);
		const toks = parseMarkup(sc.text ?? '');
		const mapped = [];
		for (const t of toks) {
			if (t.br) {
				mapped.push(t);
				continue;
			}
			const w = W[wp];
			if (!w) {
				errors.push(`${id}: text has more words than the narration ("${t.text}")`);
				break;
			}
			if (!same(norm(t.text), norm(w.text))) {
				errors.push(`${id}: expected spoken word #${wp} "${w.text}" but scene text has "${t.text}" — scene texts must follow the narration word for word (use {word} to hide a spoken word)`);
				break;
			}
			mapped.push({...t, text: display(t.text), w});
			wp++;
		}
		return {id, sc, tpl, toks: mapped};
	});
	if (wp < W.length && !errors.length) errors.push(`narration words #${wp}… ("${W.slice(wp, wp + 6).map((w) => w.text).join(' ')}") are not in any scene`);
	if (errors.length) return {errors, warnings};

	// ── 2. timing: scene boundaries anchored to words ──
	const lastWordEnd = fr(W[W.length - 1].end);
	const total = lastWordEnd + Math.round(FPS * (edit.tailSeconds ?? 1.6));
	const trans = scenes.map((s, i) => (i === 0 ? 'cut' : s.sc.transition ?? PACK_TR.rot[(i - 1) % PACK_TR.rot.length]));
	const froms = scenes.map((s, i) => {
		if (i === 0) return 0;
		const first = s.toks.find((t) => t.w)?.w;
		const prev = scenes[i - 1].toks.filter((t) => t.w).pop()?.w;
		const tf = trans[i] === 'cut' ? 0 : PACK_TR.frames;
		const lead = Math.round(tf * 0.55) + 2;
		const want = fr(first.start) - lead;
		const minB = prev ? fr(prev.end) + 1 : 0;
		return Math.max(minB, Math.min(want, fr(first.start)));
	});
	const variantCount = {};
	const usedAssets = new Map(); // asset id → first scene that used it
	const compiled = scenes.map((s, i) => {
		const from = froms[i];
		const to = i + 1 < scenes.length ? froms[i + 1] : total;
		const duration = to - from;
		const nextTr = i + 1 < scenes.length ? trans[i + 1] : 'cut';
		const tf = PACK_TR.frames;
		const exit = nextTr === 'cut' ? 0 : tf;
		const lines = assignLines(s.toks.filter((t) => t.br || !t.hidden), s.tpl?.maxLineChars ?? 16);
		const words = [];
		lines.forEach((ln, li) => ln.forEach((t) => words.push({text: t.text, style: t.style, line: li, start: fr(t.w.start) - from, end: fr(t.w.end) - from})));
		const nv = s.tpl?.variants?.length ?? 1;
		const autoVariant = (variantCount[s.sc.template] = (variantCount[s.sc.template] ?? -1) + 1);
		const variant = Number.isInteger(s.sc.variant) ? s.sc.variant : autoVariant % nv;
		// limits
		const nWords = s.toks.filter((t) => t.w).length;
		if (s.tpl && nWords > s.tpl.maxWords) warnings.push(`${s.id}: ${nWords} words > ${s.sc.template} max ${s.tpl.maxWords} — split this scene`);
		if (s.tpl && duration / FPS < s.tpl.minSeconds) warnings.push(`${s.id}: only ${(duration / FPS).toFixed(2)}s on screen (< ${s.tpl.minSeconds}s for ${s.sc.template}) — merge with a neighbour or use type-center`);
		if (lines.length > 5) warnings.push(`${s.id}: ${lines.length} text lines — too dense, split the scene`);
		// slots
		const slots = {};
		const anchors = {};
		for (const [name, spec] of Object.entries(s.tpl?.slots ?? {})) {
			let v = s.sc.slots?.[name];
			if (v === undefined && spec.default) v = spec.default;
			if (v === undefined) {
				if (spec.required) errors.push(`${s.id}: template ${s.sc.template} requires slot "${name}" (${spec.kind})`);
				continue;
			}
			const isPending = (x) => x && typeof x === 'object' && !Array.isArray(x) && (x.find || x.gen) && !x.id;
			// one image = one scene. Devices (the TV set…) are props and may repeat.
			for (const it of Array.isArray(v) ? v : [v]) {
				const ref = typeof it === 'string' ? it : it?.id;
				if (!ref || spec.kind === 'string' || ref.startsWith('device:')) continue;
				if (usedAssets.has(ref)) errors.push(`${s.id}: "${ref}" is already used in ${usedAssets.get(ref)} — never reuse an image in one video; find a different image for this line`);
				else usedAssets.set(ref, s.id);
			}
			// a big word lands on the word it stands for (never spoils a reveal) — except the hook frame of the first scene
			if (name === 'bigWord' && typeof v === 'string' && i > 0) {
				const hit = bigWordAnchor(v, s.toks);
				if (hit) anchors.bigWord = fr(hit.w.start) - from;
			}
			if (spec.kind !== 'string' && spec.kind !== 'photos' && spec.kind !== 'cutouts') {
				const an = anchorFor(v, s.toks);
				if (an?.miss) warnings.push(`${s.id}: slot "${name}" at "${an.miss}" — that word is not in this scene`);
				else if (an?.word) anchors[name] = fr(an.word.w.start) - from;
			}
			if (pendingOk && (isPending(v) || (Array.isArray(v) && v.some(isPending)))) {
				pending++;
				continue;
			}
			try {
				if (spec.kind === 'string') slots[name] = String(v);
				else if (spec.kind === 'photos' || spec.kind === 'cutouts') {
					if (!Array.isArray(v)) throw new Error(`slot "${name}" must be an array`);
					if (spec.min && v.length < spec.min) throw new Error(`slot "${name}" needs ≥${spec.min} items`);
					slots[name] = v.slice(0, spec.max ?? 5).map((r) => resolveAsset(ep, manifest, r, spec.kind === 'cutouts' ? 'cutout' : 'photo'));
				} else slots[name] = resolveAsset(ep, manifest, v, spec.kind === 'cutout' ? 'cutout' : spec.kind === 'device' ? 'device' : 'photo');
			} catch (e) {
				errors.push(`${s.id}: ${e.message}`);
			}
		}
		for (const k of Object.keys(s.sc.slots ?? {})) if (!s.tpl?.slots?.[k]) warnings.push(`${s.id}: slot "${k}" is not declared by ${s.sc.template} — ignored`);
		const defaultCam = {'photo-full': 'still', 'card-stack': 'drift', 'outro-hold': 'pull', 'split-panel': 'drift', 'tv-screen': 'push'}[s.sc.template] ?? 'push';
		return {
			id: s.id,
			template: s.sc.template,
			from,
			duration,
			exit,
			transitionIn: trans[i],
			transitionOut: nextTr,
			transitionFrames: tf,
			camera: s.sc.camera ?? defaultCam,
			anchors,
			variant,
			words,
			slots,
			_sc: s.sc,
			_toks: s.toks,
		};
	});
	for (let i = 2; i < compiled.length; i++) if (compiled[i].template === compiled[i - 1].template && compiled[i].template === compiled[i - 2].template) warnings.push(`${compiled[i].id}: 3× ${compiled[i].template} in a row — vary templates`);
	if (errors.length) return {errors, warnings};

	// ── 3. sound: explicit story cues + restrained automatic design ──
	const sfx = [];
	let seed = 0;
	const place = (ref, frame, volume, align = 'start', maxFrames) => {
		const s = resolveSfx(ref, seed++);
		if (!s) {
			warnings.push(`sfx "${ref}" not in bank — ./sv sfx fetch "${ref}" --category <cat>`);
			return;
		}
		const off = align === 'peak' ? Math.round((s.peak ?? 0) * FPS) : 0;
		const natural = Math.ceil(s.duration * FPS) + 2;
		sfx.push({src: s.file, frame: Math.max(0, frame - off), volume, durationFrames: maxFrames ? Math.min(natural, maxFrames) : natural, _id: s.id});
	};
	const auto = edit.autoSfx !== false;
	compiled.forEach((c, i) => {
		const quiet = c._sc.quiet === true;
		if (auto && !quiet && i > 0 && TRANSITION_SFX[c.transitionIn]) {
			const [g, v] = TRANSITION_SFX[c.transitionIn];
			place(g, c.from + Math.round(c.transitionFrames / 2), v * (pack === 'atelier' ? 0.8 : 1), 'peak');
		}
		if (auto && !quiet)
			for (const [g, at, v, al] of TEMPLATE_SFX[c.template] ?? []) {
				const firstWord = Math.max(0, Math.min(...c.words.map((w) => w.start), c.duration) - 6);
				place(g, c.from + firstWord + at, v, al);
			}
		if (auto && !quiet) for (const w of c.words.filter((w) => w.style === 'pop')) place('hit-deep', c.from + w.start, 0.38, 'peak');
		// the hook's key word lands with weight (unless the agent scored s01 itself)
		if (auto && !quiet && i === 0 && !(c._sc.sfx ?? []).length) {
			const key = c.words.find((w) => w.style === 'accent' || w.style === 'pop');
			if (key) place('boom-cinematic', c.from + key.start, 0.45, 'peak');
		}
		for (const cue of c._sc.sfx ?? []) {
			let frame = c.from;
			if (cue.at === 'end') frame = c.from + c.duration;
			else if (typeof cue.at === 'string' && cue.at.startsWith('#')) {
				const t = c._toks.filter((t) => t.w)[Number(cue.at.slice(1)) - 1];
				if (t) frame = fr(t.w.start);
			} else if (cue.at && cue.at !== 'start') {
				const t = c._toks.find((t) => t.w && norm(t.text) === norm(cue.at));
				if (!t) warnings.push(`${c.id}: sfx anchor word "${cue.at}" not in this scene — placed at scene start`);
				else frame = fr(t.w.start);
			}
			frame += Math.round(((cue.offsetMs ?? 0) / 1000) * FPS);
			// "durMs": play only the first part of a long sound (a phrase of a melody), faded out
			place(cue.id, frame, cue.volume ?? 0.7, cue.align ?? 'start', cue.durMs ? Math.round((cue.durMs / 1000) * FPS) : undefined);
		}
	});

	// beds: ambience + music, ducked under narration
	const beds = [];
	const sceneFrame = (ref, dflt) => {
		if (ref === undefined || ref === 'start') return dflt === 'end' ? total : 0;
		if (ref === 'end') return total;
		const c = compiled.find((c) => c.id === ref);
		if (!c) warnings.push(`bed anchor "${ref}" is not a scene id`);
		return c ? c.from : 0;
	};
	for (const a of edit.ambience ?? []) {
		const s = resolveSfx(a.sfx);
		if (!s) {
			warnings.push(`ambience "${a.sfx}" not in bank`);
			continue;
		}
		beds.push({src: s.file, from: sceneFrame(a.from, 'start'), to: sceneFrame(a.to, 'end'), volume: a.volume ?? 0.18, fadeIn: 20, fadeOut: 30, loop: true, duck: a.duck ?? 0.65});
	}
	if (edit.music) {
		const m = resolveSfx(edit.music.id ?? edit.music, 0, 'music');
		if (!m) warnings.push(`music "${edit.music.id ?? edit.music}" not in banks/music`);
		else beds.push({src: m.file, from: 0, to: total, volume: edit.music.volume ?? 0.16, fadeIn: 30, fadeOut: 60, loop: true, duck: edit.music.duck ?? 0.45});
	}

	// narration activity for ducking
	const speech = [];
	for (const w of W) {
		const a = fr(w.start);
		const b = fr(w.end);
		const last = speech[speech.length - 1];
		if (last && a - last[1] < 8) last[1] = b;
		else speech.push([a, b]);
	}

	// silence is an effect: anything still ringing when a quiet scene starts is cut there (3-frame fade)
	for (const q of compiled.filter((c) => c._sc.quiet === true))
		for (const x of sfx) if (x.frame < q.from && x.frame + x.durationFrames > q.from) x.durationFrames = q.from - x.frame + 3;

	const voice = fs.existsSync(ep.f('voice')) ? {src: rel(ep.f('voice')), from: voiceFrom, volume: 1} : null;
	let outScenes = compiled.map(({_sc, _toks, ...c}) => c);
	let duration = total;
	let offset = 0;
	if (range) {
		// render only scenes [a..b] (quick iteration); audio is shifted accordingly
		const [a, b] = range;
		const ia = outScenes.findIndex((s) => s.id === a);
		const ib = outScenes.findIndex((s) => s.id === (b ?? a));
		if (ia < 0 || ib < ia) fail(`bad scene range ${a}-${b}`);
		offset = outScenes[ia].from;
		const end = outScenes[ib].from + outScenes[ib].duration + outScenes[ib].exit;
		duration = end - offset;
		outScenes = outScenes.slice(ia, ib + 1).map((s, k) => ({...s, from: s.from - offset, ...(k === 0 ? {transitionIn: 'cut'} : {})}));
	}
	const props = {
		pack,
		theme,
		backdrop,
		fps: FPS,
		width: 1080,
		height: 1920,
		durationInFrames: duration,
		voice: voice ? {...voice, from: voice.from - offset} : null,
		speech: speech.map(([a, b]) => [a - offset, b - offset]),
		hush: compiled.filter((c) => c._sc.quiet === true).map((c) => [c.from - offset, c.from + c.duration - offset]),
		beds: beds.map((b) => ({...b, from: Math.max(0, b.from - offset), to: Math.min(duration, b.to - offset)})).filter((b) => b.to > b.from),
		sfx: sfx.map((s) => ({...s, frame: s.frame - offset})).filter((s) => s.frame >= 0 && s.frame < duration),
		scenes: outScenes,
		debug,
	};
	if (voice && offset) {
		// start the narration mid-file for a range render
		props.voice.from = voice.from - offset;
	}
	return {props, errors, warnings, summary: {scenes: compiled.length, seconds: +(total / FPS).toFixed(2), sfx: sfx.length, beds: beds.length, pending}};
};

/** Auto-split narration into scenes (draft edit.json the agent then fills). */
export const draft = (slug, {pack} = {}) => {
	const ep = episode(slug);
	const W = readJSON(ep.f('words')).words;
	const MAXW = 8; // hard max words per scene
	const PACKW = 7; // max words when joining clauses
	const MAXMS = 2800;
	const span = (ws) => ws[ws.length - 1].end - ws[0].start;
	// 1. sentences → 2. clauses
	const sentences = [];
	let cur = [];
	const ABBR = /^(mr|mrs|ms|dr|st|jr|sr|prof|mt|no|vs|capt|col|gen|lt|sgt|rev)\.$/i;
	for (const w of W) {
		cur.push(w);
		if (/[.!?…]["”']?$/.test(w.text) && !ABBR.test(w.text)) {
			sentences.push(cur);
			cur = [];
		}
	}
	if (cur.length) sentences.push(cur);
	// one-word dramatic sentences ("Louder." "Slowly.") join the following short sentence(s)
	for (let i = 0; i < sentences.length - 1; i++) {
		if (sentences[i].length <= 2 && sentences[i].length + sentences[i + 1].length <= 4) {
			sentences[i] = [...sentences[i], ...sentences.splice(i + 1, 1)[0]];
			i--;
		}
	}
	const splitAtBreath = (ws) => {
		if (ws.length <= MAXW && span(ws) <= MAXMS) return [ws];
		let best = Math.floor(ws.length / 2);
		let bestGap = -1;
		for (let k = 2; k <= ws.length - 2; k++) {
			const gap = ws[k].start - ws[k - 1].end + (/[,;:—–-]$/.test(ws[k - 1].text) ? 400 : 0) - Math.abs(k - ws.length / 2) * 25;
			if (gap > bestGap) {
				bestGap = gap;
				best = k;
			}
		}
		return [...splitAtBreath(ws.slice(0, best)), ...splitAtBreath(ws.slice(best))];
	};
	const scenes = [];
	for (const sent of sentences) {
		const clauses = [];
		let c = [];
		for (const w of sent) {
			c.push(w);
			if (/[,;:—–-]["”']?$/.test(w.text)) {
				clauses.push(c);
				c = [];
			}
		}
		if (c.length) clauses.push(c);
		// 3. pack clauses
		let pack = [];
		for (const cl of clauses) {
			if (pack.length && (pack.length + cl.length > PACKW || span([...pack, ...cl]) > MAXMS)) {
				scenes.push(...splitAtBreath(pack));
				pack = [];
			}
			pack.push(...cl);
		}
		if (pack.length) scenes.push(...splitAtBreath(pack));
	}
	// a quotation stays in one scene when it is short (never split "The paw. / Wish our boy back.")
	const quoteOpen = (ws) => {
		let open = false;
		for (const w of ws) {
			if (/^["“]/.test(w.text)) open = true;
			if (/.["”][.,!?…]*$/.test(w.text)) open = false;
		}
		return open;
	};
	for (let i = 0; i + 1 < scenes.length; i++) {
		if (quoteOpen(scenes[i]) && scenes[i].length + scenes[i + 1].length <= 9 && span([...scenes[i], ...scenes[i + 1]]) < 3600) {
			scenes[i] = [...scenes[i], ...scenes.splice(i + 1, 1)[0]];
			i--;
		}
	}
	// flash scenes (< 0.75 s) are unreadable: merge forward inside a sentence, else backward
	const ends = (ws) => /[.!?…]["”']?$/.test(ws[ws.length - 1].text) && !ABBR.test(ws[ws.length - 1].text);
	for (let i = 0; i < scenes.length; i++) {
		if (span(scenes[i]) >= 750 || scenes.length === 1) continue;
		if (!ends(scenes[i]) && i + 1 < scenes.length) {
			scenes[i + 1] = [...scenes[i], ...scenes[i + 1]];
			scenes.splice(i--, 1);
		} else if (i > 0) {
			scenes[i - 1] = [...scenes[i - 1], ...scenes[i]];
			scenes.splice(i--, 1);
		}
	}
	const epMeta = readJSON(path.join(ep.dir, 'episode.json'), {});
	return {
		pack: pack ?? epMeta.pack ?? 'noir',
		_help: 'Fill each scene: template (catalog), emphasis marks in text (*accent* _script_ ~muted~ ^pop^, / = line break, {hidden}), slots ({"find": "query", "kind": "cutout|photo"} or an asset id), optional sfx cues. Keep the words exactly as spoken. See skills/04-scene-assembly/SKILL.md',
		music: null,
		ambience: [],
		scenes: scenes.map((ws, i) => ({
			id: `s${String(i + 1).padStart(2, '0')}`,
			seconds: +((ws[ws.length - 1].end - ws[0].start) / 1000).toFixed(2),
			text: ws.map((w) => w.text).join(' '),
			template: '?',
			slots: {},
		})),
	};
};
