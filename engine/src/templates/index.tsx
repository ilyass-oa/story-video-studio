// THE LOCKED TEMPLATE BANK.
// Every template is a complete, finished scene design (layout, depth, motion, lighting).
// Episodes can only choose a template id, a variant, and fill the slots declared in catalog.json.
// Adding or changing a template = bank-building mode (see skills/08-bank-builder).
import React from 'react';
import {AbsoluteFill, Img, useCurrentFrame} from 'remotion';
import type {Pack} from '../packs';
import type {CompiledScene} from '../schema';
import {KineticText} from '../text/KineticText';
import {BigWord, Cutout, DeviceWithScreen, FullMedia, PaperClip, Phone, PhotoCard, PushPin, asDevice, asImage, asImages, asVideo, src} from '../layers/Media';
import {EASE, clamp01, float, prog} from '../lib/anim';

export type Ctx = {scene: CompiledScene; pack: Pack};

const firstAt = (s: CompiledScene) => Math.max(0, Math.min(...s.words.map((w) => w.start), s.duration) - 6);
/** Entrance frame for a slot: lands on the word that names it (compiler anchor), else the scene's first word. */
const slotAt = (s: CompiledScene, slot: string) => (s.anchors?.[slot] !== undefined ? Math.max(0, s.anchors[slot] - 5) : firstAt(s));
/** the big background word rises onto the spoken word it stands for (BigWord already leads by a few frames) */
const bigAt = (s: CompiledScene) => s.anchors?.bigWord ?? firstAt(s);
const wordAt = (s: CompiledScene, frac: number) => {
	if (!s.words.length) return Math.round(s.duration * frac);
	const i = Math.min(s.words.length - 1, Math.floor(frac * s.words.length));
	return Math.max(0, s.words[i].start - 4);
};
const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
/** Flattens 3D-transformed children into one 2D layer (headless Chrome otherwise depth-sorts them above the text). */
const Flat3D: React.FC<{children: React.ReactNode}> = ({children}) => (
	<div style={{position: 'absolute', inset: 0, isolation: 'isolate', transformStyle: 'flat', transform: 'translateZ(0)', zIndex: 0}}>{children}</div>
);
const Missing: React.FC<{what: string}> = ({what}) => (
	<div style={{position: 'absolute', left: 60, top: 60, color: 'red', fontSize: 40, fontFamily: 'monospace'}}>MISSING SLOT: {what}</div>
);

/* 1 ─ type-center: pure kinetic typography, optional giant ghost word behind */
const TypeCenter: React.FC<Ctx> = ({scene, pack}) => {
	const big = str(scene.slots.bigWord);
	return (
		<AbsoluteFill>
			{big && <BigWord text={big} pack={pack} cy={960} at={bigAt(scene)} opacity={0.22} />}
			<KineticText words={scene.words} pack={pack} box={{sceneEnd: scene.duration, x: 70, y: scene.variant % 2 ? 820 : 940, width: 940, fill: 124}} />
		</AbsoluteFill>
	);
};

/* 2 ─ object-hero: one graded cutout as the visual subject, text above it */
const ObjectHero: React.FC<Ctx> = ({scene, pack}) => {
	const obj = asImage(scene.slots.object);
	const v = scene.variant % 3;
	const textY = v === 1 ? 1530 : 470;
	const objY = v === 1 ? 900 : 1170;
	return (
		<AbsoluteFill>
			{obj ? (
				<Cutout slot={obj} pack={pack} cx={540} cy={objY} maxW={v === 2 ? 980 : 880} maxH={v === 1 ? 900 : 980} at={slotAt(scene, 'object')} enter={v === 2 ? 'pop' : 'rise'} echo={pack.id === 'atelier'} seed={scene.from} />
			) : (
				<Missing what="object" />
			)}
			<KineticText words={scene.words} pack={pack} box={{sceneEnd: scene.duration, x: 80, y: textY, width: 920, align: v === 2 ? 'left' : 'center'}} />
		</AbsoluteFill>
	);
};

/* 3 ─ object-side: subject on one side, stacked left-aligned lines on the other */
const ObjectSide: React.FC<Ctx> = ({scene, pack}) => {
	const obj = asImage(scene.slots.object);
	const right = scene.variant % 2 === 0;
	return (
		<AbsoluteFill>
			{obj ? (
				<Cutout slot={obj} pack={pack} cx={right ? 800 : 280} cy={1000} maxW={470} maxH={980} at={slotAt(scene, 'object')} enter={right ? 'slide-right' : 'slide-left'} seed={scene.from} />
			) : (
				<Missing what="object" />
			)}
			<KineticText words={scene.words} pack={pack} box={{sceneEnd: scene.duration, x: right ? 70 : 590, y: 960, width: 440, align: 'left', fill: 96}} />
		</AbsoluteFill>
	);
};

/* 4 ─ word-behind: giant word/letter behind the subject, subject in front (depth sandwich) */
const WordBehind: React.FC<Ctx> = ({scene, pack}) => {
	const obj = asImage(scene.slots.object);
	const big = str(scene.slots.bigWord) ?? scene.words.find((w) => w.style === 'accent')?.text ?? '';
	// a wide subject (banknote, car, skyline) would hide the whole word: the word rises, the subject overlaps its lower part
	const wide = !!obj && obj.width / Math.max(1, obj.height) > 1.25;
	return (
		<AbsoluteFill>
			<BigWord text={big} pack={pack} cy={wide ? 640 : 880} at={bigAt(scene)} />
			{obj ? <Cutout slot={obj} pack={pack} cx={540} cy={wide ? 1030 : 990} maxW={wide ? 860 : 900} maxH={wide ? 600 : 1060} at={slotAt(scene, 'object') + 4} enter="zoom" seed={scene.from} floatAmp={6} /> : <Missing what="object" />}
			<KineticText words={scene.words.filter((w) => w.text !== big)} pack={pack} box={{sceneEnd: scene.duration, x: 80, y: 1790, anchor: 'bottom', width: 920, scale: 0.85}} />
		</AbsoluteFill>
	);
};

/* 5 ─ photo-full: full-bleed graded photo/clip with Ken Burns, text over a scrim */
const PhotoFull: React.FC<Ctx> = ({scene, pack}) => {
	const media = asVideo(scene.slots.photo) ?? asImage(scene.slots.photo);
	const top = scene.variant % 2 === 1;
	return (
		<AbsoluteFill>
			{media ? <FullMedia slot={media} pack={pack} dur={scene.duration + scene.exit} scrim={top ? 'top' : 'bottom'} zoom={scene.variant % 3 === 2 ? [1.0, 1.12] : [1.14, 1.0]} /> : <Missing what="photo" />}
			<KineticText words={scene.words} pack={pack} box={{sceneEnd: scene.duration, x: 80, y: top ? 480 : 1300, width: 920, fill: 104}} />
		</AbsoluteFill>
	);
};

/* 6 ─ photo-framed: one photo on a card (glow rim / polaroid) floating in depth */
const PhotoFramed: React.FC<Ctx> = ({scene, pack}) => {
	const img = asImage(scene.slots.photo);
	const sign = scene.variant % 2 ? 1 : -1;
	// the card follows the picture: a wide painting / group photo is shown whole, never cropped to a sliver
	const ar = img ? img.width / Math.max(1, img.height) : 0.84;
	const wide = ar > 1.15;
	const w = wide ? 900 : 720;
	const h = wide ? Math.round(Math.max(560, Math.min(780, w / ar))) : 860;
	return (
		<AbsoluteFill>
			<Flat3D>{img ? <PhotoCard slot={img} pack={pack} cx={540} cy={wide ? 1080 : 1110} w={w} h={h} rotate={3 * sign} at={slotAt(scene, 'photo')} from="bottom" seed={scene.from} pin={pack.id === 'atelier'} /> : <Missing what="photo" />}</Flat3D>
			<KineticText words={scene.words} pack={pack} box={{sceneEnd: scene.duration, x: 80, y: 430, width: 920}} />
		</AbsoluteFill>
	);
};

/* 7 ─ card-stack: 2–4 photo cards fly in one by one on the narration, stacking */
const CARD_SPOTS = [
	{cx: 360, cy: 800, rot: -9, from: 'left' as const},
	{cx: 720, cy: 930, rot: 8, from: 'right' as const},
	{cx: 470, cy: 1120, rot: -3, from: 'bottom' as const},
	{cx: 760, cy: 1230, rot: 6, from: 'right' as const},
];
const CardStack: React.FC<Ctx> = ({scene, pack}) => {
	const imgs = asImages(scene.slots.photos).slice(0, 4);
	return (
		<AbsoluteFill>
			{imgs.length === 0 && <Missing what="photos" />}
			<Flat3D>
				{imgs.map((img, i) => {
					const s = CARD_SPOTS[i];
					return <PhotoCard key={i} slot={img} pack={pack} cx={scene.variant % 2 ? 1080 - s.cx : s.cx} cy={s.cy} w={450} h={560} rotate={s.rot} at={wordAt(scene, i / imgs.length)} from={s.from} seed={i + scene.from} />;
				})}
			</Flat3D>
			<KineticText words={scene.words} pack={pack} box={{sceneEnd: scene.duration, x: 80, y: 1600, width: 920, scale: 0.95}} />
		</AbsoluteFill>
	);
};

/* 8 ─ tv-screen: vintage TV (bank device) with a photo playing on its screen */
const TvScreen: React.FC<Ctx> = ({scene, pack}) => {
	const dev = asDevice(scene.slots.device);
	const scr = asVideo(scene.slots.screen) ?? asImage(scene.slots.screen);
	if (!dev) return <Missing what="device" />;
	return (
		<AbsoluteFill>
			<DeviceWithScreen device={dev} pack={pack} cx={540} cy={1180} maxW={840} maxH={900} at={slotAt(scene, 'screen')}>
				{scr ? <FullMedia slot={scr} pack={pack} dur={scene.duration + scene.exit} scrim="none" zoom={[1.25, 1.05]} /> : <AbsoluteFill style={{background: '#222'}} />}
			</DeviceWithScreen>
			<KineticText words={scene.words} pack={pack} box={{sceneEnd: scene.duration, x: 80, y: 480, width: 920}} />
		</AbsoluteFill>
	);
};

/* 9 ─ phone-screen: phone rises into frame; its screen shows a photo or a short screen text */
const PhoneScreen: React.FC<Ctx> = ({scene, pack}) => {
	const frame = useCurrentFrame();
	const scr = asImage(scene.slots.screen);
	const screenText = str(scene.slots.screenText);
	const t = prog(frame, firstAt(scene) + 14, 12);
	return (
		<AbsoluteFill>
			<Phone cx={540} cy={1260} w={500} at={firstAt(scene)} pack={pack}>
				{scr && <Img src={src(scr.src)} style={{position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: pack.grade.photo}} />}
				{screenText && (
					<AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', padding: 40}}>
						<div style={{fontFamily: pack.fonts.accent.family, fontWeight: 900, fontSize: 84, lineHeight: 0.95, color: '#161514', textAlign: 'center', opacity: t, filter: `blur(${(1 - t) * 12}px)`, fontVariationSettings: pack.fonts.accent.variation, letterSpacing: '-0.02em'}}>
							{screenText}
						</div>
					</AbsoluteFill>
				)}
			</Phone>
			<KineticText words={scene.words} pack={pack} box={{sceneEnd: scene.duration, x: 80, y: 420, width: 920}} />
		</AbsoluteFill>
	);
};

/* 10 ─ pinned-note: torn paper note pinned to the board, printed words + object on it */
const TORN = 'polygon(0% 2%, 6% 0%, 14% 1.5%, 23% 0%, 31% 1.2%, 42% 0.2%, 53% 1.6%, 64% 0%, 73% 1.3%, 84% 0.1%, 93% 1.5%, 100% 0.5%, 99% 12%, 100% 26%, 98.8% 41%, 100% 57%, 99% 72%, 100% 86%, 98.5% 100%, 88% 98.6%, 76% 100%, 63% 98.8%, 51% 100%, 39% 98.5%, 27% 100%, 15% 98.9%, 5% 100%, 0% 98%, 1.2% 84%, 0% 69%, 1% 53%, 0% 38%, 1.3% 22%)';
const PinnedNote: React.FC<Ctx> = ({scene, pack}) => {
	const frame = useCurrentFrame();
	const obj = asImage(scene.slots.object);
	const at = firstAt(scene);
	const t = prog(frame, at - 4, 18);
	const sign = scene.variant % 2 ? 1 : -1;
	const fy = float(frame, 3, 5, 170);
	const w = 660;
	const h = 880;
	return (
		<AbsoluteFill>
			<div style={{position: 'absolute', left: 540 - w / 2, top: 1010 - h / 2, width: w, height: h, transform: `perspective(1600px) translateY(${(1 - t) * 260 + fy}px) rotateX(${(1 - t) * 30}deg) rotate(${sign * (3 + (1 - t) * 10)}deg)`, opacity: clamp01(t * 2), filter: `drop-shadow(0 30px 30px rgba(30,25,20,0.35))`}}>
				<div style={{position: 'absolute', inset: 0, clipPath: TORN, background: 'linear-gradient(160deg,#f6f4ee,#e9e6de)'}}>
					<Img src={src('banks/textures/paper/paper-light.png')} style={{position: 'absolute', inset: 0, width: '100%', height: '100%', mixBlendMode: 'multiply', opacity: 0.8}} />
					<div style={{position: 'absolute', inset: 22, border: '1.5px solid rgba(60,55,50,0.25)'}} />
					<KineticText words={scene.words} pack={{...pack, colors: {...pack.colors, accent: '#b8232b', pop: '#b8232b', script: '#2a2724'}, textShadow: {normal: 'none', accent: 'none', script: 'none', pop: 'none'}}} box={obj ? {sceneEnd: scene.duration, x: 50, y: 70, width: w - 100, anchor: 'top', align: 'left', scale: 0.62, maxAccent: 118, color: '#23211e'} : {sceneEnd: scene.duration, x: 55, y: h * 0.46, width: w - 110, align: 'left', fill: 80, maxAccent: 150, color: '#23211e'}} />
					{obj && <Cutout slot={obj} pack={pack} cx={w / 2} cy={h * 0.66} maxW={w * 0.62} maxH={h * 0.5} at={Math.max(at + 8, slotAt(scene, 'object'))} enter="pop" seed={scene.from} floatAmp={0} grade backlight={false} />}
				</div>
				<PushPin x={w / 2} y={18} />
			</div>
			<PaperClip x={540 - w / 2 - 20} y={1010 + h / 2 - 190} rotate={-28} scale={1.1} />
		</AbsoluteFill>
	);
};

/* 11 ─ split-panel: tall paper panel swings in like a door holding a photo, text beside it */
const SplitPanel: React.FC<Ctx> = ({scene, pack}) => {
	const frame = useCurrentFrame();
	const img = asImage(scene.slots.photo);
	const at = slotAt(scene, 'photo');
	const t = prog(frame, at - 2, 22, EASE.out);
	const left = scene.variant % 2 === 1;
	const w = 470;
	const h = 1260;
	const cx = left ? 305 : 775;
	return (
		<AbsoluteFill>
			<Flat3D>
			<div style={{position: 'absolute', left: cx - w / 2, top: 980 - h / 2, width: w, height: h, transformOrigin: left ? 'left center' : 'right center', transform: `perspective(1700px) rotateY(${(left ? 1 : -1) * (75 * (1 - t) + 10)}deg)`, boxShadow: '40px 50px 80px rgba(30,25,20,0.35)', background: pack.id === 'noir' ? '#1b1414' : '#ecebe7', overflow: 'hidden'}}>
				{img ? (
					<Img src={src(img.src)} style={{width: '100%', height: '100%', objectFit: 'cover', objectPosition: `${(img.focus?.[0] ?? 0.5) * 100}% ${(img.focus?.[1] ?? 0.4) * 100}%`, filter: pack.grade.photo}} />
				) : (
					<Missing what="photo" />
				)}
				<AbsoluteFill style={{background: `linear-gradient(${left ? 90 : 270}deg, rgba(0,0,0,0.35), transparent 30%)`}} />
			</div>
			<div style={{position: 'absolute', left: left ? cx - w / 2 - 34 : cx + w / 2, top: 980 - h / 2, width: 34, height: h, background: pack.id === 'noir' ? '#0c0808' : '#bdbab3', transform: `perspective(1700px) rotateY(${(left ? 1 : -1) * (75 * (1 - t) + 10)}deg)`, transformOrigin: left ? 'right center' : 'left center', opacity: 0.8}} />
			</Flat3D>
			<KineticText words={scene.words} pack={pack} box={{sceneEnd: scene.duration, x: left ? 590 : 60, y: 1000, width: 440, align: 'left', fill: 92}} />
		</AbsoluteFill>
	);
};

/* 12 ─ scatter: several small cutouts orbit a centred phrase (metaphor cluster) */
const SPOTS = [
	[250, 560, -14],
	[830, 680, 12],
	[210, 1400, 9],
	[860, 1340, -10],
	[540, 1560, 4],
];
const Scatter: React.FC<Ctx> = ({scene, pack}) => {
	const objs = asImages(scene.slots.objects).slice(0, 5);
	return (
		<AbsoluteFill>
			{objs.length === 0 && <Missing what="objects" />}
			{objs.map((o, i) => (
				<Cutout key={i} slot={o} pack={pack} cx={SPOTS[i][0]} cy={SPOTS[i][1]} maxW={380} maxH={380} rotate={SPOTS[i][2]} at={wordAt(scene, i / objs.length)} enter="pop" seed={i + 2} floatAmp={14} />
			))}
			<KineticText words={scene.words} pack={pack} box={{sceneEnd: scene.duration, x: 110, y: 980, width: 860}} />
		</AbsoluteFill>
	);
};

/* 13 ─ figure-spotlight: a person cutout in a stage spotlight, text beside */
const FigureSpotlight: React.FC<Ctx> = ({scene, pack}) => {
	const frame = useCurrentFrame();
	const fig = asImage(scene.slots.figure);
	const at = slotAt(scene, 'figure');
	const beam = prog(frame, at - 6, 20);
	const noir = pack.id === 'noir';
	return (
		<AbsoluteFill>
			<AbsoluteFill style={{background: `conic-gradient(from 180deg at 71% -8%, transparent 0deg, transparent 165deg, ${pack.atmos.beam} 176deg, ${pack.atmos.beam} 190deg, transparent 201deg)`, opacity: beam, filter: 'blur(18px)'}} />
			<div style={{position: 'absolute', left: 770 - 330, top: 1660, width: 660, height: 120, borderRadius: '50%', background: pack.atmos.spot, opacity: beam}} />
			{fig ? <Cutout slot={fig} pack={pack} cx={800} cy={1160} maxW={500} maxH={1160} at={slotAt(scene, 'figure')} enter="fade" seed={scene.from} floatAmp={0} /> : <Missing what="figure" />}
			<KineticText words={scene.words} pack={pack} box={{sceneEnd: scene.duration, x: 60, y: 600, width: 500, align: 'left', scale: 1.15, fill: 92}} />
		</AbsoluteFill>
	);
};

/* 14 ─ outro-hold: calm final line, optional small object, fades to the pack ground */
const OutroHold: React.FC<Ctx> = ({scene, pack}) => {
	const frame = useCurrentFrame();
	const obj = asImage(scene.slots.object);
	const end = scene.duration + scene.exit;
	const fade = prog(frame, end - 24, 22, EASE.inOut);
	return (
		<AbsoluteFill>
			{obj && <Cutout slot={obj} pack={pack} cx={540} cy={1280} maxW={560} maxH={600} at={slotAt(scene, 'object')} enter="rise" seed={scene.from} />}
			<KineticText words={scene.words} pack={pack} box={{sceneEnd: scene.duration, x: 80, y: obj ? 700 : 940, width: 920, fill: 100}} />
			<AbsoluteFill style={{background: pack.colors.bg, opacity: fade}} />
		</AbsoluteFill>
	);
};

export const TEMPLATES: Record<string, React.FC<Ctx>> = {
	'type-center': TypeCenter,
	'object-hero': ObjectHero,
	'object-side': ObjectSide,
	'word-behind': WordBehind,
	'photo-full': PhotoFull,
	'photo-framed': PhotoFramed,
	'card-stack': CardStack,
	'tv-screen': TvScreen,
	'phone-screen': PhoneScreen,
	'pinned-note': PinnedNote,
	'split-panel': SplitPanel,
	scatter: Scatter,
	'figure-spotlight': FigureSpotlight,
	'outro-hold': OutroHold,
};
