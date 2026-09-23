// LOCKED LOOK PACKS. These tokens are the entire visual identity of each style.
// Episodes pick a pack; they never override these values. Change them only in bank-building mode.
import type {PackId, TransitionId} from './schema';
import LOOKS from './looks.json';

// Atmosphere = every colour that is not text: the moving background, object backlight, flash, spotlight.
export type Atmos = {
	backdrop: string; // see looks.json → backdrops
	glow: string; // main moving glow of the background
	glow2: string; // its soft falloff
	floor: string; // glow rising from the bottom edge
	smoke: string; // CSS filter that tints the smoke / fog textures
	backlight: string; // halo behind hero objects (noir)
	flash: string; // flash transition
	beam: string; // spotlight beam colour
	spot: string; // spotlight floor pool
	light: string; // window light (atelier)
	line: string; // grid / ruled lines (atelier)
};

export type Pack = {
	id: PackId;
	label: string;
	colors: {
		bg: string;
		text: string;
		muted: string;
		accent: string;
		accentGlow: string;
		pop: string;
		script: string;
		cardBorder: string;
	};
	fonts: {
		sans: {family: string; weight: number; tracking: string; transform?: 'uppercase' | 'none'};
		accent: {family: string; weight: number; tracking: string; variation?: string};
		script: {family: string; weight: number};
		serif: {family: string; weight: number};
	};
	size: {normal: number; accentMin: number; accentMax: number; script: number; muted: number};
	textShadow: {normal: string; accent: string; script: string; pop: string};
	// target mean brightness per asset kind: every photo/cutout is exposure-matched to these before grading
	exposure: {photo: number; cutout: number};
	// grade applied to every photo / cutout so stock from any source matches the pack
	grade: {photo: string; cutout: string; tintBlend: string; tint: string};
	cutoutShadow: string;
	overlays: {grain: number; vignette: number; dust: boolean; windowShadow: number; halation: number; smoke: number; paper: number; grid: boolean};
	transitions: {default: TransitionId; frames: number; rotation: TransitionId[]};
	reveal: 'noir' | 'atelier';
	theme: string;
	atmos: Atmos;
};

export const PACKS: Record<PackId, Pack> = {
	// Dark cinematic kinetic typography (reference: @mis.framed)
	noir: {
		id: 'noir',
		label: 'Noir — dark cinematic kinetic typography',
		colors: {
			bg: '#0b0707',
			text: '#efe8da',
			muted: 'rgba(239,232,218,0.62)',
			accent: '#f6e41f',
			accentGlow: 'rgba(246,228,31,0.55)',
			pop: '#ff3b2f',
			script: '#f3ede2',
			cardBorder: '#f6e41f',
		},
		fonts: {
			sans: {family: 'Montserrat', weight: 800, tracking: '-0.01em'},
			accent: {family: 'Fraunces Variable', weight: 900, tracking: '-0.02em', variation: '"SOFT" 100, "WONK" 0, "opsz" 144'},
			script: {family: 'Great Vibes', weight: 400},
			serif: {family: 'Playfair Display', weight: 500},
		},
		size: {normal: 74, accentMin: 120, accentMax: 240, script: 128, muted: 52},
		textShadow: {
			normal: '0 2px 18px rgba(0,0,0,0.65)',
			accent: '0 0 14px rgba(246,228,31,0.55), 0 0 42px rgba(246,228,31,0.28), 0 4px 30px rgba(0,0,0,0.6)',
			script: '0 0 12px rgba(255,255,255,0.35), 0 2px 16px rgba(0,0,0,0.6)',
			pop: '0 0 16px rgba(255,59,47,0.6), 0 0 48px rgba(255,40,30,0.3), 0 4px 30px rgba(0,0,0,0.6)',
		},
		exposure: {photo: 0.27, cutout: 0.46},
		grade: {
			photo: 'grayscale(0.62) sepia(0.2) contrast(1.18) brightness(0.9)',
			cutout: 'grayscale(0.3) sepia(0.12) contrast(1.1)',
			tintBlend: 'soft-light',
			tint: 'rgba(120,20,24,0.35)',
		},
		cutoutShadow: 'drop-shadow(0 0 1.5px rgba(255,236,214,0.45)) drop-shadow(0 38px 50px rgba(0,0,0,0.78))',
		overlays: {grain: 0.2, vignette: 0.85, dust: true, windowShadow: 0, halation: 0.22, smoke: 0.2, paper: 0, grid: false},
		transitions: {default: 'blur-zoom', frames: 9, rotation: ['blur-zoom', 'whip-up', 'flash', 'blur-zoom', 'zoom-through', 'whip-left']},
		reveal: 'noir',
		theme: 'ember',
		atmos: {
			backdrop: 'smoke',
			glow: 'rgba(96,20,24,0.62)',
			glow2: 'rgba(40,8,10,0.25)',
			floor: 'rgba(70,14,16,0.45)',
			smoke: 'sepia(1) saturate(2.5) hue-rotate(-30deg) brightness(0.8)',
			backlight: 'radial-gradient(ellipse at 50% 48%, rgba(255,196,150,0.24) 0%, rgba(170,40,36,0.16) 38%, rgba(90,10,12,0) 68%)',
			flash: 'radial-gradient(ellipse 70% 50% at 30% 40%, rgba(255,190,120,1), rgba(255,90,40,0.7) 45%, rgba(120,10,10,0) 80%)',
			beam: 'rgba(255,236,200,0.2)',
			spot: 'radial-gradient(ellipse, rgba(255,230,190,0.25), transparent 70%)',
			light: 'rgba(255,240,220,0.2)',
			line: 'rgba(255,255,255,0.06)',
		},
	},
	// Light editorial minimal motion design (reference: @rehmaneditor999)
	atelier: {
		id: 'atelier',
		label: 'Atelier — light editorial paper & window light',
		colors: {
			bg: '#d8d6d1',
			text: '#2a2927',
			muted: 'rgba(42,41,39,0.55)',
			accent: '#1f1e1c',
			accentGlow: 'rgba(0,0,0,0)',
			pop: '#d42a38',
			script: '#34322f',
			cardBorder: '#f4f1ea',
		},
		fonts: {
			sans: {family: 'Inter Variable', weight: 560, tracking: '-0.02em'},
			accent: {family: 'Inter Variable', weight: 800, tracking: '-0.035em'},
			script: {family: 'Pinyon Script', weight: 400},
			serif: {family: 'DM Serif Display', weight: 400},
		},
		size: {normal: 72, accentMin: 110, accentMax: 210, script: 132, muted: 50},
		textShadow: {
			normal: '0 1px 0 rgba(255,255,255,0.25)',
			accent: '0 18px 30px rgba(40,36,30,0.18)',
			script: 'none',
			pop: '0 18px 30px rgba(40,36,30,0.18)',
		},
		exposure: {photo: 0.6, cutout: 0.55},
		grade: {
			photo: 'grayscale(0.3) contrast(1.02) brightness(1.02)',
			cutout: 'grayscale(0.22) contrast(1.04) brightness(1.02)',
			tintBlend: 'multiply',
			tint: 'rgba(220,214,204,0.25)',
		},
		cutoutShadow: 'drop-shadow(0 34px 34px rgba(40,35,30,0.32)) drop-shadow(0 8px 8px rgba(40,35,30,0.2))',
		overlays: {grain: 0.08, vignette: 0.35, dust: false, windowShadow: 0.55, halation: 0, smoke: 0, paper: 0.55, grid: true},
		transitions: {default: 'blur-dissolve', frames: 12, rotation: ['blur-dissolve', 'slide-up', 'blur-dissolve', 'whip-left', 'blur-zoom']},
		reveal: 'atelier',
		theme: 'paper',
		atmos: {
			backdrop: 'grid',
			glow: 'rgba(255,255,255,0.42)',
			glow2: 'rgba(255,255,255,0)',
			floor: 'rgba(60,55,48,0.22)',
			smoke: 'none',
			backlight: 'none',
			flash: 'radial-gradient(ellipse at 50% 50%, rgba(255,255,255,1), rgba(255,255,255,0.4) 60%, transparent)',
			beam: 'rgba(255,255,255,0.55)',
			spot: 'radial-gradient(ellipse, rgba(40,35,30,0.35), transparent 70%)',
			light: 'rgba(255,255,255,0.42)',
			line: 'rgba(62,58,52,0.14)',
		},
	},
};

export const W = 1080;
export const H = 1920;

// ───────────────────────── THEMES (palette + accent font + atmosphere per story mood) ─────────────────────────
// Locked like the packs: an episode picks a theme id (looks.json), it never invents colours.
type ThemeDef = {
	colors: Partial<Pack['colors']> & {accent: string; pop: string};
	accentFont?: Pack['fonts']['accent'];
	grade?: Partial<Pack['grade']>;
	atmos: Partial<Atmos>;
};
const rgb = (hex: string) => {
	const n = parseInt(hex.slice(1), 16);
	return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
};
const halo = (c: string, a: number, b: number, core = 255) =>
	`radial-gradient(ellipse at 50% 48%, rgba(${core},${core},${core},${a}) 0%, rgba(${c},${b}) 38%, rgba(${c},0) 68%)`;

export const THEMES: Record<string, ThemeDef> = {
	ember: {colors: {accent: '#f6e41f', pop: '#ff3b2f'}, atmos: {}},
	abyss: {
		colors: {bg: '#04070c', text: '#e6eef5', muted: 'rgba(230,238,245,0.6)', accent: '#7fe0ff', pop: '#ff4f6a', script: '#e6eef5', cardBorder: '#7fe0ff'},
		accentFont: {family: 'Anton', weight: 400, tracking: '0.01em'},
		grade: {photo: 'grayscale(0.7) contrast(1.15) brightness(0.88)', tint: 'rgba(20,70,110,0.38)'},
		atmos: {
			glow: 'rgba(18,64,96,0.62)', glow2: 'rgba(6,24,40,0.25)', floor: 'rgba(10,40,64,0.45)',
			smoke: 'sepia(1) saturate(1.6) hue-rotate(160deg) brightness(0.75)',
			backlight: halo('30,90,140', 0.2, 0.16, 200),
			flash: 'radial-gradient(ellipse 70% 50% at 30% 40%, rgba(200,240,255,1), rgba(60,160,220,0.7) 45%, rgba(5,30,60,0) 80%)',
			beam: 'rgba(200,235,255,0.2)', spot: 'radial-gradient(ellipse, rgba(190,230,255,0.25), transparent 70%)',
		},
	},
	venom: {
		colors: {bg: '#050805', text: '#e8f0e0', muted: 'rgba(232,240,224,0.6)', accent: '#b6ff3b', pop: '#ff3b8d', script: '#e8f0e0', cardBorder: '#b6ff3b'},
		accentFont: {family: 'Fraunces Variable', weight: 900, tracking: '-0.02em', variation: '"SOFT" 0, "WONK" 1, "opsz" 144'},
		grade: {photo: 'grayscale(0.65) sepia(0.15) contrast(1.2) brightness(0.88)', tint: 'rgba(40,90,20,0.36)'},
		atmos: {
			glow: 'rgba(40,86,24,0.6)', glow2: 'rgba(14,34,8,0.25)', floor: 'rgba(24,60,14,0.45)',
			smoke: 'sepia(1) saturate(2.2) hue-rotate(40deg) brightness(0.7)',
			backlight: halo('70,140,30', 0.2, 0.16, 225),
			flash: 'radial-gradient(ellipse 70% 50% at 30% 40%, rgba(230,255,170,1), rgba(120,200,40,0.7) 45%, rgba(20,50,10,0) 80%)',
			beam: 'rgba(220,255,190,0.2)', spot: 'radial-gradient(ellipse, rgba(210,255,170,0.22), transparent 70%)',
		},
	},
	gilded: {
		colors: {bg: '#090705', text: '#f3ead8', muted: 'rgba(243,234,216,0.6)', accent: '#ffc94a', pop: '#ff5a36', script: '#f3ead8', cardBorder: '#e2b04a'},
		accentFont: {family: 'Playfair Display', weight: 700, tracking: '-0.01em'},
		grade: {photo: 'grayscale(0.5) sepia(0.35) contrast(1.15) brightness(0.92)', tint: 'rgba(110,76,16,0.34)'},
		atmos: {
			glow: 'rgba(110,78,20,0.55)', glow2: 'rgba(40,26,6,0.25)', floor: 'rgba(70,48,10,0.45)',
			smoke: 'sepia(1) saturate(2.4) hue-rotate(-5deg) brightness(0.85)',
			backlight: halo('180,120,30', 0.24, 0.18),
			flash: 'radial-gradient(ellipse 70% 50% at 30% 40%, rgba(255,230,160,1), rgba(230,160,40,0.7) 45%, rgba(80,50,5,0) 80%)',
			beam: 'rgba(255,230,170,0.24)', spot: 'radial-gradient(ellipse, rgba(255,220,150,0.28), transparent 70%)',
		},
	},
	bone: {
		colors: {bg: '#0b0a08', text: '#dcd5c6', muted: 'rgba(220,213,198,0.58)', accent: '#f4d9a0', pop: '#d72638', script: '#e8e0cf', cardBorder: '#cdbb93'},
		accentFont: {family: 'DM Serif Display', weight: 400, tracking: '-0.01em'},
		grade: {photo: 'grayscale(0.85) sepia(0.45) contrast(1.15) brightness(0.9)', cutout: 'grayscale(0.55) sepia(0.3) contrast(1.1)', tint: 'rgba(90,70,40,0.3)'},
		atmos: {
			glow: 'rgba(80,68,48,0.45)', glow2: 'rgba(30,26,18,0.25)', floor: 'rgba(50,42,28,0.4)',
			smoke: 'sepia(1) saturate(0.6) brightness(0.7)',
			backlight: halo('140,120,90', 0.2, 0.14, 240),
			flash: 'radial-gradient(ellipse 70% 50% at 30% 40%, rgba(255,245,225,1), rgba(200,180,140,0.6) 45%, rgba(40,30,20,0) 80%)',
			beam: 'rgba(245,235,215,0.2)', spot: 'radial-gradient(ellipse, rgba(240,228,205,0.22), transparent 70%)',
		},
	},
	violet: {
		colors: {bg: '#08050d', text: '#efe8f5', muted: 'rgba(239,232,245,0.6)', accent: '#e7a6ff', pop: '#ff4d8a', script: '#efe8f5', cardBorder: '#e7a6ff'},
		accentFont: {family: 'Fraunces Variable', weight: 900, tracking: '-0.02em', variation: '"SOFT" 100, "WONK" 1, "opsz" 144'},
		grade: {photo: 'grayscale(0.65) contrast(1.15) brightness(0.88)', tint: 'rgba(80,30,120,0.36)'},
		atmos: {
			glow: 'rgba(76,34,110,0.6)', glow2: 'rgba(28,12,44,0.25)', floor: 'rgba(46,18,70,0.45)',
			smoke: 'sepia(1) saturate(2) hue-rotate(230deg) brightness(0.75)',
			backlight: halo('120,60,170', 0.2, 0.16, 235),
			flash: 'radial-gradient(ellipse 70% 50% at 30% 40%, rgba(245,215,255,1), rgba(170,90,230,0.7) 45%, rgba(40,10,60,0) 80%)',
			beam: 'rgba(240,220,255,0.2)', spot: 'radial-gradient(ellipse, rgba(235,210,255,0.24), transparent 70%)',
		},
	},
	paper: {colors: {accent: '#1f1e1c', pop: '#d42a38'}, atmos: {}},
	cream: {
		colors: {bg: '#ebe2d2', text: '#2e2620', muted: 'rgba(46,38,32,0.55)', accent: '#3a2618', pop: '#c2410c', script: '#3a2d24', cardBorder: '#f8f3ea'},
		accentFont: {family: 'DM Serif Display', weight: 400, tracking: '-0.02em'},
		grade: {photo: 'grayscale(0.2) sepia(0.2) contrast(1.02) brightness(1.02)', tint: 'rgba(235,220,196,0.25)'},
		atmos: {backdrop: 'plain', light: 'rgba(255,248,235,0.5)', line: 'rgba(90,70,50,0.12)', floor: 'rgba(90,70,50,0.2)', spot: 'radial-gradient(ellipse, rgba(70,50,30,0.3), transparent 70%)'},
	},
	sage: {
		colors: {bg: '#d6ddd0', text: '#23302a', muted: 'rgba(35,48,42,0.55)', accent: '#1d3b2e', pop: '#c0392b', script: '#23302a', cardBorder: '#f3f5ef'},
		grade: {photo: 'grayscale(0.3) contrast(1.02) brightness(1.02)', tint: 'rgba(210,222,205,0.25)'},
		atmos: {backdrop: 'lines', light: 'rgba(250,255,245,0.45)', line: 'rgba(40,60,50,0.13)', floor: 'rgba(40,60,50,0.2)', spot: 'radial-gradient(ellipse, rgba(30,50,40,0.3), transparent 70%)'},
	},
	blush: {
		colors: {bg: '#efdcd6', text: '#3a2327', muted: 'rgba(58,35,39,0.55)', accent: '#5a1f2c', pop: '#d6336c', script: '#4a2a30', cardBorder: '#fbf2ef'},
		accentFont: {family: 'Playfair Display', weight: 700, tracking: '-0.01em'},
		grade: {photo: 'grayscale(0.3) contrast(1.02) brightness(1.02)', tint: 'rgba(240,215,208,0.25)'},
		atmos: {backdrop: 'plain', light: 'rgba(255,245,242,0.5)', line: 'rgba(90,40,50,0.12)', floor: 'rgba(90,40,50,0.2)', spot: 'radial-gradient(ellipse, rgba(80,30,40,0.3), transparent 70%)'},
	},
	slate: {
		colors: {bg: '#d3d9e0', text: '#1e2833', muted: 'rgba(30,40,51,0.55)', accent: '#14263a', pop: '#e4572e', script: '#1e2833', cardBorder: '#f3f6f9'},
		accentFont: {family: 'Anton', weight: 400, tracking: '0.005em'},
		grade: {photo: 'grayscale(0.35) contrast(1.04) brightness(1.02)', tint: 'rgba(205,215,226,0.25)'},
		atmos: {backdrop: 'grid', light: 'rgba(245,250,255,0.45)', line: 'rgba(30,50,70,0.14)', floor: 'rgba(30,50,70,0.2)', spot: 'radial-gradient(ellipse, rgba(20,35,50,0.3), transparent 70%)'},
	},
};

type LookEntry = {pack: string; backdrop: string; label: string; use: string};
const LOOK_THEMES = (LOOKS as unknown as {themes: Record<string, LookEntry>}).themes;

/** The pack as the episode sees it: pack family + theme (palette, accent font, atmosphere) + backdrop. */
export const resolvePack = (id: PackId, theme?: string, backdrop?: string): Pack => {
	const base = PACKS[id];
	const t = theme ? THEMES[theme] : undefined;
	if (!t || LOOK_THEMES[theme as string]?.pack !== id) return backdrop ? {...base, atmos: {...base.atmos, backdrop}} : base;
	const noir = id === 'noir';
	const colors = {...base.colors, ...t.colors, accentGlow: noir ? `rgba(${rgb(t.colors.accent)},0.55)` : base.colors.accentGlow};
	return {
		...base,
		theme: theme as string,
		colors,
		fonts: t.accentFont ? {...base.fonts, accent: t.accentFont} : base.fonts,
		textShadow: noir
			? {
					...base.textShadow,
					accent: `0 0 14px rgba(${rgb(colors.accent)},0.55), 0 0 42px rgba(${rgb(colors.accent)},0.28), 0 4px 30px rgba(0,0,0,0.6)`,
					pop: `0 0 16px rgba(${rgb(colors.pop)},0.6), 0 0 48px rgba(${rgb(colors.pop)},0.3), 0 4px 30px rgba(0,0,0,0.6)`,
				}
			: base.textShadow,
		grade: {...base.grade, ...t.grade},
		atmos: {...base.atmos, backdrop: LOOK_THEMES[theme as string].backdrop, ...t.atmos, ...(backdrop ? {backdrop} : {})},
	};
};
