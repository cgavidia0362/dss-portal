import { formatMoney } from './format';
import { DEPOSIT_CATEGORY_LABELS } from './labels';
import type { IncomeAnalysis, LocationReview } from './types';

export interface SummaryFacts {
  documentCount: number;
  documentNames: string[];
  coverageStart: string | null;
  coverageEnd: string | null;
  monthsAnalyzed: number;
  completeMonths: number;
  partialMonths: number;
  totalDeposits: number;
  includedDeposits: number;
  averageMonthlyIncluded: number;
  excludedDeposits: number;
  excludedCount: number;
  /** Complete calendar months only — amounts are application-calculated included totals. */
  fullMonthDeposits: Array<{ month: string; label: string; shortLabel: string; amount: number }>;
  /** Categories with included activity, largest first (meaningful non-zero only). */
  meaningfulCategories: Array<{ category: string; included: number }>;
  primarySources: Array<{ source: string; total: number; percent: number }>;
  categoryTotals: Array<{ category: string; total: number; included: number }>;
  monthlyIncluded: Array<{ month: string; label: string; amount: number; completeness: string }>;
  consistent: boolean;
  homeState: string | null;
  locationReview: LocationReview;
  reviewAlert: string | null;
}

function shortMonthLabel(label: string): string {
  return label.replace(/\s+\d{4}$/, '').trim();
}

export function buildSummaryFacts(analysis: IncomeAnalysis): SummaryFacts {
  const documentNames: string[] = [];
  for (const tx of analysis.transactions) {
    if (!documentNames.includes(tx.sourceDocument)) {
      documentNames.push(tx.sourceDocument);
    }
  }
  const amounts = analysis.months.map((month) => month.includedTotal);
  const avg = analysis.totals.averageMonthlyIncluded;
  const spread =
    amounts.length > 1 && avg > 0
      ? (Math.max(...amounts) - Math.min(...amounts)) / avg
      : 0;

  const fullMonthDeposits = analysis.months
    .filter((month) => month.completeness === 'complete')
    .map((month) => ({
      month: month.month,
      label: month.label,
      shortLabel: shortMonthLabel(month.label),
      amount: month.includedTotal,
    }));

  const meaningfulCategories = analysis.categories
    .filter((category) => category.includedTotal > 0)
    .sort((a, b) => b.includedTotal - a.includedTotal)
    .slice(0, 3)
    .map((category) => ({
      category: DEPOSIT_CATEGORY_LABELS[category.category],
      included: category.includedTotal,
    }));

  const locationReview = analysis.locationReview;

  return {
    documentCount: documentNames.length,
    documentNames,
    coverageStart: analysis.coverage.startDate,
    coverageEnd: analysis.coverage.endDate,
    monthsAnalyzed: analysis.totals.monthsAnalyzed,
    completeMonths: analysis.totals.completeMonthsAnalyzed,
    partialMonths: analysis.totals.partialMonthsAnalyzed,
    totalDeposits: analysis.totals.totalDeposits,
    includedDeposits: analysis.totals.includedDeposits,
    averageMonthlyIncluded: analysis.totals.averageMonthlyIncluded,
    excludedDeposits: analysis.totals.excludedDeposits,
    excludedCount: analysis.totals.excludedCount,
    fullMonthDeposits,
    meaningfulCategories,
    primarySources: analysis.sources.slice(0, 3).map((source) => ({
      source: source.source,
      total: source.total,
      percent: source.percentOfIncluded,
    })),
    categoryTotals: analysis.categories.map((category) => ({
      category: DEPOSIT_CATEGORY_LABELS[category.category],
      total: category.total,
      included: category.includedTotal,
    })),
    monthlyIncluded: analysis.months.map((month) => ({
      month: month.month,
      label: month.label,
      amount: month.includedTotal,
      completeness: month.completeness,
    })),
    consistent: spread <= 0.25,
    homeState: locationReview.homeState,
    locationReview,
    reviewAlert: locationReview.alert ? locationReview.alertMessage : null,
  };
}

function joinSeries(parts: string[]): string {
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
}

function fullMonthSentence(facts: SummaryFacts): string {
  if (!facts.fullMonthDeposits.length) {
    return 'No complete calendar months were available in the analyzed coverage.';
  }

  const years = new Set(facts.fullMonthDeposits.map((item) => item.month.slice(0, 4)));
  const useShort = years.size === 1;
  const parts = facts.fullMonthDeposits.map((item) => {
    const label = useShort ? item.shortLabel : item.label;
    return `${formatMoney(item.amount)} in ${label}`;
  });
  return `Full-month deposits were ${joinSeries(parts)}.`;
}

function averageSentence(facts: SummaryFacts, analysis: IncomeAnalysis): string {
  if (analysis.extractionTrust === 'incomplete_source') {
    const extracted = analysis.totals.reviewOnlyExtractedTotal ?? analysis.totals.totalDeposits;
    return `Source statement is incomplete. Extracted deposits from available pages were ${formatMoney(extracted)} for review only and are not included in the trusted income average.`;
  }
  return `Across the full statement period reviewed, including partial months, deposits averaged ${formatMoney(facts.averageMonthlyIncluded)} per month.`;
}

function categorySentence(facts: SummaryFacts): string | null {
  if (!facts.meaningfulCategories.length) return null;
  const parts = facts.meaningfulCategories.map(
    (category) => `${category.category} (${formatMoney(category.included)})`
  );
  return `Deposits consisted primarily of ${joinSeries(parts)}.`;
}

/** Concise underwriting snapshot (3 sentences typical). Does not include review alerts. */
export function buildUnderwriterSummary(analysis: IncomeAnalysis): string {
  const facts = buildSummaryFacts(analysis);
  return [fullMonthSentence(facts), averageSentence(facts, analysis), categorySentence(facts)]
    .filter(Boolean)
    .join(' ');
}

export function buildReviewAlertText(analysis: IncomeAnalysis): string | null {
  return analysis.locationReview.alert ? analysis.locationReview.alertMessage : null;
}

/** Narrative plus review alert when present — used for Copy Summary. */
export function buildCopyableSummary(analysis: IncomeAnalysis, narrative?: string): string {
  const body = narrative ?? buildUnderwriterSummary(analysis);
  const alert = buildReviewAlertText(analysis);
  return alert ? `${body}\n\n${alert}` : body;
}
