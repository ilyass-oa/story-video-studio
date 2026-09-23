import {measureText} from '@remotion/layout-utils';
import React, {useMemo} from 'react';
import {useCurrentFrame} from 'remotion';
import type {Pack} from '../packs';
import type {Word, WordStyle} from '../schema';
import {EASE, clamp01, prog} from '../lib/anim';

export type TextBox = {
	x: number; // left edge of the text column
	y: number; // anchor y
	width: number;
	anchor?: 'top' | 'center' | 'bottom';
	align?: 'left' | 'center' | 'right';
	scale?: number; // global size multiplier chosen by the template (never by the episode)
	maxAccent?: number; // optional cap for accent size in this template
	color?: string; // template may force a text color (e.g. dark text printed on a light card)
	fill?: number; // grow normal/script lines up to this size to fill the column (type-only templates)
	sceneEnd?: number; // local frame where the scene starts leaving — accent typing always completes before it
};

type Line = {words: Word[]; kind: 'accent' | 'normal' | 'script' | 'muted'; size: number; accentSize: number};

const fontFor = (pack: Pack, style: WordStyle) => {
	switch (style) {
		case 'accent':
		case 'pop':
			return pack.fonts.accent;
		case 'script':
			return pack.fonts.script;
		default:
			return pack.fonts.sans;
	}
};

const measure = (pack: Pack, style: WordStyle, text: string, size: number) => {
	const f = fontFor(pack, style) as {family: string; weight: number; tracking?: string; variation?: string};
	return measureText({
		text,
		fontFamily: f.family,
		fontSize: size,
		fontWeight: f.weight,
		letterSpacing: f.tracking,
		additionalStyles: f.variation ? {fontVariationSettings: f.variation} : undefined,
	}).width;
};

/** Lays words into lines and picks sizes so every line fits the column. Pure function of words + pack + box. */
const layout = (words: Word[], pack: Pack, box: TextBox): Line[] => {
	const scale = box.scale ?? 1;
	const maxW = box.width;
	const byLine = new Map<number, Word[]>();
	for (const w of words) byLine.set(w.line, [...(byLine.get(w.line) ?? []), w]);
	const lines: Line[] = [];
	for (const [, ws] of [...byLine.entries()].sort((a, b) => a[0] - b[0])) {
		const hasAccent = ws.some((w) => w.style === 'accent' || w.style === 'pop');
		const allScript = ws.every((w) => w.style === 'script');
		const allMuted = ws.every((w) => w.style === 'muted');
		const kind: Line['kind'] = hasAccent ? 'accent' : allScript ? 'script' : allMuted ? 'muted' : 'normal';
		let size = (allMuted ? pack.size.muted : allScript ? pack.size.script : pack.size.normal) * scale;
		let accentSize = 0;
		const gap = 0.26;
		if (hasAccent) {
			const acc = ws.filter((w) => w.style === 'accent' || w.style === 'pop');
			const rest = ws.filter((w) => !(w.style === 'accent' || w.style === 'pop'));
			const accW100 = measure(pack, 'accent', acc.map((w) => w.text).join(' '), 100);
			const restW = rest.reduce((s, w) => s + measure(pack, w.style, w.text, w.style === 'script' ? pack.size.script * scale * 0.7 : size), 0);
			const avail = maxW * 0.95 - restW - rest.length * size * gap;
			const cap = Math.min(box.maxAccent ?? Infinity, pack.size.accentMax * scale);
			accentSize = Math.max(40, Math.min(cap, (avail / accW100) * 100));
		} else {
			const lineW = ws.reduce((s, w) => s + measure(pack, w.style, w.text, size), 0) + (ws.length - 1) * size * gap;
			if (box.fill && !allMuted) {
				const cap = (allScript ? box.fill * 1.8 : box.fill) * scale;
				size = Math.min(cap, (size * maxW * 0.9) / lineW);
			} else if (lineW > maxW * 0.95) size *= (maxW * 0.95) / lineW;
		}
		lines.push({words: ws, kind, size, accentSize});
	}
	return lines;
};

const WordView: React.FC<{w: Word; pack: Pack; size: number; color?: string; sceneEnd?: number}> = ({w, pack, size, color, sceneEnd}) => {
	const frame = useCurrentFrame();
	const f = fontFor(pack, w.style) as {family: string; weight: number; tracking?: string; variation?: string};
	const base: React.CSSProperties = {
		fontFamily: f.family,
		fontWeight: f.weight,
		fontSize: size,
		letterSpacing: f.tracking,
		fontVariationSettings: f.variation,
		lineHeight: 1,
		display: 'inline-block',
		whiteSpace: 'pre',
		willChange: 'transform, opacity, filter',
	};
	const room = sceneEnd !== undefined ? sceneEnd - w.start - 3 : 99;
	const dur = Math.max(3, Math.min(18, w.end - w.start, room));
	const isAccent = w.style === 'accent' || w.style === 'pop';
	const colorOf =
		color && !isAccent
			? color
			: w.style === 'accent'
				? pack.colors.accent
				: w.style === 'pop'
					? pack.colors.pop
					: w.style === 'script'
						? color ?? pack.colors.script
						: w.style === 'muted'
							? pack.colors.muted
							: pack.colors.text;
	const shadow = w.style === 'pop' ? pack.textShadow.pop : isAccent ? pack.textShadow.accent : w.style === 'script' ? pack.textShadow.script : pack.textShadow.normal;

	if (w.style === 'script') {
		// handwriting-like wipe across the spoken duration
		const t = prog(frame, w.start - 1, Math.max(3, Math.min(Math.max(9, dur), room)), EASE.inOut);
		return (
			<span
				style={{
					...base,
					color: colorOf,
					textShadow: shadow,
					// script swashes overhang their glyph box; padding puts the ink inside the box
					// (composited layers clip overflow), the negative margin keeps the layout unchanged
					clipPath: `inset(-40% ${(1 - t) * 102}% -40% 0%)`,
					opacity: clamp01(t * 3),
					filter: `blur(${(1 - t) * 3}px)`,
					padding: '0.1em 0.45em',
					margin: '-0.1em -0.37em',
				}}
			>
				{w.text}
			</span>
		);
	}

	if (isAccent && pack.reveal === 'noir') {
		// typewriter across the word's spoken duration; each glyph flashes bright then settles
		const chars = [...w.text];
		const per = dur / chars.length;
		const wordT = prog(frame, w.start - 1, 12);
		return (
			<span style={{...base, color: colorOf, textShadow: shadow, transform: `scale(${1.1 - 0.1 * wordT})`}}>
				{chars.map((c, i) => {
					const ct = prog(frame, w.start + i * per - 1, 4, EASE.soft);
					return (
						<span key={i} style={{opacity: ct, filter: `brightness(${1 + (1 - ct) * 1.8}) blur(${(1 - ct) * 6}px)`}}>
							{c}
						</span>
					);
				})}
			</span>
		);
	}

	const lenIn = pack.reveal === 'noir' ? 7 : isAccent ? 13 : 10;
	const t = prog(frame, w.start - (pack.reveal === 'noir' ? 2 : 3), lenIn);
	const blur = (1 - t) * (pack.reveal === 'noir' ? 14 : isAccent ? 24 : 18);
	const dy = (1 - t) * (isAccent ? 34 : pack.reveal === 'noir' ? 22 : 16);
	const sc = isAccent ? 0.9 + 0.1 * t : pack.reveal === 'noir' ? 1.05 - 0.05 * t : 1;
	return (
		<span
			style={{
				...base,
				color: colorOf,
				textShadow: shadow,
				opacity: t,
				filter: blur > 0.3 ? `blur(${blur}px)` : undefined,
				transform: `translateY(${dy}px) scale(${sc})`,
			}}
		>
			{w.text}
		</span>
	);
};

export const KineticText: React.FC<{words: Word[]; pack: Pack; box: TextBox}> = ({words, pack, box}) => {
	const lines = useMemo(() => layout(words, pack, box), [words, pack, box]);
	const align = box.align ?? 'center';
	const justify = align === 'center' ? 'center' : align === 'left' ? 'flex-start' : 'flex-end';
	const anchor = box.anchor ?? 'center';
	return (
		<div
			style={{
				position: 'absolute',
				left: box.x,
				width: box.width,
				top: box.y,
				transform: anchor === 'center' ? 'translateY(-50%)' : anchor === 'bottom' ? 'translateY(-100%)' : undefined,
				display: 'flex',
				flexDirection: 'column',
				alignItems: justify,
				textAlign: align,
				zIndex: 20, // text is always the top layer (3D-transformed panels/cards can't cover it)
			}}
		>
			{lines.map((ln, li) => {
				const prev = lines[li - 1];
				const isScript = ln.kind === 'script';
				const overlap = isScript && prev ? -(prev.kind === 'accent' ? prev.accentSize * 0.3 : prev.size * 0.2) : 0;
				return (
					<div
						key={li}
						style={{
							display: 'flex',
							flexWrap: 'nowrap',
							alignItems: 'baseline',
							justifyContent: justify,
							gap: `0 ${ln.size * 0.26}px`,
							marginTop: li === 0 ? 0 : overlap || (ln.kind === 'accent' || prev?.kind === 'accent' ? ln.size * 0.08 : ln.size * 0.16),
							transform: isScript ? `translateX(${(align === 'right' ? -1 : 1) * Math.min(70, box.width * 0.07)}px) rotate(-5deg)` : undefined,
							position: 'relative',
							zIndex: isScript ? 2 : 1,
						}}
					>
						{ln.words.map((w, wi) => (
							<WordView
								key={wi}
								w={w}
								pack={pack}
								color={box.color}
								sceneEnd={box.sceneEnd}
								size={w.style === 'accent' || w.style === 'pop' ? ln.accentSize : w.style === 'script' && ln.kind !== 'script' ? ln.size * 1.35 : ln.size}
							/>
						))}
					</div>
				);
			})}
		</div>
	);
};
