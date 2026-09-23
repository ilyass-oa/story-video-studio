// Image/video search providers. Every candidate carries provenance + licence so nothing
// enters an episode without a source record. No-key providers work out of the box;
// keyed providers activate automatically when their key exists in config/secrets.env.
import {getJSON} from './env.mjs';

const enc = encodeURIComponent;

// Licences we can use commercially AND modify (cutouts/grades are modifications).
const OK_CC = new Set(['cc0', 'pdm', 'by', 'by-sa']);

const openverse = async (q, n) => {
	const d = await getJSON(`https://api.openverse.org/v1/images/?q=${enc(q)}&page_size=${Math.min(n, 20)}&license_type=commercial,modification&mature=false`);
	return d.results
		.filter((r) => OK_CC.has(r.license))
		.map((r) => ({
			provider: `openverse:${r.source}`,
			id: r.id,
			title: r.title,
			full: r.url,
			// previews straight from the source CDN — Openverse's /thumb endpoint counts against its 20 req/min API burst
			thumb: /staticflickr\.com\/.+_[a-z]\.jpg$/.test(r.url) ? r.url.replace(/_[a-z]\.jpg$/, '_z.jpg') : r.url,
			width: r.width,
			height: r.height,
			license: `${r.license.toUpperCase()} ${r.license_version ?? ''}`.trim(),
			attribution: r.license === 'cc0' || r.license === 'pdm' ? null : `${r.title} by ${r.creator ?? 'unknown'} (${r.license.toUpperCase()} ${r.license_version ?? ''})`,
			page: r.foreign_landing_url,
		}));
};

const wikimedia = async (q, n) => {
	const url = `https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrsearch=${enc(`filetype:bitmap ${q}`)}&gsrnamespace=6&gsrlimit=${Math.min(n, 30)}&prop=imageinfo&iiprop=url|size|extmetadata|mime&iiurlwidth=640`;
	const d = await getJSON(url);
	const pages = Object.values(d.query?.pages ?? {});
	return pages
		.map((p) => {
			const ii = p.imageinfo?.[0];
			if (!ii || !/image\/(jpeg|png|webp)/.test(ii.mime)) return null;
			const lic = (ii.extmetadata?.LicenseShortName?.value ?? '').toLowerCase();
			const ok = /public domain|cc0|pd|cc by(-sa)? \d/.test(lic);
			if (!ok) return null;
			const artist = (ii.extmetadata?.Artist?.value ?? '').replace(/<[^>]+>/g, '').trim();
			return {
				provider: 'wikimedia',
				id: String(p.pageid),
				title: p.title.replace(/^File:/, ''),
				desc: `${ii.extmetadata?.ObjectName?.value ?? ''} ${ii.extmetadata?.ImageDescription?.value ?? ''}`.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300),
				full: ii.width > 2600 ? ii.thumburl.replace(/\/\d+px-/, '/1920px-') : ii.url,
				thumb: ii.thumburl,
				width: ii.width,
				height: ii.height,
				license: ii.extmetadata?.LicenseShortName?.value,
				attribution: /public domain|cc0/.test(lic) ? null : `${p.title.replace(/^File:/, '')} by ${artist || 'unknown'} (${ii.extmetadata?.LicenseShortName?.value})`,
				page: ii.descriptionurl,
			};
		})
		.filter(Boolean);
};

const met = async (q, n) => {
	const s = await getJSON(`https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&q=${enc(q)}`);
	const ids = (s.objectIDs ?? []).slice(0, Math.min(n, 24));
	const objs = await Promise.all(ids.map((id) => getJSON(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`).catch(() => null)));
	return objs
		.filter((o) => o && o.isPublicDomain && o.primaryImage)
		.map((o) => ({
			provider: 'met',
			id: String(o.objectID),
			title: o.title,
			full: o.primaryImage,
			thumb: o.primaryImageSmall || o.primaryImage,
			width: null,
			height: null,
			license: 'CC0 (Met Open Access)',
			attribution: null,
			page: o.objectURL,
		}));
};

const cleveland = async (q, n) => {
	const d = await getJSON(`https://openaccess-api.clevelandart.org/api/artworks/?q=${enc(q)}&has_image=1&cc0=1&limit=${Math.min(n, 30)}`);
	return (d.data ?? []).map((r) => ({
		provider: 'cleveland',
		id: String(r.id),
		title: r.title,
		full: r.images?.print?.url ?? r.images?.web?.url,
		thumb: r.images?.web?.url,
		width: Number(r.images?.print?.width ?? r.images?.web?.width) || null,
		height: Number(r.images?.print?.height ?? r.images?.web?.height) || null,
		license: 'CC0 (Cleveland Museum of Art Open Access)',
		attribution: null,
		page: r.url,
	}));
};

const artic = async (q, n) => {
	const d = await getJSON(`https://api.artic.edu/api/v1/artworks/search?q=${enc(q)}&query[term][is_public_domain]=true&fields=id,title,image_id,artist_display,thumbnail&limit=${Math.min(n, 30)}`);
	const iiif = d.config?.iiif_url ?? 'https://www.artic.edu/iiif/2';
	return (d.data ?? [])
		.filter((r) => r.image_id)
		.map((r) => ({
			provider: 'artic',
			id: String(r.id),
			title: r.title,
			full: `${iiif}/${r.image_id}/full/1686,/0/default.jpg`,
			thumb: `${iiif}/${r.image_id}/full/400,/0/default.jpg`,
			width: r.thumbnail?.width ?? null,
			height: r.thumbnail?.height ?? null,
			license: 'CC0 (Art Institute of Chicago public domain)',
			attribution: null,
			page: `https://www.artic.edu/artworks/${r.id}`,
		}));
};

const pexels = async (q, n) => {
	const d = await getJSON(`https://api.pexels.com/v1/search?query=${enc(q)}&per_page=${Math.min(n, 40)}`, {Authorization: process.env.PEXELS_API_KEY});
	return d.photos.map((p) => ({
		provider: 'pexels',
		id: String(p.id),
		title: p.alt || q,
		full: p.src.original.includes('?') ? p.src.original : `${p.src.original}?auto=compress&w=2400`,
		thumb: p.src.medium,
		width: p.width,
		height: p.height,
		license: 'Pexels License',
		attribution: null,
		page: p.url,
	}));
};

const pixabay = async (q, n) => {
	const d = await getJSON(`https://pixabay.com/api/?key=${process.env.PIXABAY_API_KEY}&q=${enc(q)}&image_type=photo&per_page=${Math.max(3, Math.min(n, 60))}&safesearch=true`);
	return d.hits.map((h) => ({
		provider: 'pixabay',
		id: String(h.id),
		title: h.tags,
		full: h.largeImageURL,
		thumb: h.webformatURL,
		width: h.imageWidth,
		height: h.imageHeight,
		license: 'Pixabay Content License',
		attribution: null,
		page: h.pageURL,
	}));
};

const unsplash = async (q, n) => {
	const d = await getJSON(`https://api.unsplash.com/search/photos?query=${enc(q)}&per_page=${Math.min(n, 30)}`, {Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}`});
	return d.results.map((r) => ({
		provider: 'unsplash',
		id: r.id,
		title: r.alt_description || q,
		full: `${r.urls.raw}&w=2400&q=85`,
		thumb: r.urls.small,
		width: r.width,
		height: r.height,
		license: 'Unsplash License',
		attribution: `Photo by ${r.user?.name} on Unsplash`,
		page: r.links.html,
	}));
};

const smithsonian = async (q, n) => {
	const key = process.env.SMITHSONIAN_API_KEY || 'DEMO_KEY';
	const d = await getJSON(`https://api.si.edu/openaccess/api/v1.0/search?q=${enc(`${q} AND online_media_type:"Images"`)}&rows=${Math.min(n, 30)}&api_key=${key}`);
	return (d.response?.rows ?? [])
		.map((r) => {
			const m = r.content?.descriptiveNonRepeating?.online_media?.media?.find((x) => x.type === 'Images' && x.usage?.access === 'CC0');
			if (!m) return null;
			const res = m.resources?.find((x) => /Screen|High-resolution JPEG/i.test(x.label)) ?? null;
			return {
				provider: 'smithsonian',
				id: r.id,
				title: r.title,
				full: res?.url ?? m.content,
				thumb: m.thumbnail,
				width: res?.width ?? null,
				height: res?.height ?? null,
				license: 'CC0 (Smithsonian Open Access)',
				attribution: null,
				page: r.content?.descriptiveNonRepeating?.record_link,
			};
		})
		.filter(Boolean);
};

// ── video ──
const pexelsVideo = async (q, n) => {
	const d = await getJSON(`https://api.pexels.com/videos/search?query=${enc(q)}&per_page=${Math.min(n, 20)}&orientation=portrait`, {Authorization: process.env.PEXELS_API_KEY});
	return d.videos.map((v) => {
		const files = v.video_files.filter((f) => f.file_type === 'video/mp4').sort((a, b) => b.height - a.height);
		const f = files.find((x) => x.height <= 1920) ?? files[0];
		return {provider: 'pexels-video', id: String(v.id), title: q, full: f.link, thumb: v.image, width: f.width, height: f.height, duration: v.duration, license: 'Pexels License', attribution: null, page: v.url, video: true};
	});
};

const pixabayVideo = async (q, n) => {
	const d = await getJSON(`https://pixabay.com/api/videos/?key=${process.env.PIXABAY_API_KEY}&q=${enc(q)}&per_page=${Math.max(3, Math.min(n, 30))}`);
	return d.hits.map((h) => {
		const f = h.videos.large?.url ? h.videos.large : h.videos.medium;
		return {provider: 'pixabay-video', id: String(h.id), title: h.tags, full: f.url, thumb: f.thumbnail, width: f.width, height: f.height, duration: h.duration, license: 'Pixabay Content License', attribution: null, page: h.pageURL, video: true};
	});
};

export const PROVIDERS = {
	// kind: which asset kinds they are good for
	pexels: {fn: pexels, key: 'PEXELS_API_KEY', good: ['photo', 'cutout']},
	unsplash: {fn: unsplash, key: 'UNSPLASH_ACCESS_KEY', good: ['photo', 'cutout']},
	pixabay: {fn: pixabay, key: 'PIXABAY_API_KEY', good: ['photo', 'cutout']},
	openverse: {fn: openverse, good: ['photo', 'cutout']},
	wikimedia: {fn: wikimedia, good: ['photo', 'cutout']},
	met: {fn: met, good: ['cutout']},
	cleveland: {fn: cleveland, good: ['cutout']},
	artic: {fn: artic, good: ['cutout', 'photo']},
	smithsonian: {fn: smithsonian, good: ['cutout']},
	'pexels-video': {fn: pexelsVideo, key: 'PEXELS_API_KEY', good: ['video']},
	'pixabay-video': {fn: pixabayVideo, key: 'PIXABAY_API_KEY', good: ['video']},
};

export const available = (kind) =>
	Object.entries(PROVIDERS)
		.filter(([, p]) => (!p.key || process.env[p.key]) && p.good.includes(kind))
		.map(([k]) => k);

/** Search several providers in parallel; failures of one provider never kill the search. */
export const search = async (query, {kind = 'photo', n = 12, providers} = {}) => {
	const list = providers?.length ? providers : available(kind);
	const results = await Promise.all(
		list.map(async (name) => {
			try {
				const r = await PROVIDERS[name].fn(query, n);
				return r.slice(0, n);
			} catch (e) {
				return [{error: `${name}: ${e.message}`}];
			}
		}),
	);
	const flat = results.flat();
	return {candidates: flat.filter((c) => !c.error && c.full), errors: flat.filter((c) => c.error).map((c) => c.error), providers: list};
};
