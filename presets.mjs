import {validatePresetStore} from './studio.mjs?v=2026.10.27.1';
const LEGACY='ephemeral.studio.presets.v1',MIRROR='ephemeral.studio.presets.v2';
export const emptyPresets=()=>({version:2,scenes:[],colours:[],clouds:[],defaultId:null,legacyImports:[]});
export async function mergePresets(current,incoming){
 const next=validatePresetStore(current),source=validatePresetStore(incoming),ids=new Map();
 for(const key of ['scenes','colours','clouds'])for(const item of source[key]){
  const bytes=new TextEncoder().encode(JSON.stringify([key,item])),hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
  if(next.legacyImports.includes(hash))continue;
  const same=next[key].find(x=>JSON.stringify(x)===JSON.stringify(item));if(same)ids.set(item.id,same.id);
  else{const record=structuredClone(item);if(next[key].some(x=>x.id===record.id)){record.id=crypto.randomUUID();record.name=(record.name+' (import)').slice(0,60);}next[key].push(record);ids.set(item.id,record.id);}
  next.legacyImports.push(hash);
 }
 if(!next.defaultId&&ids.has(source.defaultId))next.defaultId=ids.get(source.defaultId);return validatePresetStore(next);
}
export function createPresetFile(){
 let revision=null,path='',busy=false;
 async function request(options={}){const response=await fetch('/api/presets',{cache:'no-store',signal:AbortSignal.timeout(8000),...options});let body;try{body=await response.json();}catch{throw Error('Open this demo with launch.py to use local preset files.');}if(!response.ok)throw Error(body.error||`HTTP ${response.status}`);return body;}
 function mirror(value){try{localStorage.setItem(MIRROR,JSON.stringify(value));}catch{/* Disk remains authoritative when browser storage is unavailable. */}}
 async function save(value){if(busy)throw Error('A save is already in progress.');if(revision===null)throw Error('Local file is unavailable. Reload the preset file first.');busy=true;try{const next=validatePresetStore(value),result=await request({method:'POST',headers:{'Content-Type':'application/json','If-Match':revision},body:JSON.stringify(next)});revision=result.revision;mirror(next);return next;}finally{busy=false;}}
 async function load(){const result=await request();let value=validatePresetStore(result.store||emptyPresets());revision=result.revision;path=result.path;
  let raw;try{raw=localStorage.getItem(LEGACY);}catch{}if(raw){if(raw.length>8*1024*1024)throw Error('Legacy preset data is too large; it was left unchanged.');const merged=await mergePresets(value,JSON.parse(raw));if(JSON.stringify(merged)!==JSON.stringify(value))value=await save(merged);}
  if(result.store===null&&revision==='empty')value=await save(value);
  mirror(value);return value;
 }
 return {load,save,get path(){return path;},async import(current,value){return save(await mergePresets(current,value));}};
}
