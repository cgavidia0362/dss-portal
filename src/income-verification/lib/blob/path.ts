import { BLOB_PREFIX } from '../extract/limits';

const POI_PATH = /^poi\/[A-Za-z0-9._-]+$/;

export function sanitizeUploadFileName(fileName: string): string {
  const base = fileName.split(/[/\\]/).pop()?.trim() || 'document';
  const cleaned = base.replace(/[^A-Za-z0-9._-]/g, '_').replace(/_+/g, '_').slice(0, 80);
  return cleaned.replace(/^\.+/, '') || 'document';
}

export function requestedPoiPathname(fileName: string): string {
  return `${BLOB_PREFIX}${sanitizeUploadFileName(fileName)}`;
}

export function assertPoiPathname(value: unknown): string {
  if (typeof value !== 'string' || !value) {
    throw new Error('Invalid document reference.');
  }
  if (
    value.includes('\\') ||
    value.includes('..') ||
    value.includes('%') ||
    value.includes(':') ||
    value.includes('?') ||
    value.includes('#') ||
    value.includes('\\0') ||
    value.startsWith('/') ||
    !POI_PATH.test(value)
  ) {
    throw new Error('Invalid document reference.');
  }
  return value;
}

export function fileNameFromPoiPathname(pathname: string): string {
  const asserted = assertPoiPathname(pathname);
  return asserted.slice(BLOB_PREFIX.length);
}
