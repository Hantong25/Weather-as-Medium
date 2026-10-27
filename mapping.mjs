// Projection mapping for the projector window, like a corner pin in TouchDesigner: the sky is drawn at the canopy's
// proportions and warped so its four corners land on the canopy's four corners, so a projector placed off to one side
// and below still casts it square and undistorted. A flat canopy needs exactly one projective map (a homography); the
// browser applies it to the sky canvas as a CSS matrix3d, so the sky renderer itself is untouched.

// The matrix3d that maps a w × h box onto the quad [top left, top right, bottom right, bottom left] (pixels):
// Heckbert's square-to-quad map, scaled to the box.
export function cornerPin(w, h, [[x0, y0], [x1, y1], [x2, y2], [x3, y3]]) {
  const dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2, sx = x0 - x1 + x2 - x3, sy = y0 - y1 + y2 - y3, det = dx1 * dy2 - dx2 * dy1;
  const g = (sx * dy2 - dx2 * sy) / det, k = (dx1 * sy - sx * dy1) / det;
  return [(x1 - x0 + g * x1) / w, (y1 - y0 + g * y1) / w, 0, g / w, (x3 - x0 + k * x3) / h, (y3 - y0 + k * y3) / h, 0, k / h, 0, 0, 1, 0, x0, y0, 0, 1];
}
// Point (u, v) of the unit square carried onto the quad by the same map.
export function quadPoint(q, u, v) {
  const m = cornerPin(1, 1, q), w = m[3] * u + m[7] * v + m[15];
  return [(m[0] * u + m[4] * v + m[12]) / w, (m[1] * u + m[5] * v + m[13]) / w];
}
// All four corners turn the same way: no corner pushed inside and no crossed edges (a mirror image is allowed).
export function convex(q) {
  const turns = q.map((p, i) => { const a = q[(i + 1) % 4], b = q[(i + 2) % 4]; return (a[0] - p[0]) * (b[1] - a[1]) - (a[1] - p[1]) * (b[0] - a[0]); });
  return turns.every(t => t > 0) || turns.every(t => t < 0);
}
// Saved corners: four [x, y] pairs as fractions of the projector window, allowed somewhat outside it.
export const validCorners = c => Array.isArray(c) && c.length === 4 && c.every(p => Array.isArray(p) && p.length === 2 && p.every(v => Number.isFinite(v) && v >= -1 && v <= 2)) && convex(c);
// The sky centred at 90% of the largest fit in a screen of proportions `screen` (width / height): where the corners
// start before they go to the canopy. aspect: the canopy's width / depth.
export function contain(screen, aspect) {
  const w = .9 * Math.min(1, aspect / screen), h = w * screen / aspect, x = (1 - w) / 2, y = (1 - h) / 2;
  return [[x, y], [1 - x, y], [1 - x, 1 - y], [x, 1 - y]];
}
// Corner colours, shared by the editor's handles and the dots on the projected test grid: 1 red, 2 yellow, 3 green, 4 blue.
export const CORNER_COLOURS = ['#e8553c', '#f2c230', '#3fb57f', '#3f7fe8'];

const SVG = 'http://www.w3.org/2000/svg', HOST_STYLE = ['inset', 'left', 'top', 'width', 'height', 'transformOrigin', 'transform'];
const svg = (cls) => { const el = document.createElementNS(SVG, 'svg'); el.setAttribute('class', cls); el.setAttribute('preserveAspectRatio', 'none'); el.setAttribute('aria-hidden', 'true'); return el; };

// The projector window: warps the sky onto the corners (loaded from launch.py, then sent live by the control window's
// editor). While the editor is open it shows a test grid on the warped sky, lines, two circles and a coloured dot in
// each corner, with no text, so nothing but the picture ever reaches the canopy. aspect(): the canopy's width / depth.
export function projectMapping({ host, aspect }) {
  let corners = null, calibrating = false, live = false, drawn = '';
  const grid = svg('mapping-grid'); host.append(grid);
  function drawGrid(w, h) {
    drawn = `${w}x${h}`; grid.setAttribute('viewBox', `0 0 ${w} ${h}`);
    const lines = [];for (let i = 0; i <= 8; i++) lines.push(`M${w * i / 8} 0V${h}`, `M0 ${h * i / 8}H${w}`);
    const r = Math.min(w, h) / 2, d = Math.max(8, r / 12);
    grid.innerHTML = `<path d="${lines.join('')}M0 0L${w} ${h}M${w} 0L0 ${h}"/><circle cx="${w / 2}" cy="${h / 2}" r="${r}"/><circle cx="${w / 2}" cy="${h / 2}" r="${r / 2}"/>`
      + [[0, 0], [w, 0], [w, h], [0, h]].map(([x, y], i) => `<circle class="dot" cx="${x ? x - 1.6 * d : 1.6 * d}" cy="${y ? y - 1.6 * d : 1.6 * d}" r="${d}" style="fill:${CORNER_COLOURS[i]}"/>`).join('');
  }
  function apply() {
    grid.style.display = calibrating && corners ? '' : 'none';
    if (!corners) { for (const k of HOST_STYLE) host.style[k] = ''; return; }
    const q = corners.map(([x, y]) => [x * innerWidth, y * innerHeight]), a = aspect(), xs = q.map(p => p[0]), ys = q.map(p => p[1]);
    // About one canvas pixel per projector pixel across the quad (the sky renderer caps the canvas at 1200 px).
    const s = Math.max(64, Math.round(Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)))), w = a >= 1 ? s : Math.round(s * a), h = a >= 1 ? Math.round(s / a) : s;
    Object.assign(host.style, { inset: 'auto', left: '0', top: '0', width: `${w}px`, height: `${h}px`, transformOrigin: '0 0', transform: `matrix3d(${cornerPin(w, h, q).join(',')})` });
    if (drawn !== `${w}x${h}`) drawGrid(w, h);
  }
  addEventListener('resize', apply);
  fetch('/api/mapping', { cache: 'no-store' }).then(r => r.json()).then(body => { if (!live && validCorners(body.mapping?.corners)) corners = body.mapping.corners; }).catch(() => {}).finally(apply);
  return { apply, set(next, editing) { live = true; corners = validCorners(next) ? next : null; calibrating = !!editing; apply(); } };
}

// The editor in the control window, like TouchDesigner's corner pin parameters: the board stands for the projector
// window (in its reported proportions). Drag the numbered corners onto the canopy corners while watching the canopy, or
// focus one (click or Tab) and nudge it with the arrow keys, one projector pixel at a time (Shift: ten). Changes go to
// the projector window live, and launch.py keeps them in the user data folder (mapping.json), so they survive restarts.
// send(message) reaches the projector window; aspect(): the canopy's width / depth; onChange(state) after each change.
export function mappingEditor({ board, say, send, aspect, onChange }) {
  let corners = null, editing = false, timer = 0, screen = null, message = '';
  const preview = svg('mapping-preview');
  const handles = CORNER_COLOURS.map((colour, i) => {
    const el = Object.assign(document.createElement('button'), { className: 'mapping-handle', textContent: String(i + 1), type: 'button' });
    el.style.setProperty('--colour', colour); el.setAttribute('aria-label', say(`第 ${i + 1} 角：拖动，或用方向键微调`, `Corner ${i + 1}: drag, or nudge with the arrow keys`));
    return el;
  });
  board.append(preview, ...handles);
  const size = () => screen || { width: 1920, height: 1080 };
  const state = () => ({ editing, mapped: !!corners, connected: !!screen, screen: size(), message });
  // The board: the warped picture's outline, its 8 × 8 grid and diagonals, in projector pixels.
  function draw() {
    const { width: W, height: H } = size();
    board.style.aspectRatio = `${W} / ${H}`; preview.setAttribute('viewBox', `0 0 ${W} ${H}`);
    handles.forEach((el, i) => { el.hidden = !corners; if (corners) { el.style.left = `${corners[i][0] * 100}%`; el.style.top = `${corners[i][1] * 100}%`; } });
    if (!corners) { preview.innerHTML = ''; return; }
    const p = (u, v) => quadPoint(corners, u, v).map((x, k) => (x * (k ? H : W)).toFixed(1)).join(' '), d = [];
    for (let i = 0; i <= 8; i++) d.push(`M${p(i / 8, 0)}L${p(i / 8, 1)}`, `M${p(0, i / 8)}L${p(1, i / 8)}`);
    preview.innerHTML = `<path class="grid" d="${d.join('')}M${p(0, 0)}L${p(1, 1)}M${p(1, 0)}L${p(0, 1)}"/><path class="outline" d="M${p(0, 0)}L${p(1, 0)}L${p(1, 1)}L${p(0, 1)}Z"/>`;
  }
  const push = () => { send({ type: 'mapping', corners, editing }); draw(); onChange?.(state()); };
  function save() {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      try {
        const response = await fetch('/api/mapping', { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version: 1, corners }) });
        if (!response.ok) throw Error((await response.json().catch(() => ({}))).error || `HTTP ${response.status}`);
        message = say('已保存', 'Saved');
      } catch (error) { message = say(`无法保存：${error.message}`, `Could not save: ${error.message}`); }
      onChange?.(state());
    }, 300);
  }
  function move(i, [x, y]) {
    const next = corners.map((p, k) => k === i ? [Math.min(1, Math.max(0, x)), Math.min(1, Math.max(0, y))] : p);
    if (validCorners(next)) { corners = next; message = ''; } else message = say('四角须围成凸四边形', 'The corners must form a convex shape');
    push();
  }
  const reset = () => { corners = contain(size().width / size().height, aspect()); message = ''; push(); save(); };
  handles.forEach((el, i) => {
    el.onpointerdown = event => {
      event.preventDefault(); el.focus(); el.setPointerCapture(event.pointerId);
      const r = board.getBoundingClientRect(), dx = corners[i][0] - (event.clientX - r.left) / r.width, dy = corners[i][1] - (event.clientY - r.top) / r.height;
      el.onpointermove = m => move(i, [(m.clientX - r.left) / r.width + dx, (m.clientY - r.top) / r.height + dy]);
      el.onpointerup = el.onpointercancel = () => { el.onpointermove = el.onpointerup = el.onpointercancel = null; save(); };
    };
    el.onkeydown = event => {
      const step = event.shiftKey ? 10 : 1, dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
      if (!dir) return;
      event.preventDefault(); move(i, [corners[i][0] + dir[0] * step / size().width, corners[i][1] + dir[1] * step / size().height]); save();
    };
  });
  fetch('/api/mapping', { cache: 'no-store' }).then(async response => {
    const body = await response.json();if (!response.ok) throw Error(body.error || `HTTP ${response.status}`);
    if (validCorners(body.mapping?.corners)) corners = body.mapping.corners;
  }).catch(error => { message = say(`无法读取映射：${error.message}`, `Could not read the mapping: ${error.message}`); }).finally(push);
  return {
    // Editing shows the test grid on the canopy; it starts from a centred picture when nothing is mapped yet.
    toggle() { editing = !editing; if (editing && !corners) reset(); else push(); },
    reset,
    off() { corners = null; editing = false; message = ''; push(); save(); },
    // The projector window opened, resized or asked again: answer with the current mapping.
    screen(width, height) { if (width > 0 && height > 0) screen = { width, height }; push(); },
    get state() { return state(); },
  };
}
