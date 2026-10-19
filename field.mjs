// Visitor clouds as a field that drifts with the wind. Each present visitor keeps a cloud on the canopy: it forms,
// drifts with the wind and dissipates or drifts off, and as it goes the visitor's next cloud forms upwind with a new
// shape. Positions are in sky units (the canopy's short half-side is 1) and in air coordinates: on screen a cloud sits
// at position + drift, where drift = shared wind offset × FIELD.drift, so the projector window keeps clouds moving
// between messages.
const random = seed => { let a = seed | 0; return () => { a += 0x6D2B79F5; let t = Math.imul(a ^ a >>> 15, 1 | a); t ^= t + Math.imul(t ^ t >>> 7, 61 | t); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
const smooth = x => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
const between = ([a, b], t) => a + (b - a) * t;
// drift: sky units per unit of wind offset (a 5 m/s wind crosses the A0 canopy's width in about 100 s).
// mass: half-size of the cloud mass map; exit: a cloud fades out over this distance (sky units) after its centre
// passes the downwind edge.
export const FIELD = Object.freeze({ drift: .02, life: [55, 105], grow: 10, fade: 12, mass: 1.77, exit: .6 });
// Strength over one life: forms over `grow` seconds, dissipates over the last `fade`.
export const envelope = c => smooth(c.age / FIELD.grow) * (1 - smooth((c.age - c.life + FIELD.fade) / FIELD.fade));
// Farthest visible sky point along unit vector [x, y]: the canopy (turned with the sky) clipped by the mass map.
export function skyReach({ shape = 'circle', aspect = 1, rotation = 0 }, [x, y]) {
  const r = rotation * Math.PI / 180, u = Math.abs(x * Math.cos(r) + y * Math.sin(r)), v = Math.abs(y * Math.cos(r) - x * Math.sin(r));
  const canopy = shape === 'circle' ? 1 : shape === 'fill' ? Math.max(1, aspect) * u + Math.max(1, 1 / aspect) * v : u + v;
  return Math.min(canopy, FIELD.mass * (Math.abs(x) + Math.abs(y)));
}
// A random point within 80% of the visible canopy, in the sky frame (the canopy turns with the sky).
function spot({ shape = 'circle', aspect = 1, rotation = 0 }, r) {
  if (shape === 'circle') { const a = r() * Math.PI * 2, d = .8 * Math.sqrt(r()); return [Math.cos(a) * d, Math.sin(a) * d]; }
  const t = rotation * Math.PI / 180, x = (r() * 2 - 1) * .8 * (shape === 'fill' ? Math.max(1, aspect) : 1), y = (r() * 2 - 1) * .8 * (shape === 'fill' ? Math.max(1, 1 / aspect) : 1);
  return [x * Math.cos(t) - y * Math.sin(t), x * Math.sin(t) + y * Math.cos(t)];
}
export class CloudField {
  // salt varies per session, so the same visitors do not bring back the same shapes every time.
  constructor(salt = Math.floor(Math.random() * 2 ** 31), slots = 20) { this.rnd = random(salt); this.slots = Array.from({ length: slots }, () => []); }
  // A new cloud forms in the clearest of a few spots on the canopy; a visitor's next cloud forms on the upwind half.
  // An arriving visitor's cloud starts fully formed, since their own fade-in (presence) already makes it appear gradually.
  form([dx, dy], canopy, wind) {
    const others = this.slots.flat().map(c => [c.x + dx, c.y + dy]);
    let best, gap = -1;
    for (let k = 0; k < 4; k++) {
      let p = spot(canopy, this.rnd); if (wind && p[0] * wind[0] + p[1] * wind[1] > 0) p = p.map(v => -v);
      const g = Math.min(Infinity, ...others.map(o => Math.hypot(p[0] - o[0], p[1] - o[1])));
      if (g > gap) { gap = g; best = p; }
    }
    return { x: best[0] - dx, y: best[1] - dy, seed: Math.floor(this.rnd() * 1e6), age: wind ? 0 : FIELD.grow, life: between(FIELD.life, this.rnd()) };
  }
  // people: visitors now; presence: per-slot fade 0–1; drift: wind offset in sky units; wind: unit vector it blows
  // towards; canopy: { shape, aspect, rotation } of the projected sky.
  update(dt, people, presence, drift, wind, canopy) {
    const reach = skyReach(canopy, wind);
    const downwind = c => (c.x + drift[0]) * wind[0] + (c.y + drift[1]) * wind[1];
    this.slots.forEach((list, i) => {
      const wanted = i < people;
      if (!(presence[i] > 0) && !wanted) { this.slots[i] = []; return; }
      for (const c of list) { c.age += dt; c.out = smooth((downwind(c) - reach) / FIELD.exit); }
      // The next cloud starts forming as the newest one begins to dissipate or reaches the downwind edge.
      const last = list[list.length - 1];
      if (wanted && (!last || last.age > last.life - FIELD.fade || downwind(last) > reach)) list.push(this.form(drift, canopy, last && wind));
      // A cloud goes only once it has dissipated or faded out past the edge, so nothing vanishes on screen.
      this.slots[i] = list.filter(c => c.age < c.life && (c.out ?? 0) < 1);
    });
    return this;
  }
  // [x, y, seed, strength] for every cloud, for drawing and for the projector window.
  snapshot(presence) {
    return this.slots.flatMap((list, i) => list.map(c => [c.x, c.y, c.seed, Math.min(1, Math.max(0, presence[i] || 0)) * envelope(c) * (1 - (c.out ?? 0))]));
  }
}
