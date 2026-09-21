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

export function printedDepositControlTotal(analysis: IncomeAnalysis): number {
  return analysis.totals.printedDepositControlTotal ?? 0;
}

export function incompleteSourceHeadlineCopy() {
  return {
    title: 'Verified monthly income unavailable',
    printedLabel: 'Printed statement deposit controls',
    extractedLabel: 'Extracted deposits from available pages',
    notice:
      'Source statement is incomplete. These figures are for review only and are not included in the trusted income average.',
    cannotReconcile:
      'The statement packet is incomplete, so the extracted subtotal cannot be reconciled to the full printed statement totals.',
    printedInformational:
      'The printed controls are informational only in this state and must not be treated as verified extracted income.',
    unavailableAverage:
      'A verified monthly average is unavailable because the source statement is incomplete.',
    monthLabel: 'Incomplete source — review only',
  };
}
