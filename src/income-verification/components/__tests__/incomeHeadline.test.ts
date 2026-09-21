import { describe, expect, it } from 'vitest';
import { analyzeIncome } from '../../lib/analysis/pipeline';
import type { NormalizedTransaction } from '../../lib/analysis/types';
import {
  incompleteSourceHeadlineCopy,
  isIncompleteSourceAnalysis,
  reviewOnlyExtractedTotal,
} from '../incomeHeadline';

function tx(
  partial: Partial<NormalizedTransaction> &
    Pick<NormalizedTransaction, 'id' | 'date' | 'amount' | 'description'>
): NormalizedTransaction {
  return {
    rawDescription: partial.rawDescription ?? partial.description,
    direction: partial.direction ?? 'in',
    sourceDocument: 'statement.pdf',
    sourceDocumentType: 'bank_statement',
    sourceAccount: '1234',
    detectedIncomeSource: null,
    turbopassCategory: null,
    ...partial,
  };
}

describe('incomplete-source headline', () => {
  it('never treats incomplete-source totals as a trusted monthly average', () => {
    const analysis = analyzeIncome([
      tx({
        id: 'one',
        date: '2026-07-15',
        amount: 749.44,
        description: 'Example Staffing Payroll',
        extractionTrustState: 'incomplete_source',
      }),
    ]);

    expect(isIncompleteSourceAnalysis(analysis)).toBe(true);
    expect(analysis.totals.averageMonthlyIncluded).toBe(0);
    expect(analysis.totals.trustedAverageAvailable).toBe(false);
    expect(reviewOnlyExtractedTotal(analysis)).toBe(749.44);
    expect(incompleteSourceHeadlineCopy().title).toBe('Verified monthly income unavailable');
    expect(incompleteSourceHeadlineCopy().extractedLabel).toBe(
      'Extracted deposits from available pages'
    );
    expect(incompleteSourceHeadlineCopy().notice).toMatch(/review only/i);
    expect(incompleteSourceHeadlineCopy().notice).not.toMatch(/Average monthly included income/i);
  });
});
