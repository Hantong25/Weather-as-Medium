// Visitor clouds as a field that drifts with the wind. Each present visitor keeps a cloud on the canopy. While the wind
// blows, clouds drift right across: one leaving the picture drifts out whole, and as it starts to leave, the visitor's
// next cloud drifts in from the opposite (upwind) side with a new shape. In still air a cloud dissipates after a minute
// or two and the next one forms in its place. Positions are in sky units (the canopy's short half-side is 1) and in air
// coordinates: on screen a cloud sits at position + drift, where drift = shared wind offset × FIELD.drift, so the
// projector window keeps clouds moving between messages.
const random = seed => { let a = seed | 0; return () => { a += 0x6D2B79F5; let t = Math.imul(a ^ a >>> 15, 1 | a); t ^= t + Math.imul(t ^ t >>> 7, 61 | t); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
const smooth = x => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
const between = ([a, b], t) => a + (b - a) * t;
// drift: sky units per unit of wind offset (a 5 m/s wind crosses the A0 canopy's width in about 100 s).
// life: seconds a cloud lasts in still air; grow, fade: seconds it takes to form and to dissipate at the defaults of the
// appear and disappear sliders; mass: half-size of the cloud mass map; exit: distance (sky units) over which a cloud
// fades out past the edge of its region.
export const FIELD = Object.freeze({ drift: .02, life: [55, 105], grow: 10, fade: 12, mass: 1.77, exit: .6 });
// Strength over one life: forms over its own `grow` seconds, dissipates over its last `fade` seconds.
export const envelope = c => smooth(c.age / c.grow) * (1 - smooth((c.age - c.life + c.fade) / c.fade));
// The cloud region (regionX/Y: centre from the left and top, regionW/H: size, as fractions of the frame; the whole
// frame by default) in the canopy frame: centre and half sizes in sky units.
function region({ shape = 'circle', aspect = 1, regionX = .5, regionY = .5, regionW = 1, regionH = 1 }) {
  const w = shape === 'fill' ? Math.max(1, aspect) : 1, h = shape === 'fill' ? Math.max(1, 1 / aspect) : 1;
  return { x: (regionX - .5) * 2 * w, y: (.5 - regionY) * 2 * h, w: regionW * w, h: regionH * h };
}
const turn = ([x, y], degrees) => { const t = degrees * Math.PI / 180; return [x * Math.cos(t) - y * Math.sin(t), x * Math.sin(t) + y * Math.cos(t)]; };
// How far the picture (frame) and its visible cloud region (the region within the picture, clipped by the mass map)
// reach from the canopy centre along unit vector [x, y]; both turn with the sky.
function reaches(canopy, [x, y]) {
  const { shape = 'circle', aspect = 1, rotation = 0 } = canopy, r = rotation * Math.PI / 180, u = x * Math.cos(r) + y * Math.sin(r), v = y * Math.cos(r) - x * Math.sin(r);
  const frame = shape === 'circle' ? 1 : shape === 'fill' ? Math.max(1, aspect) * Math.abs(u) + Math.max(1, 1 / aspect) * Math.abs(v) : Math.abs(u) + Math.abs(v);
  const b = region(canopy);
  return [frame, Math.min(frame, b.x * u + b.y * v + b.w * Math.abs(u) + b.h * Math.abs(v), FIELD.mass * (Math.abs(x) + Math.abs(y)))];
}
// Farthest visible cloud point along unit vector [x, y].
export const skyReach = (canopy, d) => reaches(canopy, d)[1];
// A random point within 80% of the cloud region (and of a circular canopy), in the sky frame (the canopy turns with
// the sky).
function spot(canopy, r) {
  const b = region(canopy);let p = [b.x, b.y];
  for (let k = 0; k < 12; k++) {
    const x = b.x + (r() * 2 - 1) * .8 * b.w, y = b.y + (r() * 2 - 1) * .8 * b.h;
    if (canopy.shape !== 'circle' || Math.hypot(x, y) <= .8) { p = [x, y]; break; }
  }
  return turn(p, canopy.rotation || 0);
}
export class CloudField {
  // salt varies per session, so the same visitors do not bring back the same shapes every time.
  constructor(salt = Math.floor(Math.random() * 2 ** 31), slots = 20) { this.rnd = random(salt); this.slots = Array.from({ length: slots }, () => []); }
  // A cloud at screen point p (kept in air coordinates) that forms over `grow` seconds (already formed if `grown`) and
  // dissipates over `fade`. Its still-air life stretches with both; `travel` adds the time it needs to drift across.
  make([x, y], [dx, dy], { grow, fade }, grown, travel) {
    return { x: x - dx, y: y - dy, seed: Math.floor(this.rnd() * 1e6), grow, fade, age: grown ? grow : 0,
      life: between(FIELD.life, this.rnd()) + grow - FIELD.grow + fade - FIELD.fade + travel };
  }
  // The clearest of a few random spots in the cloud region, each moved by `place` to where the cloud would start.
  pick([dx, dy], canopy, place) {
    const others = this.slots.flat().map(c => [c.x + dx, c.y + dy]);
    let best, gap = -1;
    for (let k = 0; k < 4; k++) {
      const p = place(spot(canopy, this.rnd)), g = Math.min(Infinity, ...others.map(o => Math.hypot(p[0] - o[0], p[1] - o[1])));
      if (g > gap) { gap = g; best = p; }
    }
    return best;
  }
  // people: visitors now; presence: per-slot fade 0–1; drift: wind offset in sky units; wind: unit vector it blows
  // towards; canopy: { shape, aspect, rotation } of the projected sky, its cloud region (regionX/Y/W/H), the clouds'
  // size there (scale: 1 for the whole frame), how far past the region they fade out (exit, sky units), how far a
  // cloud shows from its centre (radius, sky units), the drift speed (speed, sky units a second) and how long clouds
  // take to form and to dissipate (grow, fade, seconds).
  update(dt, people, presence, drift, wind, canopy) {
    const scale = canopy.scale ?? 1, exit = canopy.exit ?? FIELD.exit, radius = canopy.radius ?? .75 * scale, speed = canopy.speed ?? FIELD.drift, t = { grow: canopy.grow ?? FIELD.grow, fade: canopy.fade ?? FIELD.fade };
    const b = region(canopy), rot = (canopy.rotation || 0) * Math.PI / 180, [cx, cy] = turn([b.x, b.y], canopy.rotation || 0);
    const [frameDown, reachDown] = reaches(canopy, wind), [frameUp, reachUp] = reaches(canopy, [-wind[0], -wind[1]]);
    // Where the region meets the edge of the picture, a cloud starts to fade only once it is wholly outside, so it
    // drifts out (and in) whole; at a region edge inside the picture it fades from the edge over `exit`, as before.
    const down = reachDown + Math.max(0, radius - 4 * (frameDown - reachDown)), up = reachUp + Math.max(0, radius - 4 * (frameUp - reachUp));
    // Across the wind the cloud region spans ±side (plus a cloud's reach); a cloud outside that strip never drifts into
    // view, so it goes like one that has drifted past the downwind edge.
    const n = [-wind[1], wind[0]], side = b.w * Math.abs(n[0] * Math.cos(rot) + n[1] * Math.sin(rot)) + b.h * Math.abs(n[1] * Math.cos(rot) - n[0] * Math.sin(rot)) + .3 * scale;
    const along = c => (c.x + drift[0]) * wind[0] + (c.y + drift[1]) * wind[1];
    const across = c => Math.abs((c.x + drift[0] - cx) * n[0] + (c.y + drift[1] - cy) * n[1]) - side, leaving = c => Math.max(along(c) - down, across(c));
    const fadeOf = c => smooth(Math.max(leaving(c), -along(c) - up) / exit);
    // The next cloud sets off fully faded beyond the upwind limit as the newest nears the downwind one: on average it
    // comes into view as the other starts to leave, give or take a quarter of the region's length (span), so the
    // visitors' clouds do not travel in step as one column.
    const span = .5 * (reachUp + reachDown), lead = up - reachUp + down - reachDown + exit + span / 2;
    // In still air nothing drifts in, so clouds dissipate of age instead. A drifting cloud lives long enough to cross,
    // but at most four still-air lifetimes, so a very slow wind still renews the shapes.
    const drifting = speed > 1e-4, travel = drifting ? Math.min((up + down + 2 * exit + span) / speed, 4 * FIELD.life[1]) : 0;
    const inPlace = upwind => this.pick(drift, canopy, p => upwind && (p[0] - cx) * wind[0] + (p[1] - cy) * wind[1] > 0 ? [2 * cx - p[0], 2 * cy - p[1]] : p);
    const enter = () => this.pick(drift, canopy, p => { const s = p[0] * n[0] + p[1] * n[1], a = up + exit + this.rnd() * span; return [s * n[0] - a * wind[0], s * n[1] - a * wind[1]]; });
    this.slots.forEach((list, i) => {
      const wanted = i < people;
      if (!(presence[i] > 0) && !wanted) { this.slots[i] = []; return; }
      // A sudden change (region moved, sky turned) still fades a cloud over a quarter of its dissipation time.
      for (const c of list) { c.age += dt; const rate = 4 * dt / c.fade; c.out = Math.max(c.out - rate, Math.min(c.out + rate, fadeOf(c))); }
      const last = list[list.length - 1];
      let next = null;
      // An arriving visitor's cloud starts fully formed, since their own fade-in (presence) makes it appear gradually.
      // A new cloud forms in place when the newest dissipates or can no longer drift into view (the region moved or the
      // sky turned), so moving the region shows clouds there at once; otherwise the next one drifts in.
      if (wanted && !last) next = this.make(inPlace(false), drift, t, true, travel);
      else if (wanted && (last.age > last.life - last.fade || across(last) >= 0)) next = this.make(inPlace(true), drift, t, false, travel);
      else if (wanted && along(last) - down >= -(drifting ? lead : 0)) next = drifting ? this.make(enter(), drift, t, true, travel) : this.make(inPlace(true), drift, t, false, travel);
      if (next) { next.out = fadeOf(next); list.push(next); }
      // A cloud goes only once it has dissipated or faded out past an edge, so nothing vanishes on screen.
      this.slots[i] = list.filter(c => c.age < c.life && !(c.out >= 1 && leaving(c) > 0));
    });
    return this;
  }
  // [x, y, seed, strength] for every cloud, for drawing and for the projector window.
  snapshot(presence) {
    return this.slots.flatMap((list, i) => list.map(c => [c.x, c.y, c.seed, Math.min(1, Math.max(0, presence[i] || 0)) * envelope(c) * (1 - c.out)]));
  }
}
