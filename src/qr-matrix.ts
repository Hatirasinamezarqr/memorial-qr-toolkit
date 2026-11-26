import QRCode from 'qrcode';

export type QrMatrix = { border: number; data: boolean[]; size: number };

export function createQrMatrix(value: string, border = 4): QrMatrix {
  const generated = QRCode.create(value, { errorCorrectionLevel: 'H' });
  const innerSize = generated.modules.size;
  const size = innerSize + border * 2;
  const data = new Array<boolean>(size * size).fill(false);
  for (let row = 0; row < innerSize; row += 1) {
    for (let column = 0; column < innerSize; column += 1) {
      data[(row + border) * size + column + border] = Boolean(generated.modules.data[row * innerSize + column]);
    }
  }
  return { border, data, size };
}

export const matrixValue = (matrix: QrMatrix, row: number, column: number) => matrix.data[row * matrix.size + column];
