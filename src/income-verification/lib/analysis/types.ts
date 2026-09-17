export type MoneyDirection = 'in' | 'out';

export type DocumentType =
  | 'bank_statement'
  | 'turbopass'
  | 'csv_export'
  | 'image'
  | 'other';

export type DepositCategory =
  | 'payroll'
  | 'p2p_transfer'
  | 'cash_deposit'
  | 'account_transfer'
  | 'check'
  | 'miscellaneous';

export type ClassificationSource = 'rule' | 'ai' | 'underwriter';

export type InclusionSource = 'default' | 'underwriter' | 'duplicate';

export type TurboPassCategory =
  | 'P2PCredits'
  | 'General Deposit'
  | 'ATMDeposits'
  | 'Internal Transfers'
  | 'External Transfers'
  | 'Refunds'
  | 'Loan Advances'
  | 'IncomePayroll'
  | 'MiscCredits';

export interface DepositClassification {
  category: DepositCategory;
  subcategory: string | null;
  source: ClassificationSource;
  confidence: number;
  reason: string;
}

export type Classification = DepositClassification;

export interface TransferMatch {
  matchedTransactionId: string;
  amount: number;
  dateDistanceDays: number;
  reason: string;
  confidence: number;
}

export interface NormalizedTransaction {
  id: string;
  date: string;
  description: string;
  rawDescription: string;
  amount: number;
  direction: MoneyDirection;
  sourceDocument: string;
  sourceDocumentType: DocumentType;
  sourceAccount: string | null;
  detectedIncomeSource?: string | null;
  turbopassCategory?: TurboPassCategory | null;
  runningBalance?: number | null;
  page?: number | null;
}

export interface Transaction extends NormalizedTransaction {
  detectedIncomeSource: string | null;
  normalizedSource: string;
  sourceConfidence: number;
  turbopassCategory: TurboPassCategory | null;
  ruleClassification: DepositClassification;
  aiClassification: DepositClassification | null;
  underwriterClassification: DepositClassification | null;
  finalClassification: DepositClassification;
  included: boolean;
  inclusionSource: InclusionSource;
  includedAmount: number;
  exclusionReason: string | null;
  duplicateOf: string | null;
  transferMatch: TransferMatch | null;
}

export interface AnalysisWarning {
  code: string;
  message: string;
  documentName?: string;
  transactionId?: string;
}

export type PeriodCompleteness = 'complete' | 'partial' | 'unknown';

export type PeriodSource = 'statement_header' | 'transaction_dates' | 'unknown';

export interface DocumentPeriod {
  documentName: string;
  startDate: string | null;
  endDate: string | null;
  source: PeriodSource;
  accountLast4: string | null;
  /** ISO US state code from mailing/account-holder address when reliably extracted. */
  homeState?: string | null;
}

export interface LocationHit {
  state: string;
  description: string;
  physical: boolean;
}

export interface LocationReview {
  homeState: string | null;
  physicalLocationCount: number;
  outOfStateCount: number;
  outOfStatePercent: number;
  primaryOutOfStateStates: string[];
  stateCounts: Record<string, number>;
  alert: boolean;
  alertMessage: string | null;
}

export interface CoverageMonth {
  month: string;
  label: string;
  startDate: string;
  endDate: string;
  calendarStart: string;
  calendarEnd: string;
  completeness: PeriodCompleteness;
  partialReason: string | null;
  sourceDocuments: string[];
}

export interface AnalysisCoverage {
  startDate: string | null;
  endDate: string | null;
  months: CoverageMonth[];
  completeMonthCount: number;
  partialMonthCount: number;
  unknownMonthCount: number;
}

export interface MonthlyIncome {
  month: string;
  label: string;
  includedTotal: number;
  excludedTotal: number;
  includedCount: number;
  excludedCount: number;
  completeness: PeriodCompleteness;
  partialReason: string | null;
  periodStartDate: string | null;
  periodEndDate: string | null;
  sourceDocuments: string[];
}

export interface IncomeSourceBreakdown {
  source: string;
  category: DepositCategory;
  monthly: Record<string, number>;
  count: number;
  totalDeposits: number;
  total: number;
  monthlyAverage: number;
  percentOfIncluded: number;
  transactionIds: string[];
}

export interface CategoryBreakdown {
  category: DepositCategory;
  monthly: Record<string, number>;
  total: number;
  includedTotal: number;
  excludedTotal: number;
  count: number;
  includedCount: number;
  monthlyAverage: number;
  percentOfTotal: number;
  transactionIds: string[];
}

export interface IncomeTotals {
  totalDeposits: number;
  includedDeposits: number;
  excludedDeposits: number;
  averageMonthlyIncluded: number;
  monthsAnalyzed: number;
  completeMonthsAnalyzed: number;
  partialMonthsAnalyzed: number;
  includedCount: number;
  excludedCount: number;
  duplicateCount: number;
  duplicateAmount: number;
}

export interface IncomeAnalysis {
  transactions: Transaction[];
  months: MonthlyIncome[];
  sources: IncomeSourceBreakdown[];
  categories: CategoryBreakdown[];
  totals: IncomeTotals;
  coverage: AnalysisCoverage;
  warnings: AnalysisWarning[];
  locationReview: LocationReview;
}

export interface AnalyzeOptions {
  periodMonths?: string[];
  documentPeriods?: DocumentPeriod[];
  coverage?: AnalysisCoverage;
  warnings?: AnalysisWarning[];
  documentTexts?: string[];
  homeState?: string | null;
  locationReview?: LocationReview;
}
