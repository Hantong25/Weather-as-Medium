import { tr, isEnglish } from './i18n.mjs?v=2026.10.27.1';
import { RainAudio, rainProfile } from './rain-audio.mjs?v=2026.10.27.1';
import { DEFAULT_GEOMETRY, geometryProblem } from './layout.mjs?v=2026.10.27.1';
import { CONFIG, CYCLE, Experience, clamp, weatherAt, updatePresence, TIMING_PRESETS, cycleParts, validCycle, validRates, playbackTime } from './controller.mjs?v=2026.10.27.1';
import { PeopleCamera, loadDetector } from './camera.mjs?v=2026.10.27.1';
import { STYLES, createSky, GRADES } from './visual.mjs?v=2026.10.27.1';
import { CloudField, FIELD } from './field.mjs?v=2026.10.27.1';

import { ATMOSPHERES } from './atmosphere.mjs?v=2026.10.27.1';
import { MELBOURNE, fetchJSON, currentWindURL, parseCurrentWind, windToCanvas } from './forecast.mjs?v=2026.10.27.1';

import {createConcept} from './concept.mjs?v=2026.10.27.1';
import {canopyStudy,canopyRect,requiredRect,coverage} from './concept-model.mjs?v=2026.10.27.1';
import {createPresetFile,emptyPresets,mergePresets} from './presets.mjs?v=2026.10.27.1';
import {validateScenePreset,cloudLook,CLOUD_LOOK,CLOUD_STARTS,outputRegion,OUTPUT_REGION,regionScale,cloudTime,CLOUD_TIME,PART_COLOUR,palette,LOOK_MIX,lookMix} from './studio.mjs?v=2026.10.27.1';
import {projectMapping,mappingEditor} from './mapping.mjs?v=2026.10.27.1';

const $ = id => document.getElementById(id);
// updateUI runs 10 times a second; unchanged writes would still dirty layout.
const setText = (id, text) => { const el = $(id); text = String(text); if (el.textContent !== text) el.textContent = text; };
const setAttr = (el, name, value) => { value = String(value); if (el.getAttribute(name) !== value) el.setAttribute(name, value); };
const params = new URLSearchParams(location.search), projection = params.has('projection');
const session = params.get('session') || crypto.randomUUID();
// Loop timing: per part its length, whether it is shown and its transition into the next part shown (controller.mjs).
const timing={...structuredClone(TIMING_PRESETS.standard),blend:5};
const channel = new BroadcastChannel(`ephemeral-${session}`), model = new Experience(timing,{loop:true});
// ponytail: cloudSeed and windNorth stay only so presets remain readable by earlier versions; every new cloud has a random
// shape, and the canopy orientation (rotation) now turns the sun and the wind with the clouds.
const settings = { atmosphere:'melbourne',grade:'natural',turbidity:2.5,cityGlow:.6,liveWind:true,windNorth:0,windGain:1,cloudSeed:27,cloudForm:'cumulus',windDirection:25,windSpeed:1,style: 0, brightness: 1, rotation: 0, reduced: matchMedia('(prefers-reduced-motion: reduce)').matches, ...cloudLook(), ...outputRegion(), ...cloudTime(), ...lookMix(), palette: palette() };
// The weather fields of a frame, copied from the model when the cycle is not running.
const WEATHER=['hour','hour2','cross','from','to','blend','overcast','growth','fade','darkness','rain','cloudCount'];
// ponytail: legacy layout fields stay in presets for compatibility; the concept view only reads skyShape, height, eyeHeight and angle.
const geometry = structuredClone(DEFAULT_GEOMETRY);
let concept=null;
let frame = { growth: 0, fade: 0, cloudCount: 0, clock: 0, skyShape:geometry.skyShape, ...settings };
let camera = null, starting = false, startEpoch = 0, paused = false, sky, mapping = null, mapper = null, mappingAspect = 1;
let lastTick = performance.now(), lastFrameAt = 0, lastBroadcast = 0, uiTick = 0, lastMode = '';
let audio = null, rainEngine = null, audioLoading = null, audioBusy = false, auditionUntil = 0, audioEpoch = 0;
let sound = false, volume = .35;
const logEntries = [];
const windOffset=[0,0];
let motionClock=0,windClock=0,actualWindDirection=25,actualWindSpeed=1,actualMorphRate=.7;
const live={data:null,request:0,fetchedAt:0};
const presence=new Array(CONFIG.maxClouds).fill(0),field=new CloudField(undefined,CONFIG.maxClouds);
let activeView='sky';
const navigation={moveSpeed:1.2,sensitivity:.12};
const motionRate=()=>model.running&&model.mode!=='stopped'?actualMorphRate*(settings.reduced?.12:1):0;
const windRate=()=>model.running&&model.mode!=='stopped'?actualWindSpeed*(settings.reduced?.12:1):0;
const totalTime=()=>cycleParts(timing).total;
// Clouds always drift and change at the set speeds, so motion stays even; live Melbourne wind (when available) only sets
// the direction, in the sky's own frame (north up, as for the sun), which the canopy orientation turns as a whole.
// ponytail: windGain stays in presets for earlier versions; nothing reads it now.
const windTarget=()=>({direction:settings.liveWind&&live.data?windToCanvas(live.data.from):settings.windDirection,speed:settings.windSpeed});
// One shape-change rate for the whole cycle: the mean of the saved per-phase rates (older presets differ per phase).
const morphRate=()=>timing.rates.reduce((a,b)=>a+b,0)/timing.rates.length;
// Big clouds form only in the cloud region, made smaller in proportion, and fade out a set distance past its edge
// (where the region meets the edge of the picture, only once they are wholly outside it). radius: how far a cloud
// shows from its centre, measured on the renderer (its upper layers lean out further than its base). They drift at the
// set speed and take the set times to form and to dissipate (the defaults: 10 s and 12 s).
const cloudCanopy=()=>{const r=outputRegion(settings),scale=regionScale({...r,skyShape:geometry.skyShape,skyAspect:geometry.skyAspect}),look=cloudLook(settings);
  return {shape:geometry.skyShape,aspect:geometry.skyAspect,rotation:settings.rotation,...r,scale,exit:Math.max(.02,r.feather*2*scale),radius:scale*(.25*look.cloudSize+.5*look.cloudLean),speed:windRate()*FIELD.drift,grow:1.25*settings.cloudAppear,fade:1.2*settings.cloudVanish};};
function note(text, error = false) { if (!projection) { $('notice').textContent = tr(text); $('notice').classList.toggle('error', error); } }
function log(text) {
  if (projection) return;
  logEntries.unshift(`${new Date().toLocaleTimeString('en-AU', { hour12: false })}  ${text}`); logEntries.length = Math.min(logEntries.length, 20);
  $('log').replaceChildren(...logEntries.map(text => { const li = document.createElement('li'); li.textContent = tr(text); return li; }));
}
function stop(reason) { audioEpoch++; auditionUntil = 0; paused = true; startEpoch++; if (starting) camera?.stop(); model.stop(reason); note(reason); log(reason); updateAudio(); updateUI(); }
function showFatal(message) { if (!projection) stop(message); $('fatal').textContent = tr(message); $('fatal').hidden = false; }
function visualFrame() {
  if(projection){
    const age=Math.max(0,(performance.now()-lastFrameAt)/1000),extra=frame.paused||!frame.running?0:age;
    const w=frame.mode==='cycle'&&frame.running&&!frame.paused?weatherAt(playbackTime(frame.elapsed,extra,frame.timing,frame.loop!==false),frame.cloudCount,frame.timing):{};
    return {...frame,...w,clock:frame.clock+extra,motionClock:(frame.motionClock||0)+age*(frame.motionRate||0),windClock:(frame.windClock||0)+age*(frame.windRate||0),windOffset:(frame.windOffset||[0,0]).map((v,i)=>v+(i?Math.sin:Math.cos)((frame.windDirection||0)*Math.PI/180)*age*(frame.windRate||0)),alive:1};
  }
  const extra=Math.min(.2,Math.max(0,(performance.now()-lastTick)/1000));
  // Paused or scrubbed frames still carry the sun position; without it the sky fell back to noon.
  const w=model.mode==='cycle'?weatherAt(model.elapsed+(paused?0:extra),model.cloudCount,timing):Object.fromEntries(WEATHER.map(k=>[k,model[k]]));
  return {...settings,...w,field:field.snapshot(presence),
    windDirection:actualWindDirection,windSpeed:actualWindSpeed,clock:model.clock+(paused?0:extra),motionClock:motionClock+extra*motionRate(),motionRate:motionRate(),windClock:windClock+extra*windRate(),windRate:windRate(),windOffset:windOffset.map((v,i)=>v+(i?Math.sin:Math.cos)(actualWindDirection*Math.PI/180)*extra*windRate()),
    skyShape:geometry.skyShape,skyAspect:geometry.skyAspect,loop:model.loop,mode:model.mode,elapsed:model.elapsed,paused,running:model.running,timing:{stages:timing.stages,on:timing.on,edges:timing.edges},projection:skyIsFullscreen()};
}
function broadcast() { channel.postMessage({ type: 'frame', ...visualFrame() }); }
// The canopy's width / depth, which the projection mapping warps onto the four canopy corners.
const canopyAspect = () => { const g = projection ? frame : geometry; return g.skyShape === 'fill' && Number.isFinite(g.skyAspect) ? clamp(g.skyAspect, .25, 4) : 1; };
// The mapping editor's state on the control page: top button, editor buttons and status line.
function showMapping(d) {
  setText('mapping', tr(d.editing ? '完成映射' : d.mapped ? '投影映射 · 已校准' : '投影映射')); setAttr($('mapping'), 'aria-pressed', !!d.editing);
  setText('mapping-edit', tr(d.editing ? '完成校准' : '开始校准')); setAttr($('mapping-edit'), 'aria-pressed', !!d.editing); $('mapping-off').disabled = !d.mapped;
  const where = d.connected ? say(`纯投影窗口 ${d.screen.width} × ${d.screen.height} px`, `Projection window ${d.screen.width} × ${d.screen.height} px`) : say('尚未连接纯投影窗口：先点顶部「打开纯投影」，拖到投影机屏幕上双击全屏。', 'No projection window yet: click Open projection at the top, move it to the projector screen and double-click for full screen.');
  const status = d.editing ? say('校准中，天幕上显示网格', 'Calibrating: the grid shows on the canopy') : d.mapped ? say('已校准', 'Mapped') : say('未映射，画面直接铺满窗口', 'Not mapped: the picture fills the window');
  setText('mapping-status', [where, status, d.message].filter(Boolean).join(' · '));
}
const part = x => [0, 1, 2, 3].includes(x) ? x : 0;
channel.onmessage = e => {
  const d = e.data;
  if (!projection) { if (d?.type === 'hello') broadcast(); if (d?.type === 'hello' || d?.type === 'screen') mapper?.screen(d.width, d.height); return; }
  if (d?.type === 'mapping') { mapping?.set(d.corners, d.editing); return; }
  if (d?.type !== 'frame' || ![d.growth, d.fade, d.cloudCount, d.clock, d.style, d.rotation, d.brightness].every(Number.isFinite)) return;
  frame = { ...d, skyShape:['circle','square','fill'].includes(d.skyShape)?d.skyShape:'circle',loop:d.loop!==false,timing:validCycle(d.timing)?d.timing:CYCLE,
    field:Array.isArray(d.field)&&d.field.length<=CONFIG.maxClouds*5&&d.field.every(c=>Array.isArray(c)&&c.length===4&&c.every(Number.isFinite)&&c[3]>=0&&c[3]<=1)?d.field:[],
    atmosphere:Object.hasOwn(ATMOSPHERES,d.atmosphere)?d.atmosphere:'melbourne',grade:Object.hasOwn(GRADES,d.grade)?d.grade:'natural',turbidity:Number.isFinite(d.turbidity)?clamp(d.turbidity,1,40):2.5,cityGlow:Number.isFinite(d.cityGlow)?clamp(d.cityGlow,0,1):.6,
    hour:Number.isFinite(d.hour)?d.hour:0,hour2:Number.isFinite(d.hour2)?d.hour2:0,cross:Number.isFinite(d.cross)?clamp(d.cross):0,from:part(d.from),to:part(d.to),blend:Number.isFinite(d.blend)?clamp(d.blend):0,palette:palette(d.palette),...lookMix(d),
    windOffset:Array.isArray(d.windOffset)&&d.windOffset.length===2&&d.windOffset.every(Number.isFinite)?d.windOffset:[0,0],windClock:Number.isFinite(d.windClock)?Math.max(0,d.windClock):0,windRate:Number.isFinite(d.windRate)?clamp(d.windRate,0,3):0,
    windSpeed:Number.isFinite(d.windSpeed)?clamp(d.windSpeed,0,3):1,
    cloudForm:['cumulus','broken','layered'].includes(d.cloudForm)?d.cloudForm:'cumulus',...cloudLook(d),...outputRegion(d),
    windDirection:Number.isFinite(d.windDirection)?clamp(d.windDirection,0,360):25,motionClock:Number.isFinite(d.motionClock)?Math.max(0,d.motionClock):0,motionRate:Number.isFinite(d.motionRate)?clamp(d.motionRate,0,3):0,growth: clamp(d.growth), fade: clamp(d.fade), cloudCount: Math.floor(clamp(d.cloudCount, 0, 20)), style: Math.floor(clamp(d.style, 0, 2)), brightness: clamp(d.brightness, .65, 1.3), projection: true };
  lastFrameAt = performance.now();
  if (canopyAspect() !== mappingAspect) { mappingAspect = canopyAspect(); mapping?.apply(); }
};
function seek(t, people = model.people) {
  model.count(people); model.transition('cycle'); model.running = true; model.elapsed = clamp(t, 0, totalTime()); model.clock = model.elapsed;
  const w = weatherAt(model.elapsed, people, timing);
  for (const k of WEATHER) model[k] = w[k];
  paused = true; updateUI(); broadcast(); updateAudio();
}
function replay() { seek(0); paused = false; updateUI(); }
async function initAudio() {
  if (!audio) {
    audio = new AudioContext(); rainEngine = new RainAudio(audio);
    audio.addEventListener('statechange', () => {
      if (sound && audio.state !== 'running' && !document.hidden) {
        sound = false; auditionUntil = 0; rainEngine.silence();
        note('音频设备暂停或不可用，检查系统输出设备后重新启用声音。', true); updateUI();
      }
    });
  }
  await audio.resume();
  if (audio.state !== 'running') throw Error('系统音频设备未运行');
  if (!rainEngine.buffer) {
    if (!audioLoading) audioLoading = rainEngine.load().catch(e => { audioLoading = null; throw e; });
    await audioLoading;
  }
}
function updateAudio() {
  if (!rainEngine) return;
  const preview = performance.now() < auditionUntil;
  rainEngine.update({ people: preview ? model.people : model.cloudCount,
    envelope: preview ? 1 : model.rain, volume,
    enabled: sound && (preview || (!paused && model.mode === 'cycle')), preview });
}
async function audioAction(action) {
  if (audioBusy) return;
  audioBusy = true; const epoch = audioEpoch; updateUI();
  try {
    await initAudio();
    if (epoch !== audioEpoch) return;
    if (action === 'toggle') { sound = !sound; if (!sound) auditionUntil = 0; }
    if (action === 'preview') { sound = true; auditionUntil = performance.now() < auditionUntil ? 0 : performance.now() + 6000; }
    if (action === 'default') { await rainEngine.load(); $('rain-file').value = ''; note('已恢复内置花园雨声。'); }
    updateAudio();
  } catch (e) { sound = false; auditionUntil = 0; rainEngine?.silence(); note(`声音无法启动：${e.message}`, true); }
  finally { audioBusy = false; updateUI(); }
}

const stories={idle:'STILLNESS',stopped:'STOPPED'};
const phases=['01 / MORNING','02 / DAY','03 / SUNSET GLOW','04 / STARRY NIGHT'];
function updateUI() {
  if (projection) return;
  const phaseLabel=model.mode==='cycle'?phases[model.phase]:stories[model.mode];
  setText('phase-status',tr(phaseLabel));
  setText('clock', tr(model.mode === 'cycle' ? model.elapsed.toFixed(1).padStart(4, '0') : '—'));
  setText('run-state', tr(model.mode === 'stopped' ? '已停止' : paused ? '天气暂停 · 风仍在流动' : '预演中'));
  setText('cloud-count', tr(model.cloudCount)); setText('input-source', tr($('manual').checked ? '视觉预演' : `识别 ${model.people} 人`));
  $('test-people').disabled = !$('manual').checked;
  setText('play', tr(paused || model.mode === 'stopped' ? '播放天气' : '暂停天气')); setAttr($('play'), 'aria-pressed', paused);
  if (document.activeElement !== $('scrub')) $('scrub').value = model.mode === 'cycle' ? model.elapsed : 0;
  $('start').disabled = starting || !!camera?.active; setText('start', tr(starting ? '正在加载模型…' : camera?.active ? '摄像头识别中' : '启用摄像头识别'));
  $('recover').hidden = model.mode !== 'stopped';
  document.querySelectorAll('[data-style]').forEach(el => setAttr(el, 'aria-pressed', Number(el.dataset.style) === settings.style));
  const preview = performance.now() < auditionUntil;
  const rainPeople = preview ? model.people : model.mode === 'cycle' ? model.cloudCount : model.people;
  setText('rain-density', `${tr(preview ? '试听' : '雨声密度')} · ${tr(`${rainPeople} 人`)} · ${tr(rainProfile(rainPeople).label)}`);
  $('audio').disabled = audioBusy; $('rain-preview').disabled = audioBusy; $('rain-default').disabled = audioBusy; $('rain-file').disabled = audioBusy;
  setText('audio', tr(audioBusy ? '正在加载雨声…' : sound ? '雨声已启用 · 点击静音' : '启用雨声'));
  setAttr($('audio'), 'aria-pressed', sound);
  setText('rain-preview', tr(preview ? '停止试听' : '试听当前人数 · 6 秒')); setAttr($('rain-preview'), 'aria-pressed', preview);
  setText('style-name', tr(STYLES[settings.style].name)); setText('style-note', tr(STYLES[settings.style].note));
  const {parts}=cycleParts(timing);
  document.querySelectorAll('.timeline>button').forEach((el, i) => { const p=parts.find(p=>p.id===i); el.style.setProperty('--progress', `${model.mode === 'cycle' && p ? clamp((model.elapsed - p.start) / p.length) * 100 : 0}%`); el.classList.toggle('current', model.mode === 'cycle' && model.phase === i); });
  if (lastMode !== `${model.mode}/${model.phase}`) { lastMode = `${model.mode}/${model.phase}`; log(phaseLabel); }
}
function updateGeometry() {
  $('stage').style.setProperty('--sky-ratio',geometry.skyShape==='fill'?String(geometry.skyAspect):'1');
  $('sky-shape').value=geometry.skyShape;$('angle').value=geometry.angle;
  $('angle-value').textContent = tr(`${geometry.angle}°`);
  document.querySelectorAll('[data-angle]').forEach(el => el.setAttribute('aria-pressed', String(Number(el.dataset.angle) === geometry.angle % 360)));
  const c=canopyRect(geometry),size={'canopy-width':c.hw*2,'canopy-depth':c.hd*2,'canopy-height':geometry.height,'mapping-width':c.hw*2,'mapping-depth':c.hd*2};
  for(const [id,value] of Object.entries(size))if(document.activeElement!==$(id))$(id).value=+value.toFixed(2);
  document.querySelectorAll('[data-geometry]').forEach(el=>{if(document.activeElement!==el)el.value=+geometry[el.dataset.geometry].toFixed(2);});
  $('view-arc').value=geometry.viewArc;$('canopy-label').textContent=`${say('天幕','Canopy')} · ${Math.round(c.hw*2000)} × ${Math.round(c.hd*2000)} mm`;
  renderCanopyStudy();
}
const say=(zh,en)=>isEnglish?en:zh;
// Canopy study readout: worst and mean share of the pond showing sky, the canopy that fills every reflection, and how
// that canopy grows with height. Also the share for the single viewer in the reflection check.
function renderCanopyStudy() {
  const g=geometry,study=canopyStudy(g),r=study.required,w=study.worst,pct=x=>Math.round(x*100),m=x=>x.toFixed(2),c=canopyRect(g);
  const lines=[
    say(`水面映出天空：最差 ${pct(w.coverage)}%（${w.angle}°、${m(w.distance)} m、眼高 ${m(w.eye)} m），平均 ${pct(study.mean)}%。`,`Sky in the water: worst ${pct(w.coverage)}% (${w.angle}°, ${m(w.distance)} m, eyes ${m(w.eye)} m), mean ${pct(study.mean)}%.`),
    say(`映满所有站位需要 ${m(r.width)} × ${m(r.depth)} m 的天幕，中心在 X ${m(r.x)}、Z ${m(r.z)}（底面离地 ${m(g.height)} m）。`,`Filling the water from every spot needs a ${m(r.width)} × ${m(r.depth)} m canopy centred at X ${m(r.x)}, Z ${m(r.z)} (underside ${m(g.height)} m).`)];
  // Visitors stand just outside the 1 m base; a low canopy reaching over them is a head risk.
  if(geometry.height<2&&(Math.abs(c.x)+c.hw>.5||Math.abs(c.z)+c.hd>.5))lines.push(say('天幕伸出底座且底面低于 2.0 m，站在下面的观众可能碰头。','The canopy reaches past the base below 2.0 m; visitors standing under it may hit their heads.'));
  $('canopy-result').replaceChildren(...lines.map((text,i)=>{const p=document.createElement('div');p.textContent=text;if(i===2)p.className='error';return p;}));
  const heights=[...new Set([2,2.2,2.4,2.6,2.8,3,+g.height.toFixed(2)])].sort((a,b)=>a-b);
  $('canopy-heights').replaceChildren(...heights.map(h=>{const need=requiredRect(g,h),row=document.createElement('tr');row.classList.toggle('current',h===+g.height.toFixed(2));
    row.append(...[`${m(h)} m`,`${m(need.width)} × ${m(need.depth)} m`,`${m(need.x)}, ${m(need.z)}`].map(text=>{const td=document.createElement('td');td.textContent=text;return td;}));return row;}));
  const a=g.angle*Math.PI/180,share=coverage(g,{x:Math.sin(a)*g.viewNear,z:Math.cos(a)*g.viewNear,eye:g.eyeHeight});
  $('coverage').textContent=say(`眼睛离水塘中心 ${m(g.viewNear)} m、眼高 ${m(g.eyeHeight)} m 处低头看到的倒影：水面约 ${pct(share)}% 映出天空。亮度为视觉近似。`,`Looking down with the eyes ${m(g.viewNear)} m from the pond centre at ${m(g.eyeHeight)} m: about ${pct(share)}% of the water shows sky. Brightness is a visual approximation.`);
}
const round=x=>+x.toFixed(1);
function syncTiming(preset='custom') {
  const {parts,total}=cycleParts(timing);$('scrub').max=total;$('cycle-duration').textContent=tr(`${round(total)} 秒 / 一轮 · 自动循环`);
  document.querySelectorAll('[data-duration]').forEach((el,i)=>el.value=timing.stages[i]);
  document.querySelectorAll('[data-part-on]').forEach((el,i)=>el.checked=timing.on[i]);
  document.querySelectorAll('[data-edge-out]').forEach((el,i)=>el.value=round(timing.edges[i][0]));
  document.querySelectorAll('[data-edge-in]').forEach((el,i)=>el.value=round(timing.edges[i][1]));
  $('morph-rate').value=+morphRate().toFixed(2);
  document.querySelectorAll('[data-timing]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.timing===preset)));
  // The timeline shows only the parts switched on, each as long as it lasts.
  document.querySelectorAll('.timeline>button').forEach((el,i)=>{const p=parts.find(p=>p.id===i);el.hidden=!p;if(!p)return;el.dataset.time=p.start+p.length/2;el.style.flex=p.length;el.querySelector('small').textContent=`${round(p.start)}–${round(p.start+p.length)} s`;});
}
// Presets stay readable by earlier versions only up to 300 s a part (and per transition side).
function applyTiming({stages,on,edges,rates},preset='custom') {
  const cycle={stages:[...stages],on:[...on],edges:edges.map(e=>[...e])};
  if(!validCycle(cycle)||!validRates(rates)||stages.some(x=>x>300)||edges.flat().some(x=>x>300)){$('timing-error').textContent=tr(on.some(Boolean)?'请填写有效的时长（2–300 秒）和过渡时间（0–300 秒）。':'至少启用一段。');syncTiming();return;}
  Object.assign(timing,cycle,{rates:[...rates]});model.cycle=structuredClone(cycle);$('timing-error').textContent='';syncTiming(preset);replay();
}
const timingInputs=()=>{const all=sel=>Array.from(document.querySelectorAll(sel),el=>el.valueAsNumber),into=all('[data-edge-in]');
  return {stages:all('[data-duration]'),on:Array.from(document.querySelectorAll('[data-part-on]'),el=>el.checked),edges:all('[data-edge-out]').map((x,i)=>[x,into[i]]),rates:timing.rates};};
// Slider readouts, and which starting point (if any) the cloud look sliders match.
function syncCloudLook() {
  for(const key of Object.keys(CLOUD_LOOK)){const el=document.querySelector(`[data-setting="${key}"]`);el.value=settings[key];$(`${el.id}-value`).value=settings[key].toFixed(2);}
  document.querySelectorAll('[data-cloud-start]').forEach(el=>el.setAttribute('aria-pressed',String(Object.entries(CLOUD_STARTS[el.dataset.cloudStart]).every(([k,v])=>settings[k]===v))));
}
function syncRegion() {
  for(const key of Object.keys(OUTPUT_REGION)){const el=document.querySelector(`[data-setting="${key}"]`);el.value=settings[key];$(`${el.id}-value`).value=`${Math.round(settings[key]*100)}%`;}
}
function syncTime() {for(const key of Object.keys(CLOUD_TIME)){const el=document.querySelector(`[data-setting="${key}"]`);el.value=settings[key];$(`${el.id}-value`).value=`${settings[key]} s`;}}
function syncMix() {for(const key of Object.keys(LOOK_MIX)){const el=document.querySelector(`[data-setting="${key}"]`);el.value=settings[key];$(`${el.id}-value`).value=key==='moonlight'?`×${settings[key].toFixed(2)}`:`${Math.round(settings[key]*100)}%`;}}
// Colours per loop part: the part picked in the editor and its colours, strengths, cloud transparency, saturation and stars.
let colourPart=0;
function syncPalette() {
  const p=settings.palette[colourPart];
  document.querySelectorAll('[data-part]').forEach(el=>el.setAttribute('aria-pressed',String(Number(el.dataset.part)===colourPart)));
  document.querySelectorAll('[data-hue]').forEach(el=>el.value=p[el.dataset.hue]);
  document.querySelectorAll('[data-part-setting]').forEach(el=>{const k=el.dataset.partSetting;el.value=p[k];$(`${el.id}-value`).value=k==='saturation'||k==='stars'?`×${p[k].toFixed(2)}`:`${Math.round(p[k]*100)}%`;});
}
function windStatus(text,error=false) {$('wind-status').textContent=tr(text);$('wind-status').classList.toggle('error',error);}
function syncWind() {
  $('wind-direction').disabled=settings.liveWind&&!!live.data;
  $('live-wind').checked=settings.liveWind;
  const w=live.data;if(!w){$('wind-values').textContent='';return;}
  const at=new Intl.DateTimeFormat(isEnglish?'en-AU':'zh-CN',{timeZone:'Australia/Melbourne',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(w.time*1000));
  $('wind-values').textContent=tr(`来向 ${Math.round(w.from)}° · 风速 ${w.speed.toFixed(1)} m/s · 阵风 ${w.gusts.toFixed(1)} m/s · 数据时间 ${at}（墨尔本）`);
}
async function loadWind() {
  const request=++live.request;windStatus('正在读取墨尔本实时风…');
  try{
    const data=parseCurrentWind(await fetchJSON(currentWindURL(MELBOURNE)));if(request!==live.request)return;
    live.data=data;live.fetchedAt=Date.now();syncWind();windStatus(settings.liveWind?'云层正随墨尔本实时风移动。':'已读取实时风；当前使用手动风向。');
  }catch(e){if(request===live.request)windStatus((live.data?'刷新失败，沿用上次实时风：':'实时风不可用，使用手动风向：')+e.message,true);}
}
function showDock(name) {
  document.querySelectorAll('[data-dock]').forEach(el=>{const on=el.dataset.dock===name;el.setAttribute('aria-selected',String(on));$(el.getAttribute('aria-controls')).hidden=!on;});
}
function setView(view) {
  activeView=view;
  for(const name of ['sky','scene']){
    $(`${name}-view`).hidden=name!==view;
    document.querySelector(`[data-view="${name}"]`).setAttribute('aria-selected',String(name===view));
  }
  if(view==='scene')$('concept-host').focus({preventScroll:true});
}
function sceneIsFullscreen() {return document.fullscreenElement===$('scene-viewport')||$('scene-viewport').classList.contains('window-fullscreen');}
function syncSceneFullscreen() {const full=sceneIsFullscreen();document.body.classList.toggle('scene-fullscreen',full);$('scene-expand').textContent=tr(full?'退出 3D 全屏':'全屏 3D');}
async function sceneFullscreen() {
  if(sceneIsFullscreen()){if(document.fullscreenElement===$('scene-viewport'))await document.exitFullscreen();$('scene-viewport').classList.remove('window-fullscreen');lastFullscreenExit=performance.now();syncSceneFullscreen();return;}
  try{if(document.fullscreenElement)await document.exitFullscreen();await $('scene-viewport').requestFullscreen();}catch{$('scene-viewport').classList.add('window-fullscreen');}
  syncSceneFullscreen();
}
// Canopy size inputs (canopy study and mapping editor). Width and depth set the canopy and the projection aspect together,
// so the sky fills the canopy undistorted.
const inRange=el=>{const n=el.valueAsNumber;return Number.isFinite(n)&&n>=Number(el.min)&&n<=Number(el.max)?n:null;};
function setGeometry(changes){const error=geometryProblem({...geometry,...changes});$('geometry-error').textContent=error?tr(error):'';if(error)note(error,true);else{Object.assign(geometry,changes);broadcast();}updateGeometry();}
function setSize(w,d){if(w===null||d===null||w/d<.25||w/d>4){$('geometry-error').textContent=tr('天幕宽深比需在 1:4 到 4:1 之间。');note('天幕宽深比需在 1:4 到 4:1 之间。',true);updateGeometry();return false;}return true;}
function bindConcept() {
  $('scene-expand').onclick=sceneFullscreen;document.addEventListener('fullscreenchange',syncSceneFullscreen);
  document.querySelectorAll('[data-concept-view]').forEach(el=>el.onclick=()=>{const name=el.dataset.conceptView;concept?.setView(name);$('concept-layers').checked=name==='layers';document.querySelectorAll('[data-concept-view]').forEach(b=>b.setAttribute('aria-pressed',String(b===el)));});
  $('concept-layers').onchange=e=>concept?.setExplode(e.target.checked);
  $('concept-labels').onchange=e=>concept?.setLabels(e.target.checked);
  $('concept-light').onchange=e=>concept?.setLight(e.target.value);
  document.querySelectorAll('[data-geometry]').forEach(el=>el.onchange=()=>{const n=inRange(el);if(n===null)updateGeometry();else setGeometry({[el.dataset.geometry]:n});});
  for(const [a,b] of [['canopy-width','canopy-depth'],['mapping-width','mapping-depth']])for(const id of [a,b])$(id).onchange=()=>{const w=inRange($(a)),d=inRange($(b));if(setSize(w,d))setGeometry({diameter:w,skyAspect:w/d});};
  $('canopy-height').onchange=e=>{const n=inRange(e.target);if(n===null)updateGeometry();else setGeometry({height:n});};
  $('view-arc').onchange=e=>setGeometry({viewArc:e.target.value});
  $('canopy-apply').onclick=()=>{const r=requiredRect(geometry),w=Math.ceil(r.width*100)/100,d=Math.ceil(r.depth*100)/100;if(setSize(w,d))setGeometry({diameter:w,skyAspect:w/d,panelX:Math.round(r.x*100)/100,panelZ:Math.round(r.z*100)/100,skyShape:'fill'});};
  $('canopy-overlay').onchange=e=>concept?.setStudy(e.target.checked);
  $('open-projection-settings').onclick=()=>setView('sky');
}
const presetFile=createPresetFile();
let presetStore=emptyPresets(),factoryPreset;
function presetMessage(message,error=false){$('preset-status').textContent=tr(message);$('preset-status').classList.toggle('error',error);if(error)showDock('presets');}
// `colors` keeps presets readable by earlier versions, which expect one six-colour set.
function capturePreset(){return validateScenePreset({settings:{...structuredClone(settings),colors:['#4a82a8','#a3c4cc','#fff7e0','#b0c4cf','#303f4f','#42596b']},geometry:structuredClone(geometry),timing:structuredClone(timing),navigation:{...navigation},people:Number($('test-people').value),volume});}
function applyPreset(data){
  const value=validateScenePreset(data);
  Object.assign(settings,value.settings);Object.assign(geometry,value.geometry);Object.assign(timing,value.timing);model.cycle=structuredClone({stages:timing.stages,on:timing.on,edges:timing.edges});Object.assign(navigation,value.navigation);
  volume=value.volume;$('volume').value=Math.round(volume*100);$('volume-value').value=`${Math.round(volume*100)}%`;
  $('test-people').value=value.people;if($('manual').checked)model.count(value.people);
  document.querySelectorAll('[data-setting]').forEach(el=>el.value=settings[el.dataset.setting]);$('atmosphere').value=settings.atmosphere;$('grade').value=settings.grade;
  $('brightness').value=settings.brightness*100;$('rotation').value=settings.rotation;$('rotation-value').value=`${settings.rotation}°`;$('reduce').checked=settings.reduced;
  syncTiming();syncWind();syncCloudLook();syncRegion();syncTime();syncMix();syncPalette();replay();updateGeometry();
}
function refreshPresetLists(sceneId=$('scene-preset-list').value) {
  $('scene-preset-list').replaceChildren(new Option(tr('选择参数预设'),''),...presetStore.scenes.map(p=>new Option(p.name,p.id)));
  $('scene-preset-list').value=presetStore.scenes.some(p=>p.id===sceneId)?sceneId:'';
  for(const id of ['scene-preset-load','scene-preset-default','scene-preset-delete'])$(id).disabled=!$('scene-preset-list').value;
  const selectedDefault=presetStore.defaultId===$('scene-preset-list').value&&!!presetStore.defaultId;$('scene-preset-default').setAttribute('aria-pressed',String(selectedDefault));$('scene-preset-default').textContent=tr(selectedDefault?'取消启动默认':'设为启动默认');
  const name=presetStore.scenes.find(p=>p.id===presetStore.defaultId)?.name;$('default-preset-label').textContent=name?tr('启动默认：')+name:tr('启动默认：内置参数');
  refreshCloudLooks();
}
// Saved cloud looks: the cloud form and the eleven sliders, kept in the same local preset file.
function refreshCloudLooks(id=$('cloud-preset-list').value) {
  $('cloud-preset-list').replaceChildren(new Option(say('选择已存云参数','Choose a saved look'),''),...presetStore.clouds.map(p=>new Option(p.name,p.id)));
  $('cloud-preset-list').value=presetStore.clouds.some(p=>p.id===id)?id:'';
  for(const b of ['cloud-preset-load','cloud-preset-delete'])$(b).disabled=!$('cloud-preset-list').value;
}
function cloudMessage(text,error=false){$('cloud-preset-status').textContent=text;$('cloud-preset-status').classList.toggle('error',error);}
function bindCloudLooks() {
  const selected=()=>presetStore.clouds.find(p=>p.id===$('cloud-preset-list').value);
  $('cloud-preset-list').onchange=()=>{const record=selected();if(record)$('cloud-preset-name').value=record.name;refreshCloudLooks();};
  $('cloud-preset-save').onclick=async()=>{
    const name=$('cloud-preset-name').value.trim();if(!name||name.length>60){cloudMessage(say('请输入 1–60 字的名称。','Enter a name of 1–60 characters.'),true);return;}
    const next=structuredClone(presetStore),existing=next.clouds.find(p=>p.name===name),id=existing?.id||crypto.randomUUID();
    if(!existing&&next.clouds.length>=100){cloudMessage(say('最多保存 100 组云参数。','Up to 100 cloud looks can be saved.'),true);return;}
    next.clouds=[...next.clouds.filter(p=>p.id!==id),{id,name,look:{cloudForm:settings.cloudForm,...cloudLook(settings)}}];
    if(await writePresets(next)){refreshCloudLooks(id);cloudMessage(say(`已保存云参数：${name}`,`Cloud look saved: ${name}`));}
  };
  $('cloud-preset-load').onclick=()=>{const record=selected();if(!record)return;Object.assign(settings,record.look);$('cloud-form').value=settings.cloudForm;syncCloudLook();broadcast();cloudMessage(say(`已载入云参数：${record.name}`,`Cloud look loaded: ${record.name}`));};
  $('cloud-preset-delete').onclick=async()=>{const id=$('cloud-preset-list').value,next=structuredClone(presetStore);next.clouds=next.clouds.filter(p=>p.id!==id);if(await writePresets(next))cloudMessage(say('云参数已删除。','Cloud look deleted.'));};
}
async function writePresets(next,sceneId){
  try{next=await presetFile.save(next);presetStore=next;refreshPresetLists(sceneId);return true;}
  catch(e){presetMessage('无法保存预设：'+e.message,true);return false;}
}
async function bindPresets(){
  factoryPreset=capturePreset();bindCloudLooks();
  const transfer=document.createElement('div');transfer.className='preset-row';transfer.innerHTML=`<button id="preset-export">${isEnglish?'Export backup':'导出备份'}</button><label>${isEnglish?'Import JSON (merge)':'导入 JSON（合并）'}<input type="file" id="preset-import" accept=".json,application/json"></label><button id="preset-reload">${isEnglish?'Reload file':'重新读取本地文件'}</button>`;$('parameter-presets').append(transfer);
  const path=document.createElement('p');path.id='preset-path';$('parameter-presets').append(path);
  const reload=async()=>{try{presetStore=await presetFile.load();refreshPresetLists();path.textContent=(isEnglish?'Local file: ':'本地文件：')+presetFile.path;presetMessage(isEnglish?'Local file ready.':'本地预设文件已就绪。');return true;}catch(e){presetMessage((isEnglish?'File unavailable: ':'本地文件不可用：')+e.message,true);return false;}};
  $('preset-reload').onclick=reload;
  $('preset-export').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(presetStore,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='Ephemeral-presets.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  $('preset-import').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>8*1024*1024)throw Error('Maximum 8 MB');if(await writePresets(await mergePresets(presetStore,JSON.parse(await file.text()))))presetMessage(isEnglish?'Backup merged and saved.':'备份已合并并保存。');}catch(error){presetMessage(error.message,true);}finally{e.target.value='';}};
  refreshPresetLists();
  // Saved colour sets stay in the preset file but no longer drive the physical sky.
  for(const [type,listKey] of [['scene','scenes']]){
    $(`${type}-preset-list`).onchange=()=>{const id=$(`${type}-preset-list`).value,record=presetStore[listKey].find(p=>p.id===id);if(record)$(`${type}-preset-name`).value=record.name;refreshPresetLists();};
    $(`${type}-preset-save`).onclick=async()=>{
      const name=$(`${type}-preset-name`).value.trim();if(!name||name.length>60){presetMessage('请输入 1–60 字的预设名称。',true);return;}
      const next=structuredClone(presetStore),existing=next[listKey].find(p=>p.name===name),id=existing?.id||crypto.randomUUID();if(!existing&&next[listKey].length>=100){presetMessage(isEnglish?'Maximum 100 presets per collection.':'每类最多保存 100 个预设。',true);return;}
      try{const record=type==='scene'?{id,name,data:capturePreset()}:null;next[listKey]=next[listKey].filter(p=>p.id!==id);next[listKey].push(record);
        if(await writePresets(next,id))presetMessage('已保存：'+name);
      }catch(e){presetMessage('无法保存预设：'+e.message,true);}
    };
    $(`${type}-preset-delete`).onclick=async()=>{const id=$(`${type}-preset-list`).value,next=structuredClone(presetStore);next[listKey]=next[listKey].filter(p=>p.id!==id);if(type==='scene'&&next.defaultId===id)next.defaultId=null;if(await writePresets(next))presetMessage('预设已删除。');};
    $(`${type}-preset-load`).onclick=()=>{
      const record=presetStore[listKey].find(p=>p.id===$(`${type}-preset-list`).value);if(!record)return;
      try{if(type==='scene')applyPreset(record.data);presetMessage('已载入：'+record.name);}catch(e){presetMessage('预设无效：'+e.message,true);}
    };
  }
  $('scene-preset-default').onclick=async()=>{const id=$('scene-preset-list').value,next={...presetStore,defaultId:presetStore.defaultId===id?null:id};if(await writePresets(next))presetMessage('启动默认已更新。');};
  $('scene-preset-factory').onclick=()=>{applyPreset(factoryPreset);presetMessage('已载入内置默认参数。');};
  await reload();
  const startup=presetStore.scenes.find(p=>p.id===presetStore.defaultId);if(startup){try{applyPreset(startup.data);refreshPresetLists(startup.id);presetMessage('已载入启动默认：'+startup.name);}catch(e){presetMessage('预设无效：'+e.message,true);}}
}

function cameraMessage(text, error = false) { $('camera-status').textContent = tr(text); $('camera-status').classList.toggle('error', error); }
// Cameras are listed as soon as the page opens (their names appear once camera access is allowed) and again whenever
// one is plugged in or out, so a USB webcam can be chosen. The choice is remembered on this computer.
const CAMERA_KEY = 'ephemeral.camera';
const savedCamera = () => { try { return localStorage.getItem(CAMERA_KEY) || ''; } catch { return ''; } };
async function listCameras() {
  if (!navigator.mediaDevices?.enumerateDevices) return;
  const devices = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput' && d.deviceId), select = $('camera-select');
  const wanted = camera?.stream?.getVideoTracks()[0]?.getSettings().deviceId || select.value || savedCamera();
  select.replaceChildren(new Option(tr('系统默认摄像头'), ''), ...devices.map((d, i) => new Option(d.label || tr(`摄像头 ${i + 1}`), d.deviceId)));
  select.value = devices.some(d => d.deviceId === wanted) ? wanted : '';
}
async function startExperience() {
  if (starting) return; starting = true; const epoch = ++startEpoch; updateUI();
  try {
    $('manual').checked = false; model.count(0); paused = false;
    cameraMessage('等待摄像头授权，正在加载本地模型…');
    if (!await camera.start($('camera-select').value || savedCamera()) || epoch !== startEpoch) return;
    $('camera-placeholder').hidden = true; $('camera-off').hidden = false;
    await listCameras();
    if (model.mode === 'stopped') model.recover(); else model.start();
    cameraMessage('人数识别运行中。'); note('现在由摄像头人数驱动生云源，风格与天气节奏保持不变。');
  } catch (e) {
    camera.stop(); model.count(0); const message = e.name === 'NotAllowedError' ? '摄像头权限未允许，可继续用预演人数。' : `无法开启识别：${e.message}`;
    cameraMessage(message, true); stop(message);
  } finally { starting = false; updateUI(); }
}
let lastFullscreenExit=-Infinity;
function skyIsFullscreen() { return document.fullscreenElement===$('stage')||$('stage').classList.contains('window-fullscreen'); }
function syncFullscreen() {
  const active=skyIsFullscreen();document.body.classList.toggle('sky-fullscreen',active);
  for(const id of ['fullscreen','exit-fullscreen']){
    $(id).textContent=tr(active?'退出全屏 · Esc':'全屏天空');$(id).setAttribute('aria-pressed',String(active));
  }
}
async function fullscreen() {
  if(skyIsFullscreen()){
    if(document.fullscreenElement===$('stage'))await document.exitFullscreen();
    $('stage').classList.remove('window-fullscreen');lastFullscreenExit=performance.now();syncFullscreen();return;
  }
  if(!projection&&activeView!=='sky')setView('sky');
  try {
    if(document.fullscreenElement)await document.exitFullscreen();
    await $('stage').requestFullscreen();
  } catch {
    // Embedded browsers may deny native fullscreen; the same view can still fill their viewport.
    $('stage').classList.add('window-fullscreen');
  }
  syncFullscreen();
}
function bindFullscreen() {
  for(const id of ['fullscreen','exit-fullscreen'])$(id).onclick=fullscreen;
  $('stage').ondblclick=e=>{if(!e.target.closest('button'))fullscreen();};
  document.addEventListener('fullscreenchange',()=>{if(!document.fullscreenElement)lastFullscreenExit=performance.now();syncFullscreen();});
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&sceneIsFullscreen()){e.preventDefault();e.stopImmediatePropagation();sceneFullscreen();return;}
    if(e.key==='Escape'&&skyIsFullscreen()){e.preventDefault();e.stopImmediatePropagation();fullscreen();}
  },true);
  syncFullscreen();
}
function bindControls() {
  $('reduce').checked = settings.reduced;
  syncTiming('standard');
  window.addEventListener('resize',()=>{updateGeometry();broadcast();});
  document.querySelectorAll('[data-view]').forEach(el=>el.onclick=()=>setView(el.dataset.view));
  document.querySelectorAll('[data-dock]').forEach(el=>el.onclick=()=>showDock(el.dataset.dock));
  bindConcept();
  $('sky-shape').onchange=e=>{
    const candidate={...geometry,skyShape:e.target.value},error=geometryProblem(candidate);
    if(error){e.target.value=geometry.skyShape;$('geometry-error').textContent=tr(error);note(error,true);return;}
    geometry.skyShape=candidate.skyShape;$('geometry-error').textContent='';updateGeometry();broadcast();
  };
  // A timing preset sets the lengths and transitions and keeps which parts are switched on.
  document.querySelectorAll('[data-timing]').forEach(el=>el.onclick=()=>applyTiming({...TIMING_PRESETS[el.dataset.timing],on:timing.on,rates:timing.rates},el.dataset.timing));
  $('timing-apply').onclick=()=>applyTiming(timingInputs());
  document.querySelectorAll('[data-part-on]').forEach(el=>el.onchange=()=>applyTiming(timingInputs()));
  // ponytail: rates stay four equal values so presets keep their shape for earlier versions.
  $('morph-rate').onchange=e=>{const n=e.target.valueAsNumber;if(Number.isFinite(n)&&n>=.1&&n<=3)timing.rates=[n,n,n,n];else e.target.value=+morphRate().toFixed(2);};
  $('live-wind').onchange=e=>{settings.liveWind=e.target.checked;syncWind();if(settings.liveWind&&!live.data)loadWind();else windStatus(settings.liveWind?'云层正随墨尔本实时风移动。':'已改用手动风向与速度。');};
  $('wind-refresh').onclick=loadWind;
  // Open-Meteo refreshes its current values about every 15 minutes.
  setInterval(loadWind,10*60*1000);loadWind();

  $('cloud-form').onchange=e=>{settings.cloudForm=e.target.value;broadcast();};
  document.querySelectorAll('[data-setting]').forEach(el=>el.onchange=()=>{
    const n=el.valueAsNumber,key=el.dataset.setting;
    if(!Number.isFinite(n)||n<Number(el.min)||n>Number(el.max)){el.value=settings[key];return;}
    settings[key]=n;if(key in CLOUD_LOOK)syncCloudLook();if(key in OUTPUT_REGION)syncRegion();if(key in CLOUD_TIME)syncTime();if(key in LOOK_MIX)syncMix();broadcast();
  });
  $('region-reset').onclick=()=>{Object.assign(settings,{regionX:.5,regionY:.5,regionW:1,regionH:1});syncRegion();broadcast();};syncRegion();syncTime();syncMix();
  // Part colours: picking a colour whose strength is 0 sets it to half, so the change shows at once.
  document.querySelectorAll('[data-part]').forEach(el=>el.onclick=()=>{colourPart=Number(el.dataset.part);syncPalette();});
  document.querySelectorAll('[data-hue]').forEach(el=>el.oninput=()=>{const p=settings.palette[colourPart],k=el.dataset.hue;p[k]=el.value.toLowerCase();if(!p[`${k}Mix`])p[`${k}Mix`]=.5;syncPalette();broadcast();});
  document.querySelectorAll('[data-part-setting]').forEach(el=>el.oninput=()=>{const n=el.valueAsNumber,k=el.dataset.partSetting,[a,b]=PART_COLOUR[k];if(Number.isFinite(n)&&n>=a&&n<=b){settings.palette[colourPart][k]=n;syncPalette();broadcast();}});
  $('part-reset').onclick=()=>{settings.palette[colourPart]=palette()[colourPart];syncPalette();broadcast();};syncPalette();
  document.querySelectorAll('[data-cloud-start]').forEach(el=>el.onclick=()=>{Object.assign(settings,CLOUD_STARTS[el.dataset.cloudStart]);syncCloudLook();broadcast();});syncCloudLook();
  document.querySelectorAll('input[type=range][data-setting]').forEach(el=>el.oninput=el.onchange);
  // An atmosphere type sets its typical turbidity; the slider can still fine-tune it.
  $('atmosphere').onchange=e=>{settings.atmosphere=e.target.value;settings.turbidity=ATMOSPHERES[settings.atmosphere].turbidity;$('turbidity').value=settings.turbidity;broadcast();};
  $('grade').onchange=e=>{settings.grade=e.target.value;broadcast();};
  camera = new PeopleCamera($('camera-video'), $('camera-overlay'), result => {
    if ($('manual').checked) return;
    model.count(result.stable); cameraMessage(`检测 ${result.raw} 人 · 稳定 ${result.stable} 人 · ${Math.round(result.inferenceMs)} ms`);
  }, message => { model.count(0); cameraMessage(message, true); $('camera-placeholder').hidden = false; stop(message); });
  document.querySelectorAll('[data-style]').forEach(button => button.onclick = () => { settings.style = Number(button.dataset.style); updateUI(); broadcast(); });
  $('play').onclick = () => { if (model.mode === 'stopped') replay(); else paused = !paused; updateUI(); updateAudio(); };
  $('restart').onclick = replay; $('recover').onclick = replay;
  $('scrub').oninput = e => seek(Number(e.target.value));
  document.querySelectorAll('[data-time]').forEach(button => button.onclick = () => seek(Number(button.dataset.time)));
  $('test-people').onchange = e => {
    const n = Number(e.target.value); if (!Number.isInteger(n) || n < 0 || n > 20) { e.target.value = model.people; return; }
    model.count(n); if (paused) seek(model.elapsed); updateUI();
  };
  const orbit=angle=>{geometry.angle=angle;updateGeometry();};
  $('angle').oninput=e=>orbit(Number(e.target.value));
  document.querySelectorAll('[data-angle]').forEach(el=>el.onclick=()=>orbit(Number(el.dataset.angle)));
  $('brightness').oninput = e => settings.brightness = Number(e.target.value) / 100;
  $('rotation').oninput = e => { settings.rotation = Number(e.target.value); $('rotation-value').value = `${e.target.value}°`; };
  $('reduce').onchange = e => settings.reduced = e.target.checked;
  $('start').onclick = startExperience;
  $('camera-off').onclick = () => { camera.stop(); $('manual').checked = true; $('camera-placeholder').hidden = false; $('camera-off').hidden = true; model.count(Number($('test-people').value)); cameraMessage('摄像头已关闭，恢复预演人数。'); updateUI(); };
  $('manual').onchange = e => { if (!e.target.checked) startExperience(); else $('camera-off').click(); };
  $('camera-select').onchange = () => { try { localStorage.setItem(CAMERA_KEY, $('camera-select').value); } catch {} camera.stop(); if (!$('manual').checked) startExperience(); };
  navigator.mediaDevices?.addEventListener?.('devicechange', () => listCameras().catch(() => {})); listCameras().catch(() => {});
  $('threshold').oninput = e => { camera.threshold = Number(e.target.value) / 100; $('threshold-value').value = `${e.target.value}%`; };
  $('count-hold').oninput = e => { camera.hold = Number(e.target.value) * 1000; if (camera.counter) camera.counter.window = camera.hold; $('count-hold-value').value = `${e.target.value} s`; };
  $('roi').onchange = e => camera.inset = Number(e.target.value);
  $('stop').onclick = () => stop('操作员停止');
  $('audio').onclick = () => audioAction('toggle');
  $('rain-preview').onclick = () => audioAction('preview');
  $('rain-default').onclick = () => audioAction('default');
  $('volume').oninput = e => { volume = Number(e.target.value) / 100; $('volume-value').value = `${e.target.value}%`; updateAudio(); };
  $('rain-file').onchange = async e => {
    const file = e.target.files[0]; if (!file || audioBusy) return;
    audioBusy = true; updateUI();
    try { await initAudio(); await rainEngine.loadFile(file); updateAudio(); note('雨声素材已载入，密度仍随人数变化。'); }
    catch (e) { note(`音频无法播放：${e.message}`, true); }
    finally { audioBusy = false; updateUI(); }
  };
  // Projection mapping is edited here, in the dock's mapping tab; the projector window only shows the result (and the
  // test grid while calibrating).
  mapper = mappingEditor({ board: $('mapping-board'), say, send: message => channel.postMessage(message), aspect: canopyAspect, onChange: showMapping });
  $('mapping').onclick = () => { setView('sky'); showDock('mapping'); mapper.toggle(); };
  $('mapping-edit').onclick = () => mapper.toggle(); $('mapping-reset').onclick = () => mapper.reset(); $('mapping-off').onclick = () => mapper.off();
  $('project').onclick = () => {
    const url = new URL(location.href); url.search = ''; url.searchParams.set('projection', '1'); url.searchParams.set('session', session);
    const win = window.open(url.href, `ephemeral-${session}`, 'popup,width=1100,height=850'); note(win ? '纯投影已打开：拖到投影机屏幕后双击全屏，Esc 退出；窗口里没有文字、按钮和鼠标指针。' : '请允许打开投影窗口。', !win);
  };
  document.addEventListener('visibilitychange', () => { lastTick = performance.now(); updateAudio(); });
  window.addEventListener('pagehide', () => { camera.stop(); rainEngine?.silence(); });
}
function animate(now) {
  const dt = Math.max(0, (now - lastTick) / 1000); lastTick = Math.max(lastTick, now);
  camera?.tick(now);
  if (camera?.active && model.running && now - camera.lastResultAt > 5000) { camera.stop(); model.count(0); stop('摄像头识别超时，请重新启动'); }
  // Live wind turns the clouds over about half a minute, so a new reading never swings them round.
  const duration=Math.min(dt,2),mix=1-Math.exp(-duration/2.5),turn=1-Math.exp(-duration/(settings.liveWind&&live.data?30:2.5)),wind=windTarget(),targetDirection=wind.direction;
  const people=model.mode==='stopped'?0:Math.min(model.people,CONFIG.maxClouds);
  updatePresence(presence,people,duration,{fadeIn:settings.cloudAppear,fadeOut:settings.cloudVanish});
  if(model.running&&model.mode!=='stopped'){
  actualWindDirection=(actualWindDirection+((targetDirection-actualWindDirection+540)%360-180)*turn+360)%360;
  actualWindSpeed+=(wind.speed-actualWindSpeed)*mix;
  actualMorphRate+=(morphRate()-actualMorphRate)*mix;
  }
  motionClock+=duration*motionRate();windClock+=duration*windRate();
  windOffset[0]+=Math.cos(actualWindDirection*Math.PI/180)*duration*windRate();windOffset[1]+=Math.sin(actualWindDirection*Math.PI/180)*duration*windRate();
  field.update(duration,people,presence,windOffset.map(v=>v*FIELD.drift),[Math.cos(actualWindDirection*Math.PI/180),Math.sin(actualWindDirection*Math.PI/180)],cloudCanopy());
  if (!paused) {
    // Visual-only clock: a background control window still drives the separate projector.
    for (let remaining = Math.min(dt, 2); remaining > 0; remaining -= .25) model.tick(Math.min(.25, remaining));
  }
  updateAudio();
  if(now-uiTick>100){updateUI();uiTick=now;}
  if (now - lastBroadcast > 100) { broadcast(); lastBroadcast = now; }
}
bindFullscreen();
if (projection) {
  // Nothing but the sky: no text, no buttons and no pointer (style.css). Double-click toggles full screen, Esc leaves it.
  document.body.classList.add('projection'); document.title = 'Accumulus — Sky Projection';
  mapping = projectMapping({ host: $('canvas-host'), aspect: canopyAspect });
  channel.postMessage({ type: 'hello', width: innerWidth, height: innerHeight });
  addEventListener('resize', () => channel.postMessage({ type: 'screen', width: innerWidth, height: innerHeight }));
} else {
  bindControls();model.count(4);model.start();updateUI();updateGeometry();bindPresets();
  // A worker's timer keeps its pace while this window is hidden (page timers slow to once a minute), so the projector
  // window never waits for updates and its clouds keep an even speed.
  try{const ticker=new Worker(URL.createObjectURL(new Blob(['setInterval(()=>postMessage(0),100)'],{type:'text/javascript'})));ticker.onmessage=()=>animate(performance.now());}
  catch{setInterval(() => animate(performance.now()), 100);}
  window.ephemeral = { model, settings, geometry, timing, live, presence, field, loadWind, get mapper(){return mapper;}, get concept(){return concept;},updateGeometry,get activeView(){return activeView;},setView, visualFrame, rainProfile, get rainAudio() { return rainEngine; }, get audioStats() { return rainEngine?.diagnostics; }, seek, loadDetector, get camera() { return camera; }, get paused() { return paused; }, get fps() { return sky?.fps; } };
}
if (!window.p5) showFatal('无法加载本地 p5.js 库。');
else {
  sky = createSky($('canvas-host'), visualFrame, showFatal, projection);
  if (!projection) {
    try{concept=createConcept({host:$('concept-host'),reflectionHost:$('reflection-host'),labelHost:$('scene-viewport'),sky,getView:()=>activeView,getGeometry:()=>geometry,onError:showFatal});}catch(error){showFatal(error.message);}
  }
}

if(!projection&&params.get('view')!=='sky'){setView('scene');requestAnimationFrame(()=>$('scene-view').scrollIntoView({block:'start'}));}
