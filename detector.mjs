// Person detection, run as a worker so it never holds up the sky in the control or projector window. YOLOX-tiny trained
// on photos and art of people from every side (vendor/person-detector), run on the CPU by ONNX Runtime Web.
import * as ort from './vendor/onnxruntime/ort.wasm.min.mjs';
ort.env.wasm.wasmPaths = new URL('./vendor/onnxruntime/', import.meta.url).href;
// ponytail: one thread (about 0.2 s a frame on an M1 Pro); more need a cross-origin isolated page (COOP/COEP headers).
ort.env.wasm.numThreads = 1;
const SIZE = 416, session = ort.InferenceSession.create(new URL('./vendor/person-detector/yolox-tiny-humanart.onnx', import.meta.url).href);
const ctx = new OffscreenCanvas(SIZE, SIZE).getContext('2d', { willReadFrequently: true }), input = new Float32Array(3 * SIZE * SIZE);
// { id } answers once the model is ready; { id, bitmap } answers with the people in it: boxes in the bitmap's pixels.
onmessage = async ({ data: { id, bitmap } }) => {
  try {
    const model = await session;
    if (!bitmap) { postMessage({ id }); return; }
    // The model's input: the frame scaled to fit at the top left, grey padding, BGR planes of 0–255.
    const k = SIZE / Math.max(bitmap.width, bitmap.height), n = SIZE * SIZE;
    ctx.fillStyle = 'rgb(114,114,114)'; ctx.fillRect(0, 0, SIZE, SIZE); ctx.drawImage(bitmap, 0, 0, bitmap.width * k, bitmap.height * k); bitmap.close();
    const px = ctx.getImageData(0, 0, SIZE, SIZE).data;
    for (let i = 0; i < n; i++) { input[i] = px[i * 4 + 2]; input[n + i] = px[i * 4 + 1]; input[2 * n + i] = px[i * 4]; }
    const started = performance.now(), { dets } = await model.run({ [model.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, SIZE, SIZE]) }), people = [];
    for (let i = 0; i < dets.dims[1]; i++) {
      const [x1, y1, x2, y2, score] = dets.data.subarray(i * 5, i * 5 + 5);
      if (score >= .2) people.push({ class: 'person', score, bbox: [x1 / k, y1 / k, (x2 - x1) / k, (y2 - y1) / k] });
    }
    postMessage({ id, people, ms: performance.now() - started });
  } catch (error) { bitmap?.close(); postMessage({ id, error: String(error?.message || error) }); }
};
