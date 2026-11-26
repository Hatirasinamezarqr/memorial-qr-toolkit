import { File } from 'expo-file-system';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';


import { cacheFile, debugFile, hashKey, localizeImage } from './cache.native';
import { qrCacheSeed } from './cache-key';
import { detectFaces, isFaceDetectorAvailable } from './face-detector.native';
import { HOLE_SCALES, selectMeaningfulFaces, targetFillForFaceCount } from './geometry';
import { createQrMatrix } from './qr-matrix';
import { renderAdaptiveQr, renderPlainQr, type QrDebugFiles } from './renderer.native';
import type { AdaptiveQrDiagnostics, AdaptiveQrFallbackReason, MemorialQrInput, MemorialQrResult, PhotoSource, PreparedPhoto, QrProgressCallback } from './types';

const activeQrJobs = new Map<string, Promise<MemorialQrResult>>();
const completedQrResults = new Map<string, MemorialQrResult>();
const recentFallbacks = new Map<string, { expiresAt: number; result: MemorialQrResult }>();
const FALLBACK_RETRY_DELAY_MS = 60_000;
const MAX_COMPLETED_QR_RESULTS = 16;
let generationSequence = 0;

const reportDebug = (message: string, error?: unknown) => {
  if (__DEV__) console.debug(`[adaptive-qr] ${message}`, error ?? '');
};

function sourcesFromInput(input: MemorialQrInput): PhotoSource[] {
  const sources: PhotoSource[] = [];
  // A draft-local URI is not proof that its bytes match the current server
  // portrait. Delivery failure must not cache an older draft under a new ID.
  if (input.detail.portraitUrl && input.detail.portraitIdentity) {
    sources.push({ identity: input.detail.portraitIdentity, kind: 'portrait', uri: input.detail.portraitUrl });
  }
  sources.push(...input.detail.photoCandidates.slice(0, 2).map((photo) => ({ identity: photo.identity, kind: 'gallery' as const, uri: photo.url })));
  return sources;
}

type PrepareResult = { prepared: PreparedPhoto | null; reason?: AdaptiveQrFallbackReason };

const now = () => globalThis.performance?.now?.() ?? Date.now();
const elapsed = (start: number) => Math.round((now() - start) * 10) / 10;

async function prepareSource(source: PhotoSource, diagnostics: AdaptiveQrDiagnostics): Promise<PrepareResult> {
  let localized: string;
  try {
    const started = now();
    localized = await localizeImage(source.uri, source.identity);
    diagnostics.timings.download = (diagnostics.timings.download ?? 0) + elapsed(started);
  } catch (error) {
    reportDebug(`SOURCE_DOWNLOAD_FAILED (${source.kind}:${source.identity})`, error);
    return { prepared: null, reason: 'SOURCE_DOWNLOAD_FAILED' };
  }
  try {
    const started = now();
    const normalized = await manipulateAsync(localized, [], { compress: 0.95, format: SaveFormat.JPEG });
    diagnostics.timings.normalization = (diagnostics.timings.normalization ?? 0) + elapsed(started);
    const normalizedFile = new File(normalized.uri);
    diagnostics.localFile = normalizedFile.exists && normalizedFile.size > 0;
    if (!diagnostics.localFile) return { prepared: null, reason: 'IMAGE_NORMALIZATION_FAILED' };
    if (!isFaceDetectorAvailable()) {
      diagnostics.mlKit = 'ERROR';
      return { prepared: null, reason: 'FACE_DETECTOR_UNAVAILABLE' };
    }
    diagnostics.mlKit = 'AVAILABLE';
    reportDebug(`[job=${diagnostics.generationId}] MLKit module available; local=${diagnostics.localFile}; input=${normalized.width}x${normalized.height}`);
    let detected;
    try {
      const detectionStarted = now();
      detected = await detectFaces(normalized.uri);
      diagnostics.timings.faceDetection = (diagnostics.timings.faceDetection ?? 0) + elapsed(detectionStarted);
    } catch (error) {
      diagnostics.mlKit = 'ERROR';
      reportDebug(`[job=${diagnostics.generationId}] FACE_DETECTION_FAILED`, error);
      return { prepared: null, reason: error instanceof Error && error.message === 'FACE_DETECTOR_UNAVAILABLE' ? 'FACE_DETECTOR_UNAVAILABLE' : 'FACE_DETECTION_FAILED' };
    }
    diagnostics.detectedFaces = detected.length;
    reportDebug(`[job=${diagnostics.generationId}] MLKit faces=${detected.length}; boxes=${detected.map((face) => `${Math.round(face.x)},${Math.round(face.y)},${Math.round(face.width)},${Math.round(face.height)}`).join('|') || 'none'}`);
    if (!detected.length) {
      diagnostics.selectedFaces = 0;
      // A portrait remains the owner's explicit visual choice even when it
      // contains no detectable face. Keep it as the QR background and render
      // a full, hole-free code instead of silently switching to gallery media.
      if (source.kind === 'portrait') return { prepared: { ...source, faces: [], height: normalized.height, localUri: normalized.uri, width: normalized.width } };
      return { prepared: null, reason: 'NO_FACE_DETECTED' };
    }
    const selectionStarted = now();
    const faces = selectMeaningfulFaces(detected, normalized.height);
    diagnostics.timings.faceSelection = (diagnostics.timings.faceSelection ?? 0) + elapsed(selectionStarted);
    diagnostics.selectedFaces = faces.length;
    if (!faces.length) {
      if (source.kind === 'portrait') return { prepared: { ...source, faces: [], height: normalized.height, localUri: normalized.uri, width: normalized.width } };
      return { prepared: null, reason: 'NO_MEANINGFUL_FACE' };
    }
    return { prepared: { ...source, faces, height: normalized.height, localUri: normalized.uri, width: normalized.width } };
  } catch (error) {
    reportDebug(`IMAGE_NORMALIZATION_FAILED (${source.kind}:${source.identity})`, error);
    return { prepared: null, reason: 'IMAGE_NORMALIZATION_FAILED' };
  }
}

function qrDebugFiles(memorialId: string): { all: File[]; renderer: QrDebugFiles } {
  const files = Array.from({ length: 9 }, (_, index) => debugFile(memorialId, `${String(index + 1).padStart(2, '0')}_${[
    'faces_debug', 'prepared_photo', 'display_mask', 'display_mask_overlay', 'safe_hole', 'safe_hole_overlay', 'subject_fit_photo_with_safe_hole_overlay', 'final_transparent_overlay', 'final_flattened',
  ][index]}.jpg`));
  return {
    all: files,
    renderer: {
      faceDetections: files[0],
      fullFrame: files[2],
      smartCrop: files[1],
      faceHoles: files[3],
      qrPath: files[4],
      safeHoleOverlay: files[5],
      subjectFit: files[6],
      alphaOverlay: files[7],
      flattened: files[8],
    },
  };
}

async function selectSource(sources: PhotoSource[], diagnostics: AdaptiveQrDiagnostics, onState?: QrProgressCallback): Promise<{ prepared: PreparedPhoto | null; reason?: AdaptiveQrFallbackReason }> {
  let lastReason: AdaptiveQrFallbackReason = 'NO_SOURCE_IMAGE';
  const portraits = sources.filter((source) => source.kind === 'portrait');
  for (const portrait of portraits) {
    diagnostics.source = 'PORTRAIT';
    onState?.('detecting-faces', { ...diagnostics });
    const result = await prepareSource(portrait, diagnostics);
    if (result.prepared) return result;
    lastReason = result.reason ?? lastReason;
  }
  const gallery = sources.filter((source) => source.kind === 'gallery');
  const preparedGallery: PreparedPhoto[] = [];
  for (const [index, source] of gallery.entries()) {
    diagnostics.source = index === 0 ? 'GALLERY_1' : 'GALLERY_2';
    onState?.('detecting-faces', { ...diagnostics });
    const result = await prepareSource(source, diagnostics);
    if (result.prepared) preparedGallery.push(result.prepared);
    else lastReason = result.reason ?? lastReason;
  }
  return { prepared: preparedGallery.sort((left, right) => sourceScore(right) - sourceScore(left))[0] ?? null, reason: lastReason };
}

function sourceScore(source: PreparedPhoto): number {
  const primary = [...source.faces].sort((left, right) => right.width * right.height - left.width * left.height)[0];
  const primaryRatio = primary ? (primary.width * primary.height) / (source.width * source.height) : 0;
  return primaryRatio * 100 + Math.min(3, source.faces.length - 1) * 0.5;
}

function sourceLabel(sources: PhotoSource[], source: PhotoSource): AdaptiveQrDiagnostics['source'] {
  if (source.kind === 'portrait') return 'PORTRAIT';
  return sources.filter((item) => item.kind === 'gallery').findIndex((item) => item.identity === source.identity) === 0 ? 'GALLERY_1' : 'GALLERY_2';
}

function rememberCompletedQr(baseKey: string, result: MemorialQrResult) {
  completedQrResults.delete(baseKey);
  completedQrResults.set(baseKey, result);
  if (completedQrResults.size > MAX_COMPLETED_QR_RESULTS) {
    const oldest = completedQrResults.keys().next().value;
    if (oldest) completedQrResults.delete(oldest);
  }
}

async function cachedAdaptiveQr(input: MemorialQrInput, sources: PhotoSource[], diagnostics: AdaptiveQrDiagnostics): Promise<MemorialQrResult | null> {
  if (input.debug) return null;
  for (const source of sources.some(item=>item.kind==='portrait') ? sources.filter(item=>item.kind==='portrait') : sources) {
    const cacheKey = await hashKey(qrCacheSeed(input.detail.id, input.canonicalUrl, source.identity));
    const target = cacheFile(`${cacheKey}-qr.png`);
    if (!target.exists || !target.size) continue;
    diagnostics.cache = 'HIT';
    diagnostics.source = sourceLabel(sources, source);
    diagnostics.status = 'READY';
    diagnostics.totalMs = 0;
    return { adaptive: true, cacheKey, diagnostics: { ...diagnostics }, qrUri: target.uri, sourceIdentity: source.identity };
  }
  return null;
}

async function plainQr(input: MemorialQrInput, baseKey: string, diagnostics?: AdaptiveQrDiagnostics): Promise<MemorialQrResult> {
  const key = await hashKey(qrCacheSeed(input.detail.id, input.canonicalUrl, `plain:${baseKey}`));
  const file = cacheFile(`${key}-qr.png`);
  if (!file.exists || !file.size) await renderPlainQr(createQrMatrix(input.canonicalUrl), input.canonicalUrl, file);
  return { adaptive: false, cacheKey: key, diagnostics, qrUri: file.uri, sourceIdentity: 'plain' };
}

export async function generateMemorialQr(input: MemorialQrInput, onState?: QrProgressCallback): Promise<MemorialQrResult> {
  const sources = sourcesFromInput(input);
  const baseKey = `${input.detail.id}:${input.canonicalUrl}:${sources.map((source) => source.identity).join('|')}`;
  const existing = activeQrJobs.get(baseKey);
  if (existing) {
    reportDebug(`JOIN existing job memorial=${input.detail.id}`);
    return existing;
  }
  const completed = !input.debug ? completedQrResults.get(baseKey) : null;
  if (completed) {
    if(!new File(completed.qrUri).exists){completedQrResults.delete(baseKey);}
    else {
    const diagnostics = completed.diagnostics ? { ...completed.diagnostics, cache: 'HIT' as const, status: 'READY' as const } : undefined;
    const result = { ...completed, diagnostics };
    reportDebug(`REUSE completed QR memorial=${input.detail.id}`);
    onState?.('ready', diagnostics);
    return result;
    }
  }
  const recentFallback = recentFallbacks.get(baseKey);
  if (recentFallback && recentFallback.expiresAt > Date.now()) {
    reportDebug(`REUSE recent fallback memorial=${input.detail.id}`);
    onState?.('fallback', recentFallback.result.diagnostics);
    return recentFallback.result;
  }
  if (recentFallback) recentFallbacks.delete(baseKey);
  const generationId = `${Date.now().toString(36)}-${(++generationSequence).toString(36)}`;
  const diagnostics: AdaptiveQrDiagnostics = { cache: 'MISS', generationId, localFile: false, mlKit: 'NOT_CHECKED', source: 'NONE', status: 'GENERATING', timings: {} };
  const totalStarted = now();
  const fallback = async (reason: AdaptiveQrFallbackReason) => {
    diagnostics.fallbackReason = reason;
    diagnostics.status = 'FALLBACK';
    diagnostics.totalMs = elapsed(totalStarted);
    reportDebug(`[job=${generationId}] FALLBACK: ${reason}; total=${diagnostics.totalMs}ms`);
    onState?.('fallback', { ...diagnostics });
    return plainQr(input, baseKey, { ...diagnostics });
  };
  reportDebug(`[job=${generationId}] START memorial=${input.detail.id}; portrait=${Boolean(input.localPortraitUri || input.detail.portraitUrl)}; gallery=${input.detail.photoCandidates.length}`);
  const job = (async () => {
    try {
      if (!sources.length) {
        onState?.('resolving-source', { ...diagnostics });
        return fallback('NO_SOURCE_IMAGE');
      }
      const cached = await cachedAdaptiveQr(input, sources, diagnostics);
      if (cached) {
        reportDebug(`[job=${generationId}] CACHE HIT before face detection; source=${cached.sourceIdentity}`);
        onState?.('ready', cached.diagnostics);
        return cached;
      }
      onState?.('resolving-source', { ...diagnostics });
      const sourceStarted = now();
      const selection = await selectSource(sources, diagnostics, onState);
      diagnostics.timings.sourceResolution = elapsed(sourceStarted);
      const source = selection.prepared;
      if (!source) {
        return fallback(selection.reason ?? 'NO_MEANINGFUL_FACE');
      }
      diagnostics.source = sourceLabel(sources, source);
      reportDebug(`[job=${generationId}] selectedSource=${source.identity}; kind=${diagnostics.source}`);
      const cacheKey = await hashKey(qrCacheSeed(input.detail.id, input.canonicalUrl, source.identity));
      const target = cacheFile(`${cacheKey}-qr.png`);
      if (target.exists && target.size > 0 && !input.debug) {
        diagnostics.cache = 'HIT';
        diagnostics.status = 'READY';
        diagnostics.totalMs = elapsed(totalStarted);
        onState?.('ready', { ...diagnostics });
        return { adaptive: true, cacheKey, diagnostics: { ...diagnostics }, qrUri: target.uri, sourceIdentity: source.identity };
      }
      onState?.('generating', { ...diagnostics });
      const matrix = createQrMatrix(input.canonicalUrl, 4);
      const debug = (__DEV__ || input.debug) ? qrDebugFiles(input.detail.id) : null;
      const renderStarted = now();
      const success = await renderAdaptiveQr(matrix, input.canonicalUrl, source, target, HOLE_SCALES, debug?.renderer, (attempt) => {
        diagnostics.alpha = attempt.alpha;
        diagnostics.holeScale = attempt.holeScale;
        diagnostics.validation = attempt.validation;
        diagnostics.timings[`holeCandidate_${attempt.contrastRescue ? 'contrast_' : ''}${attempt.holeScale.toFixed(2)}`] = attempt.elapsedMs;
        const shown = (value: boolean | undefined) => value === undefined ? 'not-run' : String(value);
        reportDebug(`[job=${generationId}] holeScale=${attempt.holeScale}; contrastRescue=${attempt.contrastRescue}; alpha=${attempt.alpha}; 100=${shown(attempt.validation.scale100)}; 50=${shown(attempt.validation.scale50)}; 25=${shown(attempt.validation.scale25)}; elapsed=${attempt.elapsedMs}ms`);
        onState?.('validating', { ...diagnostics });
      });
      diagnostics.timings.renderAndValidation = elapsed(renderStarted);
      if (!success) {
        return fallback('FINAL_QR_VALIDATION_FAILED');
      }
      diagnostics.holeScale = success.holeScale;
      diagnostics.validation = success.validation;
      diagnostics.status = 'READY';
      diagnostics.totalMs = elapsed(totalStarted);
      reportDebug(`[job=${generationId}] COMPLETE adaptive=true; hole=${success.holeScale}; total=${diagnostics.totalMs}ms`);
      onState?.('ready', { ...diagnostics });
      return {
        adaptive: true,
        cacheKey,
        diagnostics: { ...diagnostics },
        debugUris: debug?.all.map((file) => file.uri),
        holeScale: success.holeScale,
        qrUri: target.uri,
        sourceIdentity: source.identity,
        targetFill: targetFillForFaceCount(source.faces.length),
      };
    } catch (error) {
      reportDebug(`[job=${generationId}] UNKNOWN_ERROR`, error);
      return fallback(error instanceof Error && /surface|skia|pixel|image_decode/.test(error.message) ? 'SKIA_RENDER_FAILED' : 'UNKNOWN_ERROR');
    }
  })().then((result) => {
    if (!result.adaptive) recentFallbacks.set(baseKey, { expiresAt: Date.now() + FALLBACK_RETRY_DELAY_MS, result });
    else {
      recentFallbacks.delete(baseKey);
      if (!input.debug) rememberCompletedQr(baseKey, result);
    }
    return result;
  }).finally(() => activeQrJobs.delete(baseKey));
  activeQrJobs.set(baseKey, job);
  return job;
}
