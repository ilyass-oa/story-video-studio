import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {test} from 'node:test';
import {pathToFileURL} from 'node:url';
import {renderStills, renderVideo} from '../lib/render.mjs';

const engineRequire = createRequire(path.join(process.cwd(), 'engine', 'package.json'));
const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'storyvideosgenerator-render-tests-'));
const composition = {width: 1080, height: 1920, durationInFrames: 60, fps: 30};

test.after(() => fs.rmSync(testRoot, {recursive: true, force: true}));

const fakeBundle = async ({outDir}) => {
	fs.writeFileSync(path.join(outDir, 'bundle.js'), 'test bundle');
	return outDir;
};

const validProbe = () => ({duration: 2, width: 1080, height: 1920, hasAudio: true});

const rendererFor = (overrides = {}) => ({
	selectComposition: async () => composition,
	renderMedia: async () => {},
	renderStill: async ({output}) => fs.writeFileSync(output, 'still'),
	...overrides,
});

test('render failure preserves an existing output and cleans owned temp directories', async () => {
	const output = path.join(testRoot, 'failed-render.mp4');
	fs.writeFileSync(output, 'known-good');
	const runtime = {
		bundle: fakeBundle,
		renderer: rendererFor({
			renderMedia: async () => {
				throw new Error('injected render failure');
			},
		}),
	};

	await assert.rejects(renderVideo({}, output, {runtime}), /injected render failure/);
	assert.equal(fs.readFileSync(output, 'utf8'), 'known-good');
	const diagnostics = JSON.parse(fs.readFileSync(`${output}.runtime.json`, 'utf8'));
	assert.equal(diagnostics.status, 'failed');
	assert.equal(diagnostics.error.message, 'injected render failure');
	assert.equal(diagnostics.cleanup.workspace.removed, true);
	assert.equal(diagnostics.cleanup.bundle.removed, true);
	assert.equal(path.dirname(diagnostics.cleanup.workspace.path), path.dirname(output));
	assert.equal(fs.existsSync(diagnostics.cleanup.workspace.path), false);
	assert.equal(fs.existsSync(diagnostics.cleanup.bundle.path), false);
});

test('mastering failure preserves the existing output after valid render media', async () => {
	const output = path.join(testRoot, 'failed-master.mp4');
	fs.writeFileSync(output, 'known-good');
	const runtime = {
		bundle: fakeBundle,
		renderer: rendererFor({
			renderMedia: async ({outputLocation}) => fs.writeFileSync(outputLocation, 'rendered'),
		}),
		ffprobe: validProbe,
		py: () => {
			throw new Error('injected master failure');
		},
	};

	await assert.rejects(renderVideo({}, output, {runtime}), /injected master failure/);
	assert.equal(fs.readFileSync(output, 'utf8'), 'known-good');
	const diagnostics = JSON.parse(fs.readFileSync(`${output}.runtime.json`, 'utf8'));
	assert.equal(diagnostics.status, 'failed');
	assert.equal(diagnostics.error.message, 'injected master failure');
	assert.equal(diagnostics.media.rendered.hasAudio, true);
	assert.equal(diagnostics.cleanup.workspace.removed, true);
	assert.equal(diagnostics.cleanup.bundle.removed, true);
});

test('media validation failure preserves the existing output before mastering', async () => {
	const output = path.join(testRoot, 'failed-validation.mp4');
	fs.writeFileSync(output, 'known-good');
	const runtime = {
		bundle: fakeBundle,
		renderer: rendererFor({
			renderMedia: async ({outputLocation}) => fs.writeFileSync(outputLocation, 'rendered'),
		}),
		ffprobe: () => ({duration: 2, width: 1080, height: 1920, hasAudio: false}),
		py: () => {
			throw new Error('master must not run after validation failure');
		},
	};

	await assert.rejects(renderVideo({}, output, {runtime}), /audio stream is missing/);
	assert.equal(fs.readFileSync(output, 'utf8'), 'known-good');
	const diagnostics = JSON.parse(fs.readFileSync(`${output}.runtime.json`, 'utf8'));
	assert.equal(diagnostics.status, 'failed');
	assert.equal(diagnostics.cleanup.workspace.removed, true);
	assert.equal(diagnostics.cleanup.bundle.removed, true);
});

test('validated mastered media is atomically committed and diagnostics are recorded', async () => {
	const output = path.join(testRoot, 'successful-render.mp4');
	const runtime = {
		bundle: fakeBundle,
		renderer: rendererFor({
			renderMedia: async ({outputLocation}) => fs.writeFileSync(outputLocation, 'rendered'),
		}),
		ffprobe: validProbe,
		py: (_script, args) => {
			fs.writeFileSync(args[2], 'mastered');
			return {before: {lufs: -20}, lufs: -14, truePeakDb: -1.2};
		},
	};

	const returned = await renderVideo({}, output, {runtime});
	assert.equal(returned, output);
	assert.equal(fs.readFileSync(output, 'utf8'), 'mastered');
	const diagnostics = JSON.parse(fs.readFileSync(`${output}.runtime.json`, 'utf8'));
	assert.equal(diagnostics.status, 'ok');
	assert.equal(diagnostics.media.mastered.hasAudio, true);
	assert.equal(diagnostics.cleanup.workspace.removed, true);
	assert.equal(diagnostics.cleanup.bundle.removed, true);
});

test('render concurrency accepts bounded positive integers and rejects unsafe values', async () => {
	const output = path.join(testRoot, 'concurrency.mp4');
	let receivedConcurrency;
	const runtime = {
		bundle: fakeBundle,
		renderer: rendererFor({
			renderMedia: async (options) => {
				receivedConcurrency = options.concurrency;
			fs.writeFileSync(options.outputLocation, 'rendered');
		},
		}),
		ffprobe: validProbe,
		py: (_script, args) => {
			fs.writeFileSync(args[2], 'mastered');
			return {before: {lufs: -20}, lufs: -14, truePeakDb: -1.2};
		},
	};

	await renderVideo({}, output, {runtime, concurrency: 1});
	assert.equal(receivedConcurrency, 1);
	for (const value of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 33]) {
		await assert.rejects(renderVideo({}, output, {runtime, concurrency: value}), /positive integer/);
	}
});

test('stills reuse one browser for composition selection and every frame, closing it on failure', async () => {
	const outDir = path.join(testRoot, 'stills');
	const browser = {
		closed: false,
		close: async () => {
			browser.closed = true;
		},
	};
	let openCount = 0;
	let selectedWith;
	const stillCalls = [];
	const runtime = {
		bundle: fakeBundle,
		renderer: rendererFor({
			openBrowser: async () => {
				openCount += 1;
				return browser;
			},
			selectComposition: async (options) => {
				selectedWith = options.puppeteerInstance;
				return composition;
			},
			renderStill: async (options) => {
				stillCalls.push(options);
				if (stillCalls.length === 2) throw new Error('injected still failure');
			},
		}),
	};

	await assert.rejects(
		renderStills({}, [{frame: 0, name: 'a'}, {frame: 1, name: 'b'}], outDir, {runtime}),
		/injected still failure/,
	);
	assert.equal(openCount, 1);
	assert.equal(selectedWith, browser);
	assert.equal(stillCalls.length, 2);
	assert.ok(stillCalls.every((call) => call.puppeteerInstance === browser));
	assert.equal(browser.closed, true);
	const diagnostics = JSON.parse(fs.readFileSync(path.join(outDir, '.render-runtime.json'), 'utf8'));
	assert.equal(diagnostics.status, 'failed');
	assert.equal(diagnostics.cleanup.browser.closed, true);
	assert.equal(diagnostics.cleanup.bundle.removed, true);
});

test('installed Remotion renderer exposes the browser reuse API used by this bridge', async () => {
	const rendererPath = engineRequire.resolve('@remotion/renderer');
	const renderer = await import(pathToFileURL(rendererPath).href);
	assert.equal(typeof renderer.openBrowser, 'function');
	assert.equal(typeof renderer.selectComposition, 'function');
	assert.equal(typeof renderer.renderStill, 'function');
	assert.equal(typeof renderer.renderMedia, 'function');
});

test('installed Remotion bundler accepts the explicit output-dir API used by this bridge', async () => {
	const bundlerPath = engineRequire.resolve('@remotion/bundler');
	const bundler = await import(pathToFileURL(bundlerPath).href);
	assert.equal(typeof bundler.bundle, 'function');
});
