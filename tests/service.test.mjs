import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import * as geometry from '../src/geometry.ts';
import { qrCacheSeed } from '../src/cache-key.ts';
import { createQrMatrix } from '../src/qr-matrix.ts';

// Native boundaries are mocks. These tests verify the real service's control
// flow, not ML Kit accuracy, EXIF decoding, native IO or Skia raster output.
function fixture(options = {}) {
  const files = new Set();
  const calls = { adaptive: [], plain: 0, detection: [], normalized: [], localized: [] };
  class File {
    constructor(uri) { this.uri = uri; }
    get exists() { return files.has(this.uri); }
    get size() { return this.exists ? 100 : 0; }
  }
  const imports = {
    'expo-file-system': { File },
    'expo-image-manipulator': { SaveFormat: { JPEG: 'jpeg' }, manipulateAsync: async (uri, actions, settings) => {
      calls.normalized.push({ uri, actions, settings });
      if (options.corrupt) throw Error('invalid image');
      const out = `${uri}-normalized`; files.add(out);
      return { uri: out, width: options.width ?? 1000, height: options.height ?? 800 };
    } },
    './cache.native': {
      hashKey: async value => createHash('sha256').update(value).digest('hex'),
      cacheFile: name => new File(`file:///cache/${name}`),
      debugFile: (_id, name) => new File(`file:///debug/${name}`),
      localizeImage: async uri => {
        calls.localized.push(uri);
        if (options.downloadFailure) throw Error('download failed');
        return uri;
      },
    },
    './cache-key': { qrCacheSeed },
    './face-detector.native': {
      isFaceDetectorAvailable: () => !options.unavailable,
      detectFaces: async uri => {
        calls.detection.push(uri);
        if (options.detectFailure) throw Error('native failure');
        return options.facesByUri ? options.facesByUri(uri) : (options.faces ?? [face(350, 120, 200, 240)]);
      },
    },
    './geometry': geometry,
    './qr-matrix': { createQrMatrix },
    './renderer.native': {
      renderAdaptiveQr: async (_matrix, _url, prepared, target) => {
        calls.adaptive.push(prepared);
        if (options.renderError) throw Error('skia surface unavailable');
        if (options.unsafe) return null;
        files.add(target.uri);
        return { holeScale: 1, validation: { scale100: true, scale50: true, scale25: true } };
      },
      renderPlainQr: async (_matrix, _url, target) => {
        calls.plain++;
        if (options.plainFailure) throw Error('plain_qr_validation_failed');
        files.add(target.uri);
      },
    },
  };
  const module = { exports: {} };
  const source = readFileSync(new URL('../src/service.native.ts', import.meta.url), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { module, exports: module.exports, __DEV__: false, console, performance, Date, Error, require: id => {
      assert.ok(id in imports, `Unexpected dependency: ${id}`); return imports[id];
    } });
  return { ...module.exports, calls, files };
}
const face = (x, y, width, height) => ({ x, y, width, height, imageWidth: 1000, imageHeight: 800 });
const input = (patch = {}) => ({ canonicalUrl: 'https://example.com', detail: {
  id: 'sample', portraitUrl: 'file:///synthetic', portraitIdentity: 'synthetic-v1', photoCandidates: [], ...patch,
} });

for (const [name, faces] of [
  ['single face', [face(350, 120, 200, 240)]],
  ['off-center edge face', [face(0, 0, 150, 180)]],
  ['two faces', [face(100, 150, 200, 240), face(500, 150, 200, 240)]],
  ['group of four', [face(50, 100, 150, 180), face(250, 100, 150, 180), face(450, 100, 150, 180), face(650, 100, 150, 180)]],
  ['no face in portrait', []],
]) test(`mocked native boundary: ${name}`, async () => {
  const f = fixture({ faces }); const result = await f.generateMemorialQr(input());
  assert.equal(result.adaptive, true);
  assert.equal(f.calls.adaptive[0].faces.length, faces.length);
  assert.equal(f.calls.plain, 0);
  assert.equal(f.calls.normalized[0].settings.format, 'jpeg');
  assert.equal(f.calls.normalized[0].settings.compress, 0.95);
});

for (const [name, options, reason] of [
  ['unreadable image', { corrupt: true }, 'IMAGE_NORMALIZATION_FAILED'],
  ['failed download', { downloadFailure: true }, 'SOURCE_DOWNLOAD_FAILED'],
  ['module unavailable', { unavailable: true }, 'FACE_DETECTOR_UNAVAILABLE'],
  ['ML Kit failure', { detectFailure: true }, 'FACE_DETECTION_FAILED'],
  ['unsafe candidate', { unsafe: true }, 'FINAL_QR_VALIDATION_FAILED'],
  ['renderer failure', { renderError: true }, 'SKIA_RENDER_FAILED'],
]) test(`mocked native boundary: ${name} uses observable plain fallback`, async () => {
  const f = fixture(options); const result = await f.generateMemorialQr(input());
  assert.equal(result.adaptive, false);
  assert.equal(result.diagnostics.fallbackReason, reason);
  assert.equal(f.calls.plain, 1);
});

test('no source falls back without face detection; gallery without faces is skipped', async () => {
  const f = fixture(); const result = await f.generateMemorialQr(input({ portraitUrl: null }));
  assert.equal(result.diagnostics.fallbackReason, 'NO_SOURCE_IMAGE');
  assert.equal(f.calls.detection.length, 0);
  const g = fixture({ faces: [] });
  const gallery = await g.generateMemorialQr(input({ portraitUrl: null, photoCandidates: [{ identity: 'gallery-v1', url: 'file:///gallery' }] }));
  assert.equal(gallery.diagnostics.fallbackReason, 'NO_FACE_DETECTED');
});

test('portrait wins; gallery candidates are limited to two and scored by existing rules', async () => {
  const f = fixture();
  await f.generateMemorialQr(input({ photoCandidates: [{ identity: 'gallery', url: 'file:///gallery' }] }));
  assert.equal(f.calls.localized.length, 1);
  const g = fixture({ facesByUri: uri => [face(0, 0, uri.includes('second') ? 300 : 100, 200)] });
  const result = await g.generateMemorialQr(input({ portraitUrl: null, photoCandidates: [
    { identity: 'first', url: 'file:///first' }, { identity: 'second', url: 'file:///second' }, { identity: 'third', url: 'file:///third' },
  ] }));
  assert.equal(result.sourceIdentity, 'second');
  assert.equal(g.calls.detection.length, 2);
});

test('joined jobs, warm cache and new image revision preserve existing semantics', async () => {
  const f = fixture();
  const [a, b] = await Promise.all([f.generateMemorialQr(input()), f.generateMemorialQr(input())]);
  assert.equal(a.qrUri, b.qrUri); assert.equal(f.calls.adaptive.length, 1);
  const cached = await f.generateMemorialQr(input());
  assert.equal(cached.diagnostics.cache, 'HIT'); assert.equal(f.calls.detection.length, 1);
  const changed = await f.generateMemorialQr(input({ portraitIdentity: 'synthetic-v2' }));
  assert.notEqual(changed.cacheKey, a.cacheKey); assert.equal(f.calls.adaptive.length, 2);
});

test('plain render failure rejects instead of reporting a usable QR', async () => {
  const f = fixture({ plainFailure: true });
  await assert.rejects(f.generateMemorialQr(input({ portraitUrl: null })), /plain_qr_validation_failed/);
});
