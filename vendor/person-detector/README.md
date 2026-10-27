# Person detector

`yolox-tiny-humanart.onnx` is YOLOX-tiny trained by OpenMMLab (mmpose, RTMPose project) on COCO people and Human-Art, exported with mmdeploy including box decoding and non-maximum suppression.

- Source: <https://download.openmmlab.com/mmpose/v1/projects/rtmposev1/onnx_sdk/yolox_tiny_8xb8-300e_humanart-6f3252f9.zip> (`end2end.onnx`, downloaded 2026-10-24).
- SHA-256: `ceb11c07298f95c50d7c5abeb906d03340c85f23aa79e3e66966e7fb6c307250`
- Input `input`: 1 × 3 × 416 × 416, BGR, 0–255, the image scaled to fit at the top left with grey (114) padding. Outputs `dets` (x1, y1, x2, y2, score per person) and `labels`.
- Licence: mmpose is Apache-2.0 (`LICENSE`). The Human-Art training data is offered for non-commercial use; this project is non-commercial coursework.

Run in the browser by ONNX Runtime Web 1.30.0 (`../onnxruntime`, MIT).
