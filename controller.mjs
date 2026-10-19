// Day cycle: 0 sunrise, 1 sunny, 2 sunset, 3 overcast night, then back to sunrise. A 60-second day by default: four equal phases of 15 s.
export const CONFIG = Object.freeze({ stages: [15, 15, 15, 15], maxClouds: 20, fadeIn: 8, fadeOut: 10 });
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const ease = x => { x=clamp(x); return clamp(x*x*x*(x*(x*6-15)+10)); };

export const TIMING_PRESETS = {
  slow:{stages:[165,165,165,165],rates:[.45,.55,.45,.6]},
  standard:{stages:[15,15,15,15],rates:[.6,.7,.6,.8]},
  quick:{stages:[8,8,8,8],rates:[1,1,1,1]},
};
export const phaseEdges = stages => stages.reduce((a,t)=>[...a,a.at(-1)+t],[0]);
export function playbackTime(elapsed,advance,stages,loop=true) {
  const total=phaseEdges(stages)[4],t=Math.max(0,elapsed+advance);
  return loop?t%total:Math.min(total,t);
}
export function validTiming(stages,rates) {
  return Array.isArray(stages)&&stages.length===4&&stages.every(x=>Number.isFinite(x)&&x>=2&&x<=300)
    &&Array.isArray(rates)&&rates.length===4&&rates.every(x=>Number.isFinite(x)&&x>=.1&&x<=3);
}
export function phaseMotionRate(seconds,stages,rates,blend=5) {
  const edges=phaseEdges(stages);let rate=rates[0];
  for(let i=1;i<4;i++){const width=Math.min(blend,stages[i-1]*.3,stages[i]*.3);rate+=(rates[i]-rates[i-1])*ease((seconds-edges[i]+width)/(2*width));}
  return rate;
}
// Solar hour angle (degrees from local noon) at each phase boundary: dawn (≈ −6.6°), morning (≈ 9°), afternoon, dusk,
// next dawn. The four phases last equally long; sunrise and sunset spend all of theirs in the colourful band near the
// horizon, while the sun crosses the high sky and the night faster.
export const HOUR_KNOTS=[-104,-84,84,104,256];
// Monotone C1 Hermite (Fritsch–Carlson): no jumps or reversals, and the sun slows through the horizon band.
export function hourTangents(stages=CONFIG.stages) {
  const k=HOUR_KNOTS,d=[0,1,2,3].map(i=>(k[i+1]-k[i])/stages[i]),m=[0,1,2,3].map(i=>(d[(i+3)%4]+d[i])/2);
  for(let pass=0;pass<2;pass++)for(let i=0;i<4;i++){const a=m[i]/d[i],b=m[(i+1)%4]/d[i],r=a*a+b*b;if(r>9){const t=3/Math.sqrt(r);m[i]=t*a*d[i];m[(i+1)%4]=t*b*d[i];}}
  return m;
}
export function hourAngle(seconds,stages=CONFIG.stages) {
  const e=phaseEdges(stages),t=clamp(Number(seconds)||0,0,e[4]),k=HOUR_KNOTS,m=hourTangents(stages);
  let i=0;while(i<3&&t>e[i+1])i++;const h=stages[i],u=(t-e[i])/h;
  return (2*u**3-3*u*u+1)*k[i]+(u**3-2*u*u+u)*h*m[i]+(-2*u**3+3*u*u)*k[i+1]+(u**3-u*u)*h*m[(i+1)%4];
}
// Overcast builds through the first third of the night and clears through its last third.
export function overcastAt(seconds,stages=CONFIG.stages) {
  const e=phaseEdges(stages),t=clamp(Number(seconds)||0,0,e[4]);
  if(t<e[3])return 0;const u=(t-e[3])/stages[3];return ease(u/.33)*(1-ease((u-.67)/.33));
}
export function weatherAt(seconds,people,stages=CONFIG.stages) {
  const edges=phaseEdges(stages),t=clamp(Number(seconds)||0,0,edges[4]);
  const phase=t<edges[1]?0:t<edges[2]?1:t<edges[3]?2:3,overcast=overcastAt(t,stages);
  return {phase,hour:hourAngle(t,stages),overcast,growth:.38,fade:1,darkness:overcast,rain:ease((overcast-.6)/.4),
    cloudCount:clamp(Math.floor(Number(people)||0),0,CONFIG.maxClouds)};
}
// One slot per visitor: arrivals fade in, departures fade out the most recent clouds first.
export function updatePresence(presence,people,dt,{fadeIn=CONFIG.fadeIn,fadeOut=CONFIG.fadeOut}={}) {
  for(let i=0;i<presence.length;i++){
    const target=i<people?1:0;
    presence[i]=target?Math.min(1,presence[i]+dt/fadeIn):Math.max(0,presence[i]-dt/fadeOut);
  }
  return presence;
}

export class Experience {
  constructor(stages=CONFIG.stages,{loop=true}={}) {
    this.stages=[...stages];this.loop=loop;
    this.mode='idle';this.running=false;this.people=0;this.cloudCount=0;
    this.elapsed=0;this.clock=0;this.hour=HOUR_KNOTS[0];this.overcast=0;this.growth=.38;this.fade=1;this.darkness=0;this.rain=0;
    this.reason='';this.cycles=0;
  }
  count(n) {
    if (!Number.isInteger(n) || n < 0 || n > 100) throw Error('无效人数');
    this.people = n;
  }
  // The sky keeps running with nobody present; visitors only change the clouds.
  start() {
    if (this.mode === 'stopped') return false;
    this.running = true; if (this.mode === 'idle') this.transition('cycle'); return true;
  }
  transition(mode) { this.mode = mode; this.elapsed = 0; }
  stop(reason = '操作员停止') { this.running = false; this.reason = reason; this.rain = 0; this.transition('stopped'); }
  recover() { this.reason = ''; this.running = true; this.transition('cycle'); }
  tick(dt) {
    if (!Number.isFinite(dt) || dt < 0) throw Error('无效时间步长');
    dt = Math.min(dt, 0.25); this.clock += dt;
    if (this.mode !== 'cycle') return;
    const total=phaseEdges(this.stages)[4];this.elapsed+=dt;
    if(this.elapsed>=total){if(this.loop){this.elapsed%=total;this.cycles++;}else this.elapsed=total;}
    const w=weatherAt(this.elapsed,this.people,this.stages);
    for (const k of ['hour','overcast','growth','fade','darkness','rain','cloudCount']) this[k]=w[k];
  }
  get phase() { return this.mode === 'cycle' ? weatherAt(this.elapsed, 0, this.stages).phase : -1; }
}
