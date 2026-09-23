import React from 'react';
import {AbsoluteFill, Sequence, useCurrentFrame} from 'remotion';
import {Soundtrack} from './audio/Soundtrack';
import {useFontsReady} from './fonts';
import {Backdrop} from './layers/Backdrop';
import {Overlays} from './layers/Overlays';
import {SceneShell} from './layers/SceneShell';
import {resolvePack} from './packs';
import type {StoryProps} from './schema';
import {TEMPLATES} from './templates';

const Debug: React.FC<{props: StoryProps}> = ({props}) => {
	const f = useCurrentFrame();
	const sc = props.scenes.filter((s) => f >= s.from && f < s.from + s.duration)[0];
	return (
		<div style={{position: 'absolute', left: 20, bottom: 20, padding: '8px 14px', background: 'rgba(0,0,0,0.7)', color: '#0f0', font: '28px monospace', zIndex: 99}}>
			{(f / props.fps).toFixed(2)}s f{f} {sc ? `${sc.id} ${sc.template}#${sc.variant}` : ''}
		</div>
	);
};

export const Story: React.FC<StoryProps> = (props) => {
	const ready = useFontsReady();
	const pack = React.useMemo(() => resolvePack(props.pack, props.theme, props.backdrop), [props.pack, props.theme, props.backdrop]);
	if (!ready) return <AbsoluteFill style={{backgroundColor: pack.colors.bg}} />;
	return (
		<AbsoluteFill style={{backgroundColor: pack.colors.bg, overflow: 'hidden'}}>
			<Backdrop pack={pack} seed={props.scenes.length} />
			{props.scenes.map((scene) => {
				const T = TEMPLATES[scene.template];
				return (
					<Sequence key={scene.id} from={scene.from} durationInFrames={scene.duration + scene.exit} name={`${scene.id} · ${scene.template}`}>
						<SceneShell scene={scene} pack={pack}>
							{T ? <T scene={scene} pack={pack} /> : <div style={{color: 'red', fontSize: 60}}>Unknown template {scene.template}</div>}
						</SceneShell>
					</Sequence>
				);
			})}
			<Overlays pack={pack} seed={props.scenes.length} />
			<Soundtrack props={props} />
			{props.debug && <Debug props={props} />}
		</AbsoluteFill>
	);
};
