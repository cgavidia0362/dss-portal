import { mkdtemp, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { copyPdfBytes } from './pdf';

export type SegmentPdfSlicer = (
  sourceBytes: Uint8Array,
  pageNumbers: number[]
) => Promise<Uint8Array>;

function uniquePageIndices(pageNumbers: number[], pageCount: number): number[] {
  const seen = new Set<number>();
  const indices: number[] = [];
  for (const pageNumber of pageNumbers) {
    const index = pageNumber - 1;
    if (index < 0 || index >= pageCount || seen.has(index)) continue;
    seen.add(index);
    indices.push(index);
  }
  return indices;
}

/**
 * Copy selected 1-based pages into a new in-memory PDF. Does not write disk
 * and does not mutate the source buffer.
 */
export const extractSegmentPdf: SegmentPdfSlicer = async (sourceBytes, pageNumbers) => {
  const source = await PDFDocument.load(copyPdfBytes(sourceBytes), {
    ignoreEncryption: true,
  });
  const indices = uniquePageIndices(pageNumbers, source.getPageCount());
  if (!indices.length) {
    throw new Error('Segment PDF has no pages in range.');
  }
  const segment = await PDFDocument.create();
  const copied = await segment.copyPages(source, indices);
  for (const page of copied) {
    segment.addPage(page);
  }
  return segment.save();
};

function safeSegmentFileName(fileName: string): string {
  const base = fileName.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  const trimmed = base.slice(0, 48) || 'segment';
  return trimmed.toLowerCase().endsWith('.pdf') ? trimmed : `${trimmed}.pdf`;
}

/**
 * Write a segment PDF to a unique temp directory, run the callback, then
 * delete the file and directory. Never logs contents.
 */
export async function withTemporarySegmentPdf<T>(
  bytes: Uint8Array,
  fileName: string,
  run: (path: string, bytes: Uint8Array) => Promise<T>
): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'iv-segment-'));
  const path = join(dir, safeSegmentFileName(fileName));
  try {
    await writeFile(path, bytes);
    return await run(path, bytes);
  } finally {
    await unlink(path).catch(() => undefined);
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
