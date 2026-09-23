// Compiled render props. Produced ONLY by `sv compile` (tools/lib/compile.mjs) from an
// episode's edit.json + words.json + bank indexes. The engine never invents timing,
// layout or assets: everything it draws is in here, already resolved to frames and files.

export type PackId = 'noir' | 'atelier';

export type WordStyle = 'normal' | 'accent' | 'script' | 'muted' | 'pop';

export type Word = {
	text: string;
	style: WordStyle;
	line: number; // line index inside the scene's text block
	start: number; // frame, relative to scene start (may be negative if the scene starts late)
	end: number; // frame, relative to scene start
};

export type ImageSlot = {
	kind: 'image';
	src: string; // staticFile-relative path
	width: number;
	height: number;
	cutout: boolean; // true = transparent PNG subject
	luma?: number; // mean brightness 0..1 → exposure matched to the pack
	focus?: [number, number]; // 0..1 focal point for crops / Ken Burns target
	zoom?: number; // extra framing zoom set in the edit (full-bleed media), 1–2.5
};

export type VideoSlot = {
	kind: 'video';
	src: string;
	width: number;
	height: number;
	durationFrames: number;
	focus?: [number, number];
	zoom?: number;
	luma?: number;
};

export type DeviceSlot = ImageSlot & {
	screen: [number, number, number, number]; // x, y, w, h of the screen area, 0..1 of the image
};

export type Slot = ImageSlot | VideoSlot | DeviceSlot | ImageSlot[] | string;

export type TransitionId =
	| 'cut'
	| 'blur-zoom'
	| 'blur-dissolve'
	| 'whip-left'
	| 'whip-right'
	| 'whip-up'
	| 'flash'
	| 'zoom-through'
	| 'slide-up'
	| 'glitch';

export type CompiledScene = {
	id: string;
	template: string;
	from: number; // absolute start frame
	duration: number; // frames until the next scene starts
	exit: number; // extra frames this scene keeps rendering while the next one enters
	transitionIn: TransitionId;
	transitionOut: TransitionId; // = next scene's transitionIn (the cut belongs to both scenes)
	transitionFrames: number;
	camera: 'push' | 'pull' | 'drift' | 'still';
	anchors?: Record<string, number>; // slot → local frame of the spoken word it illustrates (entrance lands on it)
	variant: number; // deterministic layout variant (e.g. mirrored side), chosen by compiler
	words: Word[];
	slots: Record<string, Slot>;
};

export type SfxCue = {src: string; frame: number; volume: number; durationFrames?: number};

export type Bed = {
	src: string;
	from: number;
	to: number;
	volume: number;
	fadeIn: number;
	fadeOut: number;
	loop: boolean;
	duck: number; // multiplier applied while narration speaks (1 = no duck)
};

export type StoryProps = {
	pack: PackId;
	theme?: string; // engine/src/looks.json → themes (palette, accent font, atmosphere)
	backdrop?: string; // override the theme's background (looks.json → backdrops)
	fps: number;
	width: number;
	height: number;
	durationInFrames: number;
	voice: {src: string; from: number; volume: number} | null;
	speech: Array<[number, number]>; // narration activity ranges (absolute frames) for ducking
	hush?: Array<[number, number]>; // "quiet" scenes: every bed drops to near-silence (absolute frames)
	beds: Bed[];
	sfx: SfxCue[];
	scenes: CompiledScene[];
	debug?: boolean;
};
