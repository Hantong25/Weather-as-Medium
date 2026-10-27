import { selectPeople, StableCount } from './counter.mjs?v=2026.10.27.1';

// The person detector runs in a worker (detector.mjs); detect(video) sends it the current frame.
let detectorPromise;
export function loadDetector() {
  if (!detectorPromise) detectorPromise = new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./detector.mjs?v=2026.10.27.1', import.meta.url), { type: 'module' }), waiting = new Map();
    let id = 0;
    const fail = error => { for (const job of waiting.values()) job.reject(error); waiting.clear(); worker.terminate(); detectorPromise = null; reject(error); };
    worker.onmessage = ({ data }) => { const job = waiting.get(data.id); waiting.delete(data.id); if (data.error) job?.reject(Error(data.error)); else job?.resolve(data); };
    worker.onerror = event => { event.preventDefault(); fail(Error(event.message || '人数识别模型无法加载')); };
    const ask = bitmap => new Promise((ok, no) => { waiting.set(++id, { resolve: ok, reject: no }); worker.postMessage({ id, bitmap }, bitmap ? [bitmap] : []); });
    ask(null).then(() => resolve({ async detect(video) { return ask(await createImageBitmap(video)); } }), fail);
  });
  return detectorPromise;
}

export class PeopleCamera {
  constructor(video, overlay, onCount, onError) {
    Object.assign(this, { video, overlay, onCount, onError, stream: null, generation: 0,
      threshold: .5, inset: 0, hold: 3000, active: false, busy: false, startedAt: -Infinity, lastResultAt: 0, raw: 0, stable: 0 });
  }
  async start(deviceId = '') {
    this.stop(); const generation = this.generation;
    if (!navigator.mediaDevices?.getUserMedia) throw Error('摄像头需要 localhost / HTTPS 和支持的浏览器');
    const stream = await navigator.mediaDevices.getUserMedia({ audio: false,
      video: { width: { ideal: 640 }, height: { ideal: 480 }, ...(deviceId ? { deviceId: { ideal: deviceId } } : { facingMode: 'user' }) } });
    if (generation !== this.generation) { stream.getTracks().forEach(t => t.stop()); return false; }
    this.stream = stream; this.video.srcObject = stream;
    try {
      await this.video.play();
      this.video.parentElement.style.aspectRatio = `${this.video.videoWidth} / ${this.video.videoHeight}`;
      this.detector = await loadDetector();
      if (generation !== this.generation) return false;
      this.active = true; this.lastResultAt = performance.now(); this.counter = new StableCount(this.hold); this.lastImageTime = -1;
      for (const track of stream.getVideoTracks()) track.onended = () => {
        if (generation === this.generation) { this.stop(); this.onError('摄像头已断开或权限被撤销'); }
      };
      this.tick(performance.now()); return true;
    } catch (error) { if (generation === this.generation) this.stop(); throw error; }
  }
  stop() {
    this.generation++; this.active = false; this.startedAt = -Infinity;
    this.stream?.getTracks().forEach(track => track.stop()); this.stream = null;
    this.video.srcObject = null; this.raw = 0; this.stable = 0;
    this.overlay.getContext('2d').clearRect(0, 0, this.overlay.width, this.overlay.height);
  }
  // Called by the control window's steady ticker (a worker timer, which keeps its pace while the window is hidden,
  // unlike page timers): one detection a second. The counted people settle slowly anyway (StableCount, then the
  // clouds' fade), and the detector leaves the processor free in between.
  tick(now) {
    if (!this.active || this.busy || now - this.startedAt < 1000) return;
    this.startedAt = now; this.detect(this.generation);
  }
  async detect(generation) {
    if (!this.active || generation !== this.generation) return;
    this.busy = true;
    try {
      if (this.video.readyState >= 2 && this.video.currentTime !== this.lastImageTime) {
        this.lastImageTime = this.video.currentTime;
        const { people, ms } = await this.detector.detect(this.video);
        if (!this.active || generation !== this.generation) return;
        const boxes = selectPeople(people, this.video.videoWidth, this.video.videoHeight, this.threshold, this.inset);
        this.raw = boxes.length; this.lastResultAt = performance.now();
        this.stable = this.counter.update(this.raw, this.lastResultAt); this.drawBoxes(boxes);
        this.onCount({ raw: this.raw, stable: this.stable, boxes, inferenceMs: ms });
      }
    } catch (error) {
      if (generation === this.generation) { this.stop(); this.onError(`人数识别失败：${error.message}`); }
    } finally { this.busy = false; }
  }
  drawBoxes(boxes) {
    const canvas = this.overlay, w = this.video.videoWidth, h = this.video.videoHeight;
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d'); ctx.lineWidth = Math.max(2, w / 260); ctx.font = `${Math.max(14, w / 35)}px Arial`;
    if (this.inset) {
      ctx.fillStyle = '#101d2780'; ctx.fillRect(0, 0, w, h);
      ctx.clearRect(w * this.inset, h * this.inset, w * (1 - 2 * this.inset), h * (1 - 2 * this.inset));
      ctx.strokeStyle = '#ffe5a3'; ctx.strokeRect(w * this.inset, h * this.inset, w * (1 - 2 * this.inset), h * (1 - 2 * this.inset));
    }
    for (const [i, box] of boxes.entries()) {
      const [x, y, bw, bh] = box.bbox; ctx.strokeStyle = '#caffb7'; ctx.strokeRect(x, y, bw, bh);
      const label = `${i + 1} · ${Math.round(box.score * 100)}%`;
      ctx.fillStyle = '#173c2ddd'; ctx.fillRect(x, Math.max(0, y - 25), ctx.measureText(label).width + 12, 25);
      ctx.fillStyle = '#f2ffe8'; ctx.fillText(label, x + 6, Math.max(19, y - 7));
    }
  }
}
