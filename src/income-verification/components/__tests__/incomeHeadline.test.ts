import { describe, expect, it } from 'vitest';
import { analyzeIncome } from '../../lib/analysis/pipeline';
import { buildUnderwriterSummary } from '../../lib/analysis/summary';
import type { NormalizedTransaction } from '../../lib/analysis/types';
import {
  incompleteSourceHeadlineCopy,
  isIncompleteSourceAnalysis,
  printedDepositControlTotal,
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
    expect(incompleteSourceHeadlineCopy().unavailableAverage).toBe(
      'A verified monthly average is unavailable because the source statement is incomplete.'
    );
    expect(incompleteSourceHeadlineCopy().unavailableAverage).not.toMatch(/\$0\.00/);
  });

  it('shows printed statement controls separately from the observable extracted subtotal', () => {
    const analysis = analyzeIncome(
      [
        tx({
          id: 'observed',
          date: '2026-07-27',
          amount: 6533.63,
          description: 'Observed available-page deposits',
          extractionTrustState: 'incomplete_source',
        }),
      ],
      { printedDepositControlTotal: 11138.49 }
    );

    expect(isIncompleteSourceAnalysis(analysis)).toBe(true);
    expect(printedDepositControlTotal(analysis)).toBe(11138.49);
    expect(reviewOnlyExtractedTotal(analysis)).toBe(6533.63);
    expect(printedDepositControlTotal(analysis)).not.toBe(reviewOnlyExtractedTotal(analysis));
    expect(incompleteSourceHeadlineCopy().printedLabel).toBe('Printed statement deposit controls');
    expect(incompleteSourceHeadlineCopy().extractedLabel).toBe(
      'Extracted deposits from available pages'
    );
    expect(incompleteSourceHeadlineCopy().cannotReconcile).toContain(
      'extracted subtotal cannot be reconciled to the full printed statement totals'
    );
    expect(incompleteSourceHeadlineCopy().printedInformational).toContain(
      'must not be treated as verified extracted income'
    );

    const summary = buildUnderwriterSummary(analysis);
    expect(summary).toContain('$11,138.49');
    expect(summary).toContain('$6,533.63');
    expect(summary).toContain(incompleteSourceHeadlineCopy().unavailableAverage);
    expect(summary).not.toMatch(/\$0\.00/);
    expect(summary).not.toMatch(/averaged \$0/i);
    expect(summary).not.toMatch(/coverage average including partial months is \$0\.00/i);
  });
});
