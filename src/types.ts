export type DetectedFace = {
  height: number;
  imageHeight: number;
  imageWidth: number;
  width: number;
  x: number;
  y: number;
};

export type PhotoSource = {
  identity: string;
  kind: 'gallery' | 'portrait';
  uri: string;
};

export type PreparedPhoto = PhotoSource & {
  faces: DetectedFace[];
  height: number;
  localUri: string;
  width: number;
};

export type QrGenerationState =
  | 'idle'
  | 'resolving-source'
  | 'detecting-faces'
  | 'generating'
  | 'validating'
  | 'ready'
  | 'fallback'
  | 'error';

export type AdaptiveQrFallbackReason =
  | 'NO_SOURCE_IMAGE'
  | 'SOURCE_DOWNLOAD_FAILED'
  | 'IMAGE_NORMALIZATION_FAILED'
  | 'FACE_DETECTOR_UNAVAILABLE'
  | 'FACE_DETECTION_FAILED'
  | 'NO_FACE_DETECTED'
  | 'NO_MEANINGFUL_FACE'
  | 'SKIA_RENDER_FAILED'
  | 'NO_SAFE_HOLE_FOUND'
  | 'FINAL_QR_VALIDATION_FAILED'
  | 'POSTER_VALIDATION_FAILED'
  | 'UNKNOWN_ERROR';

export type AdaptiveQrDiagnostics = {
  alpha?: number;
  cache: 'HIT' | 'MISS';
  detectedFaces?: number;
  fallbackReason?: AdaptiveQrFallbackReason;
  generationId: string;
  holeScale?: number;
  localFile: boolean;
  mlKit: 'AVAILABLE' | 'ERROR' | 'NOT_CHECKED';
  selectedFaces?: number;
  source: 'GALLERY_1' | 'GALLERY_2' | 'NONE' | 'PORTRAIT';
  status: 'ERROR' | 'FALLBACK' | 'GENERATING' | 'READY';
  timings: Record<string, number>;
  totalMs?: number;
  validation?: { poster?: boolean; scale100?: boolean; scale25?: boolean; scale50?: boolean };
};

export type QrProgressCallback = (state: QrGenerationState, diagnostics?: AdaptiveQrDiagnostics) => void;

export type MemorialQrInput = {
  canonicalUrl: string;
  debug?: boolean;
  detail: {
    id: string;
    portraitUrl?: string | null;
    portraitIdentity?: string | null;
    photoCandidates: { identity: string; url: string }[];
  };
  localPortraitUri?: string | null;
};

export type MemorialQrResult = {
  adaptive: boolean;
  cacheKey: string;
  diagnostics?: AdaptiveQrDiagnostics;
  debugUris?: string[];
  holeScale?: number;
  qrUri: string;
  sourceIdentity: string;
  contentRevision?: string;
  targetFill?: number;
};
