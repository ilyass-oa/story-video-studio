import React from 'react';
import {AbsoluteFill, Img, staticFile, useCurrentFrame} from 'remotion';
import type {Pack} from '../packs';
import {rnd} from '../lib/anim';

const T = (p: string) => staticFile(`banks/textures/${p}`);

/** Film surface above all scenes: window light, halation, dust, grain, vignette. */
export const Overlays: React.FC<{pack: Pack; seed?: number}> = ({pack, seed = 0}) => {
	const frame = useCurrentFrame();
	const o = pack.overlays;
	const grainIdx = Math.floor(frame / 2) % 12; // film grain refreshes at 15 fps
	const gx = Math.floor(rnd(`gx${Math.floor(frame / 2)}`, 0, 256));
	const gy = Math.floor(rnd(`gy${Math.floor(frame / 2)}`, 0, 256));
	const dustIdx = Math.floor(frame / 3) % 4;
	const shadow = ['a', 'b', 'c'][seed % 3];
	return (
		<AbsoluteFill style={{pointerEvents: 'none'}}>
			{o.windowShadow > 0 && (
				<Img
					src={T(`shadows/window-${shadow}.png`)}
					style={{
						position: 'absolute',
						width: 1180,
						height: 2080,
						left: -50 + Math.sin(frame / 300) * 30,
						top: -80 + Math.cos(frame / 360) * 20,
						opacity: o.windowShadow,
						mixBlendMode: 'multiply',
					}}
				/>
			)}
			{o.halation > 0 && (
				<AbsoluteFill style={{backdropFilter: 'blur(26px) brightness(1.35)', mixBlendMode: 'screen', opacity: o.halation}} />
			)}
			{o.dust && (
				<Img
					src={T(`dust/dust-${dustIdx}.png`)}
					style={{position: 'absolute', inset: 0, width: '100%', height: '100%', mixBlendMode: 'screen', opacity: 0.55, transform: `translate(${rnd(`dx${dustIdx}`, -40, 40)}px, ${rnd(`dy${dustIdx}`, -40, 40)}px)`}}
				/>
			)}
			<AbsoluteFill
				style={{
					backgroundImage: `url(${T(`grain/grain-${String(grainIdx).padStart(2, '0')}.png`)})`,
					backgroundSize: '256px 256px',
					backgroundPosition: `${gx}px ${gy}px`,
					mixBlendMode: 'overlay',
					opacity: o.grain,
				}}
			/>
			<AbsoluteFill
				style={{
					background: `radial-gradient(ellipse 78% 62% at 50% 48%, transparent 45%, rgba(0,0,0,${o.vignette * 0.75}) 100%)`,
				}}
			/>
		</AbsoluteFill>
	);
};
