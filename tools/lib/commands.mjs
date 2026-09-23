// Command implementations for `sv` (everything except `new`, `status`, `img`, which live in sv.mjs).
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {P, UserError, config, fail, ffprobe, log, py, readJSON, rel, sh, writeJSON} from './env.mjs';
import {episode} from './episode.mjs';

const need = (v, what) => {
	if (!v) throw new UserError(`missing ${what}. See ./sv help`);
	return v;
};

const C = {};

// ───────────────────────── sound banks ─────────────────────────
C.sfx = async ([sub, q], flags) => {
	const S = await import('./sound.mjs');
	if (sub === 'build') await S.buildSfx({only: flags.only ? String(flags.only).split(',') : undefined, force: !!flags.force});
	else if (sub === 'search') console.table(S.searchBank(need(q, 'query'), {category: flags.category}));
	else if (sub === 'fetch') await S.fetchOne(need(q, 'query'), {category: flags.category ?? 'misc', n: Number(flags.n ?? 2), id: flags.id, loop: !!flags.loop});
	else if (sub === 'list') {
		for (const [c, groups] of Object.entries(S.listBank())) console.log(`${c.padEnd(12)} ${groups.join(', ')}`);
	} else throw new UserError('sfx subcommands: build | search | fetch | list');
};

C.music = async ([sub, q], flags) => {
	const S = await import('./sound.mjs');
	if (sub === 'build') await S.buildSfx({bank: 'music', only: flags.only ? String(flags.only).split(',') : undefined});
	else if (sub === 'search') console.table(S.searchBank(need(q, 'mood'), {bank: 'music'}));
	else if (sub === 'fetch') await S.fetchOne(need(q, 'query'), {bank: 'music', category: flags.category ?? 'misc', n: Number(flags.n ?? 1), id: flags.id, loop: true});
	else if (sub === 'list') {
		for (const [c, groups] of Object.entries(S.listBank('music'))) console.log(`${c.padEnd(12)} ${groups.join(', ')}`);
	} else throw new UserError('music subcommands: build | search | fetch | list');
};

// ───────────────────────── voice & timing ─────────────────────────
C.voice = async ([slug], flags) => {
	const V = await import('./voice.mjs');
	await V.narrate(need(slug, '<slug>'), {voice: flags.voice, pace: flags.pace, model: flags.model, take: flags.take ? Number(flags.take) : undefined, retries: flags.retries !== undefined ? Number(flags.retries) : 2});
};

C['voice-audition'] = async ([slug], flags) => {
	const V = await import('./voice.mjs');
	await V.audition(need(slug, '<slug>'), {voices: flags.voices ? String(flags.voices).split(',').map((s) => s.trim()) : undefined, pace: flags.pace});
};

C['voice-import'] = async ([slug, file]) => {
	const V = await import('./voice.mjs');
	if (!fs.existsSync(need(file, '<file.wav>'))) fail(`not found: ${file}`);
	V.master(need(slug, '<slug>'), path.resolve(file), {provider: 'imported'});
};

C['voice-use'] = async ([slug, take]) => {
	// promote an earlier take to the master
	const V = await import('./voice.mjs');
	const ep = episode(need(slug, '<slug>'));
	const dir = path.join(ep.dir, '02-voice', 'takes');
	const f = fs.readdirSync(dir).find((x) => x.startsWith(`take-${String(need(take, '<take#>')).padStart(2, '0')}`) && x.endsWith('.wav'));
	if (!f) fail(`no take ${take} in ${rel(dir)}`);
	const meta = readJSON(path.join(dir, f.replace(/\.wav$/, '.json')), {});
	V.master(slug, path.join(dir, f), {provider: meta.provider, model: meta.model, voice: meta.voice, pace: meta.pace});
};

C.align = async ([slug], flags) => {
	const ep = episode(need(slug, '<slug>'));
	if (!fs.existsSync(ep.f('voice'))) fail('no narration yet — ./sv voice ' + slug);
	log.info('aligning narration to script (WhisperX, CPU) …');
	const r = py('align.py', [ep.f('voice'), ep.f('script'), ep.f('words'), '--model', flags.model ?? 'small.en', '--language', flags.language ?? 'en'], {quiet: true});
	const doc = readJSON(ep.f('words'));
	log.ok(`${r.words} words, script match ${(r.matchRatio * 100).toFixed(0)}%, ${r.issues} issues → ${rel(ep.f('words'))}`);
	if (r.matchRatio < 0.9) log.warn(`narration differs from the script (match ${(r.matchRatio * 100).toFixed(0)}%). Rough transcript:\n  ${doc.roughTranscript}\n  → the TTS may have skipped/changed words: listen, fix, re-voice.`);
	doc.issues.slice(0, 12).forEach((i) => log.warn(i));
	const a = py('audiokit.py', ['analyze', ep.f('voice'), '--words', ep.f('words')], {quiet: true});
	log.info(`voice: ${a.wpm} wpm · ${a.pauses['>1.0s']} pauses >1 s (max ${a.pauses.max}s) · intonation ${a.pitchStdSt} st → ${a.verdict.join(' · ')}`);
	if (r.matchRatio < 0.99) log.warn('the voice did not say the script exactly — listen to the flagged words; re-voice if a word is wrong or missing');
	log.info(`next: ./sv draft ${slug}`);
};

// ───────────────────────── edit ─────────────────────────
C.draft = async ([slug], flags) => {
	const {draft} = await import('./compile.mjs');
	const ep = episode(need(slug, '<slug>'));
	if (fs.existsSync(ep.f('edit')) && !flags.force) fail(`${rel(ep.f('edit'))} exists — pass --force to overwrite`);
	const d = draft(slug, {pack: flags.pack});
	writeJSON(ep.f('edit'), d);
	log.ok(`${d.scenes.length} scenes → ${rel(ep.f('edit'))}`);
	d.scenes.forEach((s) => log.dim(`  ${s.id} ${String(s.seconds).padStart(5)}s  ${s.text}`));
	log.info('next: fill template / emphasis / slots for every scene (skills/04-scene-assembly), then ./sv check ' + slug);
};

const printIssues = (r) => {
	r.warnings?.forEach((w) => log.warn(w));
	r.errors?.forEach((e) => log.err(e));
};

C.check = async ([slug]) => {
	const {compile} = await import('./compile.mjs');
	const r = compile(need(slug, '<slug>'), {pendingOk: true});
	printIssues(r);
	if (r.errors.length) fail(`${r.errors.length} error(s) — fix edit.json`);
	log.ok(`edit.json valid: ${r.summary.scenes} scenes, ${r.summary.seconds}s, ${r.summary.sfx} sfx, ${r.summary.beds} beds${r.summary.pending ? ` — ${r.summary.pending} image slot(s) to fetch or generate — ./sv assets` : ''}`);
	for (const s of r.props.scenes) log.dim(`  ${s.id} ${(s.from / 30).toFixed(2).padStart(6)}s +${(s.duration / 30).toFixed(2)}s  ${s.template.padEnd(16)} ${s.transitionIn.padEnd(12)} ${s.words.map((w, k) => (k && w.line !== s.words[k - 1].line ? '/ ' : '') + (w.style === 'normal' ? w.text : w.style === 'accent' ? `*${w.text}*` : w.style === 'script' ? `_${w.text}_` : w.style === 'pop' ? `^${w.text}^` : `~${w.text}~`)).join(' ')}`);
};

// Resolve every {"find": …} slot into its own registered asset (the slot keeps its brief + gets "id"),
// then build the review sheet. One image per scene: the same source can never be picked twice.
C.assets = async ([slug], flags) => {
	const A = await import('./assets.mjs');
	const ep = episode(need(slug, '<slug>'));
	const edit = readJSON(ep.f('edit'));
	const catalog = readJSON(P.catalog);
	const failed = [];
	const briefs = new Map();
	for (const sc of edit.scenes)
		for (const [slot, v] of Object.entries(sc.slots ?? {}))
			for (const it of Array.isArray(v) ? v : [v])
				if (it && typeof it === 'object' && (it.find || it.gen)) {
					const key = String(it.see ?? it.find).toLowerCase();
					if (briefs.has(key)) fail(`${sc.id}.${slot} repeats the brief of ${briefs.get(key)} ("${key}") — every scene shows something different: describe what is specific to THIS line`);
					briefs.set(key, `${sc.id}.${slot}`);
				}
	const toGenerate = [];
	const resolveOne = async (v, sceneId, slot, k, spec) => {
		if (!v || typeof v !== 'object' || !(v.find || v.gen)) return v;
		const kind = v.kind ?? (spec?.kind === 'cutout' || spec?.kind === 'cutouts' ? 'cutout' : 'photo');
		const id = v.id ?? `${sceneId}-${slot}${k === null ? '' : `-${k + 1}`}`;
		if (A.loadManifest(ep).assets[v.id ?? id]) return {...v, id: v.id ?? id}; // already fetched, picked or generated
		// "gen": true → no searching: this moment is made with the agent's own image tool (brief + checks written now)
		if (v.gen) {
			const b = A.brief(slug, id, undefined, {kind});
			toGenerate.push({id, file: b.file});
			return v;
		}
		if (flags.review) {
			await A.findCandidates(slug, id, v.find, {kind, providers: v.providers, see: v.see});
			return v;
		}
		const r = await A.autoAsset(slug, id, v.find, {kind, select: v.select, providers: v.providers, see: v.see}).catch((e) => (log.warn(`${id}: ${e.message.split('\n')[0]}`), {ok: false}));
		if (!r.ok) {
			failed.push({id, query: Array.isArray(v.find) ? v.find[0] : v.find, kind});
			return v;
		}
		return {...v, id};
	};
	for (const sc of edit.scenes) {
		const spec = catalog.templates[sc.template]?.slots ?? {};
		for (const [slot, v] of Object.entries(sc.slots ?? {})) {
			if (Array.isArray(v)) {
				const out = [];
				for (let k = 0; k < v.length; k++) out.push(await resolveOne(v[k], sc.id, slot, k, spec[slot]));
				sc.slots[slot] = out;
			} else sc.slots[slot] = await resolveOne(v, sc.id, slot, null, spec[slot]);
			writeJSON(ep.f('edit'), edit); // save progress after every slot
		}
	}
	if (toGenerate.length) {
		log.info(`${toGenerate.length} slot(s) to GENERATE with your image tool (art direction: 05-assets/ART.md):`);
		toGenerate.forEach((g) => log.info(`  ${g.id} → ${rel(g.file)}`));
	}
	if (flags.review) return log.info(`LOOK at every 05-assets/candidates/<id>/sheet.jpg, then ./sv img pick ${slug} <id> <#> and set "id" on that slot in edit.json`);
	if (failed.length) {
		log.warn(`${failed.length} slot(s) unresolved:`);
		failed.forEach((f) => log.warn(`  ${f.id}: "${f.query}" → open 05-assets/candidates/${f.id}/sheet.jpg and pick, add alternative queries ("find": ["…", "…"]), or — only if you can generate images — ./sv img brief ${slug} ${f.id} "<subject>" --kind ${f.kind}`));
	} else if (!toGenerate.length) log.ok('all slots resolved — now LOOK at 05-assets/review.jpg and write a verdict for every image in review.md');
	A.reviewSheet(slug);
};

// ───────────────────────── render ─────────────────────────
const parseRange = (s) => (s ? String(s).split(/[-,]/) : undefined);

const compileOrDie = async (slug, opts) => {
	const {compile} = await import('./compile.mjs');
	const r = compile(slug, opts);
	printIssues(r);
	if (r.errors.length) fail(`${r.errors.length} error(s) — run ./sv check ${slug}`);
	return r;
};

C.stills = async ([slug], flags) => {
	const ep = episode(need(slug, '<slug>'));
	const r = await compileOrDie(slug, {});
	const {renderStills} = await import('./render.mjs');
	const only = flags.scenes ? String(flags.scenes).split(',') : null;
	const frames = r.props.scenes
		.filter((s) => !only || only.includes(s.id))
		.map((s) => {
			const settled = s.words.length ? Math.max(...s.words.map((w) => w.end)) + 8 : 20;
			return {frame: s.from + Math.min(s.duration - 2, Math.max(settled, 16)), name: `${s.id}-${s.template}`};
		});
	const dir = path.join(ep.dir, '06-render', 'review', 'stills');
	fs.rmSync(dir, {recursive: true, force: true});
	const files = await renderStills(r.props, frames, dir, {scale: Number(flags.scale ?? 0.5)});
	const sheet = path.join(ep.dir, '06-render', 'review', 'stills.jpg');
	py('imagekit.py', ['sheet', sheet, ...files, '--labels', frames.map((f) => f.name).join('|')], {quiet: true});
	log.ok(`${files.length} stills → ${rel(sheet)} (open it and judge every scene)`);
};

C.render = async ([slug], flags) => {
	const ep = episode(need(slug, '<slug>'));
	const final = !!flags.final;
	const range = parseRange(flags.scenes);
	if (final && !flags.force) {
		const {readVerdicts} = await import('./assets.mjs');
		const v = [...readVerdicts(ep).entries()];
		const open_ = v.filter(([, x]) => !/^\s*(✓|ok\b)/i.test(x));
		if (!v.length) fail(`no image review yet — run ./sv img review ${slug}, look at 05-assets/review.jpg and write a verdict for every image (or --force)`);
		if (open_.length) fail(`${open_.length} image(s) without a ✓ verdict in 05-assets/review.md (${open_.slice(0, 4).map(([k]) => k.split('|')[0]).join(', ')}…) — look, judge, fix or approve each one (or --force)`);
		const md = fs.readFileSync(path.join(ep.dir, '05-assets', 'review.md'), 'utf8');
		const named = md.split('\n').filter((l) => /NAMED PERSON/.test(l)).map((l) => l.split('|')[2]?.trim());
		if (named.length) fail(`${named.join(', ')}: a real, named person stands in for a story character — pick an anonymous image (if the story IS about that person, name them in the slot's "see") and re-run ./sv img review ${slug}`);
	}
	const r = await compileOrDie(slug, {debug: !!flags.debug, range});
	writeJSON(ep.f('props'), r.props);
	const {renderVideo} = await import('./render.mjs');
	const name = final ? 'final.mp4' : range ? `preview-${range.join('-')}.mp4` : 'preview.mp4';
	const out = path.join(ep.dir, '06-render', name);
	await renderVideo(r.props, out, {scale: final ? 1 : Number(flags.scale ?? config().render?.previewScale ?? 0.5), crf: final ? (config().render?.crf ?? 17) : 23});
	if (final) {
		await C.credits([slug]);
		(await import('./history.mjs')).record(slug);
	}
	log.info(`next: ./sv review ${slug}${final ? ' --final' : ''}`);
};

C.review = async ([slug], flags) => {
	const ep = episode(need(slug, '<slug>'));
	const dir = path.join(ep.dir, '06-render');
	const f = flags.file ?? (flags.final || fs.existsSync(path.join(dir, 'final.mp4')) ? path.join(dir, 'final.mp4') : path.join(dir, 'preview.mp4'));
	if (!fs.existsSync(f)) fail(`nothing rendered yet (${rel(f)})`);
	const m = ffprobe(f);
	const out = path.join(dir, 'review');
	fs.mkdirSync(out, {recursive: true});
	const n = Math.min(40, Math.ceil(m.duration));
	const fps = n / m.duration;
	sh('ffmpeg', ['-v', 'error', '-y', '-i', f, '-vf', `fps=${fps.toFixed(4)},scale=216:-1,drawtext=text='%{pts\\:hms}':x=6:y=6:fontsize=14:fontcolor=yellow:box=1:boxcolor=black@0.6,tile=8x${Math.ceil(n / 8)}`, '-frames:v', '1', path.join(out, 'contact.jpg')]);
	const a = py('audiokit.py', ['stats', f], {quiet: true});
	const report = `# Review — ${path.basename(f)}\n\n- duration ${m.duration.toFixed(2)}s, ${m.width}x${m.height}\n- loudness ${a.lufs} LUFS integrated (target -14 ±1), true peak ${a.truePeakDb} dBFS (must be < -1)\n- contact sheet: review/contact.jpg (1 frame per second) · stills: review/stills.jpg\n\n## Director's scorecard (1–5, fix anything below 4 — skills/07-render-review)\n| criterion | score | evidence / fix |\n|---|---|---|\n| hook | | |\n| voice | | |\n| image accuracy | | |\n| variety | | |\n| sync | | |\n| readability | | |\n| sound | | |\n| ending | | |\n`;
	const rp = path.join(out, 'report.md');
	// refresh the measurements, keep a scorecard that was already filled in
	const prev = fs.existsSync(rp) ? fs.readFileSync(rp, 'utf8') : '';
	const keep = prev.indexOf("## Director's scorecard");
	fs.writeFileSync(rp, keep >= 0 ? report.slice(0, report.indexOf("## Director's scorecard")) + prev.slice(keep) : report);
	log.ok(`contact sheet → ${rel(path.join(out, 'contact.jpg'))}`);
	(a.lufs < -16 || a.lufs > -12 ? log.warn : log.ok)(`loudness ${a.lufs} LUFS, true peak ${a.truePeakDb} dBFS`);
};

// sv credits --banks → banks/CREDITS.md: attribution for every bank file (CC BY / BY-SA must be credited
// when the repository is shared; CC0 / public domain listed for provenance)
const bankCredits = () => {
	const rows = [];
	const add = (bank, id, file, title, author, license, page) => rows.push({bank, id, file, title, author, license: license || '?', page: page || ''});
	for (const [bank, key] of [['sfx', 'sounds'], ['music', 'sounds']])
		for (const [id, x] of Object.entries(readJSON(path.join(P.banks, bank, 'index.json'), {[key]: {}})[key] ?? {})) add(bank, id, x.file, x.title, x.source?.author, x.license, x.source?.page ?? x.source?.url);
	for (const [id, x] of Object.entries(readJSON(P.imageIndex, {assets: {}}).assets)) add('images', id, x.file, x.source?.title, x.source?.attribution, x.source?.license ?? x.license, x.source?.page ?? x.source?.url);
	for (const [id, x] of Object.entries(readJSON(P.deviceIndex, {devices: {}}).devices)) add('devices', id, x.file, x.source?.title, x.source?.attribution, x.source?.license, x.source?.page);
	const cc0 = (l) => /cc0|public domain|pdm|pd\b/i.test(l);
	const cell = (v) => String(v ?? '').replace(/\|/g, '/').replace(/\s+/g, ' ').trim();
	const credit = rows.filter((r) => !cc0(r.license));
	const free = rows.filter((r) => cc0(r.license));
	const md = [
		'# Bank credits',
		'',
		'Generated by `./sv credits --banks` from the bank indexes. Items under CC BY / CC BY-SA are credited here',
		'(and must be credited in a video description when used — `./sv credits <slug>` lists what one video used).',
		'CC0 / public-domain items need no credit; they are listed for provenance.',
		'',
		`## Needs attribution (${credit.length})`,
		'',
		'| bank | id | work | author / attribution | licence | source |',
		'|---|---|---|---|---|---|',
		...credit.map((r) => `| ${r.bank} | ${r.id} | ${cell(r.title)} | ${cell(r.author)} | ${cell(r.license)} | ${r.page} |`),
		'',
		`## CC0 / public domain (${free.length})`,
		'',
		'| bank | id | work | author | source |',
		'|---|---|---|---|---|',
		...free.map((r) => `| ${r.bank} | ${r.id} | ${cell(r.title)} | ${cell(r.author)} | ${r.page} |`),
		'',
	].join('\n');
	const f = path.join(P.banks, 'CREDITS.md');
	fs.writeFileSync(f, md);
	log.ok(`bank credits → ${rel(f)} (${credit.length} with attribution, ${free.length} CC0/PD)`);
};

C.credits = async ([slug], flags) => {
	if (flags.banks) return bankCredits();
	const ep = episode(need(slug, '<slug>'));
	const man = readJSON(ep.f('manifest'), {assets: {}});
	const props = readJSON(ep.f('props'), null);
	const lines = [];
	for (const [id, a] of Object.entries(man.assets)) {
		if (a.source?.provider === 'generated') lines.push(`${id}: GENERATED image ("${a.source.prompt ?? ''}") — ${a.source.license}`);
		else if (a.source?.attribution || a.source?.license) lines.push(`${id}: ${a.source.attribution ?? a.source.title ?? ''} — ${a.source.license ?? ''} — ${a.source.page ?? a.source.url ?? ''}`);
	}
	const sfxIdx = readJSON(P.sfxIndex, {sounds: {}});
	const musicIdx = readJSON(P.musicIndex, {sounds: {}});
	const used = new Set([...(props?.sfx ?? []).map((s) => s.src), ...(props?.beds ?? []).map((b) => b.src)]);
	for (const [id, s] of [...Object.entries(sfxIdx.sounds), ...Object.entries(musicIdx.sounds)]) if (used.has(s.file)) lines.push(`${id}: "${s.title}" by ${s.source?.author ?? '?'} — ${s.license} — ${s.source?.page ?? ''}`);
	const f = path.join(ep.dir, '06-render', 'credits.txt');
	fs.writeFileSync(f, `Credits / licences for ${slug}\n(CC0 needs no credit; CC BY / BY-SA items must be credited in the post description)\n\n${lines.join('\n')}\n`);
	log.ok(`credits → ${rel(f)}`);
};

C.studio = async ([slug]) => {
	const ep = episode(need(slug, '<slug>'));
	const r = await compileOrDie(slug, {debug: true});
	writeJSON(ep.f('props'), r.props);
	log.info('opening Remotion Studio (Ctrl+C to stop) …');
	spawnSync('npx', ['remotion', 'studio', 'src/index.ts', `--props=${ep.f('props')}`], {cwd: P.engine, stdio: 'inherit'});
};

// sv looks [--only abyss,gilded] — the theme menu (palette · accent font · backdrop) → engine/gallery/looks.jpg
C.looks = async (_a, flags) => {
	const LOOKS = readJSON(P.looks);
	console.table(Object.fromEntries(Object.entries(LOOKS.themes).map(([k, t]) => [k, {pack: t.pack, backdrop: t.backdrop, use: t.use}])));
	if (flags.list) return;
	const {looks} = await import('./gallery.mjs');
	await looks({only: flags.only ? String(flags.only).split(',') : undefined});
};

C.gallery = async (_a, flags) => {
	const {gallery} = await import('./gallery.mjs');
	await gallery({packs: flags.pack ? [flags.pack] : undefined, only: flags.only ? String(flags.only).split(',') : undefined});
};

// ───────────────────────── device bank (objects with a screen) ─────────────────────────
// sv device add <id> <cutout.png> [--screen-prompt "television screen"] [--screen x,y,w,h] [--tags "tv,retro"]
C.device = async ([sub, id, file], flags) => {
	if (sub === 'list') return console.table(readJSON(P.deviceIndex, {devices: {}}).devices);
	if (sub !== 'add') throw new UserError('device subcommands: add | list');
	need(id, '<id>');
	if (!fs.existsSync(need(file, '<cutout.png>'))) fail(`not found: ${file}`);
	const dest = path.join(P.banks, 'devices', `${id}.png`);
	fs.mkdirSync(path.dirname(dest), {recursive: true});
	fs.copyFileSync(file, dest);
	const info = py('imagekit.py', ['inspect', dest], {quiet: true});
	let screen;
	if (flags.screen) screen = String(flags.screen).split(',').map(Number);
	else {
		const flat = path.join(P.banks, 'devices', `.${id}-flat.jpg`);
		sh(P.py, ['-c', `from PIL import Image;im=Image.open(${JSON.stringify(dest)});bg=Image.new('RGB',im.size,(255,255,255));bg.paste(im,mask=im.getchannel('A'));bg.save(${JSON.stringify(flat)})`]);
		const boxes = py('imagekit.py', ['detect', flat, '--prompt', flags['screen-prompt'] ?? 'screen'], {quiet: true});
		fs.rmSync(flat, {force: true});
		if (!boxes.length) fail('no screen detected — pass --screen x,y,w,h (fractions of the image)');
		const top = boxes[0].score;
		// smallest confident box = the glass, not the whole bezel
		const b = boxes.filter((x) => x.score > top * 0.85).sort((p, q) => (p.box[2] - p.box[0]) * (p.box[3] - p.box[1]) - (q.box[2] - q.box[0]) * (q.box[3] - q.box[1]))[0].box;
		const s = Number(flags.shrink ?? 0.03);
		const [x0, y0, x1, y1] = b;
		const w = x1 - x0;
		const h = y1 - y0;
		screen = [(x0 + w * s) / info.width, (y0 + h * s) / info.height, (w * (1 - 2 * s)) / info.width, (h * (1 - 2 * s)) / info.height].map((v) => +v.toFixed(4));
	}
	const idx = readJSON(P.deviceIndex, {devices: {}});
	idx.devices[id] = {kind: 'device', file: rel(dest), width: info.width, height: info.height, screen, tags: String(flags.tags ?? id).split(','), source: flags.source ?? null};
	writeJSON(P.deviceIndex, idx);
	log.ok(`device:${id} screen=${screen.join(',')} → ${rel(dest)}`);
};

// ───────────────────────── autopilot & history ─────────────────────────
// Runs every mechanical step in order and STOPS at each point that needs judgement (writing, filling
// the edit, looking at images/stills). Safe to run again and again: it resumes where the episode is.
C.go = async ([slug], flags) => {
	const {status} = await import('./episode.mjs');
	need(slug, '<slug>');
	for (let guard = 0; guard < 8; guard++) {
		const s = status(slug);
		const t = s.todo;
		if (!t) return log.ok(`${slug} is finished → history/STORIES.md`);
		log.head(`▶ ${t.name}`);
		if (t.key === 'script') return log.info(`STOP — write the story. Read history/STORIES.md (never repeat a story), then ${t.skill}; write ${s.dir}/01-script/brief.md and script.txt, then ./sv go ${slug}`);
		if (t.key === 'voice') await C.voice([slug], flags);
		else if (t.key === 'timing') await C.align([slug], flags);
		else if (t.key === 'edit') {
			const ep = episode(slug);
			if (!fs.existsSync(ep.f('edit'))) await C.draft([slug], flags);
			return log.info(`STOP — fill every scene of ${s.dir}/04-edit/edit.json (template, *emphasis*, {"find": …} images, sfx). Read ${t.skill} and look at engine/gallery/<pack>.jpg. Then ./sv go ${slug}`);
		} else if (t.key === 'assets') {
			await C.check([slug]);
			await C.assets([slug], flags);
			return log.info(`STOP — open ${s.dir}/05-assets/review.jpg and judge every image against its words (skills/05-image-sourcing/SKILL.md §2). Fix misfits, then write ✓ + reason for each row in review.md. Then ./sv go ${slug}`);
		} else if (t.key === 'render') {
			const ep = episode(slug);
			if (!fs.existsSync(path.join(ep.dir, '06-render', 'review', 'stills.jpg')) || flags.stills) {
				await C.stills([slug], flags);
				return log.info(`STOP — LOOK at ${s.dir}/06-render/review/stills.jpg, fix what is off (skills/07-render-review/SKILL.md), then ./sv render ${slug} (preview) and ./sv render ${slug} --final`);
			}
			return log.info(`stills exist — preview: ./sv render ${slug} · final: ./sv render ${slug} --final (re-check stills: ./sv go ${slug} --stills)`);
		}
	}
};

C.history = async (_a, flags) => {
	const H = await import('./history.mjs');
	H.ensureHistory();
	if (flags.similar) return console.table(H.similar({title: String(flags.similar)}));
	const {rows} = H.readHistory();
	if (!rows.length) return log.info('no finished stories yet — ideas: the backlog in history/STORIES.md');
	console.table(rows.map(({date, title, look, voice, length}) => ({date, title, look, voice, length})));
	log.info('full log + backlog: history/STORIES.md · videos: history/videos/');
};

// ───────────────────────── setup / doctor ─────────────────────────
C.doctor = async () => {
	const ok = (b, m, fix) => (b ? log.ok(m) : log.warn(`${m}${fix ? `  → ${fix}` : ''}`));
	const v = (cmd, args) => spawnSync(cmd, args, {encoding: 'utf8'}).stdout?.trim().split('\n')[0] ?? '';
	log.head('runtime');
	ok(true, `node ${process.version}`);
	ok(!!v('ffmpeg', ['-version']), `ffmpeg ${v('ffmpeg', ['-version']).split(' ')[2] ?? 'MISSING'}`, 'install ffmpeg');
	ok(fs.existsSync(P.py), `python env ${rel(P.py)}`, './sv setup');
	ok(fs.existsSync(path.join(P.engine, 'node_modules', 'remotion')), 'engine node_modules', './sv setup');
	log.head('models (downloaded on first use)');
	ok(fs.existsSync(path.join(P.pyDir, 'models', 'rembg')), 'BiRefNet (cutouts)');
	ok(fs.existsSync(path.join(P.pyDir, 'models', 'hf')), 'CLIP / GroundingDINO / WhisperX align');
	log.head('keys (config/secrets.env — values never shown)');
	for (const k of ['GEMINI_API_KEY', 'PEXELS_API_KEY', 'PIXABAY_API_KEY', 'UNSPLASH_ACCESS_KEY', 'FREESOUND_API_KEY']) ok(!!process.env[k], `${k} ${process.env[k] ? 'set' : 'not set (optional — see config/secrets.example.env)'}`);
	log.head('banks');
	const n = (p, k) => Object.keys(readJSON(p, {[k]: {}})[k]).length;
	ok(n(P.sfxIndex, 'sounds') > 50, `sfx: ${n(P.sfxIndex, 'sounds')} sounds`, './sv sfx build');
	ok(n(P.musicIndex, 'sounds') > 0, `music: ${n(P.musicIndex, 'sounds')} tracks`, './sv music build');
	ok(n(P.deviceIndex, 'devices') > 0, `devices: ${n(P.deviceIndex, 'devices')}`);
	ok(n(P.imageIndex, 'assets') >= 0, `image bank: ${n(P.imageIndex, 'assets')} reusable assets`);
	ok(fs.existsSync(path.join(P.banks, 'textures', 'grain', 'grain-00.png')), 'textures', './sv setup');
	log.head('templates');
	log.dim(Object.keys(readJSON(P.catalog).templates).join(', '));
};

const findPython = () => {
	for (const bin of ['python3.12', 'python3.11', 'python3.13', 'python3', 'python']) {
		const r = spawnSync(bin, ['-c', 'import sys;print(f"{sys.version_info[0]}.{sys.version_info[1]}")'], {encoding: 'utf8'});
		const v = r.stdout?.trim();
		if (r.status === 0 && v && ['3.10', '3.11', '3.12', '3.13'].includes(v)) return bin;
	}
	return null;
};

/** Relative links so the folder works wherever it is cloned. */
const links = () => {
	const pub = path.join(P.engine, 'public');
	fs.mkdirSync(pub, {recursive: true});
	for (const [name, target] of [['banks', '../../banks'], ['episodes', '../../episodes']]) {
		const l = path.join(pub, name);
		if (fs.existsSync(l) && fs.lstatSync(l).isSymbolicLink() && fs.readlinkSync(l) === target) continue;
		fs.rmSync(l, {force: true});
		fs.symlinkSync(target, l);
	}
	const agents = path.join(P.root, '.agents', 'skills');
	fs.mkdirSync(agents, {recursive: true});
	for (const d of fs.readdirSync(path.join(P.root, 'skills')).filter((d) => /^\d\d-/.test(d))) {
		const l = path.join(agents, d);
		if (!fs.existsSync(l)) fs.symlinkSync(`../../skills/${d}`, l);
	}
};

C.setup = async (_a, flags) => {
	log.head('folders & links');
	links();
	fs.mkdirSync(path.join(P.root, 'episodes'), {recursive: true});
	(await import('./history.mjs')).ensureHistory();
	if (!fs.existsSync(P.secrets)) {
		fs.copyFileSync(path.join(P.root, 'config', 'secrets.example.env'), P.secrets);
		log.warn('created config/secrets.env — add your keys (at least GEMINI_API_KEY for narration)');
	}
	log.head('engine (Remotion)');
	spawnSync('npm', ['install', '--no-audit', '--no-fund'], {cwd: P.engine, stdio: 'inherit'});
	log.head('python env (tools/py/.venv)');
	if (!fs.existsSync(P.py)) {
		const bin = findPython();
		if (!bin) fail('need Python 3.10–3.13 (3.12 recommended) on PATH');
		spawnSync(bin, ['-m', 'venv', path.join(P.pyDir, '.venv')], {stdio: 'inherit'});
	}
	spawnSync(P.py, ['-m', 'pip', 'install', '-q', '--upgrade', 'pip'], {stdio: 'inherit'});
	spawnSync(P.py, ['-m', 'pip', 'install', '-q', '-r', path.join(P.pyDir, 'requirements.txt')], {stdio: 'inherit'});
	log.head('textures');
	if (!fs.existsSync(path.join(P.banks, 'textures', 'grain', 'grain-00.png'))) py('make_textures.py', [], {json: false});
	log.ok('textures present');
	if (!flags['skip-banks']) {
		log.head('sfx bank (only missing sounds are fetched)');
		await C.sfx(['build'], {});
		log.head('music bank');
		await C.music(['build'], {});
	}
	await C.doctor();
};

export default C;
