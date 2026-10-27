// Day cycle: morning (sunrise), day, sunset glow and a clear night with stars, 60 s each by default; each part can be
// switched off. Within a part the sun moves steadily along that part's stretch of its real October path over Melbourne
// (hour angle in degrees from local noon). Around each change of part there is a transition window, from `start`
// seconds before the part ends to `end` seconds into the next. When the next part follows on along the sun's path the
// sun travels on to it; when parts in between are off (or one part repeats on its own) the two skies cross-fade
// instead, so no dark or bright flash runs through a part that is switched off.
export const PHASES = Object.freeze([
  { id: 'morning', hours: [-104, -84] }, // −6.6° to +9°, low in the east: dawn and sunrise colours
  { id: 'day', hours: [-60, 60] },       // +28° up to 59° at noon and back
  { id: 'sunset', hours: [84, 106] },    // +9° to −8° in the west: the evening glow
  { id: 'night', hours: [128, 232] },    // below −24°: dark sky, stars and moonlit clouds
]);
export const CONFIG = Object.freeze({ maxClouds: 20, fadeIn: 8, fadeOut: 10 });
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const ease = x => { x=clamp(x); return clamp(x*x*x*(x*(x*6-15)+10)); };
const smooth = x => { x = clamp(x); return x * x * (3 - 2 * x); };

// Timing presets: four equal parts, each change with a transition of a sixth of a part on either side. Clouds change
// at one steady rate for the whole cycle; `rates` keeps four equal values for earlier versions' presets.
const preset = (s, rate) => ({ stages: [s, s, s, s], on: [true, true, true, true], edges: [0, 1, 2, 3].map(() => [s / 6, s / 6]), rates: [rate, rate, rate, rate] });
export const TIMING_PRESETS = { quick: preset(15, 1), standard: preset(60, .7), slow: preset(165, .5) };
export const CYCLE = Object.freeze(TIMING_PRESETS.standard);
export const defaultEdges = stages => stages.map(s => [s / 6, s / 6]);
// stages: seconds per part; on: parts shown (at least one); edges: per part, its transition into the next part shown.
export function validCycle(t) {
  const num = (x, a, b) => typeof x === 'number' && Number.isFinite(x) && x >= a && x <= b;
  return !!t && Array.isArray(t.stages) && t.stages.length === 4 && t.stages.every(x => num(x, 2, 600))
    && Array.isArray(t.on) && t.on.length === 4 && t.on.every(x => typeof x === 'boolean') && t.on.some(Boolean)
    && Array.isArray(t.edges) && t.edges.length === 4 && t.edges.every(e => Array.isArray(e) && e.length === 2 && e.every(x => num(x, 0, 600)));
}
export const validRates = rates => Array.isArray(rates) && rates.length === 4 && rates.every(x => typeof x === 'number' && Number.isFinite(x) && x >= .1 && x <= 3);
// The parts shown, in order: start, length, and the transition window into the next part shown (out: seconds before
// this part ends, into: seconds into the next), shortened where it would overlap the window before it.
export function cycleParts({ stages, on, edges }) {
  let t = 0;
  const parts = [0, 1, 2, 3].filter(i => on[i]).map(id => { const p = { id, start: t, length: stages[id] }; t += stages[id]; return p; });
  parts.forEach((p, k) => { p.next = parts[(k + 1) % parts.length]; p.out = Math.min(edges[p.id][0], p.length); p.into = Math.min(edges[p.id][1], p.next.length); });
  parts.forEach((p, k) => { const prev = parts[(k + parts.length - 1) % parts.length], sum = prev.into + p.out; if (sum > p.length) { prev.into *= p.length / sum; p.out *= p.length / sum; } });
  return { parts, total: t };
}
// Hour angle of part p at `time` (seconds; the same timeline as p.start), continuing at the part's speed beyond it.
const rate = p => (PHASES[p.id].hours[1] - PHASES[p.id].hours[0]) / p.length;
const hourOf = (p, time, start = p.start) => PHASES[p.id].hours[0] + rate(p) * (time - start);
// The sky at `seconds` into the cycle: hour (and hour2 with cross > 0 while two skies cross-fade), the part on show,
// and from/to/blend for anything set per part (colours), blend easing 0 → 1 through each transition.
export function cycleState(seconds, timing = CYCLE) {
  const { parts, total } = cycleParts(timing), n = parts.length, t = ((Number(seconds) || 0) % total + total) % total;
  let k = parts.findIndex(p => t < p.start + p.length);if (k < 0) k = n - 1;
  const p = parts[k], prev = parts[(k + n - 1) % n], u = t - p.start;
  // A transition from part a (starting at aStart) to part b (starting at bStart), over [t0, t1].
  const transition = (a, aStart, b, bStart, t0, t1) => {
    const blend = smooth((t - t0) / Math.max(t1 - t0, 1e-6)), base = { part: p.id, from: a.id, to: b.id, blend };
    if (n > 1 && b.id === (a.id + 1) % 4) {
      // On along the sun's path: a cubic that keeps each part's speed at its ends and never runs backwards.
      const d = Math.max(t1 - t0, 1e-6), h0 = hourOf(a, t0, aStart);let h1 = hourOf(b, t1, bStart);while (h1 <= h0) h1 += 360;
      const s = (h1 - h0) / d;let m0 = rate(a), m1 = rate(b);const r = (m0 / s) ** 2 + (m1 / s) ** 2;if (r > 9) { m0 *= 3 / Math.sqrt(r); m1 *= 3 / Math.sqrt(r); }
      const x = clamp((t - t0) / d);
      return { ...base, hour: (2 * x ** 3 - 3 * x * x + 1) * h0 + (x ** 3 - 2 * x * x + x) * d * m0 + (3 * x * x - 2 * x ** 3) * h1 + (x ** 3 - x * x) * d * m1, hour2: 0, cross: 0 };
    }
    return { ...base, hour: hourOf(a, t, aStart), hour2: hourOf(b, t, bStart), cross: blend };
  };
  if (u < prev.into) { const prevStart = k ? prev.start : prev.start - total; return transition(prev, prevStart, p, p.start, p.start - prev.out, p.start + prev.into); }
  if (u > p.length - p.out) { const nextStart = k < n - 1 ? p.next.start : p.next.start + total; return transition(p, p.start, p.next, nextStart, p.start + p.length - p.out, p.start + p.length + p.into); }
  return { part: p.id, from: p.id, to: p.id, blend: 0, hour: hourOf(p, t), hour2: 0, cross: 0 };
}
export const cycleTotal = timing => cycleParts(timing).total;
export function playbackTime(elapsed,advance,timing,loop=true) {
  const total=cycleTotal(timing),t=Math.max(0,elapsed+advance);
  return loop?t%total:Math.min(total,t);
}
// ponytail: darkness, overcast and rain stay at 0 since the overcast night went (2026.10.26.1); the fields remain for
// the rain audio and older projector messages.
export function weatherAt(seconds,people,timing=CYCLE) {
  const c=cycleState(clamp(Number(seconds)||0,0,cycleTotal(timing)),timing);
  return {phase:c.part,hour:c.hour,hour2:c.hour2,cross:c.cross,from:c.from,to:c.to,blend:c.blend,overcast:0,growth:.38,fade:1,darkness:0,rain:0,
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
  constructor(cycle=CYCLE,{loop=true}={}) {
    this.cycle=structuredClone(cycle);this.loop=loop;
    this.mode='idle';this.running=false;this.people=0;this.cloudCount=0;
    this.elapsed=0;this.clock=0;const {phase,...w}=weatherAt(0,0,this.cycle);Object.assign(this,w);
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
    const total=cycleTotal(this.cycle);this.elapsed+=dt;
    if(this.elapsed>=total){if(this.loop){this.elapsed%=total;this.cycles++;}else this.elapsed=total;}
    const {phase,...w}=weatherAt(this.elapsed,this.people,this.cycle);Object.assign(this,w);
  }
  get phase() { return this.mode === 'cycle' ? weatherAt(this.elapsed, 0, this.cycle).phase : -1; }
}
