export const QR_ALGORITHM_VERSION = 'photo-qr-v8-centered-protection';

export function qrCacheSeed(memorialId: string, canonicalUrl: string, sourceIdentity: string): string {
  return `${QR_ALGORITHM_VERSION}:${memorialId}:${canonicalUrl}:${sourceIdentity}`;
}
