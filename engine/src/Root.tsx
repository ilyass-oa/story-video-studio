import React from 'react';
import {Composition} from 'remotion';
import {Story} from './Story';
import type {StoryProps} from './schema';

const EMPTY: StoryProps = {pack: 'noir', fps: 30, width: 1080, height: 1920, durationInFrames: 90, voice: null, speech: [], beds: [], sfx: [], scenes: []};

// Props always come from `sv compile` (props.json). In Studio, pass them with --props.
export const Root: React.FC = () => (
	<Composition
		id="Story"
		component={Story}
		width={1080}
		height={1920}
		fps={30}
		durationInFrames={90}
		defaultProps={EMPTY}
		calculateMetadata={({props}) => ({durationInFrames: Math.max(1, props.durationInFrames), fps: props.fps, width: props.width, height: props.height})}
	/>
);
