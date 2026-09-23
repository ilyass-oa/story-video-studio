import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import type {Pack} from '../packs';
import type {CompiledScene, TransitionId} from '../schema';
import {EASE, clamp01, prog} from '../lib/anim';

type Look = {transform: string; opacity: number; blur: number; dirBlur?: [number, number]; flash: number; rgb: number};

const NONE: Look = {transform: '', opacity: 1, blur: 0, flash: 0, rgb: 0};

// t goes 0→1 across the transition window. `enter` = incoming scene, otherwise outgoing.
const look = (type: TransitionId, t: number, enter: boolean): Look => {
	const u = enter ? 1 - t : t; // 1 = fully "away", 0 = settled
	switch (type) {
		case 'cut':
			return NONE;
		case 'blur-zoom':
			return enter
				? {transform: `scale(${1 + 0.22 * u})`, opacity: clamp01(1 - u * 1.3), blur: 30 * u, flash: 0, rgb: 0}
				: {transform: `scale(${1 + 0.35 * u})`, opacity: 1 - u, blur: 34 * u, flash: 0, rgb: 0};
		case 'blur-dissolve':
			return {transform: `scale(${1 + (enter ? 0.04 : -0.02) * u})`, opacity: 1 - u, blur: 22 * u, flash: 0, rgb: 0};
		case 'whip-left':
			return {transform: `translateX(${(enter ? 1 : -1) * 1080 * u * u}px)`, opacity: 1, blur: 0, dirBlur: [90 * Math.sin(u * Math.PI) + 40 * u, 0], flash: 0, rgb: 0};
		case 'whip-right':
			return {transform: `translateX(${(enter ? -1 : 1) * 1080 * u * u}px)`, opacity: 1, blur: 0, dirBlur: [90 * Math.sin(u * Math.PI) + 40 * u, 0], flash: 0, rgb: 0};
		case 'whip-up':
			return {transform: `translateY(${(enter ? 1 : -1) * 1920 * u * u}px)`, opacity: 1, blur: 0, dirBlur: [0, 110 * Math.sin(u * Math.PI) + 40 * u], flash: 0, rgb: 0};
		case 'flash':
			return enter
				? {transform: `scale(${1 + 0.06 * u})`, opacity: clamp01(1 - u * 2), blur: 10 * u, flash: u, rgb: 0}
				: {transform: `scale(${1 + 0.08 * u})`, opacity: clamp01(1 - u * 1.5), blur: 12 * u, flash: 0, rgb: 0};
		case 'zoom-through':
			return enter
				? {transform: `scale(${1 - 0.3 * u})`, opacity: 1 - u, blur: 16 * u, flash: 0, rgb: 0}
				: {transform: `scale(${1 + 1.6 * u * u})`, opacity: 1 - u, blur: 26 * u, flash: 0, rgb: 0};
		case 'slide-up':
			return enter
				? {transform: `translateY(${1920 * u * u}px) rotate(${u * 4}deg)`, opacity: 1, blur: 0, flash: 0, rgb: 0}
				: {transform: `translateY(${-260 * u}px) scale(${1 - 0.06 * u})`, opacity: 1 - u * 0.6, blur: 8 * u, flash: 0, rgb: 0};
		case 'glitch':
			return {transform: `translateX(${Math.sin(u * 40) * 30 * u}px)`, opacity: enter ? clamp01(1 - u * 1.2) : 1 - u, blur: 0, flash: 0, rgb: u};
	}
};

/** Editor's "punch-in": a quick zoom accent when an emphasised word lands (3-frame rise, soft decay). */
const punch = (scene: CompiledScene, frame: number, pack: Pack) => {
	let v = 0;
	for (const w of scene.words) {
		if (w.style !== 'accent' && w.style !== 'pop') continue;
		const t = frame - w.start;
		if (t < 0 || t > 30) continue;
		const amp = (pack.id === 'noir' ? 0.038 : 0.02) * (w.style === 'pop' ? 1.5 : 1);
		v = Math.max(v, t < 3 ? amp * (t / 3) : amp * Math.exp(-(t - 3) / 6));
	}
	return v;
};

const cameraTransform = (scene: CompiledScene, frame: number, dur: number, pack: Pack) => {
	const t = prog(frame, 0, dur, EASE.soft);
	const p = punch(scene, frame, pack);
	// noir: barely-there handheld breathing so no frame is ever dead still
	const hh = pack.id === 'noir' ? `translate(${(Math.sin(frame / 61) * 4 + Math.sin(frame / 23) * 1.2).toFixed(2)}px, ${(Math.cos(frame / 53) * 3).toFixed(2)}px) rotate(${(Math.sin(frame / 47) * 0.22 + Math.sin(frame / 29) * 0.1).toFixed(3)}deg) scale(1.012)` : ''; // 1.2% covers the drift at the frame edges
	switch (scene.camera) {
		case 'push':
			return `${hh} scale(${1 + 0.065 * t + p})`;
		case 'pull':
			return `${hh} scale(${1.07 - 0.07 * t + p})`;
		case 'drift':
			return `${hh} translateX(${-18 + 36 * t}px) scale(${1.03 + 0.02 * t + p})`;
		default:
			return `${hh} scale(${1 + p})`;
	}
};

/** Wraps one scene: incoming transition, outgoing transition, and a slow camera move on its content. */
export const SceneShell: React.FC<{scene: CompiledScene; pack: Pack; children: React.ReactNode}> = ({scene, pack, children}) => {
	const frame = useCurrentFrame();
	const tf = scene.transitionFrames;
	const tIn = scene.from === 0 ? 1 : prog(frame, 0, tf, EASE.inOut);
	const tOut = scene.exit > 0 ? prog(frame, scene.duration, scene.exit, EASE.in) : 0;
	const a = tIn < 1 ? look(scene.transitionIn, tIn, true) : NONE;
	const b = tOut > 0 ? look(scene.transitionOut, tOut, false) : NONE;
	const blur = a.blur + b.blur;
	const dir = a.dirBlur ?? b.dirBlur;
	const rgb = Math.max(a.rgb, b.rgb);
	const filterId = `dir-${scene.id}`;
	const filters = [dir ? `url(#${filterId})` : '', blur > 0.3 ? `blur(${blur}px)` : '', rgb > 0.02 ? `drop-shadow(${12 * rgb}px 0 0 rgba(255,0,60,0.7)) drop-shadow(${-12 * rgb}px 0 0 rgba(0,220,255,0.7))` : '']
		.filter(Boolean)
		.join(' ');
	const flash = a.flash;
	return (
		<AbsoluteFill>
			{dir && (
				<svg width="0" height="0" style={{position: 'absolute'}}>
					<filter id={filterId} x="-20%" y="-20%" width="140%" height="140%">
						<feGaussianBlur stdDeviation={`${dir[0].toFixed(1)} ${dir[1].toFixed(1)}`} />
					</filter>
				</svg>
			)}
			<AbsoluteFill style={{transform: `${a.transform} ${b.transform}`, opacity: a.opacity * b.opacity, filter: filters || undefined}}>
				<AbsoluteFill style={{transform: cameraTransform(scene, frame, scene.duration + scene.exit, pack)}}>{children}</AbsoluteFill>
			</AbsoluteFill>
			{flash > 0.01 && (
				<AbsoluteFill
					style={{
						background: pack.atmos.flash,
						mixBlendMode: 'screen',
						opacity: Math.sin(flash * Math.PI) * 0.95,
					}}
				/>
			)}
		</AbsoluteFill>
	);
};
