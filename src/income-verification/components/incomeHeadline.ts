import type { IncomeAnalysis } from '@income-verification/lib/analysis/types';

export function isIncompleteSourceAnalysis(analysis: IncomeAnalysis): boolean {
  if (analysis.extractionTrust === 'incomplete_source') return true;
  return (
    analysis.totals.trustedAverageAvailable === false &&
    (analysis.transactions.some((tx) => tx.extractionTrustState === 'incomplete_source') ||
      analysis.months.some((month) => month.extractionTrust === 'incomplete_source'))
  );
}

export function reviewOnlyExtractedTotal(analysis: IncomeAnalysis): number {
  if (analysis.totals.reviewOnlyExtractedTotal != null && analysis.totals.reviewOnlyExtractedTotal > 0) {
    return analysis.totals.reviewOnlyExtractedTotal;
  }
  return analysis.totals.totalDeposits;
}

export function incompleteSourceHeadlineCopy() {
  return {
    title: 'Verified monthly income unavailable',
    extractedLabel: 'Extracted deposits from available pages',
    notice:
      'Source statement is incomplete. These figures are for review only and are not included in the trusted income average.',
    monthLabel: 'Incomplete source — review only',
  };
}
