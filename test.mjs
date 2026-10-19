import assert from 'node:assert/strict';
import { Experience, weatherAt, updatePresence, hourAngle, overcastAt, HOUR_KNOTS, CONFIG } from './controller.mjs?v=2026.10.19.2';
import { selectPeople, StableCount } from './counter.mjs?v=2026.10.19.2';
const step = (m, seconds) => { for (let i = 0; i < Math.ceil(seconds * 20); i++) m.tick(.05); };
const S=[10,10,10,10];
for (const [t, phase] of [[0, 0], [10, 1], [20, 2], [30, 3]]) assert.equal(weatherAt(t, 1, S).phase, phase);
HOUR_KNOTS.forEach((h,i)=>assert.ok(Math.abs(hourAngle(i*10,S)-h)<1e-9,'sun reaches each phase boundary on time'));
let lastHour=-Infinity,lastStep=null;
for(let t=0;t<=40;t+=.02){const w=weatherAt(t,3,S),step=w.hour-lastHour;assert.ok(w.hour>lastHour,'the sun only moves forward');
 if(lastStep!==null&&t>.05)assert.ok(Math.abs(step-lastStep)<.02,'no sudden change of solar speed');lastHour=w.hour;lastStep=step;assert.equal(w.cloudCount,3);assert.ok(w.rain>=0&&w.rain<=1);}
assert.equal(overcastAt(25,S),0,'sunset stays clear');assert.equal(overcastAt(35,S),1,'mid-night is overcast');assert.ok(overcastAt(39.9,S)<.01,'clears before dawn');
assert.ok(weatherAt(35,1,S).rain>.9,'overcast night brings rain sound');assert.equal(weatherAt(15,1,S).rain,0);assert.equal(weatherAt(5,1,S).darkness,0);
const m = new Experience(S); m.start(); assert.equal(m.mode, 'cycle', 'the sky runs with nobody present'); step(m, 12); assert.equal(m.phase, 1);
m.count(5); step(m, .1); assert.equal(m.cloudCount, 5); m.count(0); step(m, .1); assert.equal(m.mode, 'cycle'); assert.equal(m.cloudCount, 0);
step(m, 40); assert.equal(m.mode,'cycle'); assert.ok(m.cycles>=1&&m.elapsed<40);
m.stop(); step(m, 5); assert.equal(m.mode, 'stopped'); m.recover(); assert.equal(m.mode, 'cycle');
const presence=new Array(CONFIG.maxClouds).fill(0);
updatePresence(presence,2,4);assert.ok(presence[0]>0&&presence[0]<1&&presence[2]===0,'arrivals fade in');
updatePresence(presence,2,20);assert.deepEqual(presence.slice(0,3),[1,1,0]);
updatePresence(presence,1,5);assert.equal(presence[0],1);assert.ok(presence[1]>0&&presence[1]<1,'departures fade out');
updatePresence(presence,1,20);assert.equal(presence[1],0);
const boxes = [{ class: 'person', score: .9, bbox: [20, 20, 30, 60] }, { class: 'person', score: .8, bbox: [65, 10, 20, 70] }, { class: 'chair', score: .99, bbox: [0, 0, 40, 40] }, { class: 'person', score: .2, bbox: [0, 0, 20, 20] }];
assert.equal(selectPeople(boxes, 100, 100).length, 2); assert.equal(selectPeople(boxes, 100, 100, .55, .3).length, 1);
const counter = new StableCount(); assert.equal(counter.update(2, 0), 0); assert.equal(counter.update(2, 800), 2); counter.update(0, 900); assert.equal(counter.update(0, 1800), 2); assert.equal(counter.update(0, 2500), 0);
console.log('PASS: person filtering, debounce, continuous four-phase day loop, rain in gloom, sky runs without visitors, per-visitor cloud fade in/out.');

// Reflection geometry: outgoing ray must equal the reflected incoming ray.
const { reflectedCeilingPoint, reflectionCoverage, STYLES } = await import('./visual.mjs?v=2026.10.19.2');
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

const { approachPose } = await import('./visual.mjs?v=2026.10.19.2');
const { translate } = await import('./i18n.mjs?v=2026.10.19.2');
const distant = approachPose(0, geometry), near = approachPose(1, geometry);
assert.equal(distant.distance, 5); assert.ok(Math.abs(near.distance-geometry.distance)<1e-12); assert.equal(near.targetHeight,0);
let previousDistance = Infinity;
for(let i=0;i<=100;i++){const pose=approachPose(i/100,geometry);assert.ok(pose.distance<=previousDistance);assert.equal(pose.eyeHeight,geometry.eyeHeight);previousDistance=pose.distance;}
assert.equal(translate('距中心 2.50 m'),'2.50 m from centre');
assert.equal(translate('检测 4 人 · 稳定 3 人 · 50 ms'),'Detected 4 · Stable 3 · 50 ms');
assert.equal(translate('暂停走近'),'Pause walk');
assert.equal(translate('暂停走近',false),'暂停走近');
console.log('PASS: approach path endpoints, continuous distance, eye height and English dynamic messages.');

const { rainProfile, seamlessLoop } = await import('./rain-audio.mjs?v=2026.10.19.2');
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

const { puddles, landRadius, layoutCoverage, viewingFootprint } = await import('./layout.mjs?v=2026.10.19.2');
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

const {DEFAULT_GEOMETRY,observer,cameraFrame,panelFrame,panelPoint,reflectedPanelPoint,geometryProblem}=await import('./layout.mjs?v=2026.10.19.2');
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

const {hexRGB,drawCloudMass}=await import('./visual.mjs?v=2026.10.19.2');
const {editablePools,poolOutline,waterSurface}=await import('./layout.mjs?v=2026.10.19.2');
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

const {cloudLobes}=await import('./visual.mjs?v=2026.10.19.2');
const densitySample=(t,x,y)=>cloudLobes(123,1,t).reduce((v,p)=>v+p.opacity*Math.exp(-3*((x-p.x)**2+(y-p.y)**2)/(p.radius*p.radius)),0);
assert.notDeepEqual(cloudLobes(123,1,0),cloudLobes(123,1,7),'mature rain clouds continue evolving');
assert.deepEqual(cloudLobes(123,1,0).slice(0,3),cloudLobes(123,1,7).slice(0,3),'stable core anchors the cloud');
for(let t=0;t<80;t+=.073){
 for(const p of cloudLobes(123,1,t))assert.ok(p.radius>0&&p.opacity>=0&&p.opacity<=1);
 for(const [x,y] of [[0,0],[12,4],[-18,14],[25,-10]])assert.ok(Math.abs(densitySample(t+.001,x,y)-densitySample(t,x,y))<.005,'no density pop at wisp turnover');
}
assert.ok(Math.abs(densitySample(0,12,4)-densitySample(7,12,4))>.01);
console.log('PASS: staggered cloud-edge birth/dissipation, stable cores, continuous turnover and evolution at full maturity.');

{const {CloudField,FIELD,skyReach}=await import('./field.mjs?v=2026.10.19.2');
 const near=(a,b)=>Math.abs(a-b)<1e-9;
 assert.ok(near(skyReach({shape:'circle'},[.6,.8]),1));assert.ok(near(skyReach({shape:'fill',aspect:.7073},[0,1]),1/.7073),'portrait A0: the long side reaches farther');
 assert.ok(near(skyReach({shape:'fill',aspect:.7073,rotation:90},[1,0]),1/.7073),'the canopy turns with the sky');assert.ok(near(skyReach({shape:'fill',aspect:16/9},[1,0]),FIELD.mass),'clipped by the mass map');
 for(const [canopy,deg,windy] of [[{shape:'fill',aspect:.7073},90,1],[{shape:'circle'},200,2.5],[{shape:'square',rotation:30},45,0]]){
  const field=new CloudField(11),pres=new Array(20).fill(0),wind=[Math.cos(deg*Math.PI/180),Math.sin(deg*Math.PI/180)],reach=skyReach(canopy,wind);
  let drift=[0,0],before=new Map();const shapes=new Set(),dt=.1;
  for(let t=0;t<900;t+=dt){
   const people=t<600?6:2;updatePresence(pres,people,dt);drift=drift.map((v,i)=>v+wind[i]*FIELD.drift*windy*dt);field.update(dt,people,pres,drift,wind,canopy);
   const now=new Map(field.snapshot(pres).map(c=>[c[2],c]));
   for(const [seed,c] of before){
    const along=(c[0]+drift[0])*wind[0]+(c[1]+drift[1])*wind[1];
    if(!now.has(seed))assert.ok(c[3]<.02,'a cloud goes only after it has faded out');
    else assert.ok(Math.abs(now.get(seed)[3]-c[3])<.02,'cloud strength changes smoothly');
   }
   for(const seed of now.keys())shapes.add(seed);before=now;
   for(const c of field.slots.flat())if(c.age===0)assert.ok((c.x+drift[0])*wind[0]+(c.y+drift[1])*wind[1]<=1e-9,'a visitor\'s next cloud forms upwind');
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

const {TIMING_PRESETS,phaseMotionRate,validTiming,phaseEdges}=await import('./controller.mjs?v=2026.10.19.2');
for(const stages of [...Object.values(TIMING_PRESETS).map(p=>p.stages),[2,300,2,300]]){
 const edges=phaseEdges(stages);
 for(const edge of edges.slice(1,-1)){assert.ok(Math.abs(weatherAt(edge-1e-4,0,stages).hour-weatherAt(edge+1e-4,0,stages).hour)<1e-2,'no jump between phases');assert.ok(Math.abs(phaseMotionRate(edge-.001,stages,[.4,2,.3,1.5])-phaseMotionRate(edge+.001,stages,[.4,2,.3,1.5]))<.01);}
}
assert.equal(validTiming([0,10,10,10],[1,1,1,1]),false);assert.equal(validTiming([10,10,10,10],[1,1,NaN,1]),false);
const {parseCurrentWind,windToCanvas,compassToCanvas,currentWindURL,MELBOURNE}=await import('./forecast.mjs?v=2026.10.19.2');
const current={current_units:{wind_speed_10m:'m/s'},current:{time:1791500000,interval:900,wind_speed_10m:6.2,wind_direction_10m:270,wind_gusts_10m:11}};
assert.deepEqual(parseCurrentWind(current),{time:1791500000,speed:6.2,gusts:11,from:270});
assert.throws(()=>parseCurrentWind({...current,current:{...current.current,wind_speed_10m:null}}));assert.throws(()=>parseCurrentWind({...current,current_units:{wind_speed_10m:'km/h'}}));
assert.equal(windToCanvas(270),180,'a westerly pushes clouds east, which is on the left when looking up');assert.equal(windToCanvas(0),270);assert.equal(compassToCanvas(0),90);assert.equal(compassToCanvas(90),180);
assert.equal(currentWindURL(MELBOURNE).searchParams.get('latitude'),'-37.8136');
{const A=await import('./atmosphere.mjs?v=2026.10.19.2');
 const noon=A.solarPosition(0),rise=A.solarPosition(-96),set=A.solarPosition(96);
 assert.ok(Math.abs(noon.elevation-(90-Math.abs(A.SITE.latitude-A.SITE.declination)))<1e-9&&Math.abs(noon.azimuth)%360<1e-9,'Melbourne noon sun stands due north');
 assert.ok(Math.abs(rise.elevation)<1&&rise.azimuth>90&&rise.azimuth<110,'October sunrise just south of east');assert.ok(set.azimuth>250&&set.azimuth<270);
 assert.ok(A.sunVector(rise.elevation,rise.azimuth)[0]<-.9&&A.sunVector(set.elevation,set.azimuth)[0]>.9,'looking up: sunrise on the left, sunset on the right');
 const zenith=h=>A.skyRadiance([0,0,1],A.skyState(h).sun),day=zenith(0),dusk=zenith(100);
 assert.ok(day[2]>day[1]&&day[1]>day[0],'daytime zenith is blue');assert.ok(dusk[2]>dusk[1],'ozone keeps twilight blue-violet');assert.ok(A.luminance(dusk)<A.luminance(day)/20);
 const low=A.sunlight(A.skyState(-92).sun,3),high=A.sunlight(A.skyState(0).sun,3);assert.ok(low[0]/low[2]>high[0]/high[2]*2,'low sun light is redder');
 assert.ok(A.skyState(95).sunCloud[0]>0&&A.sunlight(A.skyState(95).sun,0)[0]<A.skyState(95).sunCloud[0],'clouds keep sunset light a little longer than the ground');
 assert.ok(A.skyState(180).exposure>A.skyState(0).exposure*10&&A.skyState(180).exposure<A.skyState(0).exposure*40&&A.skyState(180,{overcast:1}).stars===0&&A.skyState(250).stars>.5,'night adapts exposure; stars only when clear');
 for(const h of [-108,-96,0,96,180])assert.ok(A.skyState(h).ambient.every(Number.isFinite));
 const table=A.skyTable(A.skyState(0));assert.equal(table.length,A.TABLE_SIZE**2*4);const mid=(A.TABLE_SIZE**2-1)/2*4;assert.ok(table[mid+2]>table[mid],'table centre (zenith) is blue');}
assert.equal(translate('200 秒 / 一轮天气'),'200 seconds / weather cycle');
console.log('PASS: phase-boundary continuity, live wind parsing and sky-view direction, day-phase sun path, colours and cover.');

const {playbackTime}=await import('./controller.mjs?v=2026.10.19.2');
assert.equal(playbackTime(7,18,[2,2,2,2]),1);assert.equal(playbackTime(7,18,[2,2,2,2],false),8);
const looping=new Experience([2,2,2,2],{loop:true});looping.count(4);looping.start();
for(let i=0;i<600;i++){looping.tick(.05);assert.equal(looping.mode,'cycle');assert.ok(looping.elapsed<8);}
assert.ok(looping.cycles>=3);looping.stop();step(looping,10);assert.equal(looping.mode,'stopped');
const {panelContains,panelOutline}=await import('./layout.mjs?v=2026.10.19.2');
const square={...DEFAULT_GEOMETRY,skyShape:'square',diameter:3};
assert.equal(panelContains(square,1.4,1.4),true);assert.equal(panelContains({...square,skyShape:'circle'},1.4,1.4),false);
assert.equal(panelOutline(square).length,4);assert.equal(viewingFootprint(square).points.length,4);
assert.equal(panelOutline({...square,skyShape:'circle'}).length,96);
assert.ok(layoutCoverage(square).best>=layoutCoverage({...square,skyShape:'circle'}).best);
const tiltedSquare={...square,tiltX:45,tiltZ:45,height:1.6};
assert.ok(geometryProblem(tiltedSquare));assert.equal(geometryProblem({...tiltedSquare,skyShape:'circle'}),'');
assert.equal(translate('85 秒 / 一轮 · 自动循环'),'85 seconds / cycle · looping');
console.log('PASS: gapless multi-cycle playback, stop/empty-scene handling, projector wrap, circle/square reflection bounds, outlines and tilted-corner validation.');

const {panelHalfSize}=await import('./layout.mjs?v=2026.10.19.2');
const wide={...DEFAULT_GEOMETRY,skyShape:'fill',diameter:4,skyAspect:2};
assert.deepEqual(panelHalfSize(wide),[2,1]);assert.equal(panelContains(wide,1.9,.9),true);assert.equal(panelContains(wide,1.9,1.1),false);
assert.equal(panelOutline(wide).length,4);assert.equal(viewingFootprint(wide).points.length,4);
const portrait={...wide,skyAspect:.5};assert.deepEqual(panelHalfSize(portrait),[2,4]);
assert.equal(translate('铺满屏幕'),'Fill screen');
console.log('PASS: adaptive landscape/portrait sky bounds and matching reflection geometry.');

const {moveObserver,turnObserver,validateScenePreset,validatePresetStore}=await import('./studio.mjs?v=2026.10.19.2');
const forwardCamera={eyeX:0,eyeZ:5,yaw:180,pitch:0};moveObserver(forwardCamera,new Set(['w']),.05,2);assert.ok(forwardCamera.eyeZ<5);assert.ok(Math.abs(forwardCamera.eyeX)<1e-12);
const sideways={eyeX:0,eyeZ:5,yaw:180,pitch:0};moveObserver(sideways,new Set(['d']),.05,2);assert.ok(sideways.eyeX>0);
const diagonal={eyeX:0,eyeZ:0,yaw:180,pitch:0};moveObserver(diagonal,new Set(['w','d']),.05,2);assert.ok(Math.abs(Math.hypot(diagonal.eyeX,diagonal.eyeZ)-.1)<1e-9);
turnObserver(forwardCamera,100,-50,.1);assert.equal(forwardCamera.yaw,170);assert.equal(forwardCamera.pitch,5);
turnObserver(forwardCamera,0,-10000,.2);assert.equal(forwardCamera.pitch,85);
const scenePreset={geometry:structuredClone(DEFAULT_GEOMETRY),settings:{colors:['#4a82a8','#a3c4cc','#fff7e0','#b0c4cf','#303f4f','#42596b'],style:0,cloudForm:'cumulus',cloudSeed:27,windDirection:25,windSpeed:1,brightness:1,rotation:0,reduced:false},timing:structuredClone({...TIMING_PRESETS.standard,blend:5}),navigation:{moveSpeed:1.2,sensitivity:.12},people:4,volume:.35};
assert.equal(validateScenePreset(scenePreset).people,4);assert.throws(()=>validateScenePreset({...scenePreset,people:Infinity}));assert.throws(()=>validateScenePreset({...scenePreset,settings:{...scenePreset.settings,colors:['bad']}}));
const saved={version:1,scenes:[{id:'one',name:'Studio',data:scenePreset}],colours:[{id:'blue',name:'Blue',colors:['#4a82a8','#a3c4cc','#fff7e0','#b0c4cf','#303f4f','#42596b']}],defaultId:'one'};
assert.equal(validatePresetStore(JSON.parse(JSON.stringify(saved))).defaultId,'one');assert.equal(validatePresetStore({...saved,defaultId:'missing'}).defaultId,null);assert.throws(()=>validatePresetStore({...saved,scenes:[saved.scenes[0],saved.scenes[0]]}));
console.log('PASS: camera-relative WASD, normalized diagonal speed, mouse direction and pitch limits, preset validation and persisted round trips.');

const {newObject,validObject,setObjectTransform,allPonds,cloneObject}=await import('./builder-model.mjs?v=2026.10.19.2');
const build=structuredClone(DEFAULT_GEOMETRY),part=newObject('bench',{x:1,y:0,z:2},'bench-one');
assert.ok(validObject(part));build.objects.push(part);setObjectTransform(build,part.id,{x:3,width:2});assert.equal(build.objects[0].x,3);assert.equal(build.objects[0].width,2);
assert.ok(validObject(cloneObject({...part,name:'A'.repeat(60)},'bench-two')));
assert.equal(allPonds({...build,objects:[newObject('pond',{x:0,y:.2,z:0},'pond-one')]}).at(-1).rimY,.2);
assert.throws(()=>validateScenePreset({...scenePreset,geometry:{...build,objects:[{...part,width:-1}]}}));
const oldScene=structuredClone(scenePreset);for(const k of ['objects','surface','quality','baseY','panelYaw'])delete oldScene.geometry[k];
assert.deepEqual(validateScenePreset(oldScene).geometry.objects,[]);assert.throws(()=>validateScenePreset({...scenePreset,geometry:null}));
const lifted={eyeX:0,eyeZ:0,eyeHeight:1.6,yaw:0};moveObserver(lifted,new Set(['e']),.05,2);assert.ok(lifted.eyeHeight>1.6);
const {mergePresets}=await import('./presets.mjs?v=2026.10.19.2');
const merged=await mergePresets({version:2,scenes:[],colours:[],defaultId:null},saved);assert.equal(merged.scenes.length,1);assert.equal(merged.defaultId,'one');
assert.deepEqual(await mergePresets(merged,saved),merged);
const conflicted=structuredClone(saved);conflicted.scenes[0].data.people=5;const combined=await mergePresets(merged,conflicted);assert.equal(combined.scenes.length,2);assert.notEqual(combined.scenes[0].id,combined.scenes[1].id);
console.log('PASS: build transforms, part validation, schema migration, vertical movement and idempotent/conflict-preserving preset imports.');

const {objectSpec}=await import('./builder-model.mjs?v=2026.10.19.2');
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
 for(const id of ['concept-host','canopy-height','concept-light','geometry-error','reflection-host'])assert.ok(html.includes(`id="${id}"`));
 assert.equal((html.match(/data-anchor=/g)||[]).length,8);
}
console.log('PASS: legacy puddle gizmo frames; concept page replaces the builder and drops water-level controls.');
const {BUILD,innerHalf,pebbleHeight,brickLayout}=await import('./concept-model.mjs?v=2026.10.19.2');
{const h=innerHalf();let wet=0,cells=0,edgeWet=0;
 for(let x=-h;x<=h;x+=.005)for(let z=-h;z<=h;z+=.005){cells++;if(pebbleHeight(x,z)<BUILD.waterY){wet++;if(Math.max(Math.abs(x),Math.abs(z))>h-.04)edgeWet++;}}
 assert.equal(edgeWet,0,'Puddle stays clear of the liner walls');assert.ok(wet/cells>.15&&wet/cells<.45,'Puddle covers a readable share of the bed');
 for(let x=-h;x<=h;x+=.01)for(let z=-h;z<=h;z+=.01)assert.ok(pebbleHeight(x,z)<BUILD.frameHeight-.01,'Pebbles stay below the frame edge');
 const bricks=brickLayout(),s=BUILD.frame/2+BUILD.liner;assert.equal(bricks.length,32);
 for(const b of bricks){const n=Math.max(Math.abs(b.x),Math.abs(b.z));assert.ok(n-b.width/2>=s-1e-9,'Bricks sit outside the lined frame');assert.ok(b.length>.02&&b.length<=BUILD.brick.length);}}
console.log('PASS: fixed-level puddle is shaped by the pebble terrain; brick ring clears the lined 700 mm frame.');

const {outline}=await import('./layout.mjs?v=2026.10.19.2');
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
const {materializeFixtures,fixtureObjects}=await import('./builder-model.mjs?v=2026.10.19.2');
const fixtures={...structuredClone(DEFAULT_GEOMETRY),layout:'double',equipment:true};materializeFixtures(fixtures);fixtures.equipment=true;assert.equal(fixtureObjects(fixtures).length,0);assert.doesNotThrow(()=>validateScenePreset({...scenePreset,geometry:fixtures}));
console.log('PASS: distinct puddle shapes, independent pond appearance/elevation round trips and edited fixture reactivation.');


const {setPuddleLayout}=await import('./layout.mjs?v=2026.10.19.2');
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
 for(const id of ['live-wind','wind-status','wind-north','wind-gain'])assert.ok(html.includes(`id="${id}"`),id);
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
{const A=await import('./atmosphere.mjs?v=2026.10.19.2'),{GRADES}=await import('./visual.mjs?v=2026.10.19.2'),{ATMOSPHERE_IDS,GRADE_IDS}=await import('./studio.mjs?v=2026.10.19.2');
 assert.deepEqual(Object.keys(A.ATMOSPHERES),ATMOSPHERE_IDS);assert.deepEqual(Object.keys(GRADES),GRADE_IDS);
 const noon=id=>{const st=A.skyState(0,A.ATMOSPHERES[id]);return A.skyRadiance([0,0,1],st.sun,st.air);};
 const blue=noon('clear'),smoke=noon('smoke'),haze=noon('haze');assert.ok(blue[2]/blue[0]>2.5,'clean air: deep blue zenith');assert.ok(smoke[0]>smoke[2],'smoke turns the noon sky orange');assert.ok(haze[2]/haze[0]<blue[2]/blue[0]*.5,'haze whitens the sky');
 const dusk=id=>{const st=A.skyState(100,A.ATMOSPHERES[id]);return A.skyRadiance([0,0,1],st.sun,st.air);};assert.ok(dusk('volcanic')[2]/dusk('volcanic')[1]>dusk('melbourne')[2]/dusk('melbourne')[1],'volcanic twilight is more violet');
 for(const id of ATMOSPHERE_IDS)assert.ok(A.skyTable(A.skyState(-93,A.ATMOSPHERES[id])).every(Number.isFinite));
 for(const n of ['index.html','en.html']){const html=readFileSync(new URL(n,import.meta.url),'utf8');for(const id of [...ATMOSPHERE_IDS,...GRADE_IDS])assert.ok(html.includes(`value="${id}"`),n+id);}}
{const A=await import('./atmosphere.mjs?v=2026.10.19.2'),{CONFIG:C,hourAngle:H}=await import('./controller.mjs?v=2026.10.19.2');
 const x=A.skyState(-96),y=A.skyState(-94);assert.deepEqual(A.blendLight(x,y,0).exposure.toFixed(6),x.exposure.toFixed(6));assert.ok(Math.abs(A.blendLight(x,y,1).exposure-y.exposure)<1e-9);
 const mid=A.blendLight(x,y,.5).exposure;assert.ok(mid<Math.max(x.exposure,y.exposure)&&mid>Math.min(x.exposure,y.exposure),'exposure blends smoothly');
 const rows=new Uint8ClampedArray(A.TABLE_SIZE**2*4);for(let j=0;j<A.TABLE_SIZE;j+=3)A.skyTableRows(x,rows,j,j+3);assert.deepEqual(rows,A.skyTable(x),'a table built row by row matches a full build');
 assert.equal(A.applyOvercast(x,1).stars,0);assert.ok(A.applyOvercast(x,1).ambient[0]<x.ambient[0]);
 let twilight=0;for(let t=0;t<C.stages[0];t+=.1){const e=A.solarPosition(H(t)).elevation;if(e>-8&&e<10)twilight+=.1;}assert.ok(twilight>12.5,'sunrise lingers over 12.5 s in the colourful band by default');
 assert.deepEqual(C.stages,[15,15,15,15],'a 60 s day by default: four equal phases of 15 s');
 for(const [from,to] of [[0,15],[30,45]])for(let t=from;t<=to;t+=.5){const e=A.solarPosition(H(t)).elevation;assert.ok(e>-8&&e<10,'sunrise and sunset stay in the colourful band throughout: '+t);}}
console.log('PASS: smooth light blending, incremental sky tables, overcast dimming and a longer default sunrise.');
console.log('PASS: six atmosphere types change scattering physically; six colour grades; both menus in both languages.');
console.log('PASS: live-wind panel; physical atmosphere controls replace colour editing; settings persist; older presets migrate.');
