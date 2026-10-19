import { selectPeople, StableCount } from './counter.mjs?v=2026.10.19.2';

let detectorPromise;
function script(src) {
  return new Promise((resolve, reject) => {
    const el = document.createElement('script'); el.src = src;
    el.onload = resolve; el.onerror = () => { el.remove(); reject(Error(`无法加载 ${src}`)); };
    document.head.append(el);
  });
}
export async function loadDetector() {
  if (!detectorPromise) detectorPromise = (async () => {
    if (!window.tf) await script('vendor/tf.min.js');
    if (!window.cocoSsd) await script('vendor/coco-ssd.min.js');
    try { if (!await tf.setBackend('webgl')) throw Error('WebGL backend unavailable'); await tf.ready(); }
    catch { await tf.setBackend('cpu'); await tf.ready(); }
    return cocoSsd.load({ base: 'lite_mobilenet_v2', modelUrl: 'vendor/person-model/model.json' });
  })().catch(error => { detectorPromise = null; throw error; });
  return detectorPromise;
}

export class PeopleCamera {
  constructor(video, overlay, onCount, onError) {
    Object.assign(this, { video, overlay, onCount, onError, stream: null, generation: 0,
      threshold: .55, inset: 0, active: false, lastResultAt: 0, raw: 0, stable: 0 });
  }
  async start(deviceId = '') {
    this.stop(); const generation = this.generation;
    if (!navigator.mediaDevices?.getUserMedia) throw Error('摄像头需要 localhost / HTTPS 和支持的浏览器');
    const stream = await navigator.mediaDevices.getUserMedia({ audio: false,
      video: { width: { ideal: 640 }, height: { ideal: 480 }, ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'user' }) } });
    if (generation !== this.generation) { stream.getTracks().forEach(t => t.stop()); return false; }
    this.stream = stream; this.video.srcObject = stream;
    try {
      await this.video.play();
      this.video.parentElement.style.aspectRatio = `${this.video.videoWidth} / ${this.video.videoHeight}`;
      this.detector = await loadDetector();
      if (generation !== this.generation) return false;
      this.active = true; this.lastResultAt = performance.now(); this.counter = new StableCount(); this.lastImageTime = -1;
      for (const track of stream.getVideoTracks()) track.onended = () => {
        if (generation === this.generation) { this.stop(); this.onError('摄像头已断开或权限被撤销'); }
      };
      this.detect(generation); return true;
    } catch (error) { if (generation === this.generation) this.stop(); throw error; }
  }
  stop() {
    this.generation++; this.active = false; clearTimeout(this.timer);
    this.stream?.getTracks().forEach(track => track.stop()); this.stream = null;
    this.video.srcObject = null; this.raw = 0; this.stable = 0;
    this.overlay.getContext('2d').clearRect(0, 0, this.overlay.width, this.overlay.height);
  }
  async detect(generation) {
    if (!this.active || generation !== this.generation) return;
    try {
      if (this.video.readyState >= 2 && this.video.currentTime !== this.lastImageTime) {
        this.lastImageTime = this.video.currentTime;
        const started = performance.now();
        const predictions = await this.detector.detect(this.video, 100, this.threshold);
        if (!this.active || generation !== this.generation) return;
        const boxes = selectPeople(predictions, this.video.videoWidth, this.video.videoHeight, this.threshold, this.inset);
        this.raw = boxes.length; this.lastResultAt = performance.now();
        this.stable = this.counter.update(this.raw, this.lastResultAt); this.drawBoxes(boxes);
        this.onCount({ raw: this.raw, stable: this.stable, boxes, inferenceMs: this.lastResultAt - started });
      }
      this.timer = setTimeout(() => this.detect(generation), 220);
    } catch (error) {
      if (generation === this.generation) { this.stop(); this.onError(`人数识别失败：${error.message}`); }
    }
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
