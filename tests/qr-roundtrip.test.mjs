import assert from 'node:assert/strict';
import test from 'node:test';
import QRCode from 'qrcode';
import { createRequire } from 'node:module';
import { createQrMatrix, matrixValue } from '../src/qr-matrix.ts';
import { decodesExpectedQr } from '../src/qr-decoder.ts';
const require = createRequire(import.meta.url);
// pngjs is qrcode's existing dependency; no extra image processing framework.
const { PNG } = require('pngjs');

test('actual generated PNG decodes to the exact safe URL', async () => {
  const url = 'https://example.com/qr-test?sample=1';
  const png = PNG.sync.read(await QRCode.toBuffer(url, { errorCorrectionLevel: 'H', margin: 4, width: 1080 }));
  assert.equal(decodesExpectedQr(new Uint8ClampedArray(png.data), png.width, png.height, url), true);
  assert.equal(decodesExpectedQr(new Uint8ClampedArray(png.data), png.width, png.height, 'https://example.com/wrong'), false);
});

for (const scale of [3, 6, 12]) test(`retained QR matrix round-trip at ${scale} pixels/module`, () => {
  const url = 'https://example.com'; const matrix = createQrMatrix(url); const size = matrix.size * scale;
  const rgba = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4; const dark = matrixValue(matrix, Math.floor(y / scale), Math.floor(x / scale));
    rgba[i] = rgba[i + 1] = rgba[i + 2] = dark ? 0 : 255; rgba[i + 3] = 255;
  }
  assert.equal(decodesExpectedQr(rgba, size, size, url), true);
});

test('blank RGBA image is rejected', () => {
  assert.equal(decodesExpectedQr(new Uint8ClampedArray(128 * 128 * 4).fill(255), 128, 128, 'https://example.com'), false);
});
