import {measureText} from '@remotion/layout-utils';
import React from 'react';
import {AbsoluteFill, Img, OffthreadVideo, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import type {Pack} from '../packs';
import type {DeviceSlot, ImageSlot, Slot, VideoSlot} from '../schema';
import {EASE, clamp01, float, pop, prog} from '../lib/anim';

export const src = (s: string) => (s.startsWith('http') ? s : staticFile(s));

export const asImage = (s: Slot | undefined): ImageSlot | null =>
	s && typeof s === 'object' && !Array.isArray(s) && s.kind === 'image' ? (s as ImageSlot) : null;
export const asVideo = (s: Slot | undefined): VideoSlot | null =>
	s && typeof s === 'object' && !Array.isArray(s) && s.kind === 'video' ? (s as VideoSlot) : null;
export const asImages = (s: Slot | undefined): ImageSlot[] =>
	Array.isArray(s) ? s : asImage(s) ? [asImage(s)!] : [];
export const asDevice = (s: Slot | undefined): DeviceSlot | null => {
	const i = asImage(s) as DeviceSlot | null;
	return i && Array.isArray(i.screen) ? i : null;
};

export type Enter = 'rise' | 'drop' | 'pop' | 'slide-left' | 'slide-right' | 'zoom' | 'fade';

/** Exposure match: brings any source to the pack's target brightness before the pack grade. */
export const expo = (slot: {luma?: number; cutout?: boolean} | null | undefined, pack: Pack) => {
	if (!slot?.luma) return '';
	const target = slot.cutout ? pack.exposure.cutout : pack.exposure.photo;
	const k = Math.max(0.62, Math.min(1.7, target / Math.max(0.02, slot.luma)));
	return `brightness(${k.toFixed(3)})`;
};

/** Fit (w,h) inside a box keeping aspect ratio. */
export const fit = (w: number, h: number, maxW: number, maxH: number) => {
	const s = Math.min(maxW / w, maxH / h);
	return {w: w * s, h: h * s};
};

const enterStyle = (type: Enter, frame: number, fps: number, at: number, seed: number) => {
	const t = prog(frame, at, 16);
	const s = pop(frame, fps, at, 150, 13);
	switch (type) {
		case 'drop':
			return {transform: `translateY(${(1 - s) * -520}px) rotate(${(1 - s) * -9}deg)`, opacity: clamp01(t * 3), blur: (1 - t) * 10};
		case 'pop':
			return {transform: `scale(${0.55 + 0.45 * s})`, opacity: clamp01(t * 3), blur: (1 - t) * 12};
		case 'slide-left':
			return {transform: `translateX(${(1 - t) * -760}px) rotate(${(1 - t) * -14}deg)`, opacity: clamp01(t * 2), blur: (1 - t) * 18};
		case 'slide-right':
			return {transform: `translateX(${(1 - t) * 760}px) rotate(${(1 - t) * 14}deg)`, opacity: clamp01(t * 2), blur: (1 - t) * 18};
		case 'zoom':
			return {transform: `scale(${1.45 - 0.45 * t})`, opacity: t, blur: (1 - t) * 26};
		case 'fade':
			return {transform: 'none', opacity: t, blur: (1 - t) * 8};
		case 'rise':
		default:
			return {transform: `translateY(${(1 - t) * 170}px) scale(${0.93 + 0.07 * t}) rotate(${(1 - t) * (seed % 2 ? 4 : -4)}deg)`, opacity: t, blur: (1 - t) * 22};
	}
};

/** A transparent-PNG subject, graded to the pack, with grounded shadow, entrance and idle float. */
export const Cutout: React.FC<{
	slot: ImageSlot;
	pack: Pack;
	cx: number;
	cy: number;
	maxW: number;
	maxH: number;
	enter?: Enter;
	at?: number;
	seed?: number;
	floatAmp?: number;
	rotate?: number;
	echo?: boolean; // blurred larger ghost behind for depth (atelier look)
	grade?: boolean;
	backlight?: boolean; // warm glow behind the subject (default: on in noir) — off when the subject sits on paper
	style?: React.CSSProperties;
}> = ({slot, pack, cx, cy, maxW, maxH, enter = 'rise', at = 0, seed = 1, floatAmp = 10, rotate = 0, echo = false, grade = true, backlight: backlightProp, style}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const {w, h} = fit(slot.width, slot.height, maxW, maxH);
	const e = enterStyle(enter, frame, fps, at, seed);
	const fy = float(frame, seed, floatAmp, 120);
	const fr = float(frame, seed + 3, 1.4, 160) + rotate;
	const filter = [grade ? expo(slot, pack) : '', grade ? (slot.cutout ? pack.grade.cutout : pack.grade.photo) : '', slot.cutout ? pack.cutoutShadow : '', e.blur > 0.3 ? `blur(${e.blur}px)` : '']
		.filter(Boolean)
		.join(' ');
	const backlight = (backlightProp ?? pack.id === 'noir') && slot.cutout;
	return (
		<>
			{backlight && (
				<div
					style={{
						position: 'absolute',
						left: cx - w * 0.85,
						top: cy - h * 0.8 + fy,
						width: w * 1.7,
						height: h * 1.6,
						background: pack.atmos.backlight,
						opacity: e.opacity,
						filter: 'blur(10px)',
					}}
				/>
			)}
			{echo && (
				<Img
					src={src(slot.src)}
					style={{
						position: 'absolute',
						left: cx - w * 0.62 + 60,
						top: cy - h * 0.62 + fy * 0.5 + 50,
						width: w * 1.24,
						height: h * 1.24,
						objectFit: 'contain',
						filter: 'grayscale(1) brightness(0.55) blur(30px)',
						opacity: 0.2 * e.opacity,
						transform: `rotate(${-fr * 2}deg)`,
					}}
				/>
			)}
			<Img
				src={src(slot.src)}
				style={{
					position: 'absolute',
					left: cx - w / 2,
					top: cy - h / 2,
					width: w,
					height: h,
					objectFit: 'contain',
					filter,
					opacity: e.opacity,
					transform: `${e.transform} translateY(${fy}px) rotate(${fr}deg)`,
					...style,
				}}
			/>
		</>
	);
};

/** Full-bleed photo or clip, graded to the pack, with a Ken Burns move toward its focus point. */
export const FullMedia: React.FC<{
	slot: ImageSlot | VideoSlot;
	pack: Pack;
	dur: number;
	zoom?: [number, number];
	scrim?: 'bottom' | 'top' | 'center' | 'none';
}> = ({slot, pack, dur, zoom = [1.14, 1.0], scrim = 'bottom'}) => {
	const frame = useCurrentFrame();
	const t = prog(frame, 0, dur + 12, EASE.soft);
	const z = (zoom[0] + (zoom[1] - zoom[0]) * t) * (slot.zoom ?? 1);
	const [fx, fy] = slot.focus ?? [0.5, 0.45];
	const common: React.CSSProperties = {
		position: 'absolute',
		inset: 0,
		width: '100%',
		height: '100%',
		objectFit: 'cover',
		objectPosition: `${fx * 100}% ${fy * 100}%`,
		transform: `scale(${z})`,
		transformOrigin: `${fx * 100}% ${fy * 100}%`,
		filter: `${expo(slot.kind === 'image' ? slot : {luma: slot.luma}, pack)} ${pack.grade.photo}`,
	};
	const dark = pack.id === 'noir';
	const scrimCss =
		scrim === 'none'
			? 'none'
			: scrim === 'top'
				? `linear-gradient(180deg, ${dark ? 'rgba(8,4,4,0.85)' : 'rgba(230,228,224,0.8)'} 0%, transparent 45%)`
				: scrim === 'center'
					? `radial-gradient(ellipse 80% 45% at 50% 50%, ${dark ? 'rgba(8,4,4,0.6)' : 'rgba(230,228,224,0.55)'}, transparent 80%)`
					: `linear-gradient(0deg, ${dark ? 'rgba(8,4,4,0.92)' : 'rgba(232,230,226,0.92)'} 0%, ${dark ? 'rgba(8,4,4,0.5)' : 'rgba(232,230,226,0.55)'} 35%, transparent 62%)`;
	return (
		<AbsoluteFill style={{overflow: 'hidden'}}>
			{slot.kind === 'video' ? <OffthreadVideo src={src(slot.src)} muted style={common} /> : <Img src={src(slot.src)} style={common} />}
			<AbsoluteFill style={{background: pack.grade.tint, mixBlendMode: pack.grade.tintBlend as React.CSSProperties['mixBlendMode']}} />
			<AbsoluteFill style={{background: scrimCss}} />
		</AbsoluteFill>
	);
};

/** A photo on a card: yellow-rimmed glowing card (noir) or white polaroid (atelier), flying in in 3D. */
export const PhotoCard: React.FC<{
	slot: ImageSlot;
	pack: Pack;
	cx: number;
	cy: number;
	w: number;
	h: number;
	rotate?: number;
	at?: number;
	from?: 'left' | 'right' | 'bottom' | 'top';
	seed?: number;
	pin?: boolean;
}> = ({slot, pack, cx, cy, w, h, rotate = 0, at = 0, from = 'bottom', seed = 1, pin = false}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const s = pop(frame, fps, at, 120, 15);
	const t = prog(frame, at, 14);
	const off = {left: [-900, 0], right: [900, 0], bottom: [0, 1100], top: [0, -1100]}[from];
	const noir = pack.id === 'noir';
	const border = noir ? 7 : 18;
	const fy = float(frame, seed, 7, 140);
	const [fx, fyy] = slot.focus ?? [0.5, 0.45];
	return (
		<div
			style={{
				position: 'absolute',
				left: cx - w / 2,
				top: cy - h / 2,
				width: w,
				height: h,
				transform: `perspective(1800px) translate(${off[0] * (1 - s)}px, ${off[1] * (1 - s) + fy}px) rotateX(${(1 - s) * 50}deg) rotateY(${(1 - s) * (from === 'left' ? -40 : 40)}deg) rotate(${rotate + (1 - s) * rotate * 3}deg)`,
				opacity: clamp01(t * 2.5),
				filter: `blur(${(1 - t) * 10}px)`,
			}}
		>
			<div
				style={{
					position: 'absolute',
					inset: 0,
					borderRadius: noir ? 30 : 4,
					background: noir ? '#111' : pack.colors.cardBorder,
					padding: noir ? border : `${border}px ${border}px ${border * 3.4}px`,
					boxShadow: noir
						? `0 0 0 ${border}px ${pack.colors.cardBorder}, 0 0 38px ${pack.colors.accentGlow}, 0 40px 70px rgba(0,0,0,0.7)`
						: '0 30px 50px rgba(40,35,30,0.35), 0 6px 10px rgba(40,35,30,0.2)',
					boxSizing: 'border-box',
				}}
			>
				<div style={{position: 'relative', width: '100%', height: '100%', overflow: 'hidden', borderRadius: noir ? 22 : 1}}>
					<Img
						src={src(slot.src)}
						style={{width: '100%', height: '100%', objectFit: 'cover', objectPosition: `${fx * 100}% ${fyy * 100}%`, filter: `${expo(slot, pack)} ${pack.grade.photo}`}}
					/>
					<AbsoluteFill style={{background: pack.grade.tint, mixBlendMode: pack.grade.tintBlend as React.CSSProperties['mixBlendMode']}} />
				</div>
			</div>
			{pin && <PushPin x={w / 2} y={-6} />}
		</div>
	);
};

export const PushPin: React.FC<{x: number; y: number; color?: string}> = ({x, y, color = '#c9202e'}) => (
	<div style={{position: 'absolute', left: x - 17, top: y - 17, width: 34, height: 34}}>
		<div style={{position: 'absolute', left: 14, top: 22, width: 6, height: 22, background: 'linear-gradient(90deg,#999,#eee,#888)', borderRadius: 3, transform: 'rotate(18deg)', filter: 'blur(0.3px)'}} />
		<div
			style={{
				position: 'absolute',
				inset: 0,
				borderRadius: '50%',
				background: `radial-gradient(circle at 35% 30%, #ff8a8a 0%, ${color} 38%, #5a0a10 100%)`,
				boxShadow: '6px 14px 14px rgba(0,0,0,0.35)',
			}}
		/>
	</div>
);

export const PaperClip: React.FC<{x: number; y: number; rotate?: number; scale?: number}> = ({x, y, rotate = -35, scale = 1}) => (
	<svg width={70 * scale} height={170 * scale} viewBox="0 0 70 170" style={{position: 'absolute', left: x, top: y, transform: `rotate(${rotate}deg)`, filter: 'drop-shadow(4px 10px 6px rgba(0,0,0,0.3))'}}>
		<defs>
			<linearGradient id="clipMetal" x1="0" x2="1">
				<stop offset="0" stopColor="#6d6d6d" />
				<stop offset="0.5" stopColor="#e9e9e9" />
				<stop offset="1" stopColor="#7a7a7a" />
			</linearGradient>
		</defs>
		<path d="M20 60 V140 a15 15 0 0 0 30 0 V35 a22 22 0 0 0 -44 0 V130" fill="none" stroke="url(#clipMetal)" strokeWidth="6" strokeLinecap="round" />
	</svg>
);

/** Modern phone drawn in CSS. Children render on its screen. */
export const Phone: React.FC<{cx: number; cy: number; w: number; at?: number; children?: React.ReactNode; pack: Pack}> = ({cx, cy, w, at = 0, children, pack}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const h = w * 2.05;
	const s = pop(frame, fps, at, 110, 16);
	const fy = float(frame, 5, 8, 150);
	return (
		<div
			style={{
				position: 'absolute',
				left: cx - w / 2,
				top: cy - h / 2,
				width: w,
				height: h,
				borderRadius: w * 0.17,
				background: 'linear-gradient(145deg,#3a3a3c,#0c0c0d 40%,#1d1d1f)',
				padding: w * 0.035,
				boxSizing: 'border-box',
				boxShadow: `0 60px 90px rgba(0,0,0,${pack.id === 'noir' ? 0.8 : 0.35}), inset 0 0 0 2px rgba(255,255,255,0.12)`,
				transform: `perspective(2000px) translateY(${(1 - s) * 900 + fy}px) rotateX(${(1 - s) * 35}deg) rotate(${(1 - s) * 8}deg)`,
			}}
		>
			<div style={{position: 'relative', width: '100%', height: '100%', borderRadius: w * 0.14, overflow: 'hidden', background: '#f7f6f2'}}>
				{children}
				<div style={{position: 'absolute', top: w * 0.035, left: '50%', width: w * 0.3, height: w * 0.085, marginLeft: -w * 0.15, borderRadius: w, background: '#0b0b0c'}} />
				<AbsoluteFill style={{background: 'linear-gradient(115deg, rgba(255,255,255,0.18) 0%, transparent 35%)'}} />
			</div>
		</div>
	);
};

/** Photographed device (TV, monitor…) with content composited into its screen rectangle. */
export const DeviceWithScreen: React.FC<{
	device: DeviceSlot;
	pack: Pack;
	cx: number;
	cy: number;
	maxW: number;
	maxH: number;
	at?: number;
	children: React.ReactNode;
}> = ({device, pack, cx, cy, maxW, maxH, at = 0, children}) => {
	const frame = useCurrentFrame();
	const {w, h} = fit(device.width, device.height, maxW, maxH);
	const t = prog(frame, at, 16);
	const on = prog(frame, at + 8, 10); // screen powers on after the set lands
	const fy = float(frame, 9, 6, 150);
	const [sx, sy, sw, sh] = device.screen;
	return (
		<div style={{position: 'absolute', left: cx - w / 2, top: cy - h / 2, width: w, height: h, opacity: t, transform: `translateY(${(1 - t) * 140 + fy}px) scale(${0.94 + 0.06 * t})`, filter: `blur(${(1 - t) * 14}px)`}}>
			<Img src={src(device.src)} style={{position: 'absolute', inset: 0, width: '100%', height: '100%', filter: `${expo(device, pack)} ${pack.grade.cutout} ${pack.cutoutShadow}`}} />
			<div
				style={{
					position: 'absolute',
					left: `${sx * 100}%`,
					top: `${sy * 100}%`,
					width: `${sw * 100}%`,
					height: `${sh * 100}%`,
					borderRadius: '9% / 12%',
					overflow: 'hidden',
					background: '#050505',
					opacity: on,
					transform: `scaleY(${0.04 + 0.96 * EASE.out(on)})`,
				}}
			>
				{children}
				<AbsoluteFill style={{backgroundImage: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.22) 0px, rgba(0,0,0,0.22) 2px, transparent 2px, transparent 5px)'}} />
				<AbsoluteFill style={{boxShadow: 'inset 0 0 60px 20px rgba(0,0,0,0.75)', background: 'radial-gradient(ellipse at 35% 25%, rgba(255,255,255,0.14), transparent 55%)'}} />
			</div>
		</div>
	);
};

/** Giant word behind the subject, bleeding off the frame (depth sandwich). */
export const BigWord: React.FC<{text: string; pack: Pack; cy: number; at?: number; size?: number; opacity?: number}> = ({text, pack, cy, at = 0, size, opacity = 1}) => {
	const frame = useCurrentFrame();
	const t = prog(frame, at - 4, 18);
	const drift = prog(frame, at, 200, EASE.linear);
	const noir = pack.id === 'noir';
	const family = noir ? pack.fonts.serif.family : pack.fonts.accent.family;
	const weight = noir ? 700 : 900;
	// sized so the word spans ~1.08× the frame width: bleeds a little off both edges, stays legible
	const w100 = measureText({text, fontFamily: family, fontSize: 100, fontWeight: weight, letterSpacing: noir ? '-0.02em' : '-0.05em'}).width;
	const fs = size ?? Math.min(820, (1080 * 1.08 * 100) / Math.max(1, w100));
	return (
		<div
			style={{
				position: 'absolute',
				left: -400,
				right: -400,
				top: cy - fs * 0.62,
				textAlign: 'center',
				fontFamily: family,
				fontWeight: weight,
				fontSize: fs,
				lineHeight: 1.1,
				letterSpacing: noir ? '-0.02em' : '-0.05em',
				color: noir ? '#f2ece0' : '#3b3834',
				opacity: t * opacity * (noir ? 0.92 : 0.85),
				filter: `blur(${(1 - t) * 30 + (noir ? 1.2 : 0)}px)`,
				textShadow: noir ? '0 0 40px rgba(255,240,220,0.45), 0 0 120px rgba(255,200,160,0.25)' : '0 40px 60px rgba(40,35,30,0.25)',
				transform: `scale(${1.12 - 0.08 * t - 0.04 * drift})`,
				whiteSpace: 'nowrap',
			}}
		>
			{text}
		</div>
	);
};
