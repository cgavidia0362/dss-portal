import { extractText, getDocumentProxy } from 'unpdf';

export interface PdfTextExtraction {
  text: string;
  pageCount: number;
  pages: string[];
}

/** unpdf/pdf.js transfers the ArrayBuffer; callers must keep an independent copy. */
export function copyPdfBytes(bytes: Uint8Array): Uint8Array {
  return bytes.slice();
}

export async function extractPdfPages(bytes: Uint8Array): Promise<PdfTextExtraction> {
  const pdf = await getDocumentProxy(copyPdfBytes(bytes));
  const result = await extractText(pdf, { mergePages: false });
  const pages = Array.isArray(result.text) ? result.text.map((page) => page || '') : [result.text || ''];
  return {
    text: pages.join('\n'),
    pageCount: result.totalPages ?? pages.length,
    pages,
  };
}

export async function extractPdfText(
  bytes: Uint8Array
): Promise<{ text: string; pageCount: number }> {
  const extracted = await extractPdfPages(bytes);
  return {
    text: extracted.text,
    pageCount: extracted.pageCount,
  };
}

export function textLooksEmpty(text: string): boolean {
  const compact = text.replace(/\s+/g, '');
  return compact.length < 40;
}

export function pageLooksEmpty(text: string): boolean {
  const compact = text.replace(/\s+/g, '');
  return compact.length < 24;
}
