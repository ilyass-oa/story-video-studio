import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {setPosted} from '../lib/history.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'storyvideosgenerator-history-tests-'));
const posted = {
	youtube: {url: 'https://youtube.com/shorts/example'},
	instagram: {url: 'https://instagram.com/reel/example'},
	tiktok: {url: 'https://tiktok.com/@channel/video/example'},
};

test.after(() => fs.rmSync(root, {recursive: true, force: true}));

const makeCase = (video) => {
	const dir = fs.mkdtempSync(path.join(root, 'case-'));
	const historyFile = path.join(dir, 'STORIES.md');
	const videosDir = path.join(dir, 'videos');
	const episodeFinal = path.join(dir, 'episodes', 'sample-story', '06-render', 'final.mp4');
	fs.mkdirSync(path.dirname(episodeFinal), {recursive: true});
	fs.writeFileSync(episodeFinal, 'episode final');
	fs.writeFileSync(historyFile, `# Test history\n\n<!-- sv:stories -->\n| date | slug | title | source | look | voice | length | hook | video | posted |\n|---|---|---|---|---|---|---|---|---|---|\n| 2026-10-07 | sample-story | Sample Story | test | noir/ember | Voice | 60s | Hook. | ${video} | |\n<!-- /sv:stories -->\n`);
	return {dir, historyFile, videosDir, episodeFinal};
};

const rowFields = (historyFile) => fs.readFileSync(historyFile, 'utf8').split('\n').find((line) => line.startsWith('| 2026-10-07 |')).split('|').slice(1, -1).map((field) => field.trim());

test('all three verified links remove the exact archive and clear only its video cell', () => {
	const archive = 'history/videos/2026-10-07_sample-story.mp4';
	const c = makeCase(archive);
	const archiveFile = path.join(c.videosDir, '2026-10-07_sample-story.mp4');
	fs.mkdirSync(c.videosDir, {recursive: true});
	fs.writeFileSync(archiveFile, 'archive');

	const postedText = 'YT: https://youtube.com/shorts/example · IG: https://instagram.com/reel/example · TT: https://tiktok.com/@channel/video/example';
	setPosted('sample-story', postedText, {posted, historyFile: c.historyFile, videosDir: c.videosDir});

	assert.equal(fs.existsSync(archiveFile), false);
	const fields = rowFields(c.historyFile);
	assert.equal(fields[8], '');
	assert.equal(fields[9], postedText);
	assert.equal(fs.readFileSync(c.episodeFinal, 'utf8'), 'episode final');
});

test('partial platform links retain the archive and video cell', () => {
	const archive = 'history/videos/2026-10-07_sample-story.mp4';
	const c = makeCase(archive);
	const archiveFile = path.join(c.videosDir, '2026-10-07_sample-story.mp4');
	fs.mkdirSync(c.videosDir, {recursive: true});
	fs.writeFileSync(archiveFile, 'archive');

	setPosted('sample-story', 'YT: https://youtube.com/shorts/example · IG: https://instagram.com/reel/example', {
		posted: {youtube: posted.youtube, instagram: posted.instagram},
		historyFile: c.historyFile,
		videosDir: c.videosDir,
	});

	assert.equal(fs.existsSync(archiveFile), true);
	assert.equal(rowFields(c.historyFile)[8], archive);
});

test('uncertain archive paths and non-regular files are preserved', () => {
	const traversal = makeCase('history/videos/../outside.mp4');
	const outside = path.join(traversal.dir, 'outside.mp4');
	fs.writeFileSync(outside, 'sentinel');
	setPosted('sample-story', 'all links', {posted, historyFile: traversal.historyFile, videosDir: traversal.videosDir});
	assert.equal(fs.readFileSync(outside, 'utf8'), 'sentinel');
	assert.equal(rowFields(traversal.historyFile)[8], 'history/videos/../outside.mp4');

	const directoryCase = makeCase('history/videos/2026-10-07_sample-story.mp4');
	fs.mkdirSync(path.join(directoryCase.videosDir, '2026-10-07_sample-story.mp4'), {recursive: true});
	setPosted('sample-story', 'all links', {posted, historyFile: directoryCase.historyFile, videosDir: directoryCase.videosDir});
	assert.equal(fs.existsSync(path.join(directoryCase.videosDir, '2026-10-07_sample-story.mp4')), true);
	assert.equal(rowFields(directoryCase.historyFile)[8], 'history/videos/2026-10-07_sample-story.mp4');
});
