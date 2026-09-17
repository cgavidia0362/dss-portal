import { MAX_FILE_BYTES, MAX_FILES } from './limits';

export { MAX_FILE_BYTES, MAX_FILES } from './limits';

export interface UploadedFile {
  fileName: string;
  bytes: Uint8Array;
  mimeType: string;
}

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  return signature.every((value, index) => bytes[index] === value);
}

export function detectMime(fileName: string, bytes: Uint8Array, declaredType: string): string {
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46])) return 'application/pdf';
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])) return 'image/png';
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) {
    throw new Error(`${fileName}: Word/ZIP documents are not supported in V1. Upload PDF or CSV.`);
  }

  const name = fileName.toLowerCase();
  if (name.endsWith('.csv') || name.endsWith('.txt') || declaredType.includes('csv') || declaredType.startsWith('text/')) {
    return 'text/csv';
  }

  throw new Error(`${fileName}: Document format is not currently supported.`);
}

export function validateUpload(files: UploadedFile[]): void {
  if (!files.length) {
    throw new Error('No files were uploaded.');
  }
  if (files.length > MAX_FILES) {
    throw new Error(`Upload at most ${MAX_FILES} files per analysis.`);
  }
  for (const file of files) {
    if (file.bytes.byteLength === 0) {
      throw new Error(`${file.fileName}: File is empty.`);
    }
    if (file.bytes.byteLength > MAX_FILE_BYTES) {
      throw new Error(`${file.fileName}: File exceeds the ${MAX_FILE_BYTES / (1024 * 1024)}MB size limit.`);
    }
  }
}

export function bytesToText(bytes: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
}
