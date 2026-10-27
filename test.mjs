import assert from 'node:assert/strict';
import { Experience, weatherAt, updatePresence, cycleParts, validCycle, defaultEdges, CYCLE, CONFIG } from './controller.mjs?v=2026.10.27.1';
import { selectPeople, StableCount } from './counter.mjs?v=2026.10.27.1';
import { solarPosition, skyState } from './atmosphere.mjs?v=2026.10.27.1';
const step = (m, seconds) => { for (let i = 0; i < Math.ceil(seconds * 20); i++) m.tick(.05); };
const turn = (a, b) => ((b - a) % 360 + 540) % 360 - 180;
// Default loop: morning, day, sunset glow and starry night, 60 s each; nothing overcast and no rain.
assert.equal(cycleParts(CYCLE).total, 240);
for (const [t, phase] of [[0, 0], [59, 0], [61, 1], [150, 2], [230, 3]]) assert.equal(weatherAt(t, 1).phase, phase);
let lastHour = null, lastStep = null;
for (let t = 0; t < 240; t += .02) {
  const w = weatherAt(t, 3), d = lastHour === null ? null : turn(lastHour, w.hour);
  assert.equal(w.cross, 0, 'parts that follow on along the sun path never cross-fade');
  if (d !== null) assert.ok(d > 0, 'the sun only moves forward');
  if (lastStep !== null) assert.ok(Math.abs(d - lastStep) < .02, 'no sudden change of solar speed');
  lastHour = w.hour; lastStep = d; assert.equal(w.cloudCount, 3); assert.equal(w.rain, 0); assert.equal(w.overcast, 0); assert.equal(w.darkness, 0);
}
const elevation = t => solarPosition(weatherAt(t, 0).hour).elevation;
// Outside the transitions (the first and last 10 s of each part by default) each part shows its own stretch of sky.
for (let t = 10; t < 50; t += .5) assert.ok(elevation(t) > -9 && elevation(t) < 10, 'morning stays around sunrise: ' + t);
for (let t = 130; t < 170; t += .5) assert.ok(elevation(t) > -9 && elevation(t) < 10, 'the sunset glow stays around sunset: ' + t);
assert.ok(elevation(90) > 55, 'day: high sun at noon');
for (let t = 190; t < 230; t += 1) { const sky = skyState(weatherAt(t, 0).hour); assert.ok(sky.stars === 1 && sky.light[2] > .3 && sky.sunCloud[2] > .1, 'night: full stars and moonlit clouds: ' + t); }
// Transition windows: from `out` seconds before a part ends to `into` seconds into the next; a sixth of a part by default.
assert.deepEqual([45, 75].map(t => { const w = weatherAt(t, 0); return [w.from, w.to, w.blend]; }), [[0, 0, 0], [1, 1, 0]]);
{ const w = weatherAt(55, 0); assert.ok(w.from === 0 && w.to === 1 && w.blend > 0 && w.blend < .5); }
{ const T = { ...CYCLE, edges: [[20, 5], [10, 10], [10, 10], [10, 10]] };
  assert.ok(weatherAt(41, 0, T).blend > 0 && weatherAt(39, 0, T).blend === 0 && weatherAt(64, 0, T).blend > .9 && weatherAt(66, 0, T).blend === 0, 'transition start and end follow the settings');
  assert.ok(turn(weatherAt(64.99, 0, T).hour, weatherAt(65.01, 0, T).hour) < .1, 'no jump at the end of a custom transition'); }
// A part switched off: the parts either side cross-fade (the sun does not race through the missing part).
{ const T = { ...CYCLE, on: [true, true, true, false] }, w = weatherAt(175, 0, T);
  assert.equal(cycleParts(T).total, 180); assert.ok(w.cross > 0 && w.cross < 1 && w.from === 2 && w.to === 0, 'sunset cross-fades into morning');
  assert.ok(Math.abs(w.hour2 - (-104 + 20 / 60 * (175 - 180))) < 1e-9, 'the morning sky is already moving');
  assert.ok(weatherAt(5, 0, T).cross > .5 && weatherAt(15, 0, T).cross === 0);
  for (const t of [100, 150]) assert.equal(weatherAt(t, 0, T).cross, 0); }
{ const T = { ...CYCLE, on: [false, false, false, true] }; assert.equal(cycleParts(T).total, 60); assert.ok(weatherAt(55, 0, T).cross > 0, 'one part alone loops by cross-fading into itself'); assert.equal(weatherAt(30, 0, T).phase, 3); }
assert.ok(validCycle(CYCLE) && validCycle({ stages: [2, 600, 2, 600], on: [true, false, false, false], edges: defaultEdges([2, 600, 2, 600]) }));
for (const bad of [{ ...CYCLE, on: [false, false, false, false] }, { ...CYCLE, stages: [1, 60, 60, 60] }, { ...CYCLE, stages: [60, NaN, 60, 60] }, { ...CYCLE, edges: [[-1, 10], [10, 10], [10, 10], [10, 10]] }, { ...CYCLE, on: [1, 1, 1, 1] }, { stages: CYCLE.stages }])
  assert.equal(validCycle(bad), false);
const m = new Experience(CYCLE); m.start(); assert.equal(m.mode, 'cycle', 'the sky runs with nobody present'); step(m, 65); assert.equal(m.phase, 1);
m.count(5); step(m, .1); assert.equal(m.cloudCount, 5); m.count(0); step(m, .1); assert.equal(m.mode, 'cycle'); assert.equal(m.cloudCount, 0);
step(m, 240); assert.equal(m.mode,'cycle'); assert.ok(m.cycles>=1&&m.elapsed<240);
m.cycle = { ...CYCLE, on: [false, true, false, false] }; step(m, 1); assert.equal(m.phase, 1); assert.ok(m.elapsed < 60);
m.stop(); step(m, 5); assert.equal(m.mode, 'stopped'); m.recover(); assert.equal(m.mode, 'cycle');
const presence=new Array(CONFIG.maxClouds).fill(0);
updatePresence(presence,2,4);assert.ok(presence[0]>0&&presence[0]<1&&presence[2]===0,'arrivals fade in');
updatePresence(presence,2,20);assert.deepEqual(presence.slice(0,3),[1,1,0]);
updatePresence(presence,1,5);assert.equal(presence[0],1);assert.ok(presence[1]>0&&presence[1]<1,'departures fade out');
updatePresence(presence,1,20);assert.equal(presence[1],0);
const boxes = [{ class: 'person', score: .9, bbox: [20, 20, 30, 60] }, { class: 'person', score: .8, bbox: [65, 10, 20, 70] }, { class: 'chair', score: .99, bbox: [0, 0, 40, 40] }, { class: 'person', score: .2, bbox: [0, 0, 20, 20] }];
assert.equal(selectPeople(boxes, 100, 100).length, 2); assert.equal(selectPeople(boxes, 100, 100, .55, .3).length, 1);
// Debounce, one detection a second: the median of the last 3 s ignores single missed or false detections.
{ const counter = new StableCount(3000), seen = [0, 2, 2, 0, 2, 3, 0, 0].map((n, i) => counter.update(n, i * 1000));
  assert.deepEqual(seen, [0, 0, 2, 2, 2, 2, 2, 0]);
  const quick = new StableCount(1000); assert.deepEqual([1, 0, 4].map((n, i) => quick.update(n, i * 1000)), [1, 0, 4], 'a 1 s window follows every detection'); }
console.log('PASS: person filtering, median debounce, morning–day–sunset–starry-night loop with settable transitions and parts, cross-fade past parts switched off, sky runs without visitors, per-visitor cloud fade in/out.');

// Reflection geometry: outgoing ray must equal the reflected incoming ray.
const { reflectedCeilingPoint, reflectionCoverage, STYLES } = await import('./visual.mjs?v=2026.10.27.1');
assert.equal(STYLES.length, 3);
const normalize = v => { const n = Math.hypot(...v); return v.map(x => x / n); };
for (const angle of [0, Math.PI/2, Math.PI, Math.PI*1.5]) {
 const E = {x:.65*Math.sin(angle), z:.65*Math.cos(angle), height:1.55};
 for (const P of [{x:0,z:0},{x:.12,z:-.1}]) {
  const C = reflectedCeilingPoint(P,E,2.2);
  const incoming = normalize([P.x-C.x,-2.2,P.z-C.z]);
  const outgoing = normalize([E.x-P.x,E.height,E.z-P.z]);
  assert.ok(Math.hypot(incoming[0]-outgoing[0],-incoming[1]-outgoing[1],incoming[2]-outgoing[2])<1e-10);
 }
}
const geometry = {height:2.2,diameter:2.4,eyeHeight:1.55,distance:.65};
const coverage = reflectionCoverage(geometry);
assert.ok(coverage>.7 && coverage<.8);
assert.ok(reflectionCoverage({...geometry,diameter:3.2})>coverage);
assert.ok(reflectionCoverage({...geometry,distance:.4})>coverage);
assert.equal(reflectionCoverage({...geometry,diameter:5}),1);
console.log('PASS: three styles, reflection rays at four directions, canopy coverage.');

const { approachPose } = await import('./visual.mjs?v=2026.10.27.1');
const { translate } = await import('./i18n.mjs?v=2026.10.27.1');
const distant = approachPose(0, geometry), near = approachPose(1, geometry);
assert.equal(distant.distance, 5); assert.ok(Math.abs(near.distance-geometry.distance)<1e-12); assert.equal(near.targetHeight,0);
let previousDistance = Infinity;
for(let i=0;i<=100;i++){const pose=approachPose(i/100,geometry);assert.ok(pose.distance<=previousDistance);assert.equal(pose.eyeHeight,geometry.eyeHeight);previousDistance=pose.distance;}
assert.equal(translate('距中心 2.50 m'),'2.50 m from centre');
assert.equal(translate('检测 4 人 · 稳定 3 人 · 50 ms'),'Detected 4 · Stable 3 · 50 ms');
assert.equal(translate('暂停走近'),'Pause walk');
assert.equal(translate('暂停走近',false),'暂停走近');
console.log('PASS: approach path endpoints, continuous distance, eye height and English dynamic messages.');

const { rainProfile, seamlessLoop } = await import('./rain-audio.mjs?v=2026.10.27.1');
let priorRate = 0;
for(let n=1;n<=20;n++){const p=rainProfile(n);assert.equal(p.count,n);assert.ok(p.grainsPerSecond>priorRate);assert.ok(p.bedGain>0&&p.grainGain>0);priorRate=p.grainsPerSecond;}
for(const n of [0,-1,NaN,Infinity])assert.equal(rainProfile(n).grainsPerSecond,0);
assert.equal(rainProfile(100).count,20);
assert.ok(rainProfile(12).grainsPerSecond>rainProfile(1).grainsPerSecond*10);
assert.ok(rainProfile(12).washGain>rainProfile(1).washGain);
const makeBuffer=(channels,length,sampleRate)=>{const data=Array.from({length:channels},()=>new Float32Array(length));return {numberOfChannels:channels,length,sampleRate,getChannelData:i=>data[i]};};
const original=makeBuffer(1,1000,100);for(let i=0;i<1000;i++)original.getChannelData(0)[i]=i/1000;
const loop=seamlessLoop({createBuffer:makeBuffer},original,.35);
assert.equal(loop.length,965);assert.ok(Math.abs(loop.getChannelData(0)[0]-.965)<1e-6);assert.ok(Math.abs(loop.getChannelData(0)[0]-loop.getChannelData(0).at(-1))<.002);
assert.equal(translate('密集雨声'),'Dense rain');assert.equal(translate('试听当前人数 · 6 秒'),'Preview this count · 6 seconds');
console.log('PASS: visitor-driven rain density, zero/capped counts, overlapping layers, loop seam and English audio controls.');

const { puddles, landRadius, layoutCoverage, viewingFootprint } = await import('./layout.mjs?v=2026.10.27.1');
const proposal = { height:2.2, diameter:3, eyeHeight:1.55, area:28.27, layout:'double', distance:2.64, angle:0 };
assert.equal(puddles(proposal).length,14);assert.equal(puddles({...proposal,layout:'edge'}).length,8);assert.equal(puddles({...proposal,layout:'center'}).length,1);
assert.ok(Math.abs(landRadius(proposal)-3)<.001);
for(const D of [5,2.64])for(let angle=0;angle<360;angle+=5){const c=layoutCoverage({...proposal,distance:D,angle});assert.ok(c.best>.05,`${D} m, ${angle} degrees`);assert.ok(c.visible>0);}
assert.equal(layoutCoverage({...proposal,layout:'edge',area:Math.PI,distance:5}).best,0,'2m footprint cannot fake the distant reflection');
assert.equal(layoutCoverage({...proposal,layout:'center',distance:2.64}).best,0);
const footprint=viewingFootprint({...proposal,distance:5});assert.ok(Math.abs(footprint.z-2.9333333333)<1e-8);
assert.equal(translate('等效直径约 6.00 m'),'Approx. diameter 6.00 m');
assert.ok(!/[\u4e00-\u9fff]/.test(translate('当前视角：2 / 14 处水洼可映到天幕；最佳水洼覆盖约 25%。')));
console.log('PASS: scaled perimeter layouts, far/near coverage across 360 degrees, compact-layout limit, and translated area controls.');

const {DEFAULT_GEOMETRY,observer,cameraFrame,panelFrame,panelPoint,reflectedPanelPoint,geometryProblem}=await import('./layout.mjs?v=2026.10.27.1');
const g={...DEFAULT_GEOMETRY,skyShape:'circle',viewMode:'free',eyeX:1,eyeZ:4,yaw:180,pitch:-20};
const shifted={...g,baseX:2,baseZ:-3,panelX:2,panelZ:-3,eyeX:3,eyeZ:1};
assert.deepEqual(layoutCoverage(g).fractions,layoutCoverage(shifted).fractions,'common translation preserves reflection');
assert.ok(geometryProblem({...g,height:.1}));assert.ok(geometryProblem({...g,eyeHeight:.05}));assert.equal(geometryProblem(g),'');
for(const tiltX of [-35,0,40])for(const tiltZ of [-25,0,30]){
 const t={...g,tiltX,tiltZ,height:3.5},f=panelFrame(t),eye=observer(t),water=t.baseHeight;
 for(const [u,v] of [[0,0],[.4,-.3],[-.5,.5]]){
  const Q=panelPoint(t,u,v),k=(eye[1]-water)/(Q[1]+eye[1]-2*water),P={x:eye[0]+(Q[0]-eye[0])*k,z:eye[2]+(Q[2]-eye[2])*k};
  const hit=reflectedPanelPoint(P,t,f);assert.ok(hit);hit.world.forEach((n,i)=>assert.ok(Math.abs(n-Q[i])<1e-9));
  assert.ok(Math.abs(hit.u-u*t.diameter/2)<1e-9);assert.ok(Math.abs(hit.v-v*t.diameter/2)<1e-9);
 }
}
const custom={...g,baseX:3,baseZ:-2,baseHeight:.5,height:3.4,eyeHeight:1.7,baseRotation:70,pondScale:.7};
assert.equal(geometryProblem(custom),'');assert.ok(puddles(custom).every(p=>Math.hypot(p.x-3,p.z+2)<landRadius(custom)));
const viewingExample={...DEFAULT_GEOMETRY,diameter:3,skyAspect:16/9,area:28.27,layout:'double'};assert.ok(layoutCoverage({...viewingExample,...approachPose(0,viewingExample)}).framed>0);
assert.equal(layoutCoverage({...DEFAULT_GEOMETRY,viewMode:'free',eyeX:0,eyeZ:5,pitch:89,yaw:0}).framed,0,'looking up removes water from the camera frame');
assert.ok(Math.abs(Math.hypot(...cameraFrame(g).forward)-1)<1e-12);
assert.equal(approachPose(0,{...DEFAULT_GEOMETRY,farDistance:9}).distance,9);
assert.equal(approachPose(1,DEFAULT_GEOMETRY).targetHeight,DEFAULT_GEOMETRY.baseHeight);
assert.ok(!/[\u4e00-\u9fff]/.test(translate('画面内可见倒影：2 / 14 处；最佳水洼约 25% 同时反射天幕且在视场内。')));
console.log('PASS: independent translations, tilted-panel mirror rays, raised base, custom path, camera framing, geometry validation and translations.');

const {hexRGB,drawCloudMass}=await import('./visual.mjs?v=2026.10.27.1');
const {editablePools,poolOutline,waterSurface}=await import('./layout.mjs?v=2026.10.27.1');
assert.deepEqual(hexRGB('#ff0080'),[1,0,128/255]);
const massTrace=form=>{const commands=[];const ctx=new Proxy({createRadialGradient:(...p)=>{commands.push(p);return {addColorStop(){}};}},{get:(o,k)=>k in o?o[k]:(...args)=>commands.push([k,...args]),set:()=>true});drawCloudMass(ctx,[[0,0,72,1],[.4,.1,73,1],[-.3,.3,74,1]],.5,form);return commands;};
assert.notDeepEqual(massTrace('broken'),massTrace('cumulus'));assert.notDeepEqual(massTrace('cumulus'),massTrace('layered'));
const source={...DEFAULT_GEOMETRY,baseX:1.2,baseZ:-.8,baseRotation:25,pondScale:.7};
const edited={...source,layout:'custom',customPools:editablePools(source)};
const before=puddles(source),after=puddles(edited);
after.forEach((p,i)=>{for(const k of ['x','z','a','b','angle'])assert.ok(Math.abs(p[k]-before[i][k])<1e-9);});
assert.deepEqual(layoutCoverage(source).fractions,layoutCoverage(edited).fractions);
const one={...edited,customPools:[{x:1,z:0,width:1,depth:.4,angle:45,seed:18,roughness:1,shape:2}]};
assert.equal(puddles(one).length,1);assert.equal(poolOutline(puddles(one)[0],1.2),1);
assert.notEqual(poolOutline({...puddles(one)[0],shape:1},1.2),1);
const noChange=waterSurface({...source,waterDropMm:0,shoreRetreat:0},0);assert.equal(noChange.waterY,source.baseHeight);assert.equal(noChange.shoreScale,1);
const lowered=waterSurface({...source,waterDropMm:30,shoreRetreat:60},0);assert.ok(Math.abs(lowered.waterY-.04)<1e-9);assert.equal(lowered.shoreScale,.4);
assert.equal(waterSurface({...source,waterDropMm:100,baseHeight:.02},0).waterY,0,'cannot drain below the floor');
assert.equal(waterSurface(source,1).dropMm,0);
assert.equal(layoutCoverage({...source,...waterSurface({...source,shoreRetreat:100},0)}).visible,0);
assert.ok(!/[\u4e00-\u9fff]/.test(translate('下降 3.0 mm · 水面离地 0.067 m · 轮廓保留 90%')));
console.log('PASS: distinct cloud forms, palettes, custom-puddle round-trip, individual shapes, water amplitudes, dry state and translations.');

// Scaling one puddle preserves its shape, position and neighbours.
const resized={...edited,customPools:edited.customPools.map((p,i)=>({...p,scale:i===0?2.5:1}))};
const scaledPools=puddles(resized);
for(const key of ['a','b'])assert.ok(Math.abs(scaledPools[0][key]-after[0][key]*2.5)<1e-9);
for(const key of ['x','z','angle','seed','shape','roughness'])assert.equal(scaledPools[0][key],after[0][key]);
assert.deepEqual(scaledPools.slice(1),after.slice(1));
assert.equal(puddles({...resized,pondScale:resized.pondScale*2})[0].a,scaledPools[0].a*2);
assert.equal(translate('缩放后参考尺寸：1.25 × 0.50 m'),'Scaled reference size: 1.25 × 0.50 m');
console.log('PASS: individual proportional scaling, global scaling, unchanged neighbours and translated size readout.');

const {cloudLobes}=await import('./visual.mjs?v=2026.10.27.1');
const densitySample=(t,x,y)=>cloudLobes(123,1,t).reduce((v,p)=>v+p.opacity*Math.exp(-3*((x-p.x)**2+(y-p.y)**2)/(p.radius*p.radius)),0);
assert.notDeepEqual(cloudLobes(123,1,0),cloudLobes(123,1,7),'mature rain clouds continue evolving');
assert.deepEqual(cloudLobes(123,1,0).slice(0,3),cloudLobes(123,1,7).slice(0,3),'stable core anchors the cloud');
for(let t=0;t<80;t+=.073){
 for(const p of cloudLobes(123,1,t))assert.ok(p.radius>0&&p.opacity>=0&&p.opacity<=1);
 for(const [x,y] of [[0,0],[12,4],[-18,14],[25,-10]])assert.ok(Math.abs(densitySample(t+.001,x,y)-densitySample(t,x,y))<.005,'no density pop at wisp turnover');
}
assert.ok(Math.abs(densitySample(0,12,4)-densitySample(7,12,4))>.01);
console.log('PASS: staggered cloud-edge birth/dissipation, stable cores, continuous turnover and evolution at full maturity.');

{const {CloudField,FIELD,skyReach}=await import('./field.mjs?v=2026.10.27.1');
 const near=(a,b)=>Math.abs(a-b)<1e-9;
 assert.ok(near(skyReach({shape:'circle'},[.6,.8]),1));assert.ok(near(skyReach({shape:'fill',aspect:.7073},[0,1]),1/.7073),'portrait A0: the long side reaches farther');
 assert.ok(near(skyReach({shape:'fill',aspect:.7073,rotation:90},[1,0]),1/.7073),'the canopy turns with the sky');assert.ok(near(skyReach({shape:'fill',aspect:16/9},[1,0]),FIELD.mass),'clipped by the mass map');
 for(const [canopy,deg,windy] of [[{shape:'fill',aspect:.7073},90,1],[{shape:'circle'},200,2.5],[{shape:'square',rotation:30},45,0]]){
  const field=new CloudField(11),pres=new Array(20).fill(0),wind=[Math.cos(deg*Math.PI/180),Math.sin(deg*Math.PI/180)],reach=skyReach(canopy,wind),air={...canopy,speed:FIELD.drift*windy};
  let drift=[0,0],before=new Map();const shapes=new Set(),known=new Set(),dt=.1;
  for(let t=0;t<900;t+=dt){
   const people=t<600?6:2;updatePresence(pres,people,dt);drift=drift.map((v,i)=>v+wind[i]*FIELD.drift*windy*dt);field.update(dt,people,pres,drift,wind,air);
   const now=new Map(field.snapshot(pres).map(c=>[c[2],c]));
   for(const [seed,c] of before){
    const along=(c[0]+drift[0])*wind[0]+(c[1]+drift[1])*wind[1];
    if(!now.has(seed))assert.ok(c[3]<.02,'a cloud goes only after it has faded out');
    else assert.ok(Math.abs(now.get(seed)[3]-c[3])<.03,'cloud strength changes smoothly');
   }
   for(const seed of now.keys())shapes.add(seed);before=now;
   for(const c of field.slots.flat())if(!known.has(c)){known.add(c);const along=(c.x+drift[0])*wind[0]+(c.y+drift[1])*wind[1];
    // In still air the next cloud forms on the upwind half; in a wind it drifts in, starting unseen beyond the upwind edge.
    if(c.age===0)assert.ok(windy===0&&along<=1e-9,'in still air a visitor\'s next cloud forms upwind');
    else if(t>.05)assert.ok(windy>0&&c.out===1&&along<-skyReach(canopy,[-wind[0],-wind[1]]),'in a wind the next cloud starts unseen beyond the upwind edge');}
   if(t>20&&t<600)for(let i=0;i<people;i++)assert.ok(field.slots[i].length>0&&field.slots[i].length<=4,'every visitor keeps a cloud');
  }
  assert.ok(shapes.size>20,'clouds keep re-forming with new shapes');assert.equal(field.slots.slice(2).flat().length,0,'departed visitors leave no cloud');
 }
 const first=salt=>new CloudField(salt).update(0,4,[1,1,1,1],[0,0],[1,0],{shape:'circle'}).snapshot([1,1,1,1]);
 assert.notDeepEqual(first(1),first(2),'each session starts with different shapes');
 for(let salt=1;salt<=20;salt++){const a0={shape:'fill',aspect:.7073},arrivals=new CloudField(salt).update(0,6,new Array(6).fill(1),[0,0],[1,0],a0).snapshot(new Array(6).fill(1));
  arrivals.forEach((p,i)=>{assert.ok(Math.abs(p[0])<=.8+1e-9&&Math.abs(p[1])<=.8/.7073+1e-9,'arrivals form inside the canopy');
   for(const q of arrivals.slice(0,i))assert.ok(Math.hypot(p[0]-q[0],p[1]-q[1])>.2,'arrivals do not stack on one another');});
  assert.ok(arrivals.reduce((sum,p)=>sum+Math.hypot(p[0],p[1]),0)/arrivals.length>.5,'arrivals spread over the canopy instead of piling up in the centre');}
 const field=new CloudField(3),pres=[1];field.update(0,1,pres,[0,0],[1,0],{shape:'circle'});const c=field.slots[0][0],x0=c.x;
 field.update(1,1,pres,[.05,0],[1,0],{shape:'circle'});assert.equal(field.slots[0][0].x,x0,'clouds move only through the shared drift');}
{const trace=field=>{let n=0;const ctx=new Proxy({createRadialGradient:()=>({addColorStop(){}})},{get:(o,k)=>k in o?o[k]:()=>{},set:(o,k,v)=>{if(k==='globalAlpha'&&v>0)n++;return true;}});drawCloudMass(ctx,field,.55);return n;};
 assert.equal(trace([[0,0,5,1],[.3,0,6,0]]),trace([[0,0,5,1]]),'zero-strength clouds draw nothing');assert.ok(trace([[0,0,5,1],[.3,0,6,.4]])>trace([[0,0,5,1]]),'a fading cloud still draws');}
console.log('PASS: visitor clouds spread over the canopy, drift with the wind, re-form upwind with new shapes, leave only unseen, differ per session; presence-weighted particle masses.');

const {TIMING_PRESETS}=await import('./controller.mjs?v=2026.10.27.1');
for(const stages of [...Object.values(TIMING_PRESETS).map(p=>p.stages),[2,300,2,300]]){
 const T={stages,on:[true,true,true,true],edges:defaultEdges(stages)},{parts}=cycleParts(T);
 for(const {start} of parts.slice(1))assert.ok(Math.abs(turn(weatherAt(start-1e-6,0,T).hour,weatherAt(start+1e-6,0,T).hour))<1e-3,'no jump between parts');
}
// Clouds change at one steady rate through the whole cycle; the presets are 60, 240 and 660 s.
for(const p of Object.values(TIMING_PRESETS))assert.equal(new Set(p.rates).size,1);
assert.deepEqual(Object.values(TIMING_PRESETS).map(p=>cycleParts(p).total),[60,240,660]);
const {parseCurrentWind,windToCanvas,compassToCanvas,currentWindURL,MELBOURNE}=await import('./forecast.mjs?v=2026.10.27.1');
const current={current_units:{wind_speed_10m:'m/s'},current:{time:1791500000,interval:900,wind_speed_10m:6.2,wind_direction_10m:270,wind_gusts_10m:11}};
assert.deepEqual(parseCurrentWind(current),{time:1791500000,speed:6.2,gusts:11,from:270});
assert.throws(()=>parseCurrentWind({...current,current:{...current.current,wind_speed_10m:null}}));assert.throws(()=>parseCurrentWind({...current,current_units:{wind_speed_10m:'km/h'}}));
assert.equal(windToCanvas(270),180,'a westerly pushes clouds east, which is on the left when looking up');assert.equal(windToCanvas(0),270);assert.equal(compassToCanvas(0),90);assert.equal(compassToCanvas(90),180);
assert.equal(currentWindURL(MELBOURNE).searchParams.get('latitude'),'-37.8136');
{const A=await import('./atmosphere.mjs?v=2026.10.27.1');
 const noon=A.solarPosition(0),rise=A.solarPosition(-96),set=A.solarPosition(96);
 assert.ok(Math.abs(noon.elevation-(90-Math.abs(A.SITE.latitude-A.SITE.declination)))<1e-9&&Math.abs(noon.azimuth)%360<1e-9,'Melbourne noon sun stands due north');
 assert.ok(Math.abs(rise.elevation)<1&&rise.azimuth>90&&rise.azimuth<110,'October sunrise just south of east');assert.ok(set.azimuth>250&&set.azimuth<270);
 assert.ok(A.sunVector(rise.elevation,rise.azimuth)[0]<-.9&&A.sunVector(set.elevation,set.azimuth)[0]>.9,'looking up: sunrise on the left, sunset on the right');
 const zenith=h=>A.skyRadiance([0,0,1],A.skyState(h).sun),day=zenith(0),dusk=zenith(100);
 assert.ok(day[2]>day[1]&&day[1]>day[0],'daytime zenith is blue');assert.ok(dusk[2]>dusk[1],'ozone keeps twilight blue-violet');assert.ok(A.luminance(dusk)<A.luminance(day)/20);
 const low=A.sunlight(A.skyState(-92).sun,3),high=A.sunlight(A.skyState(0).sun,3);assert.ok(low[0]/low[2]>high[0]/high[2]*2,'low sun light is redder');
 assert.ok(A.skyState(95).sunCloud[0]>0&&A.sunlight(A.skyState(95).sun,0)[0]<A.skyState(95).sunCloud[0],'clouds keep sunset light a little longer than the ground');
 assert.ok(A.skyState(180).exposure>A.skyState(0).exposure*10&&A.skyState(180).exposure<A.skyState(0).exposure*40&&A.skyState(250).stars>.5,'night adapts exposure; stars at night');
 for(const h of [-108,-96,0,96,180])assert.ok(A.skyState(h).ambient.every(Number.isFinite));
 const table=A.skyTable(A.skyState(0));assert.equal(table.length,A.TABLE_SIZE**2*4);const mid=(A.TABLE_SIZE**2-1)/2*4;assert.ok(table[mid+2]>table[mid],'table centre (zenith) is blue');}
assert.equal(translate('200 秒 / 一轮天气'),'200 seconds / weather cycle');
console.log('PASS: phase-boundary continuity, live wind parsing and sky-view direction, day-phase sun path, colours and cover.');

const {playbackTime}=await import('./controller.mjs?v=2026.10.27.1');
{const T={stages:[2,2,2,2],on:[true,true,true,true],edges:defaultEdges([2,2,2,2])};assert.equal(playbackTime(7,18,T),1);assert.equal(playbackTime(7,18,T,false),8);}
const looping=new Experience({stages:[2,2,2,2],on:[true,true,true,true],edges:defaultEdges([2,2,2,2])},{loop:true});looping.count(4);looping.start();
for(let i=0;i<600;i++){looping.tick(.05);assert.equal(looping.mode,'cycle');assert.ok(looping.elapsed<8);}
assert.ok(looping.cycles>=3);looping.stop();step(looping,10);assert.equal(looping.mode,'stopped');
const {panelContains,panelOutline}=await import('./layout.mjs?v=2026.10.27.1');
const square={...DEFAULT_GEOMETRY,skyShape:'square',diameter:3};
assert.equal(panelContains(square,1.4,1.4),true);assert.equal(panelContains({...square,skyShape:'circle'},1.4,1.4),false);
assert.equal(panelOutline(square).length,4);assert.equal(viewingFootprint(square).points.length,4);
assert.equal(panelOutline({...square,skyShape:'circle'}).length,96);
assert.ok(layoutCoverage(square).best>=layoutCoverage({...square,skyShape:'circle'}).best);
const tiltedSquare={...square,tiltX:45,tiltZ:45,height:1.6};
assert.ok(geometryProblem(tiltedSquare));assert.equal(geometryProblem({...tiltedSquare,skyShape:'circle'}),'');
assert.equal(translate('85 秒 / 一轮 · 自动循环'),'85 seconds / cycle · looping');
console.log('PASS: gapless multi-cycle playback, stop/empty-scene handling, projector wrap, circle/square reflection bounds, outlines and tilted-corner validation.');

const {panelHalfSize}=await import('./layout.mjs?v=2026.10.27.1');
const wide={...DEFAULT_GEOMETRY,skyShape:'fill',diameter:4,skyAspect:2};
assert.deepEqual(panelHalfSize(wide),[2,1]);assert.equal(panelContains(wide,1.9,.9),true);assert.equal(panelContains(wide,1.9,1.1),false);
assert.equal(panelOutline(wide).length,4);assert.equal(viewingFootprint(wide).points.length,4);
const portrait={...wide,skyAspect:.5};assert.deepEqual(panelHalfSize(portrait),[2,4]);
assert.equal(translate('铺满屏幕'),'Fill screen');
console.log('PASS: adaptive landscape/portrait sky bounds and matching reflection geometry.');

const {moveObserver,turnObserver,validateScenePreset,validatePresetStore}=await import('./studio.mjs?v=2026.10.27.1');
const forwardCamera={eyeX:0,eyeZ:5,yaw:180,pitch:0};moveObserver(forwardCamera,new Set(['w']),.05,2);assert.ok(forwardCamera.eyeZ<5);assert.ok(Math.abs(forwardCamera.eyeX)<1e-12);
const sideways={eyeX:0,eyeZ:5,yaw:180,pitch:0};moveObserver(sideways,new Set(['d']),.05,2);assert.ok(sideways.eyeX>0);
const diagonal={eyeX:0,eyeZ:0,yaw:180,pitch:0};moveObserver(diagonal,new Set(['w','d']),.05,2);assert.ok(Math.abs(Math.hypot(diagonal.eyeX,diagonal.eyeZ)-.1)<1e-9);
turnObserver(forwardCamera,100,-50,.1);assert.equal(forwardCamera.yaw,170);assert.equal(forwardCamera.pitch,5);
turnObserver(forwardCamera,0,-10000,.2);assert.equal(forwardCamera.pitch,85);
const scenePreset={geometry:structuredClone(DEFAULT_GEOMETRY),settings:{colors:['#4a82a8','#a3c4cc','#fff7e0','#b0c4cf','#303f4f','#42596b'],style:0,cloudForm:'cumulus',cloudSeed:27,windDirection:25,windSpeed:1,brightness:1,rotation:0,reduced:false},timing:structuredClone({...TIMING_PRESETS.standard,blend:5}),navigation:{moveSpeed:1.2,sensitivity:.12},people:4,volume:.35};
assert.equal(validateScenePreset(scenePreset).people,4);assert.throws(()=>validateScenePreset({...scenePreset,people:Infinity}));assert.throws(()=>validateScenePreset({...scenePreset,settings:{...scenePreset.settings,colors:['bad']}}));
const saved={version:1,scenes:[{id:'one',name:'Studio',data:scenePreset}],colours:[{id:'blue',name:'Blue',colors:['#4a82a8','#a3c4cc','#fff7e0','#b0c4cf','#303f4f','#42596b']}],defaultId:'one'};
assert.equal(validatePresetStore(JSON.parse(JSON.stringify(saved))).defaultId,'one');
{// Saved cloud looks (version 3): files stay version 2 until one is saved; missing sliders take defaults; bad ones are refused.
 assert.equal(validatePresetStore(saved).version,2);assert.deepEqual(validatePresetStore(saved).clouds,[]);
 const withLook=validatePresetStore({...saved,clouds:[{id:'c1',name:'Wisps',look:{cloudForm:'broken',cloudWarp:2}}]});
 assert.equal(withLook.version,3);assert.equal(withLook.clouds[0].look.cloudWarp,2);assert.equal(withLook.clouds[0].look.cloudSize,1);assert.equal(withLook.clouds[0].look.cloudForm,'broken');
 assert.deepEqual(validatePresetStore(JSON.parse(JSON.stringify(withLook))),withLook,'version 3 round-trips');
 for(const look of [{cloudForm:'storm'},{cloudForm:'cumulus',cloudWarp:99},{cloudForm:'cumulus',cloudWarp:'1'},null])assert.throws(()=>validatePresetStore({...saved,clouds:[{id:'c1',name:'Bad',look}]}));
 assert.throws(()=>validatePresetStore({...saved,version:4}),'a newer file is left alone');
 assert.throws(()=>validatePresetStore({...saved,clouds:[{id:'c1',name:'A',look:{cloudForm:'cumulus'}},{id:'c1',name:'B',look:{cloudForm:'cumulus'}}]}));}assert.equal(validatePresetStore({...saved,defaultId:'missing'}).defaultId,null);assert.throws(()=>validatePresetStore({...saved,scenes:[saved.scenes[0],saved.scenes[0]]}));
console.log('PASS: camera-relative WASD, normalized diagonal speed, mouse direction and pitch limits, preset validation and persisted round trips.');

const {newObject,validObject,setObjectTransform,allPonds,cloneObject}=await import('./builder-model.mjs?v=2026.10.27.1');
const build=structuredClone(DEFAULT_GEOMETRY),part=newObject('bench',{x:1,y:0,z:2},'bench-one');
assert.ok(validObject(part));build.objects.push(part);setObjectTransform(build,part.id,{x:3,width:2});assert.equal(build.objects[0].x,3);assert.equal(build.objects[0].width,2);
assert.ok(validObject(cloneObject({...part,name:'A'.repeat(60)},'bench-two')));
assert.equal(allPonds({...build,objects:[newObject('pond',{x:0,y:.2,z:0},'pond-one')]}).at(-1).rimY,.2);
assert.throws(()=>validateScenePreset({...scenePreset,geometry:{...build,objects:[{...part,width:-1}]}}));
const oldScene=structuredClone(scenePreset);for(const k of ['objects','surface','quality','baseY','panelYaw'])delete oldScene.geometry[k];
assert.deepEqual(validateScenePreset(oldScene).geometry.objects,[]);assert.throws(()=>validateScenePreset({...scenePreset,geometry:null}));
const lifted={eyeX:0,eyeZ:0,eyeHeight:1.6,yaw:0};moveObserver(lifted,new Set(['e']),.05,2);assert.ok(lifted.eyeHeight>1.6);
const {mergePresets}=await import('./presets.mjs?v=2026.10.27.1');
const merged=await mergePresets({version:2,scenes:[],colours:[],defaultId:null},saved);assert.equal(merged.scenes.length,1);assert.equal(merged.defaultId,'one');
assert.deepEqual(await mergePresets(merged,saved),merged);
{const looks={...saved,clouds:[{id:'c1',name:'Wisps',look:{cloudForm:'layered'}}]},both=await mergePresets(merged,looks);assert.equal(both.clouds.length,1);assert.equal(both.version,3);assert.deepEqual(await mergePresets(both,looks),both,'cloud looks import once');}
const conflicted=structuredClone(saved);conflicted.scenes[0].data.people=5;const combined=await mergePresets(merged,conflicted);assert.equal(combined.scenes.length,2);assert.notEqual(combined.scenes[0].id,combined.scenes[1].id);
console.log('PASS: build transforms, part validation, schema migration, vertical movement and idempotent/conflict-preserving preset imports.');

const {objectSpec}=await import('./builder-model.mjs?v=2026.10.27.1');
const pondScene={...structuredClone(DEFAULT_GEOMETRY),baseX:2,baseZ:-1,baseRotation:35};
const actualPond=allPonds(pondScene)[0],editablePond=objectSpec(pondScene,'pond:0');
assert.equal(editablePond.x,actualPond.x);assert.equal(editablePond.z,actualPond.z);
assert.equal(editablePond.width,actualPond.a*2);assert.equal(editablePond.ry,-actualPond.angle*180/Math.PI);
assert.equal(objectSpec(pondScene,'missing'),null);
const {readFileSync}=await import('node:fs');
for(const name of ['index.html','en.html']){
 const html=readFileSync(new URL(name,import.meta.url),'utf8');
 assert.ok(!html.includes('id="plan-view"'));assert.ok(!html.includes('id="layout-plan"'));
 assert.equal((html.match(/data-view=/g)||[]).length,2);
 for(const id of ['water-drop','shore-retreat','layout-select','forecast-rain-scale','approach-host'])assert.ok(!html.includes(`id="${id}"`));
 for(const id of ['concept-host','canopy-height','concept-light','geometry-error','reflection-host','canopy-width','canopy-depth','canopy-x','canopy-z','view-arc','view-near','view-far','eye-low','eye-high','pond-width','pond-depth','water-width','water-depth','canopy-result','canopy-apply','canopy-heights','canopy-overlay','canopy-label'])assert.ok(html.includes(`id="${id}"`),name+id);
 for(const view of ['overview','eye','puddle','layers','plan'])assert.ok(html.includes(`data-concept-view="${view}"`));
 assert.equal((html.match(/data-anchor=/g)||[]).length,8);
}
console.log('PASS: legacy puddle gizmo frames; concept page replaces the builder and drops water-level controls.');
const {BUILD,innerHalf,paverLayout,viewers,reflectedPatch,requiredRect,canopyStudy,VIEW_ARCS,waterOutline,inWater,pebbleHeight}=await import('./concept-model.mjs?v=2026.10.27.1');
{// Two paver rows cover the band between pond and frame exactly once, inside the frame and off the pond.
 for(const [w,d] of [[.58,.58],[.5,.7],[.8,.3]]){const inner=innerHalf();let area=0;
  for(const p of paverLayout(w,d)){assert.ok(Math.abs(p.x)+p.sx/2<=inner+1e-9&&Math.abs(p.z)+p.sz/2<=inner+1e-9,'pavers stay inside the frame');assert.ok(Math.abs(p.x)-p.sx/2>=w/2-1e-9||Math.abs(p.z)-p.sz/2>=d/2-1e-9,'pavers stay off the pond');area+=(p.sx+BUILD.paver.joint)*(p.sz+BUILD.paver.joint);}
  assert.ok(Math.abs(area-(4*inner*inner-w*d))<1e-9,'the paver band is covered once');}
 assert.ok(BUILD.waterY<BUILD.gravelY&&BUILD.gravelY<BUILD.frameHeight,'dry stones stand above the water, below the frame');}
{const g=structuredClone(DEFAULT_GEOMETRY),v={x:0,z:.7,eye:1.6},p=reflectedPatch(g,v);
 // The water patch matches the mirror-ray check above, and lies on the far side from the viewer.
 for(const [u,w] of [[-1,-1],[1,1],[1,-1]]){const C=reflectedCeilingPoint({x:u*g.waterWidth/2,z:w*g.waterDepth/2},{x:v.x,z:v.z,height:v.eye-BUILD.waterY},g.height-BUILD.waterY);assert.ok(Math.abs(C.x-(p.x+u*p.hw))<1e-12&&Math.abs(C.z-(p.z+w*p.hd))<1e-12);}
 assert.ok(p.z<0,'the pond shows ceiling beyond it');
 assert.equal(viewers(g).length,72*9);assert.equal(viewers({...g,viewArc:'front'}).length,9);
 // A canopy equal to the required rectangle fills every reflection; a smaller one does not.
 for(const arc of Object.keys(VIEW_ARCS)){const q={...g,viewArc:arc},r=requiredRect(q),fit={...q,skyShape:'fill',diameter:r.width,skyAspect:r.width/r.depth,panelX:r.x,panelZ:r.z};
  assert.equal(canopyStudy(fit).worst.coverage,1,arc);assert.ok(canopyStudy({...fit,diameter:r.width*.8}).worst.coverage<1,arc);}
 const all=requiredRect(g),front=requiredRect({...g,viewArc:'front'});
 assert.ok(Math.abs(all.x)<1e-9&&Math.abs(all.z)<1e-9,'all-round viewers need a canopy centred on the pond');
 assert.ok(front.z<0&&front.width<all.width&&front.depth<all.depth,'viewers on one side need a smaller canopy beyond the pond');
 assert.ok(requiredRect(g,2.6).width>requiredRect(g,2.2).width,'a higher canopy must be larger');assert.ok(requiredRect({...g,eyeLow:1}).width>all.width,'lower eyes need more canopy');
 const s=canopyStudy(g);assert.ok(s.worst.coverage<=s.mean&&s.mean<1,'the A0 default leaves sky missing from some reflections');
 // Only part of the gravel holds water: an irregular outline exactly waterWidth × waterDepth across, dry stones round it.
 const shore=waterOutline(g,720),xs=shore.map(p=>p[0]),zs=shore.map(p=>p[1]);
 assert.ok(Math.abs(Math.max(...xs)-Math.min(...xs)-g.waterWidth)<2e-3&&Math.abs(Math.max(...zs)-Math.min(...zs)-g.waterDepth)<2e-3,'outline spans the water size');
 assert.ok(new Set(shore.map(([x,z])=>Math.round(Math.hypot(x/g.waterWidth,z/g.waterDepth)*100))).size>5,'the shore is irregular');
 assert.ok(inWater(g,0,0)&&!inWater(g,g.pondWidth*.45,g.pondDepth*.45),'water in the middle, stones at the corners');
 assert.ok(pebbleHeight(g,0,0)<BUILD.waterY&&pebbleHeight(g,g.pondWidth*.45,0)>BUILD.waterY,'the bed dips under the water and rises outside it');
 assert.ok(geometryProblem({...g,waterWidth:g.pondWidth-.01}),'water must stay inside the gravel');
 // Coverage counts water only: a canopy that covers every reflection of the water but not of the whole gravel scores 1.
 {const r=requiredRect(g),fit={...g,skyShape:'fill',diameter:r.width,skyAspect:r.width/r.depth,panelX:r.x,panelZ:r.z};assert.equal(canopyStudy(fit).worst.coverage,1);
  const wet={...g,waterWidth:g.pondWidth-.02,waterDepth:g.pondDepth-.02};assert.ok(requiredRect(g).width<requiredRect(wet).width-.1,'less water needs less canopy');}
 // Presets saved before the study load with its defaults; unknown arcs and oversized ponds are refused.
 const old=structuredClone(scenePreset);for(const k of ['pondWidth','pondDepth','waterWidth','waterDepth','eyeLow','viewNear','viewFar','viewArc'])delete old.geometry[k];
 const loaded=validateScenePreset(old).geometry;assert.equal(loaded.pondWidth,.58);assert.equal(loaded.waterWidth,.42);assert.equal(loaded.waterDepth,.38);assert.equal(loaded.viewArc,'all');assert.equal(loaded.eyeLow,1.2);
 assert.throws(()=>validateScenePreset({...scenePreset,geometry:{...scenePreset.geometry,viewArc:'sideways'}}));assert.throws(()=>validateScenePreset({...scenePreset,geometry:{...scenePreset.geometry,pondWidth:1.2}}));}
console.log('PASS: 1 m base with two paver rows round the pond; canopy study: mirror patches, full-coverage rectangle, arcs, heights, eye heights and preset migration.');

const {outline}=await import('./layout.mjs?v=2026.10.27.1');
const signatures=new Set();
for(let shape=0;shape<8;shape++){
 const radii=Array.from({length:128},(_,i)=>outline(i*Math.PI/64,27,false,1,shape));
 assert.ok(radii.every(r=>Number.isFinite(r)&&r>.2&&r<1.5));signatures.add(radii.map(r=>r.toFixed(3)).join(','));
}
assert.equal(signatures.size,8,'Eight distinct, finite puddle contours');
const enriched=structuredClone(DEFAULT_GEOMETRY);enriched.layout='custom';enriched.customPools=editablePools(DEFAULT_GEOMETRY);Object.assign(enriched.customPools[0],{shape:5,color:'#887755',material:'muddy-water',name:'Saved pond',elevation:.12,basinDepth:.09});
const pondSpec=objectSpec(enriched,'pond:0');assert.equal(pondSpec.name,'Saved pond');assert.equal(pondSpec.material,'muddy-water');assert.equal(pondSpec.y,enriched.baseHeight+.12);assert.equal(pondSpec.height,.09);
const rebuilt={...enriched,customPools:editablePools(enriched)};assert.deepEqual(objectSpec(rebuilt,'pond:0'),pondSpec);
assert.equal(validateScenePreset({...scenePreset,geometry:rebuilt}).geometry.customPools[0].shape,5);
assert.throws(()=>validateScenePreset({...scenePreset,geometry:{...rebuilt,customPools:[{...rebuilt.customPools[0],elevation:Infinity}]}}));
const {materializeFixtures,fixtureObjects}=await import('./builder-model.mjs?v=2026.10.27.1');
const fixtures={...structuredClone(DEFAULT_GEOMETRY),layout:'double',equipment:true};materializeFixtures(fixtures);fixtures.equipment=true;assert.equal(fixtureObjects(fixtures).length,0);assert.doesNotThrow(()=>validateScenePreset({...scenePreset,geometry:fixtures}));
console.log('PASS: distinct puddle shapes, independent pond appearance/elevation round trips and edited fixture reactivation.');


const {setPuddleLayout}=await import('./layout.mjs?v=2026.10.27.1');
const centred={...structuredClone(DEFAULT_GEOMETRY),layout:'center',equipment:true,customPools:null};
assert.equal(fixtureObjects(centred).length,0);
setPuddleLayout(centred,'custom');centred.customPools[0].width=.8;
assert.equal(centred.equipment,false);assert.equal(fixtureObjects(centred).length,0);assert.equal(centred.objects.length,0);
const equipped={...structuredClone(DEFAULT_GEOMETRY),layout:'double',equipment:true};setPuddleLayout(equipped,'custom');assert.equal(fixtureObjects(equipped).length,3);
assert.equal(DEFAULT_GEOMETRY.equipment,false);assert.equal(DEFAULT_GEOMETRY.objects.length,0);
assert.equal(puddles(DEFAULT_GEOMETRY).length,1);assert.equal(puddles(DEFAULT_GEOMETRY)[0].a*2,.5);assert.equal(puddles(DEFAULT_GEOMETRY)[0].b*2,.5);
assert.ok(Math.abs(landRadius(DEFAULT_GEOMETRY)*2-1)<1e-12);
assert.ok(Math.abs(panelHalfSize(DEFAULT_GEOMETRY)[0]*2-.841)<1e-12);assert.ok(Math.abs(panelHalfSize(DEFAULT_GEOMETRY)[1]*2-1.189)<1e-12);
console.log('PASS: resizing a legacy central pond cannot reveal equipment; new default is a 0.5 m pond, 1 m ground and A0 canopy.');
for(const name of ['index.html','en.html']){const html=readFileSync(new URL(name,import.meta.url),'utf8');
 for(const id of ['live-wind','wind-status','wind-speed','morph-rate'])assert.ok(html.includes(`id="${id}"`),id);
 // The canopy orientation turns sun, wind and clouds together; the separate north rotation is gone.
 assert.ok(!html.includes('id="wind-north"'));
 // One steady drift and one steady shape-change speed: no live-wind speed gain, no per-phase rates.
 for(const id of ['wind-gain','rate-blend','stage-rate-0'])assert.ok(!html.includes(`id="${id}"`),id);
 for(const id of ['forecast-controls','forecast-search','forecast-bound','palette','colour-preset-list'])assert.ok(!html.includes(`id="${id}"`),id);
 for(const id of ['turbidity','city-glow'])assert.ok(html.includes(`id="${id}"`),id);}
{const legacy=structuredClone(scenePreset);legacy.settings.sky='storm-night';
 const migrated=validateScenePreset(legacy).settings;assert.equal(migrated.turbidity,2.5,'older presets take default atmosphere');assert.equal(migrated.cityGlow,.6);assert.equal(migrated.liveWind,true);assert.equal('sky' in migrated,false);assert.equal('dayColors' in migrated,false);
 const colours=Array.from({length:4},()=>[...legacy.settings.colors]);assert.doesNotThrow(()=>validateScenePreset({...scenePreset,settings:{...scenePreset.settings,dayColors:colours}}),'2026-10-09 presets still load');
 assert.equal(validateScenePreset({...scenePreset,settings:{...scenePreset.settings,turbidity:6,cityGlow:.2,windNorth:30,liveWind:false}}).settings.turbidity,6);
 assert.throws(()=>validateScenePreset({...scenePreset,settings:{...scenePreset.settings,turbidity:50}}));
 assert.equal(validateScenePreset({...scenePreset,settings:{...scenePreset.settings,atmosphere:'smoke',grade:'dream'}}).settings.grade,'dream');assert.equal(validateScenePreset(scenePreset).settings.atmosphere,'melbourne');
 assert.throws(()=>validateScenePreset({...scenePreset,settings:{...scenePreset.settings,grade:'neon'}}));
 assert.throws(()=>validateScenePreset({...scenePreset,settings:{...scenePreset.settings,windGain:9}}));}
{const A=await import('./atmosphere.mjs?v=2026.10.27.1'),{GRADES}=await import('./visual.mjs?v=2026.10.27.1'),{ATMOSPHERE_IDS,GRADE_IDS}=await import('./studio.mjs?v=2026.10.27.1');
 assert.deepEqual(Object.keys(A.ATMOSPHERES),ATMOSPHERE_IDS);assert.deepEqual(Object.keys(GRADES),GRADE_IDS);
 const noon=id=>{const st=A.skyState(0,A.ATMOSPHERES[id]);return A.skyRadiance([0,0,1],st.sun,st.air);};
 const blue=noon('clear'),smoke=noon('smoke'),haze=noon('haze');assert.ok(blue[2]/blue[0]>2.5,'clean air: deep blue zenith');assert.ok(smoke[0]>smoke[2],'smoke turns the noon sky orange');assert.ok(haze[2]/haze[0]<blue[2]/blue[0]*.5,'haze whitens the sky');
 const dusk=id=>{const st=A.skyState(100,A.ATMOSPHERES[id]);return A.skyRadiance([0,0,1],st.sun,st.air);};assert.ok(dusk('volcanic')[2]/dusk('volcanic')[1]>dusk('melbourne')[2]/dusk('melbourne')[1],'volcanic twilight is more violet');
 for(const id of ATMOSPHERE_IDS)assert.ok(A.skyTable(A.skyState(-93,A.ATMOSPHERES[id])).every(Number.isFinite));
 for(const n of ['index.html','en.html']){const html=readFileSync(new URL(n,import.meta.url),'utf8');for(const id of [...ATMOSPHERE_IDS,...GRADE_IDS])assert.ok(html.includes(`value="${id}"`),n+id);}}
{const A=await import('./atmosphere.mjs?v=2026.10.27.1');
 const x=A.skyState(-96),y=A.skyState(-94);assert.deepEqual(A.blendLight(x,y,0).exposure.toFixed(6),x.exposure.toFixed(6));assert.ok(Math.abs(A.blendLight(x,y,1).exposure-y.exposure)<1e-9);
 const mid=A.blendLight(x,y,.5).exposure;assert.ok(mid<Math.max(x.exposure,y.exposure)&&mid>Math.min(x.exposure,y.exposure),'exposure blends smoothly');
 const rows=new Uint8ClampedArray(A.TABLE_SIZE**2*4);for(let j=0;j<A.TABLE_SIZE;j+=3)A.skyTableRows(x,rows,j,j+3);assert.deepEqual(rows,A.skyTable(x),'a table built row by row matches a full build');
 assert.deepEqual(CYCLE.stages,[60,60,60,60],'a 240 s day by default: four equal parts of 60 s');
 // The moon takes over from the sun only once sunlight has left the clouds, so the light never jumps.
 let swap=96;while(A.solarPosition(swap).elevation>-7)swap+=.01;const before=A.skyState(swap-.02),after=A.skyState(swap+.02);assert.ok(Math.max(...before.sunCloud)<.01&&Math.max(...after.sunCloud)<.01,'nothing lights the clouds when the light swaps');
 assert.ok(A.luminance(A.skyState(180).sunCloud)>A.luminance(A.skyState(180,{moonlight:0}).sunCloud)&&A.skyState(180,{moonlight:0}).sunCloud.every(v=>v===0),'moonlight setting');
 {const n=A.skyState(180);assert.ok(n.light.every((v,i)=>Math.abs(v+n.sun[i])<1e-9)&&n.light[2]>.5,'the full moon stands opposite the sun, high at midnight');}
 // The canopy orientation turns the whole sky in the renderer, so the sun table is always computed with north up.
 assert.ok(A.sunVector(30,90)[0]<-.8,'east on the left when looking up');}
console.log('PASS: smooth light blending, incremental sky tables, moonlit night and the 240 s default loop.');
console.log('PASS: six atmosphere types change scattering physically; six colour grades; both menus in both languages.');
console.log('PASS: live-wind panel; physical atmosphere controls replace colour editing; settings persist; older presets migrate.');
{const {CLOUD_LOOK,CLOUD_STARTS,cloudLook,validateScenePreset:check}=await import('./studio.mjs?v=2026.10.27.1'),{drawCloudMass:mass}=await import('./visual.mjs?v=2026.10.27.1');
 const defaults=cloudLook(),lookIn=s=>Object.fromEntries(Object.keys(CLOUD_LOOK).map(k=>[k,s[k]]));
 // Presets from before the cloud look sliders load with the 10.19.2 look; saved values round-trip; bad ones are refused.
 assert.deepEqual(lookIn(check(scenePreset).settings),defaults);
 assert.deepEqual(lookIn(check({...scenePreset,settings:{...scenePreset.settings,...CLOUD_STARTS.ragged}}).settings),CLOUD_STARTS.ragged);
 for(const [k,[,b]] of Object.entries(CLOUD_LOOK)){assert.throws(()=>check({...scenePreset,settings:{...scenePreset.settings,[k]:b+1}}),k);assert.throws(()=>check({...scenePreset,settings:{...scenePreset.settings,[k]:'1'}}),k);}
 // The projection window clamps what it receives and falls back to the defaults.
 assert.equal(cloudLook({cloudWarp:99}).cloudWarp,CLOUD_LOOK.cloudWarp[1]);assert.equal(cloudLook({cloudWarp:NaN}).cloudWarp,1);assert.equal(cloudLook(null).cloudSize,1);
 // Starting points set every slider, inside its range and on the 0.05 slider grid; "soft" is the default look.
 assert.deepEqual(CLOUD_STARTS.soft,defaults);
 for(const start of Object.values(CLOUD_STARTS)){assert.deepEqual(Object.keys(start).sort(),Object.keys(CLOUD_LOOK).sort());
  for(const [k,v] of Object.entries(start)){const [a,b]=CLOUD_LOOK[k];assert.ok(v>=a&&v<=b,k);assert.ok(Math.abs((v-a)/.05-Math.round((v-a)/.05))<1e-9,k);}}
 // Both pages offer every slider with the same range and default, a readout, and every starting point.
 for(const name of ['index.html','en.html']){const html=readFileSync(new URL(name,import.meta.url),'utf8');
  for(const [k,[a,b,d]] of Object.entries(CLOUD_LOOK)){const tag=html.match(new RegExp(`<input id="([\\w-]+)" data-setting="${k}"[^>]*>`));assert.ok(tag,name+k);
   for(const attr of ['type="range"',`min="${a}"`,`max="${b}"`,`value="${d}"`])assert.ok(tag[0].includes(attr),name+k+attr);assert.ok(html.includes(`id="${tag[1]}-value"`),name+k);}
  for(const k of Object.keys(CLOUD_STARTS))assert.ok(html.includes(`data-cloud-start="${k}"`),name+k);}
 // Cloud size scales each cloud in the mass map; at 1 the map is drawn exactly as before.
 const trace=(...gain)=>{const c=[];const ctx=new Proxy({createRadialGradient:(...p)=>{c.push(p);return {addColorStop(){}};}},{get:(o,k)=>k in o?o[k]:(...args)=>c.push([k,...args]),set:()=>true});mass(ctx,[[0,0,72,1],[.4,.1,73,1]],.5,'cumulus',0,25,1,[0,0],...gain);return c;};
 assert.deepEqual(trace(1),trace());const scales=g=>trace(g).filter(c=>c[0]==='scale');assert.ok(Math.abs(scales(1.5)[0][1]-scales(1)[0][1]*1.5)<1e-12);}
console.log('PASS: cloud look sliders: defaults keep the 10.19.2 clouds, presets round-trip and older ones migrate, both pages match the ranges.');
{const {OUTPUT_REGION,outputRegion,regionScale,validateScenePreset:check}=await import('./studio.mjs?v=2026.10.27.1');
 // The whole frame by default; values round-trip in presets, the projection clamps, bad ones are refused.
 assert.deepEqual(outputRegion(),{regionX:.5,regionY:.5,regionW:1,regionH:1,feather:.3});assert.deepEqual(outputRegion(check(scenePreset).settings),outputRegion());
 const set={regionX:.3,regionY:.7,regionW:.6,regionH:.4,feather:.2};assert.deepEqual(outputRegion(check({...scenePreset,settings:{...scenePreset.settings,...set}}).settings),set);
 assert.equal(outputRegion({regionW:0}).regionW,.1);assert.throws(()=>check({...scenePreset,settings:{...scenePreset.settings,regionW:0}}));assert.throws(()=>check({...scenePreset,settings:{...scenePreset.settings,feather:'.2'}}));
 for(const name of ['index.html','en.html']){const html=readFileSync(new URL(name,import.meta.url),'utf8');
  for(const [k,[a,b,d]] of Object.entries(OUTPUT_REGION)){const tag=html.match(new RegExp(`<input id="([\\w-]+)" data-setting="${k}"[^>]*>`));assert.ok(tag,name+k);
   for(const attr of ['type="range"',`min="${a}"`,`max="${b}"`,`value="${d}"`])assert.ok(tag[0].includes(attr),name+k+attr);assert.ok(html.includes(`id="${tag[1]}-value"`),name+k);}
  for(const id of ['region-reset','cloud-preset-list','cloud-preset-name','cloud-preset-save','cloud-preset-load','cloud-preset-delete','cloud-preset-status'])assert.ok(html.includes(`id="${id}"`),name+id);}
 // Big clouds shrink with the region: its shorter half-side in sky units, 1 for the whole frame.
 assert.equal(regionScale({skyShape:'fill',skyAspect:.7073}),1);assert.equal(regionScale({skyShape:'circle',regionW:.4,regionH:.7}),.4);
 assert.ok(Math.abs(regionScale({skyShape:'fill',skyAspect:.7073,regionW:.5,regionH:.3})-.3/.7073)<1e-12);
 // Big clouds form only inside the cloud region, on its upwind half once the wind blows; past its edge they fade out
 // over the set distance (no mask: the sky and its thin cloud stay as they are everywhere).
 {const {CloudField:Field,FIELD:F,skyReach:reach}=await import('./field.mjs?v=2026.10.27.1'),canopy={shape:'fill',aspect:.7073,rotation:0},H=1/.7073;
  const corner={...canopy,regionX:.75,regionY:.25,regionW:.4,regionH:.3,scale:.3*H,exit:.6*.3*H};
  for(const wind of [[1,0],[0,1],[-.6,.8]])assert.ok(Math.abs(reach(canopy,wind)-reach({...canopy,...outputRegion()},wind))<1e-12,'the default region changes nothing');
  assert.ok(Math.abs(reach(corner,[1,0])-.9)<1e-12&&Math.abs(reach(corner,[0,1])-.8*H)<1e-12,'reach ends at the region edge');
  const field=new Field(3),pres=new Array(20).fill(1),known=new Set(),formed=[];let drift=[0,0];
  for(let t=0;t<600;t+=.5){drift=[drift[0]+F.drift*.5,drift[1]];field.update(.5,6,pres,drift,[1,0],corner);
   for(const c of field.slots.flat()){if(!known.has(c)){known.add(c);formed.push([c.x+drift[0],c.y+drift[1],t,c.out]);}
    if(c.x+drift[0]>.9+corner.exit)assert.ok(c.out>=1-1e-9,'gone once past the edge by the fade distance');}}
  assert.ok(formed.length>30,'clouds keep coming');
  // Arrivals form inside 80% of the region; later clouds drift in across 80% of its height, starting unseen at least one
  // fade distance beyond its upwind edge (a region edge inside the picture: no extra margin), staggered by up to half
  // the region's length.
  for(const [x,y,t,out] of formed){assert.ok(Math.abs(y-.5*H)<=.24*H+1e-9,'across 80% of the region');
   if(t===0)assert.ok(Math.abs(x-.5)<=.32+1e-9,'arrivals inside 80% of the region');else assert.ok(x<=.1-corner.exit+1e-9&&x>=.1-corner.exit-.4-1e-9&&out===1,'next clouds start beyond the upwind edge');}
  // Moving the region: clouds that can no longer drift into it give way at once to new ones growing inside it.
  const moved=new Field(5),p2=new Array(20).fill(1);let d2=[0,0];for(let t=0;t<200;t+=.5){d2=[d2[0]+F.drift*.5,d2[1]];moved.update(.5,6,p2,d2,[1,0],canopy);}
  for(let t=0;t<20;t+=.5){d2=[d2[0]+F.drift*.5,d2[1]];moved.update(.5,6,p2,d2,[1,0],corner);}
  const shown=moved.snapshot(p2).filter(c=>c[3]>.05);assert.ok(shown.length>=6,'every visitor has a cloud in the new region');
  for(const [x,y] of shown)assert.ok(Math.abs(y+d2[1]-.5*H)<=.3*H+.3*corner.scale+corner.exit,'visible clouds lie in the region\'s strip along the wind');}
 // Wisps inside a cloud move at one constant speed: equal steps between reseeds, the same for every wisp and cloud.
 const {cloudLobes:lobes}=await import('./visual.mjs?v=2026.10.27.1');
 for(const seed of [5,77]){const steps=[];for(let t=0;t<120;t+=.5){const a=lobes(seed,1,t),b=lobes(seed,1,t+.5);a.forEach((p,i)=>{if(i>=3&&a[i].opacity>.05&&b[i].opacity>.05)steps.push(Math.abs(b[i].x-p.x));});}
  const base=(14+25)*.25/21*.5,same=steps.filter(d=>d<base*3);assert.ok(same.length>steps.length*.9);
  const sizes=new Set(same.map(d=>(d/same[0]).toFixed(6)));assert.ok(sizes.size===1,`one constant step per cloud (${[...sizes].slice(0,4)})`);}}
console.log('PASS: cloud region in presets and pages; big clouds form, shrink and fade by the region; saved cloud looks UI; constant wisp speed.');
{const {CloudField,FIELD,envelope}=await import('./field.mjs?v=2026.10.27.1');
 // Whole frame, square canopy, wind to the right at 1×: a cloud keeps full strength while any of it can be in the
 // picture (centre within the frame widened by its radius), so it drifts out whole and fades only once outside.
 const r=.75,square={shape:'fill',aspect:1,rotation:0,scale:1,exit:.6,radius:r,speed:FIELD.drift,grow:10,fade:12},field=new CloudField(4),full=new Map(),handover=[];let drift=[0,0];
 for(let t=0;t<800;t+=.5){drift=[drift[0]+FIELD.drift*.5,0];field.update(.5,1,[1],drift,[1,0],square);const list=field.slots[0];
  for(const c of list){const x=c.x+drift[0],s=envelope(c)*(1-c.out);
   if(Math.abs(x)<=1+r)assert.ok(s>1-1e-9,'full strength while any of the cloud can be in the picture');
   if(s>1-1e-9&&!full.has(c)){full.set(c,t);const before=list[list.indexOf(c)-1];if(before&&full.get(before)>0)handover.push(before.x+drift[0]);}}}
 // A new cloud reaches full strength just outside the left edge as the one before it starts to leave on the right, give
 // or take a quarter of the frame, so different visitors' clouds fall out of step.
 assert.ok(handover.length>=3);for(const x of handover)assert.ok(Math.abs(x-(1-r))<=.5+.011,`in at one side as the other goes out (${x})`);
 assert.ok(Math.max(...handover)-Math.min(...handover)>.2,'handovers vary');
 // In still air clouds dissipate where they are and new ones form, so shapes still change.
 const calm=new CloudField(9),seeds=new Set();for(let t=0;t<600;t+=.5){calm.update(.5,1,[1],[0,0],[1,0],{...square,speed:0});calm.slots[0].forEach(c=>seeds.add(c.seed));}
 assert.ok(seeds.size>=5&&calm.slots[0].length<=2,'still air renews clouds in place');
 // Forming and dissipating times are separate (the appear and disappear sliders give 1.25 and 1.2 times theirs); a
 // visitor's cloud fades in and out over the slider times themselves.
 const slow=new CloudField(2).update(0,1,[1],[0,0],[1,0],{...square,speed:0,grow:30,fade:20}).slots[0][0];
 assert.equal(slow.grow,30);assert.equal(slow.fade,20);assert.ok(Math.abs(envelope({...slow,age:15})-.5)<1e-9,'half formed halfway through 30 s');
 assert.ok(Math.abs(envelope({...slow,age:slow.life-10})-.5)<1e-9,'half dissipated halfway through its last 20 s');
 const usual=new CloudField(2).update(0,1,[1],[0,0],[1,0],{...square,speed:0,grow:undefined,fade:undefined}).slots[0][0];assert.equal(usual.grow,FIELD.grow);assert.equal(usual.fade,FIELD.fade);
 const p=[0];updatePresence(p,1,12,{fadeIn:24,fadeOut:30});assert.ok(Math.abs(p[0]-.5)<1e-9);updatePresence(p,0,15,{fadeIn:24,fadeOut:30});assert.equal(p[0],0);
 const {CLOUD_TIME,cloudTime,validateScenePreset:check}=await import('./studio.mjs?v=2026.10.27.1');
 assert.deepEqual(cloudTime(check(scenePreset).settings),{cloudAppear:8,cloudVanish:10},'the defaults keep the earlier 10 s timing');
 assert.deepEqual(cloudTime(check({...scenePreset,settings:{...scenePreset.settings,cloudFade:30}}).settings),{cloudAppear:24,cloudVanish:30},'2026.10.24.5 presets migrate');
 assert.deepEqual(cloudTime(check({...scenePreset,settings:{...scenePreset.settings,cloudAppear:3,cloudVanish:45}}).settings),{cloudAppear:3,cloudVanish:45});
 for(const [k,bad] of [['cloudAppear',1],['cloudVanish',61],['cloudAppear','10'],['cloudFade',61]])assert.throws(()=>check({...scenePreset,settings:{...scenePreset.settings,[k]:bad}}),k);
 for(const name of ['index.html','en.html']){const html=readFileSync(new URL(name,import.meta.url),'utf8');
  for(const [k,[a,b,d]] of Object.entries(CLOUD_TIME)){const tag=html.match(new RegExp(`<input id="([\\w-]+)" data-setting="${k}"[^>]*>`));assert.ok(tag&&html.includes(`id="${tag[1]}-value"`),name+k);for(const attr of ['type="range"',`min="${a}"`,`max="${b}"`,`value="${d}"`])assert.ok(tag[0].includes(attr),name+k+attr);}
  for(const id of ['mapping','camera-select','threshold','count-hold','mapping-board','mapping-edit','mapping-reset','mapping-off','mapping-width','mapping-depth'])assert.ok(html.includes(`id="${id}"`),name+id);
  // The projection window carries no hint text; the old single appear/disappear slider is gone.
  for(const id of ['projection-hint','cloud-fade'])assert.ok(!html.includes(`id="${id}"`),name+id);}
 // Projection mapping: the corner pin takes the box corners to the quad corners and the box centre to where the quad's
 // diagonals cross (a projective map, as a projector off to one side needs); a rectangle is plain scaling.
 const {cornerPin,convex,validCorners,quadPoint,contain}=await import('./mapping.mjs?v=2026.10.27.1');
 const quad=[[210,90],[1500,160],[1700,1010],[60,930]],m=cornerPin(800,600,quad),map=(x,y)=>{const w=m[3]*x+m[7]*y+m[15];return [(m[0]*x+m[4]*y+m[12])/w,(m[1]*x+m[5]*y+m[13])/w];};
 [[0,0],[800,0],[800,600],[0,600]].forEach(([x,y],i)=>{const [u,v]=map(x,y);assert.ok(Math.hypot(u-quad[i][0],v-quad[i][1])<1e-6,'corner '+i);});
 const [[x1,y1],[x2,y2],[x3,y3],[x4,y4]]=quad,d=(x1-x3)*(y2-y4)-(y1-y3)*(x2-x4),k=((x1-x2)*(y2-y4)-(y1-y2)*(x2-x4))/d,[u,v]=map(400,300);
 assert.ok(Math.hypot(u-(x1+k*(x3-x1)),v-(y1+k*(y3-y1)))<1e-6,'the centre lands where the diagonals cross');
 assert.deepEqual(cornerPin(100,50,[[10,20],[210,20],[210,120],[10,120]]).map(n=>+n.toFixed(12)),[2,0,0,0,0,2,0,0,0,0,1,0,10,20,0,1],'a rectangle is plain scaling');
 assert.ok(convex(quad)&&convex([...quad].reverse()),'mirror images are allowed');assert.ok(!convex([[0,0],[1,0],[0,1],[1,1]])&&!convex([[0,0],[1,0],[.2,.2],[0,1]]),'crossed or dented corners are refused');
 assert.ok(validCorners([[.1,.1],[.9,.1],[.9,.9],[.1,.9]])&&!validCorners([[.1,.1],[.9,.1],[.9,.9]])&&!validCorners([[.1,.1],[.9,.1],[.9,3],[.1,.9]]));
 // The editor's preview grid uses the same map; the starting quad keeps the canopy's proportions on any screen.
 {const q=[[.2,.1],[.8,.15],[.9,.95],[.1,.8]];[[0,0],[1,0],[1,1],[0,1]].forEach(([a,b],i)=>assert.ok(Math.hypot(...quadPoint(q,a,b).map((v,k)=>v-q[i][k]))<1e-9));
  for(const [screen,aspect] of [[16/9,1],[16/9,.707],[4/3,2]]){const c=contain(screen,aspect),w=(c[1][0]-c[0][0])*screen,h=c[3][1]-c[0][1];assert.ok(Math.abs(w/h-aspect)<1e-9&&validCorners(c)&&Math.max(c[1][0]-c[0][0],h)<=.9+1e-9);}}
 // The person detector ships with the program (worker, ONNX Runtime Web, the checked YOLOX-tiny model); COCO-SSD is gone.
 const {existsSync}=await import('node:fs'),{createHash}=await import('node:crypto');
 for(const f of ['detector.mjs','vendor/onnxruntime/ort.wasm.min.mjs','vendor/onnxruntime/ort-wasm-simd-threaded.mjs','vendor/onnxruntime/ort-wasm-simd-threaded.wasm','vendor/onnxruntime/LICENSE','vendor/person-detector/LICENSE','vendor/person-detector/README.md'])assert.ok(existsSync(new URL(f,import.meta.url)),f);
 for(const f of ['vendor/tf.min.js','vendor/coco-ssd.min.js','vendor/person-model'])assert.ok(!existsSync(new URL(f,import.meta.url)),f);
 assert.equal(createHash('sha256').update(readFileSync(new URL('vendor/person-detector/yolox-tiny-humanart.onnx',import.meta.url))).digest('hex'),'ceb11c07298f95c50d7c5abeb906d03340c85f23aa79e3e66966e7fb6c307250');}
console.log('PASS: clouds drift out whole and the next drifts in from the other side; still air renews in place; appear/disappear time and presets; corner-pin projection mapping; person detector files.');
{const {PART_COLOUR,PART_HUES,palette,LOOK_MIX,lookMix,validateScenePreset:check}=await import('./studio.mjs?v=2026.10.27.1');
 // Colours per loop part and the style, grade and moonlight strengths: defaults change nothing, values round-trip in
 // presets, the projection window sanitises what it receives, bad values are refused.
 const plain=palette();assert.equal(plain.length,4);for(const p of plain){assert.deepEqual(Object.keys(PART_HUES).map(k=>p[k]),Object.values(PART_HUES));for(const [k,[,,d]] of Object.entries(PART_COLOUR))assert.equal(p[k],d,k);}
 assert.deepEqual(palette(check(scenePreset).settings.palette),plain);assert.deepEqual(lookMix(check(scenePreset).settings),{styleMix:1,gradeMix:1,moonlight:1});
 const night={...plain[3],sky:'#102040',skyMix:.4,clear:.3,stars:2},set=[plain[0],plain[1],plain[2],night];
 assert.deepEqual(check({...scenePreset,settings:{...scenePreset.settings,palette:set,styleMix:.2,gradeMix:0,moonlight:1.5}}).settings.palette[3],night);
 assert.deepEqual(palette([{sky:'red',clear:5}])[0],{...plain[0],clear:.9},'a bad colour falls back, a number out of range is clamped');
 for(const bad of [[plain[0]],[...plain.slice(0,3),{...plain[3],sky:'#12345'}],[...plain.slice(0,3),{...plain[3],stars:4}],'warm'])assert.throws(()=>check({...scenePreset,settings:{...scenePreset.settings,palette:bad}}));
 for(const [k,[,b]] of Object.entries(LOOK_MIX))assert.throws(()=>check({...scenePreset,settings:{...scenePreset.settings,[k]:b+1}}),k);
 for(const name of ['index.html','en.html']){const html=readFileSync(new URL(name,import.meta.url),'utf8'),slider=(attr,k,[a,b,d])=>{const tag=html.match(new RegExp(`<input id="([\\w-]+)" ${attr}="${k}"[^>]*>`));assert.ok(tag&&html.includes(`id="${tag[1]}-value"`),name+k);for(const x of ['type="range"',`min="${a}"`,`max="${b}"`,`value="${d}"`])assert.ok(tag[0].includes(x),name+k+x);};
  for(const [k,r] of Object.entries(PART_COLOUR))slider('data-part-setting',k,r);for(const [k,r] of Object.entries(LOOK_MIX))slider('data-setting',k,r);
  for(const [k,v] of Object.entries(PART_HUES))assert.ok(html.includes(`data-hue="${k}" type="color" value="${v}"`),name+k);
  for(let i=0;i<4;i++)for(const a of ['data-part','data-part-on','data-duration','data-edge-out','data-edge-in'])assert.ok(html.includes(`${a}="${i}"`),name+a+i);
  assert.ok(html.includes('id="part-reset"')&&!html.includes('OVERCAST')&&!/夜晚阴天|Overcast night/.test(html),name);}}
console.log('PASS: colours per loop part, style/grade/moonlight strengths and the loop editor: presets round-trip, both pages match the ranges.');
