// COCO-SSD performs non-max suppression. Count valid person boxes in the chosen region.
export function selectPeople(predictions, width, height, threshold = .55, inset = 0) {
  if (!Array.isArray(predictions) || !(width > 0 && height > 0)) return [];
  return predictions.filter(p => {
    if (p.class !== 'person' || !Number.isFinite(p.score) || p.score < threshold || p.score > 1 || !Array.isArray(p.bbox) || p.bbox.length !== 4 || !p.bbox.every(Number.isFinite)) return false;
    const [x, y, w, h] = p.bbox, cx = (x + w / 2) / width, cy = (y + h / 2) / height;
    return w > 0 && h > 0 && cx >= inset && cx <= 1 - inset && cy >= inset && cy <= 1 - inset;
  });
}
export class StableCount {
  constructor() { this.value = 0; this.candidate = 0; this.since = 0; }
  update(raw, now) {
    if (!Number.isInteger(raw) || raw < 0 || !Number.isFinite(now)) throw Error('无效检测计数');
    if (raw !== this.candidate) { this.candidate = raw; this.since = now; }
    if (now - this.since >= (raw === 0 ? 1500 : 700)) this.value = raw;
    return this.value;
  }
}
