import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { extractSegmentPdf, withTemporarySegmentPdf } from '../segmentPdf';

async function makePdf(pageCount: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let index = 0; index < pageCount; index += 1) {
    const page = doc.addPage([612, 792]);
    page.drawText(`Page ${index + 1}`, { x: 72, y: 720, size: 12, font });
  }
  return doc.save();
}

describe('segment PDF creation', () => {
  it('copies only the requested statement pages into a new PDF', async () => {
    const source = await makePdf(9);
    const segment = await extractSegmentPdf(source, [6, 7, 8, 9]);
    const loaded = await PDFDocument.load(segment);
    expect(loaded.getPageCount()).toBe(4);
    const leftover = await PDFDocument.load(source);
    expect(leftover.getPageCount()).toBe(9);
  });

  it('keeps concatenated statements as independent page ranges', async () => {
    const source = await makePdf(9);
    const may = await extractSegmentPdf(source, [6, 7, 8, 9]);
    const june = await extractSegmentPdf(source, [3, 4, 5]);
    const july = await extractSegmentPdf(source, [1, 2]);
    expect((await PDFDocument.load(may)).getPageCount()).toBe(4);
    expect((await PDFDocument.load(june)).getPageCount()).toBe(3);
    expect((await PDFDocument.load(july)).getPageCount()).toBe(2);
  });
});

describe('temporary segment PDF cleanup', () => {
  it('deletes the temp file after the model callback finishes', async () => {
    const bytes = await makePdf(1);
    let tempPath = '';
    const result = await withTemporarySegmentPdf(bytes, 'chase-may.pdf', async (path) => {
      tempPath = path;
      expect(existsSync(path)).toBe(true);
      return 'ok';
    });
    expect(result).toBe('ok');
    expect(tempPath).toContain('iv-segment-');
    expect(existsSync(tempPath)).toBe(false);
  });

  it('deletes the temp file even when the callback throws', async () => {
    const bytes = await makePdf(1);
    let tempPath = '';
    await expect(
      withTemporarySegmentPdf(bytes, 'segment.pdf', async (path) => {
        tempPath = path;
        throw new Error('model failed');
      })
    ).rejects.toThrow('model failed');
    expect(existsSync(tempPath)).toBe(false);
  });
});
