import { describe, expect, it } from 'vitest';
import { analyzeIncome } from '../pipeline';
import type { NormalizedTransaction } from '../types';

function tx(
  partial: Partial<NormalizedTransaction> &
    Pick<NormalizedTransaction, 'id' | 'date' | 'amount' | 'description'>
): NormalizedTransaction {
  return {
    rawDescription: partial.rawDescription ?? partial.description,
    direction: partial.direction ?? 'in',
    sourceDocument: partial.sourceDocument ?? 'statement.pdf',
    sourceDocumentType: partial.sourceDocumentType ?? 'bank_statement',
    sourceAccount: partial.sourceAccount ?? '1234',
    detectedIncomeSource: partial.detectedIncomeSource ?? null,
    turbopassCategory: partial.turbopassCategory ?? null,
    ...partial,
  };
}

describe('extraction trust state', () => {
  it('averages only verified months when a later segment mismatches', () => {
    const analysis = analyzeIncome(
      [
        tx({
          id: 'may',
          date: '2026-05-15',
          amount: 1000,
          description: 'ADP PAYROLL ACME',
          extractionTrustState: 'verified',
          sourceDocument: 'may.pdf',
        }),
        tx({
          id: 'june',
          date: '2026-06-15',
          amount: 1000,
          description: 'ADP PAYROLL ACME',
          extractionTrustState: 'verified',
          sourceDocument: 'june.pdf',
        }),
        tx({
          id: 'july',
          date: '2026-07-15',
          amount: 500,
          description: 'ADP PAYROLL ACME',
          extractionTrustState: 'mismatch',
          sourceDocument: 'july.pdf',
        }),
      ],
      {
        documentPeriods: [
          {
            documentName: 'may.pdf',
            startDate: '2026-05-01',
            endDate: '2026-05-31',
            source: 'statement_header',
            accountLast4: '1234',
          },
          {
            documentName: 'june.pdf',
            startDate: '2026-06-01',
            endDate: '2026-06-30',
            source: 'statement_header',
            accountLast4: '1234',
          },
          {
            documentName: 'july.pdf',
            startDate: '2026-07-01',
            endDate: '2026-07-31',
            source: 'statement_header',
            accountLast4: '1234',
          },
        ],
      }
    );

    expect(analysis.extractionTrust).toBe('mismatch');
    expect(analysis.months.find((month) => month.month === '2026-07')?.reviewRequired).toBe(true);
    expect(analysis.totals.averageMonthlyIncluded).toBe(1000);
    expect(analysis.totals.unverifiedIncludedTotal).toBe(500);
    expect(analysis.totals.includedDeposits).toBe(2500);
    expect(analysis.warnings.some((warning) => warning.code === 'segment_partial_failure')).toBe(
      true
    );
  });

  it('excludes incomplete-source segments from trusted headline totals', () => {
    const analysis = analyzeIncome(
      [
        tx({
          id: 'may',
          date: '2026-05-15',
          amount: 1000,
          description: 'ADP PAYROLL ACME',
          extractionTrustState: 'verified',
          sourceDocument: 'may.pdf',
        }),
        tx({
          id: 'june',
          date: '2026-06-15',
          amount: 400,
          description: 'ADP PAYROLL ACME',
          extractionTrustState: 'incomplete_source',
          sourceDocument: 'june.pdf',
        }),
      ],
      {
        documentPeriods: [
          {
            documentName: 'may.pdf',
            startDate: '2026-05-01',
            endDate: '2026-05-31',
            source: 'statement_header',
            accountLast4: '1234',
          },
          {
            documentName: 'june.pdf',
            startDate: '2026-06-01',
            endDate: '2026-06-30',
            source: 'statement_header',
            accountLast4: '1234',
          },
        ],
      }
    );

    expect(analysis.extractionTrust).toBe('incomplete_source');
    expect(analysis.months.find((month) => month.month === '2026-06')?.reviewRequired).toBe(true);
    expect(analysis.totals.averageMonthlyIncluded).toBe(1000);
    expect(analysis.totals.unverifiedIncludedTotal).toBe(400);
    expect(analysis.totals.includedDeposits).toBe(1400);
  });
});
