import test from 'node:test';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {auditEpisode, selectReviewFile, hashFile, assetVersion} from '../lib/quality.mjs';
import {compile, draft} from '../lib/compile.mjs';
import {P} from '../lib/env.mjs';

const fixture = () => ({props: {fps:30,durationInFrames:1800,voice:{src:'voice.wav'},sfx:[],beds:[],scenes:[{id:'s01',template:'photo-full',duration:1800,slots:{photo:{kind:'image',src:'photo.jpg'}}}]}, edit:{}, wordsDoc:{scriptMatchRatio:1,words:[{text:'Portrait.'}]}, script:'[serious] Portrait.',assets:{photo:{file:'photo.jpg',source:{provider:'museum'}}}});
test('quality distinguishes measurable pass from manual review',()=>{const r=auditEpisode(fixture());assert.deepEqual(r.errors,[]);assert.equal(r.metrics.imageSceneCoverage,1);assert.match(r.limits,/visible pixels/)});
test('final gates catch duration, stale script, generated majority and cymbals',()=>{let f=fixture();f.props.durationInFrames=1700;f.script='Changed words';f.assets.photo.source.provider='generated';f.props.sfx=[{src:'drum.mp3'}];f.soundIndex={'drum.mp3':{tags:['cymbal']}};const r=auditEpisode(f);for(const s of ['below','script has changed','majority','cymbal'])assert(r.errors.some(x=>x.includes(s)),s)});
test('text-only runs and unknown provenance cannot pass photo rules',()=>{let f=fixture();f.props.scenes[0].slots={bigWord:'PORTRAIT'};const r=auditEpisode(f);assert.equal(r.metrics.usedAssets,0);assert(r.errors.some(x=>x.includes('image-bearing')));assert(r.warnings.some(x=>x.includes('text-only')))});
test('review selects newest range preview over stale final; explicit requests win',async()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sv-quality-test-'));try{for(const f of ['final.mp4','preview.mp4','preview-s01.mp4'])fs.writeFileSync(path.join(dir,f),f);fs.utimesSync(path.join(dir,'final.mp4'),1,1);fs.utimesSync(path.join(dir,'preview.mp4'),2,2);fs.utimesSync(path.join(dir,'preview-s01.mp4'),3,3);assert.equal(selectReviewFile(dir),path.join(dir,'preview-s01.mp4'));assert.equal(selectReviewFile(dir,{preview:true}),path.join(dir,'preview-s01.mp4'));assert.equal(selectReviewFile(dir,{final:true}),path.join(dir,'final.mp4'));const a=await hashFile(path.join(dir,'final.mp4'));fs.writeFileSync(path.join(dir,'final.mp4'),'changed');assert.notEqual(await hashFile(path.join(dir,'final.mp4')),a)}finally{fs.rmSync(dir,{recursive:true,force:true})}});

test('compiler rejects invalid timing and anchors; new drafts are quiet and deliberate',()=>{
 const slug=`upgrade-test-${randomUUID()}`,dir=path.join(P.episodes,slug);fs.mkdirSync(dir);
 const put=(file,value)=>{const f=path.join(dir,file);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,JSON.stringify(value))};
 const words={words:[{text:'A',start:0,end:200},{text:'portrait',start:210,end:700}],scriptMatchRatio:1};
 const edit={scenes:[{id:'s01',template:'photo-full',text:'A *portrait*',slots:{photo:{id:'photo',at:'start'}}}]};
 try{
 put('episode.json',{pack:'noir',theme:'bone'});put('03-timing/words.json',words);put('04-edit/edit.json',edit);put('05-assets/photo.json',{});
 put('05-assets/manifest.json',{assets:{photo:{kind:'photo',file:path.relative(P.root,path.join(dir,'05-assets/photo.json')),width:100,height:100,luma:.5}}});
 let r=compile(slug);assert.deepEqual(r.errors,[]);assert.equal(r.props.sfx.length,0);
 const d=draft(slug);assert.equal(d.autoSfx,false);assert.equal(d.scenes[0].transition,'cut');assert.equal(d.scenes[0].camera,'still');
 edit.tailSeconds=5;put('04-edit/edit.json',edit);assert.throws(()=>compile(slug),/tailSeconds/);delete edit.tailSeconds;
 edit.scenes[0].text='A portraits';put('04-edit/edit.json',edit);assert(compile(slug).errors.some(x=>x.includes('expected spoken word')));edit.scenes[0].text='A *portrait*';
 edit.scenes[0].slots.photo.at='missing';put('04-edit/edit.json',edit);assert(compile(slug).errors.some(x=>x.includes('not in this scene')));
 words.words[1].start=-1;put('03-timing/words.json',words);assert(compile(slug).errors.some(x=>x.includes('timestamps')));
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('asset approval changes when the same file is replaced in place',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sv-asset-version-'));
 try {const file=path.join(dir,'image.jpg');fs.writeFileSync(file,'original');const a={file,source:{url:'same-url'},created:'same-time'};const before=assetVersion(a);fs.writeFileSync(file,'replacement');assert.notEqual(assetVersion(a),before);}
 finally {fs.rmSync(dir,{recursive:true,force:true});}
});
