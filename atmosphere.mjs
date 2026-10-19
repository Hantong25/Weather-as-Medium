// Physically based sky: Melbourne sun path plus single-scattering Rayleigh, Mie and ozone (Nishita-style), in km.
// The same model runs per pixel in GLSL and a few times per frame in JS for cloud lighting and exposure.
import { compassToCanvas } from './forecast.mjs?v=2026.10.19.2';
export const SITE = { latitude: -37.81, declination: -7 }; // Melbourne, mid-October
const R = Math.PI / 180, RE = 6360, RA = 6420, HR = 8, HM = 1.2, SUN = 20, G = .76;
const BR = [5.8e-3, 13.5e-3, 33.1e-3], BO = [.65e-3, 1.881e-3, .085e-3];
const bm = turbidity => 21e-3 * turbidity / 2.5;
// Air composition: turbidity (aerosol amount), ozone column multiplier and aerosol single-scattering tint.
// A tint below 1 means that colour is absorbed rather than scattered (smoke absorbs blue, turning the sky orange).
const airOf = air => typeof air === 'number' ? { turbidity: air, ozone: 1, tint: [1, 1, 1] } : { turbidity: 2.5, ozone: 1, tint: [1, 1, 1], ...air };
// Physically motivated atmosphere types. 'volcanic' approximates stratospheric aerosol with a stronger ozone-like absorption.
export const ATMOSPHERES = {
  melbourne: { turbidity: 2.5, ozone: 1, tint: [1, 1, 1] },
  clear: { turbidity: 1.2, ozone: 1.15, tint: [1, 1, 1] },
  marine: { turbidity: 7, ozone: 1, tint: [1, 1, 1.02] },
  haze: { turbidity: 18, ozone: 1, tint: [1, .93, .84] },
  smoke: { turbidity: 40, ozone: 1, tint: [.92, .6, .3] },
  volcanic: { turbidity: 3, ozone: 2.6, tint: [1, .98, 1] },
};

// Hour angle in degrees from local noon → elevation and compass azimuth (degrees).
export function solarPosition(hour, { latitude, declination } = SITE) {
  const h = hour * R, p = latitude * R, d = declination * R;
  const elevation = Math.asin(Math.sin(p) * Math.sin(d) + Math.cos(p) * Math.cos(d) * Math.cos(h)) / R;
  const azimuth = (Math.atan2(Math.sin(h), Math.cos(h) * Math.sin(p) - Math.tan(d) * Math.cos(p)) / R + 540) % 360;
  return { elevation, azimuth };
}
// Canvas frame for a viewer looking up: x/y across the canopy (north up, east left), z towards the zenith.
export function sunVector(elevation, azimuth, north = 0) {
  const a = compassToCanvas(azimuth, north) * R, e = elevation * R;
  return [Math.cos(e) * Math.cos(a), Math.cos(e) * Math.sin(a), Math.sin(e)];
}
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function exitDistance(o, d, r) { const b = dot(o, d), c = dot(o, o) - r * r, q = b * b - c; return q < 0 ? -1 : -b + Math.sqrt(q); }
const shadowed = (o, d) => { const b = dot(o, d), c = dot(o, o) - RE * RE; return b < 0 && b * b - c > 0; };
// Ozone sits in a layer peaking at 25 km; it absorbs orange light and keeps twilight skies blue.
const ozone = h => Math.max(0, 1 - Math.abs(h - 25) / 15);
// Samples crowd near the start of each path (t ∝ u²) where Mie haze and Rayleigh air are densest.
function march(o, d, length, steps, visit) {
  for (let j = 0; j < steps; j++) {
    const a = j / steps, b = (j + 1) / steps, t = length * ((a + b) / 2) ** 2, dt = length * (b * b - a * a);
    visit([o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t], dt);
  }
}
// Optical depth (Rayleigh, Mie, ozone) from point o towards d, or null when the Earth blocks the sun.
function depth(o, d, steps = 6) {
  if (shadowed(o, d)) return null;
  const od = [0, 0, 0];
  march(o, d, exitDistance(o, d, RA), steps, (p, dt) => { const h = Math.hypot(...p) - RE; od[0] += Math.exp(-h / HR) * dt; od[1] += Math.exp(-h / HM) * dt; od[2] += ozone(h) * dt; });
  return od;
}
// Aerosol extinction per channel: scattering (tint) plus absorption, which grows where the tint drops below 1.
const mieExtinction = (air, c) => bm(air.turbidity) * 1.1 * (2 - air.tint[c]);
const extinction = (od, air) => BR.map((b, i) => Math.exp(-(b * od[0] + mieExtinction(air, i) * od[1] + BO[i] * air.ozone * od[2])));
// Sunlight reaching a point at altitude km: reddens near the horizon and lingers on clouds after ground sunset.
export function sunlight(sun, altitude = 0, air = 2.5) {
  air = airOf(air);
  const od = depth([0, 0, RE + altitude], sun, 12);
  return od ? extinction(od, air).map(x => x * SUN) : [0, 0, 0];
}
// Allocation-free single scattering: 10 view samples (crowded near the ground), 4 light samples each.
export function skyRadiance(ray, sun, air = 2.5) {
  air = airOf(air);
  const ox = 0, oy = 0, oz = RE + .002, mu = dot(ray, sun), M = bm(air.turbidity), O = air.ozone, [k0, k1, k2] = air.tint, e0 = mieExtinction(air, 0), e1 = mieExtinction(air, 1), e2 = mieExtinction(air, 2);
  const pr = 3 / (16 * Math.PI) * (1 + mu * mu), pm = 3 / (8 * Math.PI) * ((1 - G * G) * (1 + mu * mu)) / ((2 + G * G) * Math.pow(1 + G * G - 2 * G * mu, 1.5));
  const L = exitDistance([ox, oy, oz], ray, RA);
  let r0 = 0, r1 = 0, r2 = 0, m0 = 0, m1 = 0, m2 = 0, vr = 0, vm = 0, vo = 0;
  for (let i = 0; i < 10; i++) {
    const a = i / 10, b = (i + 1) / 10, t = L * (a + b) * (a + b) / 4, dt = L * (b * b - a * a);
    const px = ox + ray[0] * t, py = oy + ray[1] * t, pz = oz + ray[2] * t, h = Math.sqrt(px * px + py * py + pz * pz) - RE;
    const hr = Math.exp(-h / HR) * dt, hm = Math.exp(-h / HM) * dt; vr += hr; vm += hm; vo += Math.max(0, 1 - Math.abs(h - 25) / 15) * dt;
    const sb = px * sun[0] + py * sun[1] + pz * sun[2], sc = px * px + py * py + pz * pz - RE * RE;
    if (sb < 0 && sb * sb - sc > 0) continue;
    const Ll = -sb + Math.sqrt(sb * sb - (px * px + py * py + pz * pz - RA * RA));
    let lr = 0, lm = 0, lo = 0;
    for (let k = 0; k < 4; k++) {
      const c0 = k / 4, c1 = (k + 1) / 4, u = Ll * (c0 + c1) * (c0 + c1) / 4, du = Ll * (c1 * c1 - c0 * c0);
      const qx = px + sun[0] * u, qy = py + sun[1] * u, qz = pz + sun[2] * u, hl = Math.sqrt(qx * qx + qy * qy + qz * qz) - RE;
      lr += Math.exp(-hl / HR) * du; lm += Math.exp(-hl / HM) * du; lo += Math.max(0, 1 - Math.abs(hl - 25) / 15) * du;
    }
    const tr = vr + lr, tm = vm + lm, to = vo + lo;
    const a0 = Math.exp(-(BR[0] * tr + e0 * tm + BO[0] * O * to)), a1 = Math.exp(-(BR[1] * tr + e1 * tm + BO[1] * O * to)), a2 = Math.exp(-(BR[2] * tr + e2 * tm + BO[2] * O * to));
    r0 += a0 * hr; r1 += a1 * hr; r2 += a2 * hr; m0 += a0 * hm; m1 += a1 * hm; m2 += a2 * hm;
  }
  return [SUN * (r0 * BR[0] * pr + m0 * M * k0 * pm), SUN * (r1 * BR[1] * pr + m1 * M * k1 * pm), SUN * (r2 * BR[2] * pr + m2 * M * k2 * pm)];
}
export const luminance = c => .2126 * c[0] + .7152 * c[1] + .0722 * c[2];
// Per-frame lighting shared by both windows: sun direction, sunlight on clouds (~2 km), sky ambient and exposure.
export function skyState(hour, { turbidity = 2.5, ozone = 1, tint = [1, 1, 1], cityGlow = .6, north = 0, overcast = 0 } = {}) {
  // Afternoon heating and traffic usually leave more aerosol by evening: warmer, softer sunsets than sunrises.
  turbidity *= 1 + .45 * Math.min(1, Math.max(0, (((hour + 180) % 360 - 180) + 30) / 120));
  const { elevation, azimuth } = solarPosition(hour), sun = sunVector(elevation, azimuth, north), air = { turbidity, ozone, tint };
  const rays = [[0, 0, 1], ...[0, 60, 120, 180, 240, 300].map(a => [Math.cos(a * R) * .866, Math.sin(a * R) * .866, .5])];
  const ambient = [0, 0, 0];
  for (const ray of rays) skyRadiance(ray, sun, air).forEach((v, c) => ambient[c] += v / rays.length);
  const sunCloud = sunlight(sun, 3, air).map(v => v * (1 - .85 * overcast));
  // Night: faint airglow/starlight and warm light from the city reflected by cloud bases (Melbourne, not a dark site).
  const night = [.0004, .0006, .0011], city = [.0085, .0074, .0064].map(v => v * cityGlow);
  // Exposure follows scene brightness like an adapting eye, but night keeps a floor so it still reads as night.
  const exposure = .22 / (luminance(ambient) + .012);
  // Stars only before dawn once the overcast has cleared and the sky is properly dark.
  const stars = (1 - overcast) * Math.min(1, Math.max(0, (-elevation - 8) / 6));
  return { elevation, azimuth, sun, sunCloud, stars, ambient: ambient.map(v => v * (1 - .55 * overcast)), night, city, exposure, cityGlow, turbidity, air, overcast };
}

// Sky radiance over the canopy as a small RGBA table (exposure applied, sqrt-encoded up to 4). Sky light is smooth,
// so the shader interpolates this instead of running the scattering integral per pixel.
export const TABLE_SIZE = 17, TABLE_SPAN = 1.5;
// Rows j0..j1 of the sky table, so a new table can be built a few rows per frame without stalling playback.
export function skyTableRows(state, data, j0, j1, size = TABLE_SIZE, span = TABLE_SPAN) {
  const k = state.exposure;
  for (let j = j0; j < Math.min(j1, size); j++) for (let i = 0; i < size; i++) {
    const x = (i / (size - 1) * 2 - 1) * span * .95, y = (j / (size - 1) * 2 - 1) * span * .95, n = Math.hypot(x, y, 1), ray = [x / n, y / n, 1 / n];
    const horizon = 1 - ray[2], sky = skyRadiance(ray, state.sun, state.air);
    const o = (j * size + i) * 4;
    for (let c = 0; c < 3; c++) data[o + c] = Math.round(255 * Math.sqrt(Math.min(1, k * (sky[c] + state.night[c] + state.city[c] * (.12 + .5 * horizon * horizon)) / 4)));
    data[o + 3] = 255;
  }
  return data;
}
export const skyTable = (state, size = TABLE_SIZE, span = TABLE_SPAN) => skyTableRows(state, new Uint8ClampedArray(size * size * 4), 0, size, size, span);
// Per-frame lighting between two precomputed states; exposure blends in log space like an eye adapting.
export function blendLight(a, b, t) {
  const mix = (x, y) => x.map((v, i) => v + (y[i] - v) * t), sun = mix(a.sun, b.sun), n = Math.hypot(...sun) || 1;
  return { sun: sun.map(v => v / n), sunCloud: mix(a.sunCloud, b.sunCloud), ambient: mix(a.ambient, b.ambient), night: a.night, city: mix(a.city, b.city),
    stars: a.stars + (b.stars - a.stars) * t, exposure: Math.exp(Math.log(a.exposure) + (Math.log(b.exposure) - Math.log(a.exposure)) * t) };
}
// Night cloud cover dims sunlight, skylight and stars; applied per frame so tables never depend on it.
export const applyOvercast = (light, overcast) => ({ ...light, sunCloud: light.sunCloud.map(v => v * (1 - .85 * overcast)), ambient: light.ambient.map(v => v * (1 - .55 * overcast)), stars: light.stars * (1 - overcast) });
