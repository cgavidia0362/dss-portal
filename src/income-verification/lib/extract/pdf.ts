import { extractText } from 'unpdf';

export async function extractPdfText(
  bytes: Uint8Array
): Promise<{ text: string; pageCount: number }> {
  const result = await extractText(bytes, { mergePages: true });
  const text = Array.isArray(result.text) ? result.text.join('\n') : result.text;
  return {
    text: text || '',
    pageCount: result.totalPages ?? 0,
  };
}

export function textLooksEmpty(text: string): boolean {
  const compact = text.replace(/\s+/g, '');
  return compact.length < 40;
}
