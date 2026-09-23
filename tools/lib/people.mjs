// A character in a story is nobody famous. Museum / Wikimedia portraits almost always depict a NAMED
// person ("Colonel Mowbray Thomson", "Portrait of Abraham Lincoln") — showing one for "an old soldier"
// or "his wife" is wrong: the viewer may recognise them, and it is not the character.
// These helpers read the source metadata and flag named sitters when the brief is about a generic person.

const RANKS =
	'Colonel|Col\\.|General|Gen\\.|Captain|Capt\\.|Major|Lieutenant|Lt\\.|Sergeant|Sgt\\.|Admiral|Commander|Commodore|Sir|Lord|Lady|Dame|King|Queen|Prince|Princess|Duke|Duchess|Earl|Count|Countess|Marquis|Marquess|Baron|Baroness|Emperor|Empress|Tsar|Czar|Kaiser|Sultan|Maharaja|Shah|Pharaoh|President|Senator|Governor|Chancellor|Minister|Mayor|Mr\\.?|Mrs\\.?|Miss|Mme\\.?|Madame|Monsieur|Herr|Frau|Dr\\.?|Rev\\.?|Reverend|Saint|St\\.|Pope|Cardinal|Bishop|Archbishop|Rabbi|Professor|Prof\\.';
const GIVEN =
	'John|William|James|George|Charles|Thomas|Henry|Robert|Edward|Richard|Joseph|Samuel|David|Francis|Frederick|Albert|Arthur|Alfred|Walter|Harry|Frank|Louis|Ludwig|Johann|Johannes|Friedrich|Karl|Carl|Wilhelm|Heinrich|Pierre|Jean|Jacques|Napoleon|Abraham|Benjamin|Daniel|Isaac|Andrew|Peter|Paul|Michael|Hugh|Edgar|Oscar|Victor|Leo|Nikolai|Ivan|Winston|Theodore|Ulysses|Horatio|Giuseppe|Giovanni|Antonio|Mary|Elizabeth|Anne|Anna|Margaret|Catherine|Jane|Sarah|Emily|Charlotte|Victoria|Alice|Florence|Ellen|Helen|Marie|Louise|Sophie|Emma|Julia|Harriet|Martha|Frances|Eleanor|Grace|Clara|Edith|Ada|Lucy|Isabella|Maria|Amelia|Josephine|Kate|Kitty|Nellie|Jack|Tom|Bill|Joe|Ben|Sam|Hans|Otto|Max|Fritz|Vincent|Claude|Auguste|Pablo|Leonardo|Rembrandt';
const PATTERNS = [
	new RegExp(`\\b(?:${RANKS})\\s+(?:[A-Z]\\.\\s*)*[A-Z][a-zà-ÿ'’-]{2,}(?:\\s+[A-Z][a-zà-ÿ'’-]{2,})?`), // Colonel Mowbray Thomson
	new RegExp(`\\b(?:${GIVEN})\\s+(?:[A-Z]\\.\\s*)*[A-Z][a-zà-ÿ'’-]{2,}(?:\\s+[A-Z][a-zà-ÿ'’-]{2,})?`), // Abraham Lincoln
	/\b(?:[Pp]ortrait|Bildnis|Ritratto|Retrato|Portret)\s+(?:of\s+)?(?!(?:[Aa]n?|[Tt]he|[Uu]nknown|[Uu]nidentified|[Yy]oung|[Oo]ld|[Mm]an|[Ww]oman|[Ll]ady|[Gg]entleman|[Gg]irl|[Bb]oy|[Cc]hild|[Ss]oldier|[Oo]fficer)\b)[A-Z][a-zà-ÿ'’-]+(?:\s+[A-Z][a-zà-ÿ'’-]+)*/, // Portrait of Lincoln
	new RegExp(`\\b[A-Z][a-zà-ÿ'’-]{2,},\\s+(?:${GIVEN})\\b`), // "Lincoln, Abraham"
	/\(\s*(?:c\.\s*)?1[0-9]{3}\s*[-–]\s*(?:c\.\s*)?1[0-9]{3}\s*\)/, // life dates "(1826–1888)"
];
const ANONYMOUS = /\b(?:unknown|unidentified|anonymous|portrait of an? (?:man|woman|lady|gentleman|girl|boy|child|soldier|officer))\b/i;
const PERSON =
	/\b(?:man|men|woman|women|boy|girl|child|children|kid|baby|person|people|figure|gentleman|gentlemen|lady|ladies|husband|wife|mother|father|son|daughter|brother|sister|widow|widower|stranger|soldier|sergeant|officer|sailor|captain|king|queen|prince|princess|knight|priest|monk|nun|doctor|farmer|merchant|mayor|piper|peasant|beggar|servant|maid|thief|murderer|killer|detective|elder|crowd|villagers?|townsfolk|townspeople|face|portrait|sitter)s?\b/i;

/** Is the brief about a person (so a named portrait would be a misfit)? */
export const isPersonBrief = (brief = '') => PERSON.test(brief);

/** The named sitter found in the metadata, or null ("Colonel Mowbray Thomson"). */
export const namedSitter = (...texts) => {
	const t = texts.filter(Boolean).join(' · ').replace(/_/g, ' ');
	if (!t || ANONYMOUS.test(t)) return null;
	for (const re of PATTERNS) {
		const m = t.match(re);
		if (m) return m[0].trim();
	}
	return null;
};

/** A named sitter used for a generic person → the name; if the brief itself names that person → null (wanted). */
export const namedMisfit = (brief, ...texts) => {
	if (!isPersonBrief(brief)) return null;
	const who = namedSitter(...texts);
	if (!who) return null;
	const b = brief.toLowerCase();
	const names = who.split(/\s+/).filter((w) => /^[A-Z][a-z]{2,}/.test(w) && !new RegExp(`^(?:${RANKS})$`).test(w));
	return names.some((n) => new RegExp(`\\b${n.toLowerCase().replace(/[^a-zà-ÿ]/g, '')}\\b`).test(b)) ? null : who;
};
