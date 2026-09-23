// Remotion bridge: bundle the engine once per call, render MP4 or stills from compiled props.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {P, log, py, rel} from './env.mjs';

const req = createRequire(path.join(P.engine, 'package.json'));
const load = async (m) => import(pathToFileURL(req.resolve(m)).href);

let bundled = null;
const getBundle = async () => {
	if (bundled) return bundled;
	const {bundle} = await load('@remotion/bundler');
	log.info('bundling engine …');
	bundled = await bundle({
		entryPoint: path.join(P.engine, 'src', 'index.ts'),
		publicDir: path.join(P.engine, 'public'),
		symlinkPublicDir: true, // episodes/ and banks/ are symlinks — never copy media
		onProgress: () => {},
	});
	return bundled;
};

const chromium = {gl: 'angle', ignoreCertificateErrors: false};

export const renderVideo = async (props, out, {scale = 1, crf = 17, concurrency} = {}) => {
	const {selectComposition, renderMedia} = await load('@remotion/renderer');
	const serveUrl = await getBundle();
	const composition = await selectComposition({serveUrl, id: 'Story', inputProps: props, chromiumOptions: chromium});
	fs.mkdirSync(path.dirname(out), {recursive: true});
	let last = -1;
	const t0 = Date.now();
	await renderMedia({
		serveUrl,
		composition,
		codec: 'h264',
		outputLocation: out,
		inputProps: props,
		scale,
		crf,
		pixelFormat: 'yuv420p',
		audioCodec: 'aac',
		audioBitrate: '256k',
		imageFormat: 'jpeg',
		jpegQuality: 92,
		concurrency: concurrency ?? Math.max(2, Math.min(8, Math.floor(os.cpus().length / 2))),
		chromiumOptions: chromium,
		timeoutInMilliseconds: 120000,
		onProgress: ({progress}) => {
			const p = Math.floor(progress * 20);
			if (p !== last) {
				last = p;
				process.stdout.write(`\r  rendering ${'█'.repeat(p)}${'░'.repeat(20 - p)} ${Math.round(progress * 100)}%`);
			}
		},
	});
	process.stdout.write('\n');
	// master bus: two-pass loudness normalisation to -14 LUFS / -1.2 dBTP (TikTok/Reels/Shorts target)
	const raw = out.replace(/\.mp4$/, '.raw.mp4');
	fs.renameSync(out, raw);
	const m = py('audiokit.py', ['master', raw, out], {quiet: true});
	fs.rmSync(raw, {force: true});
	log.ok(`${rel(out)}  (${((Date.now() - t0) / 1000).toFixed(0)}s, ${(composition.durationInFrames / composition.fps).toFixed(1)}s video, audio ${m.before.lufs}→${m.lufs} LUFS, peak ${m.truePeakDb} dBFS)`);
	return out;
};

export const renderStills = async (props, frames, outDir, {scale = 0.5} = {}) => {
	const {selectComposition, renderStill} = await load('@remotion/renderer');
	const serveUrl = await getBundle();
	const composition = await selectComposition({serveUrl, id: 'Story', inputProps: props, chromiumOptions: chromium});
	fs.mkdirSync(outDir, {recursive: true});
	const files = [];
	for (const {frame, name} of frames) {
		const output = path.join(outDir, `${name}.jpg`);
		await renderStill({serveUrl, composition, output, frame: Math.min(frame, composition.durationInFrames - 1), inputProps: props, scale, imageFormat: 'jpeg', jpegQuality: 88, chromiumOptions: chromium});
		files.push(output);
	}
	return files;
};
