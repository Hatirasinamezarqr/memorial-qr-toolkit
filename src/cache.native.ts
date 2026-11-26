import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';

const cacheRoot = new Directory(Paths.cache, 'memorialever', 'qr');

export async function hashKey(value: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value);
}

export function ensureQrCache(): Directory {
  cacheRoot.create({ idempotent: true, intermediates: true });
  return cacheRoot;
}

export function cacheFile(name: string): File {
  return new File(ensureQrCache(), name);
}

export function debugFile(memorialId: string, name: string): File {
  const safeId = memorialId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const directory = new Directory(ensureQrCache(), 'debug', safeId);
  directory.create({ idempotent: true, intermediates: true });
  return new File(directory, name);
}

export function clearAdaptiveQrCacheForDevelopment(): void {
  if (!__DEV__) return;
  if (cacheRoot.exists) cacheRoot.delete();
}

export async function localizeImage(uri: string, identity: string): Promise<string> {
  if (/^(file|content):/.test(uri)) return uri;
  const key = await hashKey(identity);
  const target = cacheFile(`${key}-source`);
  if (target.exists && target.size > 0) return target.uri;
  const downloaded = await File.downloadFileAsync(uri, target, { idempotent: true });
  return downloaded.uri;
}
