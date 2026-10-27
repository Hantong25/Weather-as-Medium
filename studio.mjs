import {validObject,MAX_OBJECTS,MATERIALS} from './builder-model.mjs?v=2026.10.27.1';
import {DEFAULT_GEOMETRY,geometryProblem} from './layout.mjs?v=2026.10.27.1';
import {validCycle,validRates,defaultEdges} from './controller.mjs?v=2026.10.27.1';
import {VIEW_ARCS} from './concept-model.mjs?v=2026.10.27.1';

const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
// Kept as plain lists so validation does not pull in the WebGL renderer.
export const ATMOSPHERE_IDS=['melbourne','clear','marine','haze','smoke','volcanic'],GRADE_IDS=['natural','warm','cool','dream','pastel','silver'];
// Cloud look sliders: [min, max, default]. The defaults draw the 2026.10.19.2 clouds unchanged. cloudMerge: how far
// neighbouring clouds fuse and drag their upper layers into strings between them (1 as before); cloudBump: how far the
// outline bulges in and out.
export const CLOUD_LOOK={cloudSize:[.6,1.6,1],cloudWarp:[0,3,1],cloudScale:[.5,2,1],cloudBillow:[0,1,0],cloudLean:[0,2,1],cloudDensity:[.3,2.5,1],cloudShadow:[0,3,1],cloudDetail:[0,2.5,1],cloudErosion:[0,1,0],cloudSoftness:[.1,2,1],cloudSilver:[0,1,0],cloudMerge:[0,1,1],cloudBump:[0,3,0]};
const lookDefaults=Object.fromEntries(Object.entries(CLOUD_LOOK).map(([k,[,,d]])=>[k,d]));
// Starting points for the sliders; each sets every slider, unnamed ones to their defaults.
export const CLOUD_STARTS={soft:lookDefaults,
  // Irregular, crisper edges with grey cores and bright rims (after the 2026.10.06.3 clouds), still volumetric.
  ragged:{...lookDefaults,cloudWarp:1.6,cloudScale:1.1,cloudBillow:.6,cloudShadow:1.5,cloudDetail:2,cloudErosion:.6,cloudSoftness:.7,cloudSilver:.6},
  dense:{...lookDefaults,cloudSize:1.15,cloudBillow:.6,cloudDensity:1.8,cloudShadow:1.8,cloudDetail:1.2,cloudSoftness:.7,cloudSilver:.3},
  thin:{...lookDefaults,cloudWarp:2,cloudScale:1.4,cloudLean:1.3,cloudDensity:.55,cloudShadow:.6,cloudDetail:1.6,cloudErosion:.6,cloudSoftness:1.5}};
// Out-of-range or missing values fall back to the defaults (used for frames from the control window).
export const cloudLook=s=>Object.fromEntries(Object.entries(CLOUD_LOOK).map(([k,[a,b,d]])=>[k,Number.isFinite(s?.[k])?clamp(s[k],a,b):d]));
export const CLOUD_FORMS=['cumulus','broken','layered'];
// Where the big clouds form (the sky and its thin background cloud always fill the frame): centre (x from the left, y
// from the top) and size as fractions of the frame, and how far past its edge clouds fade out, as a fraction of the
// region's shorter side. By default clouds use the whole frame and fade as they always did (30% = 0.6 sky units).
export const OUTPUT_REGION={regionX:[0,1,.5],regionY:[0,1,.5],regionW:[.1,1,1],regionH:[.1,1,1],feather:[0,.5,.3]};
export const outputRegion=s=>Object.fromEntries(Object.entries(OUTPUT_REGION).map(([k,[a,b,d]])=>[k,Number.isFinite(s?.[k])?clamp(s[k],a,b):d]));
// Seconds a visitor's cloud takes to appear after they arrive and to go after they leave (a cloud forming in place takes
// 1.25 times the first, one dissipating 1.2 times the second). 8 and 10 s keep the earlier timing. 2026.10.24.5 had one
// time for both (cloudFade: appear over 0.8 of it, go over all of it).
export const CLOUD_TIME={cloudAppear:[2,60,8],cloudVanish:[2,60,10]};
export function cloudTime(s){
 const old=Number.isFinite(s?.cloudFade)?clamp(s.cloudFade,2,60):null,set=(k,legacy)=>{const [a,b,d]=CLOUD_TIME[k];return Number.isFinite(s?.[k])?clamp(s[k],a,b):legacy===null?d:clamp(legacy,a,b);};
 return {cloudAppear:set('cloudAppear',old===null?null:.8*old),cloudVanish:set('cloudVanish',old)};
}
// Colour for each part of the cycle (morning, day, sunset, night): the sky and the lit and the shaded side of the clouds,
// each pushed towards a chosen colour by an amount (0 keeps the computed colour); how see-through the clouds are; colour
// saturation; star brightness. The defaults change nothing.
export const PART_COLOUR={skyMix:[0,1,0],lightMix:[0,1,0],shadeMix:[0,1,0],clear:[0,.9,0],saturation:[0,2,1],stars:[0,3,1]};
export const PART_HUES={sky:'#7aa6ff',light:'#ffc58f',shade:'#7f8fc4'};
const hex=c=>typeof c==='string'&&/^#[0-9a-f]{6}$/i.test(c);
export const partColour=p=>({...Object.fromEntries(Object.entries(PART_HUES).map(([k,d])=>[k,hex(p?.[k])?p[k].toLowerCase():d])),...Object.fromEntries(Object.entries(PART_COLOUR).map(([k,[a,b,d]])=>[k,Number.isFinite(p?.[k])?clamp(p[k],a,b):d]))});
export const palette=list=>[0,1,2,3].map(i=>partColour(Array.isArray(list)?list[i]:null));
// Style and colour-grade strength (0 plain, 1 full) and the moonlight on night clouds.
export const LOOK_MIX={styleMix:[0,1,1],gradeMix:[0,1,1],moonlight:[0,2,1]};
export const lookMix=s=>Object.fromEntries(Object.entries(LOOK_MIX).map(([k,[a,b,d]])=>[k,Number.isFinite(s?.[k])?clamp(s[k],a,b):d]));
// Big clouds shrink with the cloud region: its shorter half-side in sky units (the frame's shorter half-side is 1).
export function regionScale(f){
 const r=outputRegion(f),fill=f?.skyShape==='fill',a=f?.skyAspect||1;
 return Math.min(r.regionW*(fill?Math.max(1,a):1),r.regionH*(fill?Math.max(1,1/a):1));
}
export function moveObserver(g,keys,dt,speed=1.2) {
  const lift=Number(keys.has('e'))-Number(keys.has('q'));
  const forward=Number(keys.has('w'))-Number(keys.has('s')),side=Number(keys.has('d'))-Number(keys.has('a')),length=Math.hypot(forward,side,lift);
  if(!length)return false;
  const yaw=g.yaw*Math.PI/180,step=Math.min(.05,Math.max(0,dt))*speed*(keys.has('shift')?2.5:1)/length;
  g.eyeX=clamp(g.eyeX+(Math.sin(yaw)*forward-Math.cos(yaw)*side)*step,-100,100);
  g.eyeZ=clamp(g.eyeZ+(Math.cos(yaw)*forward+Math.sin(yaw)*side)*step,-100,100);if(lift)g.eyeHeight=clamp(g.eyeHeight+lift*step,.15,30);return true;
}
export function turnObserver(g,dx,dy,sensitivity=.12) {
  g.yaw=((g.yaw-dx*sensitivity+540)%360)-180;g.pitch=clamp(g.pitch-dy*sensitivity,-85,85);
}
const ranges={baseY:[-2,10],panelYaw:[-360,360],angle:[0,360],height:[.1,20],diameter:[.2,30],panelX:[-30,30],panelZ:[-30,30],tiltX:[-75,75],tiltZ:[-75,75],baseX:[-30,30],baseZ:[-30,30],baseHeight:[0,3],baseRotation:[-360,360],area:[.0314,707],pondScale:[.05,10],eyeHeight:[.1,30],distance:[.1,40],farDistance:[.1,40],fov:[20,120],eyeX:[-100,100],eyeZ:[-100,100],yaw:[-360,360],pitch:[-89,89],waterDropMm:[0,100],shoreRetreat:[0,100],skyAspect:[.25,4],pondWidth:[.1,.9],pondDepth:[.1,.9],waterWidth:[.05,.9],waterDepth:[.05,.9],eyeLow:[.3,2.5],viewNear:[.3,6],viewFar:[.3,6]};
const num=(v,a,b)=>typeof v==='number'&&Number.isFinite(v)&&v>=a&&v<=b;
export const validColours=colors=>Array.isArray(colors)&&colors.length===6&&colors.every(c=>typeof c==='string'&&/^#[0-9a-f]{6}$/i.test(c));
export function validateScenePreset(data) {
  if(!data||typeof data!=='object'||!data.geometry||typeof data.geometry!=='object'||Array.isArray(data.geometry))throw Error('Invalid parameter preset');
  const g={...structuredClone(DEFAULT_GEOMETRY),...data.geometry},s=data.settings,t=data.timing,n=data.navigation;
  if(!g||!s||!t||!n||!Object.entries(ranges).every(([k,[a,b]])=>num(g[k],a,b)))throw Error('Invalid geometry values');
  if(!['circle','square','fill'].includes(g.skyShape)||!Object.hasOwn(VIEW_ARCS,g.viewArc)||!['center','edge','double','custom'].includes(g.layout)||!['free','walk'].includes(g.viewMode)||typeof g.equipment!=='boolean'||geometryProblem(g))throw Error('Invalid geometry');
  if(!Array.isArray(g.objects)||g.objects.filter(o=>o?.type==='pond').length>32||g.objects.some(o=>typeof o?.id==='string'&&/^(core-|pond:)/.test(o.id))||g.objects.length>MAX_OBJECTS||!g.objects.every(validObject)||new Set(g.objects.map(o=>o.id)).size!==g.objects.length||!g.surface||!MATERIALS.includes(g.surface.material)||!/^#[0-9a-f]{6}$/i.test(g.surface.color)||!['auto','low','balanced','high'].includes(g.quality))throw Error('Invalid building parts or materials');
  if(g.customPools!==null){
    if(!Array.isArray(g.customPools)||g.customPools.length<1||g.customPools.length>16)throw Error('Invalid puddle list');
    for(const p of g.customPools)if(!p||!num(p.x,-30,30)||!num(p.z,-30,30)||!num(p.width,.001,20)||!num(p.depth,.001,20)||!num(p.scale??1,.05,20)||!num(p.angle,-720,720)||!num(p.seed,0,999999)||!num(p.roughness,0,2)||![0,1,2,3,4,5,6,7].includes(p.shape))throw Error('Invalid puddle parameters');
    for(const p of g.customPools)if((p.material!==undefined&&!MATERIALS.includes(p.material))||(p.name!==undefined&&(typeof p.name!=='string'||p.name.length>60))||(p.color!==undefined&&!/^#[0-9a-f]{6}$/i.test(p.color))||(p.elevation!==undefined&&!num(p.elevation,-5,30))||(p.basinDepth!==undefined&&!num(p.basinDepth,.02,3)))throw Error('Invalid puddle elevation, depth or appearance');
  }else if(g.layout==='custom')throw Error('Missing custom puddles');
  if(!validColours(s.colors)||![0,1,2].includes(s.style)||!['cumulus','broken','layered'].includes(s.cloudForm)||!Number.isInteger(s.cloudSeed)||!num(s.cloudSeed,0,999999)||!num(s.windDirection,0,360)||!num(s.windSpeed,0,3)||!num(s.brightness,.65,1.3)||!num(s.rotation,0,360)||typeof s.reduced!=='boolean')throw Error('Invalid sky parameters');
  // 2026-10-09 per-phase colours are still accepted but ignored since the sky became physically based (2026-10-11).
  if((s.dayColors!==undefined&&!(Array.isArray(s.dayColors)&&s.dayColors.length===4&&s.dayColors.every(validColours)))||(s.liveWind!==undefined&&typeof s.liveWind!=='boolean')||(s.windNorth!==undefined&&!num(s.windNorth,-360,360))||(s.windGain!==undefined&&!num(s.windGain,.1,3))||(s.turbidity!==undefined&&!num(s.turbidity,1,40))||(s.atmosphere!==undefined&&!ATMOSPHERE_IDS.includes(s.atmosphere))||(s.grade!==undefined&&!GRADE_IDS.includes(s.grade))||(s.cityGlow!==undefined&&!num(s.cityGlow,0,1)))throw Error('Invalid day sky or wind settings');
  // Settings added later (cloud look 2026.10.20.1, region 10.24.1, appear/disappear time 10.24.5, colours and the
  // four-part cycle 10.26.1) are missing from older presets, which take the defaults.
  if(Object.entries({...CLOUD_LOOK,...OUTPUT_REGION,...CLOUD_TIME,...LOOK_MIX,cloudFade:[2,60]}).some(([k,[a,b]])=>s[k]!==undefined&&!num(s[k],a,b)))throw Error('Invalid cloud look, region or timing settings');
  if(s.palette!==undefined&&!(Array.isArray(s.palette)&&s.palette.length===4&&s.palette.every(p=>p&&typeof p==='object'&&Object.keys(PART_HUES).every(k=>p[k]===undefined||hex(p[k]))&&Object.entries(PART_COLOUR).every(([k,[a,b]])=>p[k]===undefined||num(p[k],a,b)))))throw Error('Invalid colour settings');
  // ponytail: parts stay within 300 s so earlier versions can still read the preset.
  const cycle={stages:t.stages,on:t.on??[true,true,true,true],edges:t.edges??(Array.isArray(t.stages)?defaultEdges(t.stages):null)};
  if(!validCycle(cycle)||cycle.stages.some(x=>x>300)||cycle.edges.flat().some(x=>x>300)||!validRates(t.rates)||!num(t.blend,.5,15)||!num(n.moveSpeed,.1,10)||!num(n.sensitivity,.02,1)||!Number.isInteger(data.people)||!num(data.people,0,20)||!num(data.volume,0,1))throw Error('Invalid timing or navigation parameters');
  // Whitelist fields: saved browser data cannot inject additional live application state.
  return {geometry:Object.fromEntries(Object.keys(DEFAULT_GEOMETRY).map(k=>[k,structuredClone(g[k])])),settings:{colors:[...s.colors],style:s.style,cloudForm:s.cloudForm,cloudSeed:s.cloudSeed,windDirection:s.windDirection,windSpeed:s.windSpeed,brightness:s.brightness,rotation:s.rotation,reduced:s.reduced,atmosphere:s.atmosphere??'melbourne',grade:s.grade??'natural',turbidity:s.turbidity??2.5,cityGlow:s.cityGlow??.6,liveWind:s.liveWind??true,windNorth:s.windNorth??0,windGain:s.windGain??1,...cloudLook(s),...outputRegion(s),...cloudTime(s),...lookMix(s),palette:palette(s.palette)},timing:{stages:[...cycle.stages],on:[...cycle.on],edges:cycle.edges.map(e=>[...e]),rates:[...t.rates],blend:t.blend},navigation:{moveSpeed:n.moveSpeed,sensitivity:n.sensitivity},people:data.people,volume:data.volume};
}
// Saved cloud looks (version 3): the cloud form and the eleven sliders, applied on their own without other settings.
const validLook=l=>l&&typeof l==='object'&&CLOUD_FORMS.includes(l.cloudForm)&&Object.entries(CLOUD_LOOK).every(([k,[a,b]])=>l[k]===undefined||num(l[k],a,b));
export function validatePresetStore(value) {
  if(!value||![1,2,3].includes(value.version)||(value.clouds!==undefined&&(!Array.isArray(value.clouds)||value.clouds.length>100))||!Array.isArray(value.scenes)||!Array.isArray(value.colours)||value.scenes.length>100||value.colours.length>100)throw Error('Invalid preset collection');
  const record=p=>p&&typeof p.id==='string'&&p.id.length>0&&p.id.length<=80&&typeof p.name==='string'&&p.name.trim().length>0&&p.name.length<=60;
  const scenes=value.scenes.map(p=>{if(!record(p))throw Error('Invalid preset name');return {id:p.id,name:p.name,data:validateScenePreset(p.data)};});
  const colours=value.colours.map(p=>{if(!record(p)||!validColours(p.colors))throw Error('Invalid colour preset');return {id:p.id,name:p.name,colors:[...p.colors]};});
  const clouds=(value.clouds??[]).map(p=>{if(!record(p)||!validLook(p.look))throw Error('Invalid cloud look preset');return {id:p.id,name:p.name,look:{cloudForm:p.look.cloudForm,...cloudLook(p.look)}};});
  if([scenes,colours,clouds].some(list=>new Set(list.map(p=>p.id)).size!==list.length))throw Error('Duplicate preset IDs');
  // Files stay at version 2 until a cloud look is saved, so earlier versions keep reading them; with cloud looks they
  // see version 3 and leave the file untouched instead of dropping the looks on their next save.
  return {version:clouds.length?3:2,scenes,colours,clouds,legacyImports:Array.isArray(value.legacyImports)?value.legacyImports.filter(x=>typeof x==='string'&&/^[0-9a-f]{64}$/.test(x)).slice(-512):[],defaultId:scenes.some(p=>p.id===value.defaultId)?value.defaultId:null};
}
