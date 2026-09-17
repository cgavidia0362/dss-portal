import { del, get, list } from '@vercel/blob';
import { MAX_FILE_BYTES, POI_ORPHAN_MS } from '../extract/limits';
import type { UploadedFile } from '../extract/files';
import { assertPoiPathname, fileNameFromPoiPathname } from './path';

export function isBlobConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
}

async function streamToLimitedBytes(
  stream: ReadableStream<Uint8Array>,
  fileName: string
): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > MAX_FILE_BYTES) {
        throw new Error(`${fileName}: File exceeds the ${MAX_FILE_BYTES / (1024 * 1024)}MB size limit.`);
      }
      chunks.push(value);
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // already released
    }
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function downloadPoiBlob(pathname: string): Promise<UploadedFile> {
  const safePath = assertPoiPathname(pathname);
  const fileName = fileNameFromPoiPathname(safePath);
  const result = await get(safePath, { access: 'private', useCache: false });
  if (!result?.stream) {
    throw new Error(`${fileName}: Uploaded document could not be read.`);
  }
  if (result.blob.size != null && result.blob.size > MAX_FILE_BYTES) {
    throw new Error(`${fileName}: File exceeds the ${MAX_FILE_BYTES / (1024 * 1024)}MB size limit.`);
  }
  const bytes = await streamToLimitedBytes(result.stream, fileName);
  return {
    fileName,
    bytes,
    mimeType: result.blob.contentType || 'application/octet-stream',
  };
}

export async function deletePoiBlobs(pathnames: string[]): Promise<void> {
  const safe = pathnames.flatMap((pathname) => {
    try {
      return [assertPoiPathname(pathname)];
    } catch {
      return [];
    }
  });
  if (!safe.length) return;
  await del(safe);
}

export async function deleteOrphanPoiBlobs(now = Date.now()): Promise<number> {
  if (!isBlobConfigured()) return 0;
  const { blobs } = await list({ prefix: 'poi/', limit: 1000 });
  const expired = blobs.filter((blob) => {
    try {
      assertPoiPathname(blob.pathname);
    } catch {
      return false;
    }
    return now - new Date(blob.uploadedAt).getTime() > POI_ORPHAN_MS;
  });
  if (!expired.length) return 0;
  await del(expired.map((blob) => blob.pathname));
  return expired.length;
}
