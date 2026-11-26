import FaceDetection from 'memorialever-face-detection';

import type { DetectedFace } from './types';

export async function detectFaces(imageUri: string): Promise<DetectedFace[]> {
  if (!FaceDetection) throw new Error('FACE_DETECTOR_UNAVAILABLE');
  return FaceDetection.detectFaces(imageUri);
}

export function isFaceDetectorAvailable(): boolean {
  return Boolean(FaceDetection);
}
