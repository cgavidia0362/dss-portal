import type { AnalysisWarning, DocumentPeriod, NormalizedTransaction } from '../analysis/types';
import type { DocumentPreflight, ExtractionTelemetry, SegmentExtraction } from './documentModel';

export interface ExtractedDocument {
  fileName: string;
  text: string;
  transactions: NormalizedTransaction[];
  period: DocumentPeriod;
  warnings: AnalysisWarning[];
  pageCount?: number;
  segments?: SegmentExtraction[];
  preflight?: DocumentPreflight;
  telemetry?: ExtractionTelemetry;
}

export interface ExtractionResult {
  transactions: NormalizedTransaction[];
  documentPeriods: DocumentPeriod[];
  warnings: AnalysisWarning[];
  /** Raw extracted text per document — used for home-state / location analysis. Not sent to UI. */
  documentTexts: string[];
  documents: Array<{
    fileName: string;
    documentType: string;
    transactionCount: number;
    warningCount: number;
  }>;
  telemetry?: ExtractionTelemetry;
  segments?: SegmentExtraction[];
}
