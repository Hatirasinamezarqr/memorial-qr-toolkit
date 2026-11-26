import {
  AlphaType,
  ColorType,
  FilterMode,
  ImageFormat,
  MipmapMode,
  Skia,
  TileMode,
  type SkCanvas,
  type SkImage,
} from '@shopify/react-native-skia';
import { File } from 'expo-file-system';

import { adaptiveDarkAlpha, centeredFaceGroup, centeredSubjectPlacement, chooseSquareLayout, faceGroupBounds, isFinderProtected, isQuietZone, organicHoleBounds, pointInOrganicHole, type Rect } from './geometry';
import { decodesExpectedQr } from './qr-decoder';
import { matrixValue, type QrMatrix } from './qr-matrix';
import type { AdaptiveQrDiagnostics, PreparedPhoto } from './types';

const QR_CANVAS_SIZE = 1080;
const CREAM = '#F8F5EF';
const MODULE_BLUE = '#7A8A9A';
const FINDER_GREEN = '#31523F';

type RenderedCandidate = { alpha: number; image: SkImage; pixels: Uint8Array; size: number };
type ValidationResult = NonNullable<AdaptiveQrDiagnostics['validation']>;
export type QrDebugFiles = {
  faceDetections: File;
  fullFrame: File;
  smartCrop: File;
  faceHoles: File;
  qrPath: File;
  safeHoleOverlay: File;
  subjectFit: File;
  alphaOverlay: File;
  flattened: File;
};

function paint(color: string, alpha = 1) {
  const result = Skia.Paint();
  result.setColor(Skia.Color(color));
  result.setAlphaf(alpha);
  result.setAntiAlias(false);
  return result;
}

function vividPhotoPaint() {
  const saturation = 1.07;
  const inverse = 1 - saturation;
  const result = Skia.Paint();
  result.setAntiAlias(true);
  result.setColorFilter(Skia.ColorFilter.MakeMatrix([
    inverse * 0.213 + saturation, inverse * 0.715, inverse * 0.072, 0, 0,
    inverse * 0.213, inverse * 0.715 + saturation, inverse * 0.072, 0, 0,
    inverse * 0.213, inverse * 0.715, inverse * 0.072 + saturation, 0, 0,
    0, 0, 0, 1, 0,
  ]));
  return result;
}

async function loadImage(uri: string): Promise<SkImage> {
  const bytes = await new File(uri).bytes();
  const image = Skia.Image.MakeImageFromEncoded(Skia.Data.fromBytes(bytes));
  if (!image) throw new Error('image_decode_failed');
  return image;
}

function drawPreparedPhoto(canvas: SkCanvas, image: SkImage, prepared: PreparedPhoto): Rect[] {
  if (!prepared.faces.length) {
    drawFacelessPhoto(canvas, image);
    return [];
  }
  const layout = chooseSquareLayout(prepared.width, prepared.height, prepared.faces, QR_CANVAS_SIZE);
  const imagePaint = Skia.Paint();
  imagePaint.setAntiAlias(true);
  if (layout.crop.width !== layout.crop.height) {
    const group = faceGroupBounds(prepared.faces);
    drawBlurredCover(canvas, image, group.x + group.width / 2, group.y + group.height / 2);
    canvas.drawImageRectOptions(image, Skia.XYWHRect(0, 0, image.width(), image.height()), Skia.XYWHRect(layout.destination.x, layout.destination.y, layout.destination.width, layout.destination.height), FilterMode.Linear, MipmapMode.None, imagePaint);
  } else {
    canvas.drawImageRectOptions(image, Skia.XYWHRect(layout.crop.x, layout.crop.y, layout.crop.width, layout.crop.height), Skia.XYWHRect(0, 0, QR_CANVAS_SIZE, QR_CANVAS_SIZE), FilterMode.Linear, MipmapMode.None, imagePaint);
  }
  return layout.mappedFaces;
}

const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));

function drawBlurredCover(canvas: SkCanvas, image: SkImage, subjectX: number, subjectY: number) {
  const coverScale = Math.max(QR_CANVAS_SIZE / image.width(), QR_CANVAS_SIZE / image.height());
  const sourceWidth = QR_CANVAS_SIZE / coverScale;
  const sourceHeight = QR_CANVAS_SIZE / coverScale;
  const sourceX = clamp(subjectX - sourceWidth / 2, 0, image.width() - sourceWidth);
  const sourceY = clamp(subjectY - sourceHeight / 2, 0, image.height() - sourceHeight);
  const source = Skia.XYWHRect(sourceX, sourceY, sourceWidth, sourceHeight);
  const destination = Skia.XYWHRect(0, 0, QR_CANVAS_SIZE, QR_CANVAS_SIZE);
  const blurPaint = Skia.Paint();
  blurPaint.setImageFilter(Skia.ImageFilter.MakeBlur(30, 30, TileMode.Clamp));
  canvas.drawImageRectOptions(image, source, destination, FilterMode.Linear, MipmapMode.None, blurPaint);
  const mixPaint = Skia.Paint();
  mixPaint.setAlphaf(0.08);
  canvas.drawImageRectOptions(image, source, destination, FilterMode.Linear, MipmapMode.None, mixPaint);
}

function drawFacelessPhoto(canvas: SkCanvas, image: SkImage) {
  drawBlurredCover(canvas, image, image.width() / 2, image.height() / 2);
  const containScale = Math.min(QR_CANVAS_SIZE / image.width(), QR_CANVAS_SIZE / image.height());
  const width = image.width() * containScale;
  const height = image.height() * containScale;
  canvas.drawImageRectOptions(
    image,
    Skia.XYWHRect(0, 0, image.width(), image.height()),
    Skia.XYWHRect((QR_CANVAS_SIZE - width) / 2, (QR_CANVAS_SIZE - height) / 2, width, height),
    FilterMode.Linear,
    MipmapMode.None,
    vividPhotoPaint(),
  );
}

function drawSubjectFitPhoto(canvas: SkCanvas, image: SkImage, prepared: PreparedPhoto, hole: Rect) {
  const originalGroup = faceGroupBounds(prepared.faces);
  const originalCenterX = originalGroup.x + originalGroup.width / 2;
  const originalCenterY = originalGroup.y + originalGroup.height / 2;
  const fit = (source: Rect, group: Rect, allowUpscale: boolean) => {
    const placement = centeredSubjectPlacement(source, group, hole, prepared.faces.length, allowUpscale, QR_CANVAS_SIZE);
    const { x, y, width, height } = placement.destination;
    return { ...placement, destination: Skia.XYWHRect(x, y, width, height) };
  };

  const fullSource = { x: 0, y: 0, width: image.width(), height: image.height() };
  let placement = fit(fullSource, originalGroup, false);
  if (placement.scaleRatio < 0.92 || placement.maxMargin > 0.18) {
    const side = Math.min(image.width(), image.height());
    const crop = {
      x: clamp(originalCenterX - side / 2, 0, image.width() - side),
      y: clamp(originalCenterY - side / 2, 0, image.height() - side),
      width: side,
      height: side,
    };
    placement = fit(crop, originalGroup, true);
  }
  drawBlurredCover(canvas, image, originalCenterX, originalCenterY);
  canvas.drawImageRectOptions(image, Skia.XYWHRect(placement.source.x, placement.source.y, placement.source.width, placement.source.height), placement.destination, FilterMode.Linear, MipmapMode.None, vividPhotoPaint());
  const scale = placement.destination.width / placement.source.width;
  return prepared.faces.map(face => ({ x: placement.destination.x + (face.x - placement.source.x) * scale,
    y: placement.destination.y + (face.y - placement.source.y) * scale, width: face.width * scale, height: face.height * scale }));
}

function rgbaSnapshot(surface: NonNullable<ReturnType<typeof Skia.Surface.MakeOffscreen>>, width: number, height = width): Uint8Array {
  surface.flush();
  const image = surface.makeImageSnapshot();
  const pixels = image.readPixels(0, 0, { alphaType: AlphaType.Unpremul, colorType: ColorType.RGBA_8888, height, width });
  image.dispose();
  if (!pixels || pixels instanceof Float32Array) throw new Error('pixel_read_failed');
  return pixels;
}

function darkModuleLuminances(pixels: Uint8Array, matrix: QrMatrix, moduleSize: number, offset: number, mappedFaces: Rect[], holeScale: number): number[] {
  const values: number[] = [];
  for (let row = matrix.border; row < matrix.size - matrix.border; row += 1) {
    for (let column = matrix.border; column < matrix.size - matrix.border; column += 1) {
      const centerX = offset + (column + 0.5) * moduleSize;
      const centerY = offset + (row + 0.5) * moduleSize;
      if (!matrixValue(matrix, row, column) || isFinderProtected(row, column, matrix.size, matrix.border) || pointInOrganicHole(centerX, centerY, mappedFaces, holeScale)) continue;
      let luma = 0;
      let count = 0;
      for (let y = offset + row * moduleSize; y < offset + (row + 1) * moduleSize; y += 2) {
        for (let x = offset + column * moduleSize; x < offset + (column + 1) * moduleSize; x += 2) {
          const index = (Math.min(QR_CANVAS_SIZE - 1, y) * QR_CANVAS_SIZE + Math.min(QR_CANVAS_SIZE - 1, x)) * 4;
          luma += 0.2126 * pixels[index] + 0.7152 * pixels[index + 1] + 0.0722 * pixels[index + 2];
          count += 1;
        }
      }
      values.push(luma / Math.max(1, count));
    }
  }
  return values;
}

function renderQrModules(canvas: SkCanvas, matrix: QrMatrix, mappedFaces: Rect[], holeScale: number, backgroundPixels: Uint8Array, plain: boolean, minimumAlpha = 0) {
  const moduleSize = Math.floor(QR_CANVAS_SIZE / matrix.size);
  const qrPixelSize = moduleSize * matrix.size;
  const offset = Math.floor((QR_CANVAS_SIZE - qrPixelSize) / 2);
  const alpha = plain ? 1 : Math.max(minimumAlpha, adaptiveDarkAlpha(darkModuleLuminances(backgroundPixels, matrix, moduleSize, offset, mappedFaces, holeScale)));
  const cream = paint(CREAM);
  const normalDark = paint(plain ? FINDER_GREEN : MODULE_BLUE, alpha);
  const finderDark = paint(FINDER_GREEN, alpha);
  for (let row = 0; row < matrix.size; row += 1) {
    for (let column = 0; column < matrix.size; column += 1) {
      const protectedZone = isFinderProtected(row, column, matrix.size, matrix.border) || isQuietZone(row, column, matrix.size, matrix.border);
      const centerX = offset + (column + 0.5) * moduleSize;
      const centerY = offset + (row + 0.5) * moduleSize;
      if (!plain && !protectedZone && pointInOrganicHole(centerX, centerY, mappedFaces, holeScale)) continue;
      const rect = Skia.XYWHRect(offset + column * moduleSize, offset + row * moduleSize, moduleSize, moduleSize);
      if (matrixValue(matrix, row, column)) canvas.drawRect(rect, isFinderProtected(row, column, matrix.size, matrix.border) ? finderDark : normalDark);
      else canvas.drawRect(rect, cream);
    }
  }
  return alpha;
}

function renderCandidate(matrix: QrMatrix, photo: SkImage | null, prepared: PreparedPhoto | null, holeScale: number, minimumAlpha = 0): RenderedCandidate {
  const surface = Skia.Surface.MakeOffscreen(QR_CANVAS_SIZE, QR_CANVAS_SIZE);
  if (!surface) throw new Error('surface_unavailable');
  const canvas = surface.getCanvas();
  canvas.clear(Skia.Color(CREAM));
  let mappedFaces = photo && prepared ? centeredFaceGroup(drawPreparedPhoto(canvas, photo, prepared), QR_CANVAS_SIZE) : [];
  if (photo && prepared) {
    canvas.clear(Skia.Color(CREAM));
    if (prepared.faces.length) mappedFaces = drawSubjectFitPhoto(canvas, photo, prepared, organicHoleBounds(mappedFaces, holeScale));
    else drawFacelessPhoto(canvas, photo);
    // Apply the same contrast treatment regardless of whether the source is
    // the portrait or the gallery fallback selected after portrait removal.
    // The final multi-scale decoder validation remains the acceptance gate.
    canvas.drawRect(Skia.XYWHRect(0, 0, QR_CANVAS_SIZE, QR_CANVAS_SIZE), paint('#13231C', 0.18));
  }
  const photoPixels = rgbaSnapshot(surface, QR_CANVAS_SIZE);
  const alpha = renderQrModules(canvas, matrix, mappedFaces, holeScale, photoPixels, !photo || !prepared, minimumAlpha);
  const pixels = rgbaSnapshot(surface, QR_CANVAS_SIZE);
  const image = surface.makeImageSnapshot();
  surface.dispose();
  return { alpha, image, pixels, size: QR_CANVAS_SIZE };
}

function writeDebugSurface(surface: NonNullable<ReturnType<typeof Skia.Surface.MakeOffscreen>>, target: File) {
  surface.flush();
  const snapshot = surface.makeImageSnapshot();
  target.create({ intermediates: true, overwrite: true });
  target.write(snapshot.encodeToBytes(ImageFormat.JPEG, 92));
  snapshot.dispose();
  surface.dispose();
}

function renderPhotoDebug(image: SkImage, prepared: PreparedPhoto, targets: QrDebugFiles) {
  const makeSurface = () => {
    const surface = Skia.Surface.MakeOffscreen(QR_CANVAS_SIZE, QR_CANVAS_SIZE);
    if (!surface) throw new Error('debug_surface_unavailable');
    surface.getCanvas().clear(Skia.Color(CREAM));
    return surface;
  };
  const fullFrame = makeSurface();
  const containScale = Math.min(QR_CANVAS_SIZE / image.width(), QR_CANVAS_SIZE / image.height());
  const containedWidth = image.width() * containScale;
  const containedHeight = image.height() * containScale;
  fullFrame.getCanvas().drawImageRectOptions(image, Skia.XYWHRect(0, 0, image.width(), image.height()), Skia.XYWHRect((QR_CANVAS_SIZE - containedWidth) / 2, (QR_CANVAS_SIZE - containedHeight) / 2, containedWidth, containedHeight), FilterMode.Linear, MipmapMode.None, Skia.Paint());
  writeDebugSurface(fullFrame, targets.fullFrame);

  const smartCrop = makeSurface();
  const mappedFaces = drawPreparedPhoto(smartCrop.getCanvas(), image, prepared);
  writeDebugSurface(smartCrop, targets.smartCrop);

  const detections = makeSurface();
  const detectedFaces = drawPreparedPhoto(detections.getCanvas(), image, prepared);
  const detectionPaint = paint('#E55353', 0.42);
  detectedFaces.forEach((face) => detections.getCanvas().drawRect(Skia.XYWHRect(face.x, face.y, face.width, face.height), detectionPaint));
  writeDebugSurface(detections, targets.faceDetections);

  const holes = makeSurface();
  drawPreparedPhoto(holes.getCanvas(), image, prepared);
  mappedFaces.forEach((face) => holes.getCanvas().drawOval(Skia.XYWHRect(face.x - face.width * 0.18, face.y - face.height * 0.08, face.width * 1.36, face.height * 1.43), paint('#F8F5EF', 0.36)));
  writeDebugSurface(holes, targets.faceHoles);
}

const yieldToUi = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function resizedPixels(candidate: RenderedCandidate, size: number): Uint8ClampedArray {
  if (size === candidate.size) return new Uint8ClampedArray(candidate.pixels);
  const surface = Skia.Surface.MakeOffscreen(size, size);
  if (!surface) throw new Error('validation_surface_unavailable');
  surface.getCanvas().drawImageRectOptions(candidate.image, Skia.XYWHRect(0, 0, candidate.size, candidate.size), Skia.XYWHRect(0, 0, size, size), FilterMode.Linear, MipmapMode.None, Skia.Paint());
  const pixels = rgbaSnapshot(surface, size);
  surface.dispose();
  return new Uint8ClampedArray(pixels);
}

export async function validateQr(candidate: RenderedCandidate, expectedValue: string): Promise<ValidationResult> {
  const result: ValidationResult = {};
  // Reject unsafe holes at the cheapest resolution first. A candidate is
  // still accepted only when all three notebook scales decode successfully.
  for (const ratio of [0.25, 0.5, 1] as const) {
    await yieldToUi();
    const size = Math.round(candidate.size * ratio);
    const pixels = resizedPixels(candidate, size);
    const passed = decodesExpectedQr(pixels, size, size, expectedValue);
    if (ratio === 1) result.scale100 = passed;
    if (ratio === 0.5) result.scale50 = passed;
    if (ratio === 0.25) result.scale25 = passed;
    if (!passed) return result;
  }
  return result;
}

export async function renderAdaptiveQr(matrix: QrMatrix, payload: string, prepared: PreparedPhoto, target: File, scales: readonly number[], debug?: QrDebugFiles, onAttempt?: (attempt: { alpha?: number; contrastRescue: boolean; elapsedMs: number; holeScale: number; validation: ValidationResult }) => void): Promise<{ holeScale: number; validation: ValidationResult } | null> {
  const image = await loadImage(prepared.localUri);
  try {
    if (debug) renderPhotoDebug(image, prepared, debug);
    const attempts = prepared.faces.length === 0
      ? [
          // A face-less portrait intentionally has no missing QR modules.
          // Strong modules keep it readable while the selected portrait stays
          // visible as the background instead of being replaced by gallery art.
          { contrastRescue: true, minimumAlpha: 0.78, scale: 0 },
          { contrastRescue: true, minimumAlpha: 0.9, scale: 0 },
        ]
      : [
          ...scales.map((scale) => ({ contrastRescue: false, minimumAlpha: 0, scale })),
          // Preserve the vivid-photo treatment first. If every normal hole size
          // fails decoding, retain the face-aware hole but strengthen only the QR
          // modules. The same three-scale decoder remains the acceptance gate.
          ...scales.filter((scale) => scale <= 1).map((scale) => ({ contrastRescue: true, minimumAlpha: 0.78, scale })),
        ];
    for (const { contrastRescue, minimumAlpha, scale } of attempts) {
      await yieldToUi();
      const attemptStarted = globalThis.performance?.now?.() ?? Date.now();
      const candidate = renderCandidate(matrix, image, prepared, scale, minimumAlpha);
      try {
        const validation = await validateQr(candidate, payload);
        onAttempt?.({ alpha: candidate.alpha, contrastRescue, elapsedMs: Math.round(((globalThis.performance?.now?.() ?? Date.now()) - attemptStarted) * 10) / 10, holeScale: scale, validation });
        if (!validation.scale100 || !validation.scale50 || !validation.scale25) {
          if (__DEV__ && debug && contrastRescue && scale === scales.at(-1)) {
            debug.flattened.create({ intermediates: true, overwrite: true });
            debug.flattened.write(candidate.image.encodeToBytes(ImageFormat.PNG, 100));
          }
          continue;
        }
        target.create({ intermediates: true, overwrite: true });
        const bytes = candidate.image.encodeToBytes(ImageFormat.PNG, 100);
        target.write(bytes);
        if (debug) {
          for (const file of [debug.qrPath, debug.safeHoleOverlay, debug.subjectFit, debug.alphaOverlay, debug.flattened]) {
            file.create({ intermediates: true, overwrite: true });
            file.write(bytes);
          }
        }
        return { holeScale: scale, validation };
      } finally {
        candidate.image.dispose();
      }
    }
    return null;
  } finally {
    image.dispose();
  }
}

export async function renderPlainQr(matrix: QrMatrix, payload: string, target: File): Promise<void> {
  const candidate = renderCandidate(matrix, null, null, 0);
  try {
    const validation = await validateQr(candidate, payload);
    if (!validation.scale100 || !validation.scale50 || !validation.scale25) throw new Error('plain_qr_validation_failed');
    target.create({ intermediates: true, overwrite: true });
    target.write(candidate.image.encodeToBytes(ImageFormat.PNG, 100));
  } finally {
    candidate.image.dispose();
  }
}
