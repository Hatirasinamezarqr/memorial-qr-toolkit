import type { DetectedFace } from './types';

export const MIN_FACE_RELATIVE_AREA = 0.42;
export const HOLE_SCALES = [1.3, 1.25, 1.2, 1.15, 1.1, 1.05, 1, 0.95, 0.9, 0.85, 0.8, 0.75, 0.7, 0.65, 0.6, 0.55] as const;

export type Rect = { height: number; width: number; x: number; y: number };
export type ImageLayout = { crop: Rect; destination: Rect; mappedFaces: Rect[] };

const area = (rect: Rect) => Math.max(0, rect.width) * Math.max(0, rect.height);

export function selectMeaningfulFaces(faces: DetectedFace[], imageHeight = Number.POSITIVE_INFINITY): DetectedFace[] {
  if (!faces.length) return [];
  const ordered = [...faces].filter((face) => face.width > 0 && face.height > 0).sort((left, right) => area(right) - area(left));
  // Group portraits commonly contain smaller faces in a second row. Once
  // ML Kit has found four or more valid rectangles, retaining only the three
  // largest makes the subject-fit crop and QR hole describe different people.
  // Keep the complete detected group and let the bounded group-hole renderer
  // protect QR readability instead of silently dropping faces.
  if (ordered.length >= 4) {
    return ordered.sort((left, right) => {
      const rowDistance = (left.y + left.height / 2) - (right.y + right.height / 2);
      const rowTolerance = Math.min(left.height, right.height) * 0.5;
      return Math.abs(rowDistance) <= rowTolerance ? left.x - right.x : rowDistance;
    });
  }
  const primary = ordered[0];
  if (!primary) return [];
  const primaryArea = area(primary);
  const primaryCenterX = primary.x + primary.width / 2;
  const primaryCenterY = primary.y + primary.height / 2;
  const selected = [primary];
  for (const face of ordered.slice(1)) {
    const relativeArea = area(face) / primaryArea;
    const centerX = face.x + face.width / 2;
    const centerY = face.y + face.height / 2;
    const verticalDistance = Math.abs(centerY - primaryCenterY) / Math.max(primary.height, face.height);
    const horizontalDistance = Math.abs(centerX - primaryCenterX) / primary.width;
    const tooLowInImage = face.y > imageHeight * 0.82;
    if (relativeArea >= MIN_FACE_RELATIVE_AREA && verticalDistance <= 1.1 && horizontalDistance <= 2.6 && !tooLowInImage) {
      selected.push(face);
    }
  }
  return selected.sort((left, right) => left.x - right.x);
}

export function faceGroupBounds(faces: Rect[]): Rect {
  const left = Math.min(...faces.map((face) => face.x));
  const top = Math.min(...faces.map((face) => face.y));
  const right = Math.max(...faces.map((face) => face.x + face.width));
  const bottom = Math.max(...faces.map((face) => face.y + face.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export function centeredFaceGroup(faces: Rect[], canvasSize = 1080): Rect[] {
  if (!faces.length) return [];
  const bounds = faceGroupBounds(faces);
  const dx = canvasSize / 2 - (bounds.x + bounds.width / 2);
  const dy = canvasSize / 2 - (bounds.y + bounds.height / 2);
  return faces.map(face => ({ ...face, x: face.x + dx, y: face.y + dy }));
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** Center the detected subject, even when the protective hole extends below it. */
export function centeredSubjectPlacement(source: Rect, group: Rect, hole: Rect, faceCount: number, allowUpscale: boolean, canvasSize = 1080) {
  const target = canvasSize / 2;
  const subjectX = group.x - source.x + group.width / 2;
  const subjectY = group.y - source.y + group.height / 2;
  const margin = faceCount <= 1 ? 0.03 : faceCount === 2 ? 0.04 : 0.05;
  const fill = targetFillForFaceCount(faceCount);
  const containScale = Math.min(canvasSize / source.width, canvasSize / source.height);
  const faceFitScale = Math.min(hole.width * fill / (group.width * (1 + 2 * margin)), hole.height * fill / (group.height * (1 + 2 * margin)));
  const alignmentScale = Math.min(
    target / Math.max(subjectX, 1e-6), target / Math.max(source.width - subjectX, 1e-6),
    target / Math.max(subjectY, 1e-6), target / Math.max(source.height - subjectY, 1e-6),
  );
  const scale = Math.max(1e-4, Math.min(containScale, faceFitScale, alignmentScale, allowUpscale ? Infinity : 1));
  const width = source.width * scale;
  const height = source.height * scale;
  const x = clamp(target - subjectX * scale, 0, canvasSize - width);
  const y = clamp(target - subjectY * scale, 0, canvasSize - height);
  return {
    destination: { x, y, width, height }, source,
    scaleRatio: scale / Math.max(containScale, 1e-6),
    maxMargin: Math.max(x, y, canvasSize - x - width, canvasSize - y - height) / canvasSize,
  };
}

export function chooseSquareLayout(imageWidth: number, imageHeight: number, faces: DetectedFace[], canvasSize: number): ImageLayout {
  const side = Math.min(imageWidth, imageHeight);
  const group = faceGroupBounds(faces);
  const centerX = group.x + group.width / 2;
  const centerY = group.y + group.height / 2;
  const containScale = Math.min(canvasSize / imageWidth, canvasSize / imageHeight);
  const target = canvasSize / 2;
  const alignmentScale = Math.min(
    target / Math.max(centerX, 1e-6),
    (canvasSize - target) / Math.max(imageWidth - centerX, 1e-6),
    target / Math.max(centerY, 1e-6),
    (canvasSize - target) / Math.max(imageHeight - centerY, 1e-6),
  );
  const fullScale = Math.max(1e-4, Math.min(containScale, alignmentScale));
  const fullWidth = imageWidth * fullScale;
  const fullHeight = imageHeight * fullScale;
  const fullX = clamp(target - centerX * fullScale, 0, canvasSize - fullWidth);
  const fullY = clamp(target - centerY * fullScale, 0, canvasSize - fullHeight);
  const maxMargin = Math.max(fullX, fullY, canvasSize - fullX - fullWidth, canvasSize - fullY - fullHeight) / canvasSize;
  const keepFullFrame = fullScale / Math.max(containScale, 1e-9) >= 0.92 && maxMargin <= 0.18;
  let crop: Rect;
  let destination: Rect;
  if (keepFullFrame) {
    crop = { x: 0, y: 0, width: imageWidth, height: imageHeight };
    destination = { x: fullX, y: fullY, width: fullWidth, height: fullHeight };
  } else {
    crop = {
      x: clamp(centerX - side / 2, 0, imageWidth - side),
      y: clamp(centerY - side / 2, 0, imageHeight - side),
      width: side,
      height: side,
    };
    destination = { x: 0, y: 0, width: canvasSize, height: canvasSize };
  }
  const scale = destination.width / crop.width;
  return {
    crop,
    destination,
    mappedFaces: faces.map((face) => ({
      x: destination.x + (face.x - crop.x) * scale,
      y: destination.y + (face.y - crop.y) * scale,
      width: face.width * scale,
      height: face.height * scale,
    })),
  };
}

export function pointInOrganicHole(x: number, y: number, faces: Rect[], scale: number): boolean {
  if (!faces.length) return false;
  if (faces.length >= 4) {
    const hole = boundedGroupHole(faces, scale);
    const radius = Math.min(hole.width, hole.height) * 0.16;
    const nearestX = clamp(x, hole.x + radius, hole.x + hole.width - radius);
    const nearestY = clamp(y, hole.y + radius, hole.y + hole.height - radius);
    return (x - nearestX) ** 2 + (y - nearestY) ** 2 <= radius ** 2;
  }
  const canvasCenter = 540;
  const unscaledX = canvasCenter + (x - canvasCenter) / scale;
  const unscaledY = canvasCenter + (y - canvasCenter) / scale;
  const ellipses = faces.map((face) => {
    const centerX = face.x + face.width / 2;
    const centerY = face.y + face.height / 2;
    return { bridgeSize: Math.max(face.width, face.height), centerX, centerY, radiusX: face.width * 0.66 + 11, radiusY: face.height * 0.675 + 16 };
  });
  if (ellipses.some(({ centerX, centerY, radiusX, radiusY }) => {
    const dx = (unscaledX - centerX) / Math.max(1, radiusX);
    const dy = (unscaledY - centerY) / Math.max(1, radiusY + 9);
    return dx * dx + dy * dy <= 1;
  })) return true;

  const ordered = [...ellipses].sort((left, right) => left.centerX - right.centerX);
  return ordered.slice(0, -1).some((start, index) => {
    const end = ordered[index + 1];
    if (!end) return false;
    const vx = end.centerX - start.centerX;
    const vy = end.centerY - start.centerY;
    const lengthSquared = vx * vx + vy * vy;
    const t = lengthSquared ? clamp(((unscaledX - start.centerX) * vx + (unscaledY - start.centerY) * vy) / lengthSquared, 0, 1) : 0;
    const px = start.centerX + t * vx;
    const py = start.centerY + t * vy;
    const bridgeRadius = Math.max(8, (start.bridgeSize + end.bridgeSize) / 6 + 11);
    return (unscaledX - px) ** 2 + (unscaledY - py) ** 2 <= bridgeRadius ** 2;
  });
}

export function organicHoleBounds(faces: Rect[], scale: number, canvasSize = 1080): Rect {
  if (!faces.length) return { x: canvasSize * 0.27, y: canvasSize * 0.27, width: canvasSize * 0.46, height: canvasSize * 0.46 };
  if (faces.length >= 4) return boundedGroupHole(faces, scale, canvasSize);
  const left = Math.min(...faces.map((face) => face.x - face.width * 0.16 - 11));
  const top = Math.min(...faces.map((face) => face.y + face.height / 2 - face.height * 0.675 - 25));
  const right = Math.max(...faces.map((face) => face.x + face.width * 1.16 + 11));
  const bottom = Math.max(...faces.map((face) => face.y + face.height / 2 + face.height * 0.675 + 25));
  const center = canvasSize / 2;
  const x = center + (left - center) * scale;
  const y = center + (top - center) * scale;
  return { x, y, width: (right - left) * scale, height: (bottom - top) * scale };
}

export function targetFillForFaceCount(count: number): number {
  return count === 0 ? 0 : count === 1 ? 0.94 : count === 2 ? 0.9 : count === 3 ? 0.86 : 0.76;
}

function boundedGroupHole(faces: Rect[], scale: number, canvasSize = 1080): Rect {
  const group = faceGroupBounds(faces);
  const paddedWidth = group.width + Math.max(40, group.width * 0.16);
  const paddedHeight = group.height + Math.max(52, group.height * 0.24);
  const baseWidth = Math.min(paddedWidth, canvasSize * 0.62);
  const baseHeight = Math.min(paddedHeight, canvasSize * 0.54);
  const width = Math.max(1, baseWidth * scale);
  const height = Math.max(1, baseHeight * scale);
  const centerX = clamp(group.x + group.width / 2, width / 2, canvasSize - width / 2);
  const centerY = clamp(group.y + group.height / 2, height / 2, canvasSize - height / 2);
  return { x: centerX - width / 2, y: centerY - height / 2, width, height };
}

export function isFinderProtected(row: number, column: number, matrixSize: number, border = 4): boolean {
  const finderOrigins = [
    { row: border, column: border },
    { row: border, column: matrixSize - border - 7 },
    { row: matrixSize - border - 7, column: border },
  ];
  return finderOrigins.some((origin) => row >= origin.row - 1 && row <= origin.row + 7 && column >= origin.column - 1 && column <= origin.column + 7);
}

export function isQuietZone(row: number, column: number, matrixSize: number, border = 4): boolean {
  return row < border || column < border || row >= matrixSize - border || column >= matrixSize - border;
}

export function adaptiveDarkAlpha(luminances: number[]): number {
  if (!luminances.length) return 0.2;
  const sorted = [...luminances].sort((a, b) => a - b);
  const mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
  const p75 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.75))];
  const brightFraction = sorted.filter((value) => value >= 200).length / sorted.length;
  const brightnessScore = Math.max(0, Math.min(1, 0.65 * (mean / 255) + 0.25 * (p75 / 255) + 0.1 * brightFraction));
  return Math.round(Math.max(0.1, Math.min(0.28, 0.1 + brightnessScore * 0.18)) * 100) / 100;
}
