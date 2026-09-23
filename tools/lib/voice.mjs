// Narration: casting (config/voices.json) → Gemini TTS take(s) → editor-style master (pause tightening,
// pace targeting, loudness) → measured report. Script may contain inline performance tags in [brackets];
// they are sent to the TTS but never shown on screen or used for alignment.
import fs from 'node:fs';
import path from 'node:path';
import {P, config, fail, log, py, readJSON, rel, writeJSON} from './env.mjs';
import {episode} from './episode.mjs';

export const stripTags = (s) => s.replace(/\[[^\]]*\]/g, ' ').replace(/[ \t]+/g, ' ').replace(/ +([,.!?;:…])/g, '$1').trim();
const countWords = (s) => stripTags(s).split(/\s+/).filter(Boolean).length;

const catalog = () => readJSON(path.join(P.root, 'config', 'voices.json'));

const epMeta = (ep) => readJSON(path.join(ep.dir, 'episode.json'), {});

/** Voice + pace profile for an episode: explicit flag > episode.json > pack default. */
export const casting = (ep, {voice, pace} = {}) => {
	const meta = epMeta(ep);
	const cfg = config();
	const pack = meta.pack ?? 'noir';
	const v = voice ?? meta.voice ?? cfg.packs?.[pack]?.voice ?? 'Algieba';
	const cat = catalog();
	if (!cat.voices[v]) fail(`unknown voice "${v}" — see config/voices.json`);
	const paceName = pace ?? meta.pace ?? (pack === 'noir' ? 'tense' : 'reflective');
	if (!cat.pace[paceName]) fail(`unknown pace "${paceName}" — ${Object.keys(cat.pace).filter((k) => k !== '_doc').join(' | ')}`);
	return {voice: v, info: cat.voices[v], paceName, pace: cat.pace[paceName], pack};
};

const DEFAULT_DIRECTION = ({pack, info}) => {
	const man = info.gender === 'male';
	const who = man ? 'A man' : 'A woman';
	const his = man ? 'his' : 'her';
	if (pack === 'atelier')
		return `# AUDIO PROFILE: The Storyteller
## "Stories that stay with you"
${who} in ${his} thirties with a warm, clear, grounded voice, telling a short story with a quiet lesson to one listener who hangs on every word.

## THE SCENE: A bright room in the morning
Soft window light, a cup of coffee going cold. The narrator loves this story and wants the listener to feel its turn.

### PERFORMANCE
Style: Sincere, warm and captivating, like a friend telling the best story they know. A vocal smile on hopeful lines, real gravity on the turn. Natural and human, never a presenter.
Pace: Conversational momentum. Phrases connect and flow; a brief beat only where the meaning turns; the ending lands without dragging.
Accent: Neutral American English.`;
	return `# AUDIO PROFILE: The Night Narrator
## "Dark stories, told close"
${who} in ${his} forties with a low, textured, magnetic voice, telling a dark story to one listener as if sharing a secret.

## THE SCENE: A dim room at two in the morning
One desk lamp, rain on the window, the listener leaning in. The narrator is gripped by the story and wants the listener to feel every turn.

### PERFORMANCE
Style: Captivating, intimate and suspenseful, like the best late-night storytellers. Conversational and human, never theatrical, never an announcer. Lean into the concrete words that carry each image.
Pace: Gripping forward momentum. Sentences flow into each other and tighten as tension rises; one held beat right before the reveal, then push on.
Accent: Neutral American English.`;
};

const PREAMBLE = 'Synthesize speech for the performance described below. Everything above "#### TRANSCRIPT" is direction: never speak it. Speak ONLY the lines under #### TRANSCRIPT, exactly as written; words in [square brackets] are performance cues, not words to say.';

const buildPrompt = (direction, transcript) => {
	if (/####\s*TRANSCRIPT/i.test(direction)) fail('02-voice/direction.md must not contain the #### TRANSCRIPT header — the script is added automatically');
	return `${PREAMBLE}\n\n${direction.trim()}\n\n#### TRANSCRIPT\n${transcript.trim()}\n`;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const pcmToWav = (pcm, rate = 24000, channels = 1, bits = 16) => {
	const h = Buffer.alloc(44);
	h.write('RIFF', 0);
	h.writeUInt32LE(36 + pcm.length, 4);
	h.write('WAVE', 8);
	h.write('fmt ', 12);
	h.writeUInt32LE(16, 16);
	h.writeUInt16LE(1, 20);
	h.writeUInt16LE(channels, 22);
	h.writeUInt32LE(rate, 24);
	h.writeUInt32LE((rate * channels * bits) / 8, 28);
	h.writeUInt16LE((channels * bits) / 8, 32);
	h.writeUInt16LE(bits, 34);
	h.write('data', 36);
	h.writeUInt32LE(pcm.length, 40);
	return Buffer.concat([h, pcm]);
};

/** One Gemini TTS request → WAV file. Retries on free-tier rate limits (never falls back to anything paid). */
const tts = async ({prompt, voice, model, out}) => {
	if (!process.env.GEMINI_API_KEY) fail('GEMINI_API_KEY missing in config/secrets.env (or record a human voice: ./sv voice-import)');
	for (let attempt = 0; attempt < 3; attempt++) {
		const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
			method: 'POST',
			headers: {'x-goog-api-key': process.env.GEMINI_API_KEY, 'Content-Type': 'application/json'},
			body: JSON.stringify({contents: [{parts: [{text: prompt}]}], generationConfig: {responseModalities: ['AUDIO'], speechConfig: {voiceConfig: {prebuiltVoiceConfig: {voiceName: voice}}}}}),
		});
		const body = await res.json();
		if (res.status === 429 && attempt < 2) {
			const wait = Number(String(body.error?.details?.find((d) => d.retryDelay)?.retryDelay ?? '30').replace('s', '')) || 30;
			log.warn(`free-tier rate limit — waiting ${wait}s and retrying`);
			await sleep((wait + 2) * 1000);
			continue;
		}
		if (!res.ok) fail(`Gemini TTS ${res.status}: ${body.error?.message ?? JSON.stringify(body).slice(0, 300)}${res.status === 429 ? '\n→ free-tier quota reached; try again later (no paid fallback is used)' : ''}`);
		const part = body.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
		if (!part) fail(`Gemini returned no audio (finish: ${body.candidates?.[0]?.finishReason ?? '?'})`);
		const rate = Number(part.inlineData.mimeType?.match(/rate=(\d+)/)?.[1] ?? 24000);
		const pcm = Buffer.from(part.inlineData.data, 'base64');
		fs.mkdirSync(path.dirname(out), {recursive: true});
		fs.writeFileSync(out, pcm.subarray(0, 4).toString() === 'RIFF' ? pcm : pcmToWav(pcm, rate));
		return {usage: body.usageMetadata ?? null};
	}
};

const loadDirection = (ep, cast) => {
	const f = path.join(ep.dir, '02-voice', 'direction.md');
	if (fs.existsSync(f)) {
		// {person} {his} {he} {him} adapt the persona to the cast voice's gender (so auditions can mix genders)
		const m = cast.info.gender === 'male';
		const text = fs
			.readFileSync(f, 'utf8')
			.replace(/\{person\}/g, m ? 'A man' : 'A woman')
			.replace(/\{his\}/g, m ? 'his' : 'her')
			.replace(/\{he\}/g, m ? 'he' : 'she')
			.replace(/\{him\}/g, m ? 'him' : 'her');
		return {text, file: f, custom: true};
	}
	return {text: DEFAULT_DIRECTION(cast), file: null, custom: false};
};

/** Master a take to the pace target: tighten pauses, then (only if still slow) a pitch-safe speed-up ≤ ×1.10. */
export const master = (slug, input, meta = {}, {pace, words} = {}) => {
	const ep = episode(slug);
	const p = pace ?? casting(ep).pace;
	const n = words ?? countWords(fs.readFileSync(ep.f('script'), 'utf8'));
	const args = (tempo) => ['voice', input, ep.f('voice'), '--max-pause', String(p.maxPause), '--dramatic', String(p.dramatic), '--tempo', String(tempo)];
	let r = py('audiokit.py', args(1), {quiet: true});
	let wpm = (n / Math.max(1, r.duration - 0.45)) * 60;
	// aim inside the range (not at its floor): momentum is what keeps people watching
	const target = p.wpm[0] + (p.wpm[1] - p.wpm[0]) * 0.3;
	for (let k = 0, tempo = 1; k < 2 && wpm < target && tempo < 1.1; k++) {
		tempo = +Math.min(1.1, (tempo * target) / wpm).toFixed(3);
		r = py('audiokit.py', args(tempo), {quiet: true});
		wpm = (n / Math.max(1, r.duration - 0.45)) * 60;
	}
	const a = py('audiokit.py', ['analyze', ep.f('voice')], {quiet: true});
	const report = {...meta, source: rel(input), ...r, estWpm: +wpm.toFixed(1), paceTarget: p.wpm, pitchMedianHz: a.pitchMedianHz, pitchStdSt: a.pitchStdSt, mastered: new Date().toISOString()};
	writeJSON(ep.f('voiceMeta'), report);
	log.ok(`narration → ${rel(ep.f('voice'))}  ${r.duration}s · ~${wpm.toFixed(0)} wpm (target ${p.wpm.join('–')}) · ${r.pausesShortened ?? 0} pauses tightened (-${r.silenceRemoved ?? 0}s)${r.tempo > 1 ? ` · tempo ×${r.tempo}` : ''} · intonation ${a.pitchStdSt} st`);
	if (wpm > p.wpm[1] + 10) log.warn('faster than the target — if it feels rushed, remove [very fast] tags or pick a calmer pace profile');
	return report;
};

/** What the take really says vs the script (fast transcription primed with the script). */
export const verify = (slug) => {
	const ep = episode(slug);
	return py('align.py', [ep.f('voice'), ep.f('script'), path.join(ep.dir, '02-voice', 'check.json'), '--check'], {quiet: true});
};

const describe = (c) =>
	[
		c.tagsSpoken.length ? `tag read aloud: ${c.tagsSpoken.join(', ')}` : '',
		c.missing.length ? `skipped: "${c.missing.join('" · "')}"` : '',
		c.changed.length ? `changed: ${c.changed.slice(0, 4).join(' · ')}` : '',
		c.extra.length ? `added: "${c.extra.slice(0, 4).join('" · "')}"` : '',
	]
		.filter(Boolean)
		.join(' | ');

export const narrate = async (slug, {voice, pace, model, take, retries = 2} = {}) => {
	const ep = episode(slug);
	const script = fs.existsSync(ep.f('script')) ? fs.readFileSync(ep.f('script'), 'utf8').trim() : '';
	if (!script) fail(`${rel(ep.f('script'))} is empty — write the spoken words first`);
	const cast = casting(ep, {voice, pace});
	if (voice || pace) writeJSON(path.join(ep.dir, 'episode.json'), {...epMeta(ep), voice: cast.voice, pace: cast.paceName});
	const m = model ?? config().narrator?.model ?? 'gemini-3.1-flash-tts-preview';
	const dir = loadDirection(ep, cast);
	const prompt = buildPrompt(dir.text, script);
	const takesDir = path.join(ep.dir, '02-voice', 'takes');
	const tags = (script.match(/\[[^\]]+\]/g) ?? []).length;
	log.info(`Gemini TTS · ${cast.voice} (${cast.info.gender}, ${cast.info.character}) · pace "${cast.paceName}" · ${countWords(script)} words · ${tags} performance tags · direction: ${dir.custom ? '02-voice/direction.md' : 'pack default'}`);
	const tries = [];
	for (let attempt = 0; attempt <= retries; attempt++) {
		const n = (take ?? (fs.existsSync(takesDir) ? fs.readdirSync(takesDir).filter((f) => f.endsWith('.wav')).length : 0) + 1) + (take ? attempt : 0);
		const out = path.join(takesDir, `take-${String(n).padStart(2, '0')}-${cast.voice}.wav`);
		const {usage} = await tts({prompt, voice: cast.voice, model: m, out});
		writeJSON(out.replace(/\.wav$/, '.json'), {provider: 'gemini', model: m, voice: cast.voice, pace: cast.paceName, prompt, created: new Date().toISOString(), usage});
		const r = master(slug, out, {provider: 'gemini', model: m, voice: cast.voice, pace: cast.paceName}, {pace: cast.pace});
		const c = verify(slug);
		tries.push({out, c, r});
		const clean = c.matchRatio >= 0.985 && !c.tagsSpoken.length;
		(clean ? log.ok : log.warn)(`take ${n}: says the script ${(c.matchRatio * 100).toFixed(1)}%${clean ? '' : ` — ${describe(c)}`}`);
		if (clean) break;
		if (attempt < retries) log.info('re-taking (the model varies between takes) …');
	}
	const best = tries.reduce((x, y) => (y.c.matchRatio - y.c.tagsSpoken.length * 0.05 > x.c.matchRatio - x.c.tagsSpoken.length * 0.05 ? y : x));
	if (best !== tries[tries.length - 1]) master(slug, best.out, {provider: 'gemini', model: m, voice: cast.voice, pace: cast.paceName}, {pace: cast.pace});
	if (best.c.matchRatio < 0.985 || best.c.tagsSpoken.length) {
		log.warn(`no take said the script exactly (best ${(best.c.matchRatio * 100).toFixed(1)}%: ${describe(best.c)})`);
		log.warn('fix the script, not the timing: move tags to the start of a sentence and outside quotes, prefer documented tags ([whispering] [sigh] [serious] [very fast]…), rephrase words the voice stumbles on — then ./sv voice again');
	}
	log.info(`next: ./sv align ${slug} (definitive word check) — and LISTEN to 02-voice/narration.wav`);
	return best;
};

/** Same opening lines in several voices → auditions/ + a measured comparison table. */
export const audition = async (slug, {voices, pace, words = 45} = {}) => {
	const ep = episode(slug);
	const script = fs.readFileSync(ep.f('script'), 'utf8').trim();
	if (!script) fail('write the script first');
	// first sentences up to ~45 spoken words: enough to judge tone, pace and the hook
	const sentences = script.match(/[^.!?…]+[.!?…]+["”']?\s*/g) ?? [script];
	let excerpt = '';
	for (const s of sentences) {
		if (countWords(excerpt + s) > words && excerpt) break;
		excerpt += s;
	}
	const base = casting(ep, {pace});
	const list = voices?.length ? voices : [base.voice];
	const dir = path.join(ep.dir, '02-voice', 'auditions');
	fs.mkdirSync(dir, {recursive: true});
	const m = config().narrator?.model ?? 'gemini-3.1-flash-tts-preview';
	const rows = [];
	for (const v of list) {
		const cast = casting(ep, {voice: v, pace});
		const direction = loadDirection(ep, cast).text;
		const raw = path.join(dir, `${v}.raw.wav`);
		log.info(`audition · ${v} (${cast.info.gender}, ${cast.info.character})`);
		await tts({prompt: buildPrompt(direction, excerpt), voice: v, model: m, out: raw});
		const outFile = path.join(dir, `${v}.wav`);
		const r = py('audiokit.py', ['voice', raw, outFile, '--max-pause', String(cast.pace.maxPause), '--dramatic', String(cast.pace.dramatic)], {quiet: true});
		const a = py('audiokit.py', ['analyze', outFile], {quiet: true});
		fs.rmSync(raw, {force: true});
		rows.push({voice: v, gender: cast.info.gender, character: cast.info.character, seconds: r.duration, estWpm: Math.round((countWords(excerpt) / Math.max(1, r.duration - 0.45)) * 60), pitchHz: a.pitchMedianHz, intonationSt: a.pitchStdSt, file: rel(outFile)});
	}
	console.table(rows);
	// a generation that is far too slow is broken (long silences, garbled audio) — not a slow voice
	for (const r of rows) if (r.estWpm < 90) log.warn(`${r.voice}: ${r.estWpm} wpm — this audition generation failed (silence / garbled); re-run it before judging the voice`);
	log.info(`LISTEN to ${rel(dir)}/*.wav (the user decides by ear). Then: ./sv voice ${slug} --voice <Name>`);
	return rows;
};
