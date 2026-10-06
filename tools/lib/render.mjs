// Remotion bridge: bundle the engine once per operation, render MP4 or stills
// from compiled props, and keep temporary resources bounded to this operation.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {P, ffprobe, log, py, rel} from './env.mjs';

const req = createRequire(path.join(P.engine, 'package.json'));
const load = async (m) => import(pathToFileURL(req.resolve(m)).href);

const chromium = {gl: 'angle', ignoreCertificateErrors: false};
const TEMP_PREFIX = 'storyvideosgenerator-remotion-';
const RUNTIME_VERSION = 1;
const MAX_CONCURRENCY = 32;

const errorInfo = (error) => ({
	name: error?.name ?? 'Error',
	message: error?.message ?? String(error),
});

const elapsed = (start, end = Date.now()) => end - start;

const makeTempDir = (prefix, baseDir = os.tmpdir()) => fs.mkdtempSync(path.join(baseDir, prefix));

const cleanupPath = (pathToRemove, record) => {
	if (!pathToRemove) return;
	try {
		fs.rmSync(pathToRemove, {recursive: true, force: true});
		record.removed = true;
	} catch (error) {
		record.removed = false;
		record.error = errorInfo(error);
	}
};

const writeDiagnostics = (file, diagnostics) => {
	const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
	try {
		fs.writeFileSync(tmp, JSON.stringify(diagnostics, null, 2) + '\n');
		fs.renameSync(tmp, file);
	} catch (error) {
		try {
			fs.rmSync(tmp, {force: true});
		} catch {
			// The diagnostics file is best effort and must never mask the render error.
		}
	}
};

const runtimeFor = async (injected = {}) => {
	const renderer = injected.renderer ?? (await load('@remotion/renderer'));
	const bundle = injected.bundle ?? (await load('@remotion/bundler')).bundle;
	return {
		renderer,
		bundle,
		ffprobe: injected.ffprobe ?? ffprobe,
		py: injected.py ?? py,
		now: injected.now ?? Date.now,
	};
};

/**
 * Bundle into an explicitly owned directory. Remotion otherwise creates an
 * anonymous remotion-webpack-bundle-* directory which cannot be cleaned up
 * reliably after a failed render.
 */
const bundleEngine = async (runtime, onDirectory) => {
	const directory = makeTempDir(TEMP_PREFIX);
	const cleanup = {path: directory, removed: false};
	onDirectory?.(cleanup);
	try {
		const serveUrl = await runtime.bundle({
			entryPoint: path.join(P.engine, 'src', 'index.ts'),
			outDir: directory,
			publicDir: path.join(P.engine, 'public'),
			symlinkPublicDir: true, // episodes/ and banks/ are symlinks — never copy media
			onProgress: () => {},
		});
		return {serveUrl: serveUrl ?? directory, directory};
	} catch (error) {
		cleanupPath(directory, cleanup);
		throw error;
	}
};

const evenVideoDimension = (dimension, scale) => {
	let source = dimension;
	while (Math.round(source * scale) % 2 !== 0) source -= 1;
	return Math.round(source * scale);
};

const expectedMedia = (composition, scale) => ({
	width: evenVideoDimension(composition.width, scale),
	height: evenVideoDimension(composition.height, scale),
	duration: composition.durationInFrames / composition.fps,
	fps: composition.fps,
});

const validateMedia = (file, composition, scale, media, {requireAudio = true} = {}) => {
	const expected = expectedMedia(composition, scale);
	if (!media || !Number.isFinite(media.duration) || media.duration <= 0) {
		throw new Error(`render validation failed for ${rel(file)}: missing or empty duration`);
	}
	if (media.width !== expected.width || media.height !== expected.height) {
		throw new Error(`render validation failed for ${rel(file)}: expected ${expected.width}x${expected.height}, got ${media.width}x${media.height}`);
	}
	// ffmpeg can differ by a few frames after muxing audio, but a materially
	// truncated or extended file is unsafe to publish.
	const durationTolerance = Math.max(0.25, 4 / expected.fps);
	if (Math.abs(media.duration - expected.duration) > durationTolerance) {
		throw new Error(`render validation failed for ${rel(file)}: expected ~${expected.duration.toFixed(2)}s, got ${media.duration.toFixed(2)}s`);
	}
	if (requireAudio && !media.hasAudio) {
		throw new Error(`render validation failed for ${rel(file)}: audio stream is missing`);
	}
	return {
		duration: media.duration,
		width: media.width,
		height: media.height,
		hasAudio: !!media.hasAudio,
	};
};

const renderMediaOptions = ({serveUrl, composition, props, output, scale, crf, concurrency, onProgress}) => ({
	serveUrl,
	composition,
	inputProps: props,
	codec: 'h264',
	outputLocation: output,
	scale,
	crf,
	pixelFormat: 'yuv420p',
	audioCodec: 'aac',
	audioBitrate: '256k',
	imageFormat: 'jpeg',
	jpegQuality: 92,
	concurrency,
	chromiumOptions: chromium,
	timeoutInMilliseconds: 120000,
	overwrite: true,
	onProgress,
});

const resolveConcurrency = (value) => {
	if (value === undefined) return Math.max(2, Math.min(8, Math.floor(os.cpus().length / 2)));
	if (!Number.isInteger(value) || value < 1 || value > MAX_CONCURRENCY) {
		throw new Error(`render concurrency must be a positive integer between 1 and ${MAX_CONCURRENCY}, got ${value}`);
	}
	return value;
};

const renderVideoOperation = async (props, out, options, injectedRuntime) => {
	const {
		scale = 1,
		crf = 17,
		concurrency,
		requireAudio = true,
		runtime: _runtime,
	} = options;
	if (!Number.isFinite(scale) || scale <= 0) throw new Error(`render scale must be positive, got ${scale}`);
	const renderConcurrency = resolveConcurrency(concurrency);

	const runtime = await runtimeFor(injectedRuntime);
	const output = path.resolve(out);
	fs.mkdirSync(path.dirname(output), {recursive: true});
	const workspace = makeTempDir(`.${path.basename(output)}.render-`, path.dirname(output));
	const rendered = path.join(workspace, 'rendered.mp4');
	const mastered = path.join(workspace, 'mastered.mp4');
	const diagnosticsFile = `${output}.runtime.json`;
	const startedAt = runtime.now();
	const diagnostics = {
		version: RUNTIME_VERSION,
		kind: 'video',
		output: out,
		status: 'running',
		startedAt: new Date(startedAt).toISOString(),
		timingsMs: {},
		cleanup: {
			workspace: {path: workspace, removed: false},
			bundle: null,
		},
	};
	let bundleState;
	let result;
	let failure;
	let composition;
	let masterStats;
	try {
		let mark = runtime.now();
		bundleState = await bundleEngine(runtime, (cleanup) => {
			diagnostics.cleanup.bundle = cleanup;
		});
		diagnostics.timingsMs.bundle = elapsed(mark, runtime.now());

		mark = runtime.now();
		composition = await runtime.renderer.selectComposition({
			serveUrl: bundleState.serveUrl,
			id: 'Story',
			inputProps: props,
			chromiumOptions: chromium,
		});
		diagnostics.timingsMs.selectComposition = elapsed(mark, runtime.now());

		let last = -1;
		mark = runtime.now();
		await runtime.renderer.renderMedia(renderMediaOptions({
			serveUrl: bundleState.serveUrl,
			composition,
			props,
			output: rendered,
			scale,
			crf,
			concurrency: renderConcurrency,
			onProgress: ({progress}) => {
				const p = Math.floor(progress * 20);
				if (p !== last) {
					last = p;
					process.stdout.write(`\r  rendering ${'█'.repeat(p)}${'░'.repeat(20 - p)} ${Math.round(progress * 100)}%`);
				}
			},
		}));
		process.stdout.write('\n');
		diagnostics.timingsMs.render = elapsed(mark, runtime.now());

		mark = runtime.now();
		const renderedMedia = runtime.ffprobe(rendered);
		diagnostics.media = {rendered: validateMedia(rendered, composition, scale, renderedMedia, {requireAudio})};
		diagnostics.timingsMs.validateRendered = elapsed(mark, runtime.now());

		mark = runtime.now();
		// Master in the private workspace; the existing output is untouched until
		// both this pass and its validation succeed.
		masterStats = runtime.py('audiokit.py', ['master', rendered, mastered], {quiet: true});
		diagnostics.timingsMs.master = elapsed(mark, runtime.now());

		mark = runtime.now();
		const masteredMedia = runtime.ffprobe(mastered);
		diagnostics.media.mastered = validateMedia(mastered, composition, scale, masteredMedia, {requireAudio});
		diagnostics.timingsMs.validateMastered = elapsed(mark, runtime.now());

		mark = runtime.now();
		fs.renameSync(mastered, output);
		diagnostics.timingsMs.commit = elapsed(mark, runtime.now());
		diagnostics.status = 'ok';
		result = out;
	} catch (error) {
		failure = error;
		diagnostics.status = 'failed';
		diagnostics.error = errorInfo(error);
	} finally {
		if (bundleState && diagnostics.cleanup.bundle && !diagnostics.cleanup.bundle.removed) cleanupPath(bundleState.directory, diagnostics.cleanup.bundle);
		cleanupPath(workspace, diagnostics.cleanup.workspace);
		diagnostics.finishedAt = new Date(runtime.now()).toISOString();
		diagnostics.timingsMs.total = elapsed(startedAt, runtime.now());
		if (masterStats) {
			diagnostics.master = {
				beforeLufs: masterStats.before?.lufs,
				lufs: masterStats.lufs,
				truePeakDb: masterStats.truePeakDb,
			};
		}
		writeDiagnostics(diagnosticsFile, diagnostics);
	}
	if (failure) throw failure;
	log.ok(`${rel(out)}  (${(diagnostics.timingsMs.total / 1000).toFixed(0)}s, ${(composition.durationInFrames / composition.fps).toFixed(1)}s video, audio ${masterStats?.before?.lufs ?? '?'}→${masterStats?.lufs ?? '?'} LUFS, peak ${masterStats?.truePeakDb ?? '?'} dBFS)`);
	return result;
};

export const renderVideo = async (props, out, options = {}) => renderVideoOperation(props, out, options, options.runtime);

const renderStillsOperation = async (props, frames, outDir, options, injectedRuntime) => {
	const {scale = 0.5, runtime: _runtime} = options;
	if (!Number.isFinite(scale) || scale <= 0) throw new Error(`still scale must be positive, got ${scale}`);
	const runtime = await runtimeFor(injectedRuntime);
	fs.mkdirSync(outDir, {recursive: true});
	const diagnosticsFile = path.join(outDir, '.render-runtime.json');
	const startedAt = runtime.now();
	const diagnostics = {
		version: RUNTIME_VERSION,
		kind: 'stills',
		output: outDir,
		status: 'running',
		startedAt: new Date(startedAt).toISOString(),
		timingsMs: {},
		cleanup: {bundle: null, browser: {closed: false}},
		frames: frames.length,
	};
	let bundleState;
	let browser;
	let composition;
	let files = [];
	let failure;
	try {
		let mark = runtime.now();
		bundleState = await bundleEngine(runtime, (cleanup) => {
			diagnostics.cleanup.bundle = cleanup;
		});
		diagnostics.timingsMs.bundle = elapsed(mark, runtime.now());

		mark = runtime.now();
		browser = await runtime.renderer.openBrowser('chrome', {chromiumOptions: chromium});
		diagnostics.timingsMs.openBrowser = elapsed(mark, runtime.now());

		mark = runtime.now();
		composition = await runtime.renderer.selectComposition({
			serveUrl: bundleState.serveUrl,
			id: 'Story',
			inputProps: props,
			chromiumOptions: chromium,
			puppeteerInstance: browser,
		});
		diagnostics.timingsMs.selectComposition = elapsed(mark, runtime.now());

		mark = runtime.now();
		for (const {frame, name} of frames) {
			const output = path.join(outDir, `${name}.jpg`);
			await runtime.renderer.renderStill({
				serveUrl: bundleState.serveUrl,
				composition,
				output,
				frame: Math.min(frame, composition.durationInFrames - 1),
				inputProps: props,
				scale,
				imageFormat: 'jpeg',
				jpegQuality: 88,
				chromiumOptions: chromium,
				puppeteerInstance: browser,
				overwrite: true,
			});
			files.push(output);
		}
		diagnostics.timingsMs.render = elapsed(mark, runtime.now());
		diagnostics.status = 'ok';
	} catch (error) {
		failure = error;
		diagnostics.status = 'failed';
		diagnostics.error = errorInfo(error);
	} finally {
		if (browser) {
			try {
				await browser.close({silent: true});
				diagnostics.cleanup.browser.closed = true;
			} catch (error) {
				diagnostics.cleanup.browser.error = errorInfo(error);
			}
		}
		if (bundleState && diagnostics.cleanup.bundle && !diagnostics.cleanup.bundle.removed) cleanupPath(bundleState.directory, diagnostics.cleanup.bundle);
		diagnostics.finishedAt = new Date(runtime.now()).toISOString();
		diagnostics.timingsMs.total = elapsed(startedAt, runtime.now());
		writeDiagnostics(diagnosticsFile, diagnostics);
	}
	if (failure) throw failure;
	return files;
};

export const renderStills = async (props, frames, outDir, options = {}) => renderStillsOperation(props, frames, outDir, options, options.runtime);
