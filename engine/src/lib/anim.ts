import {Easing, interpolate, random, spring} from 'remotion';

export const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** 0→1 progress of `frame` across [start, start+len], eased. */
export const prog = (frame: number, start: number, len: number, ease: (t: number) => number = EASE.out) =>
	ease(clamp01((frame - start) / Math.max(1, len)));

export const EASE = {
	out: Easing.bezier(0.16, 1, 0.3, 1), // expo-ish out, the "settle" curve used everywhere
	inOut: Easing.bezier(0.65, 0, 0.35, 1),
	in: Easing.bezier(0.7, 0, 0.84, 0),
	soft: Easing.bezier(0.33, 1, 0.68, 1),
	linear: (t: number) => t,
};

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const mapRange = (frame: number, input: number[], output: number[], ease = EASE.out) =>
	interpolate(frame, input, output, {easing: ease, extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});

export const pop = (frame: number, fps: number, delay = 0, stiffness = 170, damping = 14) =>
	spring({frame: frame - delay, fps, config: {stiffness, damping, mass: 0.9}});

/** Deterministic pseudo-random in [a,b] for a key. */
export const rnd = (key: string | number, a = 0, b = 1) => a + (b - a) * random(`${key}`);

/** Smooth idle float (sine) — deterministic, frame-driven. */
export const float = (frame: number, seed: number, amp = 10, period = 110) =>
	Math.sin(((frame + seed * 37) / period) * Math.PI * 2) * amp;
