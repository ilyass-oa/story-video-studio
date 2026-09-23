import React from 'react';
import {AbsoluteFill, Img, staticFile, useCurrentFrame} from 'remotion';
import type {Pack} from '../packs';

const T = (p: string) => staticFile(`banks/textures/${p}`);

/** Smoke / fog texture layer tinted by the theme (screen-blended, drifting). */
const Smoke: React.FC<{pack: Pack; frame: number; i: number; top: number; opacity: number; speed?: number; rotate?: number}> = ({pack, frame, i, top, opacity, speed = 0.35, rotate}) => (
	<Img
		src={T(i ? 'smoke/smoke-b.png' : 'smoke/smoke-a.png')}
		style={{
			position: 'absolute',
			width: 2100,
			height: 2100,
			left: -500 + (i ? -1 : 1) * ((frame * speed) % 400) + (i ? 120 : -80),
			top,
			opacity,
			mixBlendMode: 'screen',
			filter: pack.atmos.smoke,
			transform: `rotate(${rotate ?? (i ? 12 : -8)}deg)`,
		}}
	/>
);

/** Persistent background under every scene (continuous across cuts, so transitions never flash). */
export const Backdrop: React.FC<{pack: Pack; seed?: number}> = ({pack, seed = 0}) => {
	const frame = useCurrentFrame();
	const a = pack.atmos;
	if (pack.id === 'noir') {
		const t = frame / 30;
		const gx = 50 + Math.sin(t * 0.11 + seed) * 10;
		const gy = 42 + Math.cos(t * 0.09 + seed) * 6;
		const glow = <AbsoluteFill style={{background: `radial-gradient(ellipse 85% 55% at ${gx}% ${gy}%, ${a.glow}, ${a.glow2} 55%, transparent 78%)`}} />;
		const floor = <AbsoluteFill style={{background: `radial-gradient(ellipse 60% 35% at 50% 100%, ${a.floor}, transparent 70%)`}} />;
		const o = pack.overlays.smoke;
		return (
			<AbsoluteFill style={{backgroundColor: pack.colors.bg}}>
				{glow}
				{floor}
				{a.backdrop === 'smoke' && [0, 1].map((i) => <Smoke key={i} pack={pack} frame={frame} i={i} top={i ? 700 : -100} opacity={o * (i ? 0.8 : 1)} />)}
				{a.backdrop === 'mist' &&
					[0, 1].map((i) => <Smoke key={i} pack={pack} frame={frame} i={i} top={i ? 1050 : 820} opacity={o * (i ? 1.6 : 1.3)} speed={0.25} rotate={i ? 3 : -2} />)}
				{a.backdrop === 'rays' && (
					<>
						{[0, 1, 2].map((i) => {
							const sway = Math.sin(t * 0.18 + i * 1.7 + seed) * 2.5;
							const x = [26, 52, 76][i];
							return (
								<AbsoluteFill
									key={i}
									style={{
										background: `conic-gradient(from ${180 + sway}deg at ${x}% -12%, transparent 0deg, transparent ${170 - i}deg, ${a.beam} ${176}deg, ${a.beam} ${183 + i}deg, transparent ${190 + i}deg)`,
										filter: 'blur(22px)',
										opacity: 0.55 + 0.25 * Math.sin(t * 0.4 + i * 2.1),
									}}
								/>
							);
						})}
						<Smoke pack={pack} frame={frame} i={0} top={200} opacity={o * 0.55} speed={0.2} />
					</>
				)}
				{/* void: glow + floor only — restraint */}
			</AbsoluteFill>
		);
	}
	// atelier
	const drift = Math.sin(frame / 240) * 8;
	return (
		<AbsoluteFill style={{backgroundColor: pack.colors.bg}}>
			<AbsoluteFill style={{background: `radial-gradient(ellipse 90% 60% at 32% 22%, ${a.light}, transparent 65%)`}} />
			<Img src={T('paper/paper-light.png')} style={{position: 'absolute', inset: 0, width: '100%', height: '100%', mixBlendMode: 'multiply', opacity: pack.overlays.paper}} />
			{a.backdrop === 'grid' && (
				<AbsoluteFill
					style={{
						transform: `translate(${drift}px, ${drift * 0.5}px)`,
						backgroundImage: `linear-gradient(${a.line} 1.5px, transparent 1.5px), linear-gradient(90deg, ${a.line} 1.5px, transparent 1.5px)`,
						backgroundSize: '64px 64px',
						backgroundPosition: '-2px -2px',
						inset: -40,
					}}
				/>
			)}
			{a.backdrop === 'lines' && (
				<AbsoluteFill
					style={{
						transform: `translateY(${drift * 0.6}px)`,
						backgroundImage: `linear-gradient(${a.line} 2px, transparent 2px)`,
						backgroundSize: '100% 78px',
						backgroundPosition: '0 30px',
						inset: -40,
					}}
				/>
			)}
			{a.backdrop === 'lines' && <div style={{position: 'absolute', left: 120, top: -20, bottom: -20, width: 2, background: pack.colors.pop, opacity: 0.25}} />}
			<AbsoluteFill style={{background: `radial-gradient(ellipse 120% 80% at 50% 50%, transparent 55%, ${a.floor})`}} />
		</AbsoluteFill>
	);
};
