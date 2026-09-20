export type {
  AnalysisCoverage,
  AnalysisWarning,
  AnalyzeOptions,
  CategoryBreakdown,
  Classification,
  ClassificationSource,
  CoverageMonth,
  DepositCategory,
  DepositClassification,
  DocumentPeriod,
  DocumentType,
  ExtractionProvenance,
  ExtractionTrustState,
  IncomeAnalysis,
  IncomeSourceBreakdown,
  IncomeTotals,
  InclusionSource,
  LocationHit,
  LocationReview,
  MoneyDirection,
  MonthlyIncome,
  NormalizedTransaction,
  PeriodCompleteness,
  PeriodSource,
  Transaction,
  TransferMatch,
  TurboPassCategory,
} from './types';

export { analyzeIncome } from './pipeline';
export { calculateIncome, resolveFinalClassification, resolveTransaction } from './calculate';
export { classifyTransaction } from './classify';
export {
  applyCategoryInclusion,
  applyCategoryOverride,
  applyInclusion,
  applySourceInclusion,
} from './overrides';
export { buildCoverage, coverageWarnings, inferDocumentPeriod } from './coverage';
export { detectDuplicates } from './duplicates';
export { detectTransfers } from './transfers';
export { parseIncomeSource, normalizeIncomeSource, normalizeText, stripSourceNoise } from './source';
export { addMoney, amountsEqual, fromCents, roundMoney, toCents } from './money';
export { formatConfidence, formatFileSize, formatMoney, formatPercent } from './format';
export { DEPOSIT_CATEGORIES, DEPOSIT_CATEGORY_LABELS } from './labels';
export { buildSummaryFacts, buildUnderwriterSummary, buildCopyableSummary, buildReviewAlertText } from './summary';
export {
  buildLocationReview,
  detectPhysicalLocation,
  extractHomeState,
  LOCATION_ALERT_MIN_OUT_OF_STATE,
  LOCATION_ALERT_MIN_PHYSICAL,
  LOCATION_ALERT_MIN_SHARE,
} from './location';
