// All fonts are bundled locally from @fontsource (no network at render time).
import '@fontsource-variable/fraunces/full.css';
import '@fontsource-variable/inter/index.css';
import '@fontsource/montserrat/500.css';
import '@fontsource/montserrat/700.css';
import '@fontsource/montserrat/800.css';
import '@fontsource/montserrat/900.css';
import '@fontsource/great-vibes/400.css';
import '@fontsource/pinyon-script/400.css';
import '@fontsource/playfair-display/500.css';
import '@fontsource/playfair-display/700.css';
import '@fontsource/dm-serif-display/400.css';
import '@fontsource/dm-serif-display/400-italic.css';
import '@fontsource/special-elite/400.css';
import '@fontsource/anton/400.css';
import {useEffect, useState} from 'react';
import {continueRender, delayRender} from 'remotion';

const FACES = [
	'900 100px "Fraunces Variable"',
	'500 100px "Fraunces Variable"',
	'560 100px "Inter Variable"',
	'800 100px "Inter Variable"',
	'500 100px "Montserrat"',
	'700 100px "Montserrat"',
	'800 100px "Montserrat"',
	'900 100px "Montserrat"',
	'400 100px "Great Vibes"',
	'400 100px "Pinyon Script"',
	'500 100px "Playfair Display"',
	'700 100px "Playfair Display"',
	'400 100px "DM Serif Display"',
	'italic 400 100px "DM Serif Display"',
	'400 100px "Special Elite"',
	'400 100px "Anton"',
];

let loaded: Promise<void> | null = null;
const loadAll = () => {
	if (!loaded) {
		loaded = Promise.all(FACES.map((f) => document.fonts.load(f, 'AaBbWw09'))).then(() => undefined);
	}
	return loaded;
};

/** Blocks the render until every bundled face is decoded, so text measurement is exact. */
export const useFontsReady = () => {
	const [ready, setReady] = useState(false);
	const [handle] = useState(() => delayRender('fonts'));
	useEffect(() => {
		loadAll()
			.then(() => setReady(true))
			.finally(() => continueRender(handle));
	}, [handle]);
	return ready;
};
