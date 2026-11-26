import jsQR from 'jsqr';

// The notebook/OpenCV decoder binarizes these low-alpha photo QR images before
// locating modules. jsQR's internal binarizer does not reliably do that for
// the approved output (including the known-good 09_final_flattened fixtures),
// so provide the same kind of high-contrast validation input explicitly.
export const QR_LUMA_THRESHOLDS = [230, 215, 200, 185] as const;

function thresholdPixels(pixels: Uint8ClampedArray, threshold: number): Uint8ClampedArray {
  const result = new Uint8ClampedArray(pixels.length);
  for (let index = 0; index < pixels.length; index += 4) {
    const luma = 0.2126 * pixels[index] + 0.7152 * pixels[index + 1] + 0.0722 * pixels[index + 2];
    const value = luma < threshold ? 0 : 255;
    result[index] = value;
    result[index + 1] = value;
    result[index + 2] = value;
    result[index + 3] = 255;
  }
  return result;
}

export function decodesExpectedQr(pixels: Uint8ClampedArray, width: number, height: number, expectedValue: string): boolean {
  for (const threshold of QR_LUMA_THRESHOLDS) {
    const decoded = jsQR(thresholdPixels(pixels, threshold), width, height, { inversionAttempts: 'attemptBoth' });
    if (decoded?.data === expectedValue) return true;
  }
  const decoded = jsQR(pixels, width, height, { inversionAttempts: 'attemptBoth' });
  return decoded?.data === expectedValue;
}
