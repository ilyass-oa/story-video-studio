import React from 'react';
import {Audio, Sequence, interpolate, staticFile} from 'remotion';
import type {StoryProps} from '../schema';

const S = (p: string) => (p.startsWith('http') ? p : staticFile(p));

/** Smooth 0..1 "narration is speaking" envelope with attack/release, for ducking beds under the voice. */
const speakingAt = (speech: StoryProps['speech'], f: number, attack = 6, release = 14) => {
	let v = 0;
	for (const [a, b] of speech) {
		if (f < a - attack || f > b + release) continue;
		const up = interpolate(f, [a - attack, a], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
		const down = interpolate(f, [b, b + release], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
		v = Math.max(v, Math.min(up, down));
	}
	return v;
};

/** 1 → 0.1 inside a quiet scene: a sudden drop (3 frames) and a slow return (20 frames) — silence as an effect. */
const hushAt = (hush: StoryProps['hush'], f: number) => {
	let v = 1;
	for (const [a, b] of hush ?? []) {
		if (f < a - 3 || f > b + 20) continue;
		const down = interpolate(f, [a - 3, a], [1, 0.1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
		const up = interpolate(f, [b, b + 20], [0.1, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
		v = Math.min(v, Math.max(down, up));
	}
	return v;
};

export const Soundtrack: React.FC<{props: StoryProps}> = ({props}) => {
	return (
		<>
			{props.voice && (
				<Sequence from={props.voice.from} name="voice">
					<Audio src={S(props.voice.src)} volume={props.voice.volume} />
				</Sequence>
			)}
			{props.beds.map((b, i) => (
				<Sequence key={`bed${i}`} from={b.from} durationInFrames={Math.max(1, b.to - b.from)} name={`bed:${b.src.split('/').pop()}`}>
					<Audio
						src={S(b.src)}
						loop={b.loop}
						volume={(f) => {
							const abs = f + b.from;
							const len = b.to - b.from;
							const fade = Math.min(
								interpolate(f, [0, Math.max(1, b.fadeIn)], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}),
								interpolate(f, [len - Math.max(1, b.fadeOut), len], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}),
							);
							const duck = 1 - (1 - b.duck) * speakingAt(props.speech, abs);
							return b.volume * fade * duck * hushAt(props.hush, abs);
						}}
					/>
				</Sequence>
			))}
			{props.sfx.map((s, i) => (
				<Sequence key={`sfx${i}`} from={Math.max(0, s.frame)} durationInFrames={s.durationFrames ?? props.fps * 8} name={`sfx:${s.src.split('/').pop()}`}>
					<Audio
						src={S(s.src)}
						volume={(f) => (s.durationFrames ? s.volume * interpolate(f, [s.durationFrames - 3, s.durationFrames], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}) : s.volume)}
					/>
				</Sequence>
			))}
		</>
	);
};
