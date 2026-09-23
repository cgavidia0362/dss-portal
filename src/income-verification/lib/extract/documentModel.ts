import type {
  AnalysisWarning,
  DocumentType,
  ExtractionProvenance,
  ExtractionTrustState,
  NormalizedTransaction,
} from '../analysis/types';
import type { StatementPeriod } from './parse';
import type { SourceCompleteness } from './pageSequence';

export type InstitutionId =
  | 'turbopass'
  | 'pnc'
  | 'bank_of_america'
  | 'navy_federal'
  | 'chase'
  | 'wells_fargo'
  | 'lake_forest'
  | 'first_bank'
  | 'generic_bank'
  | 'csv'
  | 'unknown';

export type FallbackReason =
  | 'image_only'
  | 'insufficient_text'
  | 'zero_transactions'
  | 'implausibly_few'
  | 'control_mismatch'
  | 'ambiguous_structure'
  | 'invalid_vision_output'
  | 'vision_failed'
  | 'incomplete_source';

export interface DocumentPage {
  pageNumber: number;
  text: string;
  usableChars: number;
  imageOnly: boolean;
  printedPage?: number | null;
  printedPageCount?: number | null;
  duplicateOfPage?: number | null;
}

export interface StatementDebitControls {
  atmAndDebitCard: number | null;
  electronic: number | null;
  other: number | null;
  fees: number | null;
}

export interface StatementControlTotals {
  creditTotal: number | null;
  creditCount: number | null;
  debitTotal: number | null;
  debitControls?: StatementDebitControls;
  beginningBalance: number | null;
  endingBalance: number | null;
  accountLast4: string | null;
  accountLabel: string | null;
}

export interface AccountSegment {
  id: string;
  accountLast4: string | null;
  accountLabel: string | null;
  pageStart: number;
  pageEnd: number;
  controls: StatementControlTotals;
}

export interface StatementSegment {
  id: string;
  fileName: string;
  index: number;
  pageStart: number;
  pageEnd: number;
  pageNumbers: number[];
  pageTexts: Array<{ pageNumber: number; text: string }>;
  text: string;
  period: StatementPeriod | null;
  institution: InstitutionId;
  documentType: DocumentType;
  knownParser: boolean;
  imageOnly: boolean;
  accounts: AccountSegment[];
  controls: StatementControlTotals[];
  sourceCompleteness: SourceCompleteness;
}

export interface DocumentPreflight {
  fileName: string;
  pageCount: number;
  pages: DocumentPage[];
  imageOnly: boolean;
  institution: InstitutionId;
  documentType: DocumentType;
  knownParser: boolean;
  statementPeriods: StatementPeriod[];
  accountLast4s: string[];
  controls: StatementControlTotals[];
  segments: StatementSegment[];
  usableTextChars: number;
  sourceCompletenessState: import('./pageSequence').SourceCompletenessState;
}

export interface ExtractionTelemetry {
  deterministicPagesProcessed: number;
  terraPagesProcessed: number;
  solPagesProcessed: number;
  pdfInputPagesProcessed: number;
  rasterizedPagesProcessed: number;
  fallbackReasons: FallbackReason[];
  modelsUsed: string[];
}

export interface SegmentExtraction {
  segment: StatementSegment;
  transactions: NormalizedTransaction[];
  warnings: AnalysisWarning[];
  provenance: ExtractionProvenance;
  trustState: ExtractionTrustState;
  reconciliation: import('./reconcile').ReconciliationResult;
  creditReconciliation?: import('./reconcile').DirectionReconciliation;
  debitReconciliation?: import('./reconcile').DirectionReconciliation;
  fallbackReason?: FallbackReason;
  processingNote: string;
  deterministicExtractedCreditTotal?: number;
  terraExtractedCreditTotal?: number | null;
  solExtractedCreditTotal?: number | null;
  usedPdfInput?: boolean;
  fusionStats?: import('./candidates').FusionStats;
  aiFallbackPages?: { terra: number[]; sol: number[] };
}
