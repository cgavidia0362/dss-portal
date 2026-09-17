import { parseBankStatementText } from './bankStatement';
import { parseCsvText } from './csv';
import { detectDocumentType } from './detect';
import { bytesToText, detectMime, validateUpload } from './files';
import type { UploadedFile } from './files';
import { extractPdfText, textLooksEmpty } from './pdf';
import { parseTurboPassText } from './turbopass';
import { extractTransactionsFromImage } from '../ai/extractVision';
import type { ExtractedDocument, ExtractionResult } from './types';
import type { AnalysisWarning } from '../analysis/types';

async function extractOne(file: UploadedFile): Promise<ExtractedDocument> {
  const mime = detectMime(file.fileName, file.bytes, file.mimeType);
  let text = '';
  let pageCount: number | undefined;
  const extraWarnings: AnalysisWarning[] = [];

  if (mime === 'application/pdf') {
    const pdf = await extractPdfText(file.bytes);
    text = pdf.text;
    pageCount = pdf.pageCount;
    if (textLooksEmpty(text)) {
      extraWarnings.push({
        code: 'scanned_pdf',
        message: `Unable to identify transactions on ${file.fileName}. The PDF appears to have little or no extractable text.`,
        documentName: file.fileName,
      });
    }
  } else if (mime === 'text/csv') {
    text = bytesToText(file.bytes);
  } else if (mime.startsWith('image/')) {
    const vision = await extractTransactionsFromImage({
      fileName: file.fileName,
      bytes: file.bytes,
      mimeType: mime,
    });
    const dates = vision.transactions.map((tx) => tx.date).sort();
    return {
      fileName: file.fileName,
      text: '',
      transactions: vision.transactions,
      period: {
        documentName: file.fileName,
        startDate: dates[0] ?? null,
        endDate: dates[dates.length - 1] ?? null,
        source: dates.length ? 'transaction_dates' : 'unknown',
        accountLast4: null,
      },
      warnings: vision.warnings,
    };
  }

  const documentType = detectDocumentType(file.fileName, text);
  let parsed: ExtractedDocument;

  if (documentType === 'turbopass') {
    parsed = parseTurboPassText(text, file.fileName);
  } else if (documentType === 'csv_export' || mime === 'text/csv') {
    parsed = parseCsvText(text, file.fileName);
  } else {
    parsed = parseBankStatementText(text, file.fileName);
  }

  parsed.pageCount = pageCount;
  parsed.warnings = [...extraWarnings, ...parsed.warnings];
  return parsed;
}

export async function extractDocuments(files: UploadedFile[]): Promise<ExtractionResult> {
  validateUpload(files);

  const documents: ExtractedDocument[] = [];
  const warnings: AnalysisWarning[] = [];

  for (const file of files) {
    try {
      const extracted = await extractOne(file);
      documents.push(extracted);
      warnings.push(...extracted.warnings);
    } catch (error) {
      warnings.push({
        code: 'document_failed',
        message:
          error instanceof Error
            ? error.message
            : `Failed to process ${file.fileName}.`,
        documentName: file.fileName,
      });
    }
  }

  return {
    transactions: documents.flatMap((document) => document.transactions),
    documentPeriods: documents.map((document) => document.period),
    warnings,
    documents: documents.map((document) => ({
      fileName: document.fileName,
      documentType: document.transactions[0]?.sourceDocumentType ?? 'other',
      transactionCount: document.transactions.length,
      warningCount: document.warnings.length,
    })),
  };
}
