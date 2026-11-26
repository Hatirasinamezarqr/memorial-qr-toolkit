import { requireOptionalNativeModule } from 'expo-modules-core';

export type DetectedFace = {
  height: number;
  imageHeight: number;
  imageWidth: number;
  width: number;
  x: number;
  y: number;
};

type FaceDetectionModule = {
  detectFaces(imageUri: string): Promise<DetectedFace[]>;
};

export default requireOptionalNativeModule<FaceDetectionModule>('MemorialEverFaceDetection');
