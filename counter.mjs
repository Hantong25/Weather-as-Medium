// The detector (detector.mjs) already merges overlapping boxes. Count valid person boxes in the chosen region.
export function selectPeople(predictions, width, height, threshold = .5, inset = 0) {
  if (!Array.isArray(predictions) || !(width > 0 && height > 0)) return [];
  return predictions.filter(p => {
    if (p.class !== 'person' || !Number.isFinite(p.score) || p.score < threshold || p.score > 1 || !Array.isArray(p.bbox) || p.bbox.length !== 4 || !p.bbox.every(Number.isFinite)) return false;
    const [x, y, w, h] = p.bbox, cx = (x + w / 2) / width, cy = (y + h / 2) / height;
    return w > 0 && h > 0 && cx >= inset && cx <= 1 - inset && cy >= inset && cy <= 1 - inset;
  });
}
// Debounced count: the median of the counts of the last `window` ms (the lower one of an even number), so a person
// missed or a false detection in single frames changes nothing; a real change counts once it is in most of them.
export class StableCount {
  constructor(window = 3000) { this.window = window; this.samples = []; this.value = 0; }
  update(raw, now) {
    if (!Number.isInteger(raw) || raw < 0 || !Number.isFinite(now)) throw Error('无效检测计数');
    this.samples = [...this.samples.filter(s => now - s.now < this.window), { raw, now }];
    const counts = this.samples.map(s => s.raw).sort((a, b) => a - b);
    return this.value = counts[Math.floor((counts.length - 1) / 2)];
  }
}
