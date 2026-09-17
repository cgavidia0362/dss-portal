import type { AnalysisWarning, DocumentPeriod, NormalizedTransaction } from '../analysis/types';

export interface ExtractedDocument {
  fileName: string;
  text: string;
  transactions: NormalizedTransaction[];
  period: DocumentPeriod;
  warnings: AnalysisWarning[];
  pageCount?: number;
}

export interface ExtractionResult {
  transactions: NormalizedTransaction[];
  documentPeriods: DocumentPeriod[];
  warnings: AnalysisWarning[];
  documents: Array<{
    fileName: string;
    documentType: string;
    transactionCount: number;
    warningCount: number;
  }>;
}
