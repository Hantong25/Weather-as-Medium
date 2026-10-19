import {validObject,MAX_OBJECTS,MATERIALS} from './builder-model.mjs?v=2026.10.19.2';
import {DEFAULT_GEOMETRY,geometryProblem} from './layout.mjs?v=2026.10.19.2';
import {validTiming} from './controller.mjs?v=2026.10.19.2';

const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
// Kept as plain lists so validation does not pull in the WebGL renderer.
export const ATMOSPHERE_IDS=['melbourne','clear','marine','haze','smoke','volcanic'],GRADE_IDS=['natural','warm','cool','dream','pastel','silver'];
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
const ranges={baseY:[-2,10],panelYaw:[-360,360],angle:[0,360],height:[.1,20],diameter:[.2,30],panelX:[-30,30],panelZ:[-30,30],tiltX:[-75,75],tiltZ:[-75,75],baseX:[-30,30],baseZ:[-30,30],baseHeight:[0,3],baseRotation:[-360,360],area:[.0314,707],pondScale:[.05,10],eyeHeight:[.1,30],distance:[.1,40],farDistance:[.1,40],fov:[20,120],eyeX:[-100,100],eyeZ:[-100,100],yaw:[-360,360],pitch:[-89,89],waterDropMm:[0,100],shoreRetreat:[0,100],skyAspect:[.25,4]};
const num=(v,a,b)=>typeof v==='number'&&Number.isFinite(v)&&v>=a&&v<=b;
export const validColours=colors=>Array.isArray(colors)&&colors.length===6&&colors.every(c=>typeof c==='string'&&/^#[0-9a-f]{6}$/i.test(c));
export function validateScenePreset(data) {
  if(!data||typeof data!=='object'||!data.geometry||typeof data.geometry!=='object'||Array.isArray(data.geometry))throw Error('Invalid parameter preset');
  const g={...structuredClone(DEFAULT_GEOMETRY),...data.geometry},s=data.settings,t=data.timing,n=data.navigation;
  if(!g||!s||!t||!n||!Object.entries(ranges).every(([k,[a,b]])=>num(g[k],a,b)))throw Error('Invalid geometry values');
  if(!['circle','square','fill'].includes(g.skyShape)||!['center','edge','double','custom'].includes(g.layout)||!['free','walk'].includes(g.viewMode)||typeof g.equipment!=='boolean'||geometryProblem(g))throw Error('Invalid geometry');
  if(!Array.isArray(g.objects)||g.objects.filter(o=>o?.type==='pond').length>32||g.objects.some(o=>typeof o?.id==='string'&&/^(core-|pond:)/.test(o.id))||g.objects.length>MAX_OBJECTS||!g.objects.every(validObject)||new Set(g.objects.map(o=>o.id)).size!==g.objects.length||!g.surface||!MATERIALS.includes(g.surface.material)||!/^#[0-9a-f]{6}$/i.test(g.surface.color)||!['auto','low','balanced','high'].includes(g.quality))throw Error('Invalid building parts or materials');
  if(g.customPools!==null){
    if(!Array.isArray(g.customPools)||g.customPools.length<1||g.customPools.length>16)throw Error('Invalid puddle list');
    for(const p of g.customPools)if(!p||!num(p.x,-30,30)||!num(p.z,-30,30)||!num(p.width,.001,20)||!num(p.depth,.001,20)||!num(p.scale??1,.05,20)||!num(p.angle,-720,720)||!num(p.seed,0,999999)||!num(p.roughness,0,2)||![0,1,2,3,4,5,6,7].includes(p.shape))throw Error('Invalid puddle parameters');
    for(const p of g.customPools)if((p.material!==undefined&&!MATERIALS.includes(p.material))||(p.name!==undefined&&(typeof p.name!=='string'||p.name.length>60))||(p.color!==undefined&&!/^#[0-9a-f]{6}$/i.test(p.color))||(p.elevation!==undefined&&!num(p.elevation,-5,30))||(p.basinDepth!==undefined&&!num(p.basinDepth,.02,3)))throw Error('Invalid puddle elevation, depth or appearance');
  }else if(g.layout==='custom')throw Error('Missing custom puddles');
  if(!validColours(s.colors)||![0,1,2].includes(s.style)||!['cumulus','broken','layered'].includes(s.cloudForm)||!Number.isInteger(s.cloudSeed)||!num(s.cloudSeed,0,999999)||!num(s.windDirection,0,360)||!num(s.windSpeed,0,3)||!num(s.brightness,.65,1.3)||!num(s.rotation,0,360)||typeof s.reduced!=='boolean')throw Error('Invalid sky parameters');
  // 2026-10-09 per-phase colours are still accepted but ignored since the sky became physically based (2026-10-11).
  if((s.dayColors!==undefined&&!(Array.isArray(s.dayColors)&&s.dayColors.length===4&&s.dayColors.every(validColours)))||(s.liveWind!==undefined&&typeof s.liveWind!=='boolean')||(s.windNorth!==undefined&&!num(s.windNorth,-360,360))||(s.windGain!==undefined&&!num(s.windGain,.1,3))||(s.turbidity!==undefined&&!num(s.turbidity,1,40))||(s.atmosphere!==undefined&&!ATMOSPHERE_IDS.includes(s.atmosphere))||(s.grade!==undefined&&!GRADE_IDS.includes(s.grade))||(s.cityGlow!==undefined&&!num(s.cityGlow,0,1)))throw Error('Invalid day sky or wind settings');
  if(!validTiming(t.stages,t.rates)||!num(t.blend,.5,15)||!num(n.moveSpeed,.1,10)||!num(n.sensitivity,.02,1)||!Number.isInteger(data.people)||!num(data.people,0,20)||!num(data.volume,0,1))throw Error('Invalid timing or navigation parameters');
  // Whitelist fields: saved browser data cannot inject additional live application state.
  return {geometry:Object.fromEntries(Object.keys(DEFAULT_GEOMETRY).map(k=>[k,structuredClone(g[k])])),settings:{colors:[...s.colors],style:s.style,cloudForm:s.cloudForm,cloudSeed:s.cloudSeed,windDirection:s.windDirection,windSpeed:s.windSpeed,brightness:s.brightness,rotation:s.rotation,reduced:s.reduced,atmosphere:s.atmosphere??'melbourne',grade:s.grade??'natural',turbidity:s.turbidity??2.5,cityGlow:s.cityGlow??.6,liveWind:s.liveWind??true,windNorth:s.windNorth??0,windGain:s.windGain??1},timing:{stages:[...t.stages],rates:[...t.rates],blend:t.blend},navigation:{moveSpeed:n.moveSpeed,sensitivity:n.sensitivity},people:data.people,volume:data.volume};
}
export function validatePresetStore(value) {
  if(!value||![1,2].includes(value.version)||!Array.isArray(value.scenes)||!Array.isArray(value.colours)||value.scenes.length>100||value.colours.length>100)throw Error('Invalid preset collection');
  const record=p=>p&&typeof p.id==='string'&&p.id.length>0&&p.id.length<=80&&typeof p.name==='string'&&p.name.trim().length>0&&p.name.length<=60;
  const scenes=value.scenes.map(p=>{if(!record(p))throw Error('Invalid preset name');return {id:p.id,name:p.name,data:validateScenePreset(p.data)};});
  const colours=value.colours.map(p=>{if(!record(p)||!validColours(p.colors))throw Error('Invalid colour preset');return {id:p.id,name:p.name,colors:[...p.colors]};});
  if(new Set(scenes.map(p=>p.id)).size!==scenes.length||new Set(colours.map(p=>p.id)).size!==colours.length)throw Error('Duplicate preset IDs');
  return {version:2,scenes,colours,legacyImports:Array.isArray(value.legacyImports)?value.legacyImports.filter(x=>typeof x==='string'&&/^[0-9a-f]{64}$/.test(x)).slice(-512):[],defaultId:scenes.some(p=>p.id===value.defaultId)?value.defaultId:null};
}
