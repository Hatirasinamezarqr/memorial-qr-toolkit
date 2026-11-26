import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { QR_ALGORITHM_VERSION, qrCacheSeed } from '../src/cache-key.ts';
import {
  adaptiveDarkAlpha,
  chooseSquareLayout,
  centeredSubjectPlacement,
  centeredFaceGroup,
  faceGroupBounds,
  isFinderProtected,
  isQuietZone,
  organicHoleBounds,
  pointInOrganicHole,
  selectMeaningfulFaces,
  targetFillForFaceCount,
} from '../src/geometry.ts';
import { createQrMatrix, matrixValue } from '../src/qr-matrix.ts';
import { decodesExpectedQr, QR_LUMA_THRESHOLDS } from '../src/qr-decoder.ts';


const face = (x, y, width, height, imageWidth = 1000, imageHeight = 800) => ({ x, y, width, height, imageWidth, imageHeight });

test('subject stays exactly at the QR center despite downward hole padding and edge crops', () => {
  for (const group of [{ x: 10, y: 20, width: 220, height: 260 }, { x: 700, y: 850, width: 250, height: 300 }]) {
    for (const holeScale of [0.55, 1, 1.3]) {
      const hole = { x: 200, y: 400, width: 500 * holeScale, height: 650 * holeScale };
      const source = { x: 0, y: 0, width: 1000, height: 1200 };
      const { destination } = centeredSubjectPlacement(source, group, hole, 1, true);
      const scale = destination.width / source.width;
      assert.ok(Math.abs(destination.x + (group.x + group.width / 2) * scale - 540) < 1e-6);
      assert.ok(Math.abs(destination.y + (group.y + group.height / 2) * scale - 540) < 1e-6);
      assert.ok(destination.x >= 0 && destination.y >= 0);
      assert.ok(destination.x + destination.width <= 1080 + 1e-6);
      assert.ok(destination.y + destination.height <= 1080 + 1e-6);
    }
  }
});

test('protective holes follow the centered subject for single and group portraits', () => {
  for (const faces of [[{ x: 10, y: 700, width: 200, height: 240 }], [{ x: 20, y: 700, width: 180, height: 200 }, { x: 230, y: 710, width: 180, height: 200 }]]) {
    const centered = centeredFaceGroup(faces);
    const bounds = faceGroupBounds(centered);
    assert.equal(bounds.x + bounds.width / 2, 540);
    assert.equal(bounds.y + bounds.height / 2, 540);
    for (const face of centered) assert.equal(pointInOrganicHole(face.x + face.width / 2, face.y + face.height / 2, centered, 1), true);
  }
  assert.deepEqual(centeredFaceGroup([]), []);
});

test('one, two and three meaningful faces are retained left-to-right', () => {
  assert.equal(selectMeaningfulFaces([face(300, 100, 300, 300)]).length, 1);
  const two = selectMeaningfulFaces([face(520, 100, 260, 260), face(120, 110, 280, 280)]);
  assert.deepEqual(two.map((item) => item.x), [120, 520]);
  assert.equal(selectMeaningfulFaces([face(50, 100, 260, 260), face(370, 100, 270, 270), face(700, 110, 250, 250)]).length, 3);
});

test('four or more detected faces are all retained across multiple rows', () => {
  const group = [
    face(90, 80, 190, 190),
    face(390, 95, 180, 180),
    face(700, 75, 200, 200),
    face(170, 360, 150, 150),
    face(430, 350, 145, 145),
    face(690, 370, 135, 135),
  ];
  const selected = selectMeaningfulFaces(group, 800);
  assert.equal(selected.length, group.length);
  assert.deepEqual(new Set(selected.map((item) => item.x)), new Set(group.map((item) => item.x)));
});

test('large groups use a bounded central hole with extra subject margin', () => {
  const faces = [
    { x: 30, y: 90, width: 220, height: 240 },
    { x: 290, y: 80, width: 210, height: 250 },
    { x: 560, y: 100, width: 210, height: 230 },
    { x: 820, y: 90, width: 220, height: 240 },
  ];
  const hole = organicHoleBounds(faces, 1, 1080);
  assert.ok(hole.width <= 1080 * 0.62);
  assert.ok(hole.height <= 1080 * 0.54);
  assert.equal(pointInOrganicHole(hole.x + hole.width / 2, hole.y + hole.height / 2, faces, 1), true);
  assert.equal(targetFillForFaceCount(4), 0.76);
});

test('tiny and implausibly low false-positive faces are rejected', () => {
  const selected = selectMeaningfulFaces([
    face(250, 80, 320, 320),
    face(50, 700, 250, 100),
    face(700, 100, 80, 80),
  ]);
  assert.equal(selected.length, 1);
});

test('portrait, wide, square and edge-face crops stay inside original pixels', () => {
  const cases = [
    { width: 600, height: 1200, faces: [face(180, 30, 220, 260, 600, 1200)] },
    { width: 1800, height: 700, faces: [face(20, 140, 300, 300, 1800, 700)] },
    { width: 900, height: 900, faces: [face(610, 200, 250, 300, 900, 900)] },
  ];
  for (const item of cases) {
    const layout = chooseSquareLayout(item.width, item.height, item.faces, 1080);
    assert.ok(layout.crop.x >= 0 && layout.crop.y >= 0);
    assert.ok(layout.crop.x + layout.crop.width <= item.width);
    assert.ok(layout.crop.y + layout.crop.height <= item.height);
    assert.equal(layout.mappedFaces.length, 1);
  }
});

test('organic single and multi-face holes expose face centers', () => {
  const faces = [{ x: 250, y: 250, width: 240, height: 300 }, { x: 520, y: 260, width: 230, height: 290 }];
  for (const item of faces) assert.equal(pointInOrganicHole(item.x + item.width / 2, item.y + item.height / 2, faces, 1), true);
});

test('border=4 keeps quiet zone and all finder plus separator regions protected', () => {
  const matrix = createQrMatrix('https://example.com/a-very-long-canonical-memorial-url-1940-2026', 4);
  assert.equal(matrix.size > 8, true);
  for (let index = 0; index < matrix.size; index += 1) {
    assert.equal(isQuietZone(0, index, matrix.size, 4), true);
    assert.equal(matrixValue(matrix, 0, index), false);
  }
  assert.equal(isFinderProtected(4, 4, matrix.size, 4), true);
  assert.equal(isFinderProtected(4, matrix.size - 4 - 7, matrix.size, 4), true);
  assert.equal(isFinderProtected(matrix.size - 4 - 7, 4, matrix.size, 4), true);
});

test('adaptive alpha is brightness-aware and clamped to 0.10...0.28', () => {
  assert.equal(adaptiveDarkAlpha([0, 0, 0]), 0.1);
  assert.equal(adaptiveDarkAlpha([255, 255, 255]), 0.28);
  assert.ok(adaptiveDarkAlpha([80, 120, 200]) > adaptiveDarkAlpha([10, 20, 30]));
});

test('group and face-less behavior invalidate prior adaptive QR cache entries', () => {
  assert.equal(QR_ALGORITHM_VERSION, 'photo-qr-v8-centered-protection');
});

test('photo QR validation uses the notebook-compatible luma threshold ladder', () => {
  assert.deepEqual(QR_LUMA_THRESHOLDS, [230, 215, 200, 185]);
  const matrix = createQrMatrix('https://example.com/threshold-validation', 4);
  const scale = 8;
  const size = matrix.size * scale;
  const pixels = new Uint8ClampedArray(size * size * 4);
  for (let row = 0; row < size; row += 1) for (let column = 0; column < size; column += 1) {
    const dark = matrixValue(matrix, Math.floor(row / scale), Math.floor(column / scale));
    const value = dark ? 175 : 248;
    const index = (row * size + column) * 4;
    pixels[index] = value;
    pixels[index + 1] = value;
    pixels[index + 2] = value;
    pixels[index + 3] = 255;
  }
  assert.equal(decodesExpectedQr(pixels, size, size, 'https://example.com/threshold-validation'), true);
});
