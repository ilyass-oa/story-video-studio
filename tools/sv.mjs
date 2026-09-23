#!/usr/bin/env node
// sv — Story Video CLI. One entry point for every pipeline step. Run `./sv help`.
import fs from 'node:fs';
import path from 'node:path';
import {P, UserError, config, log, readJSON, rel, writeJSON} from './lib/env.mjs';
import {BRIEF_TEMPLATE, LAYOUT, episode, status} from './lib/episode.mjs';

const argv = process.argv.slice(2);
const flags = {};
const pos = [];
for (let i = 0; i < argv.length; i++) {
	const a = argv[i];
	if (a.startsWith('--')) {
		const [k, v] = a.slice(2).split('=');
		if (v !== undefined) flags[k] = v;
		else if (argv[i + 1] && !argv[i + 1].startsWith('--')) flags[k] = argv[++i];
		else flags[k] = true;
	} else pos.push(a);
}
const [cmd, ...args] = pos;

const HELP = `
sv — story video studio. Run from the project root:  ./sv <command>   (Windows: node tools/sv.mjs <command>)

 START HERE
  go <slug>                              run every mechanical step, stop at each creative/review checkpoint
  status <slug>   (alias: next)          where the episode is + the exact next command + the skill to read
  history                                every finished story (never repeat one) — history/STORIES.md

 PIPELINE (in order)
  new <slug> --title "…" [--source "…"] [--pack noir|atelier] [--theme <look>] [--voice Name] [--pace tense|story|reflective|energetic]
  voice-audition <slug> --voices A,B,C   opening lines in several voices → 02-voice/auditions/ + measured table
  voice <slug> [--voice Name] [--pace …] narrate script.txt (Gemini TTS, [tags] = performance cues) → narration.wav
  voice-import <slug> <file.wav>         use a human recording instead
  voice-use <slug> <take#>               make an earlier take the master again
  align <slug>                           word timestamps → 03-timing/words.json (must be 100% match)
  draft <slug>                           split the narration into scenes → 04-edit/edit.json (then fill it)
  check <slug>                           validate edit.json (templates, words, slots) — no render
  assets <slug> [--review]               resolve every {"find": …} image → 05-assets/ + review.jpg (LOOK at it)
  stills <slug> [--scenes s01,s04]       one settled frame per scene → 06-render/review/stills.jpg
  render <slug> [--scenes s03-s06]       fast 540x960 preview → 06-render/preview.mp4
  render <slug> --final                  1080x1920 final + credits + copy to history/
  review <slug>                          contact sheet + loudness report of the last render

 IMAGES
  img find <slug> <id> "<q1> | <q2>" [--see "<brief>"] [--kind cutout|photo|video] [--providers pexels,met]   candidates + sheet.jpg
  img pick <slug> <id> <#> [--select "object"]    take candidate # from the sheet (select = cut one element out)
  img auto <slug> <id> "<q1> | <q2>" [--see "<brief>"] [--kind cutout]   find + pick the best that passes quality checks
  img add <slug> <id> <file|url> [--kind cutout] [--generated] [--note "…"]   register your own / generated file
  img style <slug> [--style photo|art]            the episode's art direction for generated images → 05-assets/ART.md
  img brief <slug> <id> ["<subject>"]            generation brief for a slot (template composition + ART.md style + checks)
  img review <slug>                              rebuild 05-assets/review.jpg (every chosen image + its words)
  img promote <slug> <id> --tags "a,b"           keep a great asset in banks/images for future videos
  img bank "<words>"                             search reusable images → use "bank:<id>" in slots

 SOUND
  sfx list | sfx search "<words>" [--category impacts] | sfx fetch "<query>" --category <cat> [--loop]
  music list | music search "<mood>" | music fetch "<query>"

 BANK & SETUP
  gallery [--pack noir|atelier]          render every template → engine/gallery/<pack>.jpg (the visual menu)
  looks [--list]                         the themes (palette · accent font · backdrop) → engine/gallery/looks.jpg
  device add <id> <cutout.png> [--screen-prompt "screen"]   add an object-with-screen (TV, monitor…)
  post pack <slug>                       after --final: posting pack (06-render/post/post.json + cover.jpg) for Shorts + Reels
  post check <slug>                      validate titles/captions/hashtags/credits against platform limits (skill 09)
  post host <slug> [--hours 24]          temporary public URL of final.mp4 (Instagram fetches videos from a URL)
  post done <slug> --youtube <url> --instagram <url>   record the published links (never post twice)
  credits <slug> | credits --banks       licences for a video's post description | banks/CREDITS.md for the repo
  studio <slug>                          open Remotion Studio on the episode (frame-by-frame scrubbing)
  setup | doctor                         install everything / health report
`;

const need = (v, what) => {
	if (!v) throw new UserError(`missing ${what}. See ./sv help`);
	return v;
};

const main = async () => {
	switch (cmd) {
		case undefined:
		case 'help':
			console.log(HELP);
			return;
		case 'new': {
			const slug = need(args[0], '<slug>');
			const ep = episode(slug, {mustExist: false});
			const pack = flags.pack ?? config().defaultPack ?? 'noir';
			const looks = readJSON(P.looks);
			if (flags.theme && looks.themes[flags.theme]?.pack !== pack) throw new UserError(`theme "${flags.theme}" is not a ${pack} theme — ./sv looks`);
			const meta = {title: flags.title, source: flags.source};
			const {similar, recent, ensureHistory} = await import('./lib/history.mjs');
			ensureHistory();
			const dup = similar(meta);
			if (dup.length) log.warn(`history/STORIES.md already has: ${dup.map((r) => `${r.title} (${r.date})`).join(', ')} — make sure this is a different story`);
			// variety: never the same look or narrator as the previous two videos
			const rc = recent(2);
			if (!flags.theme) log.warn(`no --theme: defaulting to ${looks.defaults[pack]} — choose the theme that matches the story's energy (./sv looks)`);
			const look = `${pack}/${flags.theme ?? looks.defaults[pack]}`;
			if (rc.looks.includes(look)) {
				const fresh = Object.keys(looks.themes).filter((t) => !rc.looks.includes(`${looks.themes[t].pack}/${t}`));
				log.warn(`look ${look} was used by one of the last two videos — choose by the story's mood from: ${fresh.join(', ')} (./sv looks, then --theme <name>)`);
			}
			if (flags.voice && rc.voices.includes(flags.voice)) log.warn(`narrator ${flags.voice} voiced one of the last two videos — cast another (config/voices.json) unless the story truly needs this voice`);
			for (const d of ['01-script', '02-voice/takes', '03-timing', '04-edit', '05-assets/candidates', '06-render/review']) fs.mkdirSync(path.join(ep.dir, d), {recursive: true});
			if (!fs.existsSync(ep.f('brief'))) fs.writeFileSync(ep.f('brief'), BRIEF_TEMPLATE(slug, pack, meta));
			if (!fs.existsSync(ep.f('script'))) fs.writeFileSync(ep.f('script'), '');
			writeJSON(path.join(ep.dir, 'episode.json'), {slug, pack, ...(meta.title ? {title: meta.title} : {}), ...(meta.source ? {source: meta.source} : {}), ...(flags.theme ? {theme: flags.theme} : {}), ...(flags.voice ? {voice: flags.voice} : {}), ...(flags.pace ? {pace: flags.pace} : {}), created: new Date().toISOString()});
			log.ok(`created ${rel(ep.dir)} (pack: ${pack}, theme: ${flags.theme ?? looks.defaults[pack]})`);
			log.info(`next: write ${LAYOUT.brief} and ${LAYOUT.script}   (read skills/01-story-script/SKILL.md) — or ./sv go ${slug}`);
			return;
		}
		case 'next':
		case 'status': {
			const s = status(need(args[0], '<slug>'));
			log.head(`${s.slug}  (${s.dir})`);
			for (const st of s.steps) console.log(`  ${st.done ? '✓' : '·'} ${st.name}`);
			log.info(`next: ${s.next}`);
			return;
		}
		case 'img': {
			const A = await import('./lib/assets.mjs');
			const [sub, slug, id, third] = args;
			const kind = flags.kind ?? 'cutout';
			const providers = flags.providers ? String(flags.providers).split(',') : undefined;
			// several queries: "a | b | c"; --see "<what the viewer must see>" ranks every candidate against the brief
			const queries = () => need(third, 'query').split('|').map((q) => q.trim()).filter(Boolean);
			const see = flags.see ? String(flags.see) : undefined;
			if (sub === 'find') await A.findCandidates(need(slug, 'slug'), need(id, 'id'), queries(), {kind, providers, see});
			else if (sub === 'pick') await A.pick(slug, id, Number(need(third, '#')), {select: flags.select});
			else if (sub === 'auto') {
				const r = await A.autoAsset(slug, id, queries(), {kind, providers, see, select: flags.select});
				if (!r.ok) log.warn(`${id}: ${r.reason} → look at the sheet, try another query, or (if you can generate images) ./sv img brief ${slug} ${id} "<subject>" --kind ${kind}`);
			} else if (sub === 'add') await A.addAsset(slug, id, need(third, 'file'), {kind, select: flags.select, license: flags.license, note: flags.note, generated: !!flags.generated});
			else if (sub === 'brief') console.log(A.brief(need(slug, 'slug'), need(id, 'id'), third, {kind: flags.kind}).md);
			else if (sub === 'style') A.artDirection(need(slug, 'slug'), {style: flags.style ?? 'photo'});
			else if (sub === 'review') A.reviewSheet(need(slug, 'slug'));
			else if (sub === 'promote') A.promote(slug, id, String(flags.tags ?? id).split(',').map((t) => t.trim()));
			else if (sub === 'bank') console.log(A.bankSearch(need(slug, 'query')));
			else throw new UserError('img subcommands: find | pick | auto | add | style | brief | review | promote | bank');
			return;
		}
		default: {
			const {default: C} = await import('./lib/commands.mjs');
			if (!C[cmd]) throw new UserError(`unknown command "${cmd}". See ./sv help`);
			await C[cmd](args, flags);
		}
	}
};

main().catch((e) => {
	if (e instanceof UserError) {
		log.err(e.message);
		process.exit(2);
	}
	console.error(e);
	process.exit(1);
});
