import { formatMoney } from './format';
import { DEPOSIT_CATEGORY_LABELS } from './labels';
import type { IncomeAnalysis } from './types';

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
  primarySources: Array<{ source: string; total: number; percent: number }>;
  categoryTotals: Array<{ category: string; total: number; included: number }>;
  monthlyIncluded: Array<{ month: string; label: string; amount: number; completeness: string }>;
  consistent: boolean;
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
  };
}

export function buildUnderwriterSummary(analysis: IncomeAnalysis): string {
  const facts = buildSummaryFacts(analysis);
  const documents =
    facts.documentCount === 1
      ? 'one document'
      : `${facts.documentCount} documents`;
  const period =
    facts.coverageStart && facts.coverageEnd
      ? ` covering ${facts.coverageStart} through ${facts.coverageEnd}`
      : '';
  const monthNote = [
    `${facts.monthsAnalyzed} month${facts.monthsAnalyzed === 1 ? '' : 's'}`,
    facts.completeMonths ? `${facts.completeMonths} complete` : null,
    facts.partialMonths ? `${facts.partialMonths} partial` : null,
  ]
    .filter(Boolean)
    .join(', ');

  const categoryText = facts.categoryTotals
    .filter((category) => category.total > 0)
    .map((category) => `${category.category} ${formatMoney(category.total)}`)
    .join('; ');

  const sourceText = facts.primarySources.length
    ? facts.primarySources
        .map((source) => `${source.source} (${formatMoney(source.total)}, ${source.percent}% of included)`)
        .join('; ')
    : 'no identified sources';

  const exclusionText = facts.excludedDeposits
    ? ` The underwriter currently has ${formatMoney(facts.excludedDeposits)} excluded.`
    : ' No deposits are currently excluded.';

  const consistency = facts.consistent
    ? ' Included deposits were relatively consistent across the review period.'
    : ' Included deposits varied across the review period.';

  return `Reviewed ${documents}${period} (${monthNote}). Extracted deposits totaled ${formatMoney(facts.totalDeposits)} and currently included deposits averaged ${formatMoney(facts.averageMonthlyIncluded)} per month across the coverage period. Categories: ${categoryText || 'none'}. Primary included sources: ${sourceText}.${exclusionText}${consistency}`;
}
