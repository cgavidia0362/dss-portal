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
  IncomeAnalysis,
  IncomeSourceBreakdown,
  IncomeTotals,
  InclusionSource,
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
export { buildSummaryFacts, buildUnderwriterSummary } from './summary';
