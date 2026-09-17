import { describe, expect, it } from 'vitest';
import { analyzeIncome } from '../index';
import { buildUnderwriterSummary } from '../summary';
import type { NormalizedTransaction } from '../types';

function tx(
  partial: Partial<NormalizedTransaction> &
    Pick<NormalizedTransaction, 'id' | 'date' | 'amount' | 'description'>
): NormalizedTransaction {
  return {
    rawDescription: partial.rawDescription ?? partial.description,
    direction: partial.direction ?? 'in',
    sourceDocument: partial.sourceDocument ?? 'jan.pdf',
    sourceDocumentType: partial.sourceDocumentType ?? 'bank_statement',
    sourceAccount: partial.sourceAccount ?? '1234',
    detectedIncomeSource: partial.detectedIncomeSource ?? null,
    turbopassCategory: partial.turbopassCategory ?? null,
    ...partial,
  };
}

describe('underwriter summary', () => {
  it('uses calculated totals and does not invent a different average', () => {
    const analysis = analyzeIncome(
      [
        tx({
          id: 'jan',
          date: '2026-01-15',
          amount: 5000,
          description: 'ADP PAYROLL ACME',
          sourceDocument: 'q1.pdf',
        }),
        tx({
          id: 'mar',
          date: '2026-03-15',
          amount: 5000,
          description: 'ADP PAYROLL ACME',
          sourceDocument: 'q1.pdf',
        }),
      ],
      {
        documentPeriods: [
          {
            documentName: 'q1.pdf',
            startDate: '2026-01-01',
            endDate: '2026-03-31',
            source: 'statement_header',
            accountLast4: '1234',
          },
        ],
      }
    );

    const summary = buildUnderwriterSummary(analysis);
    expect(summary).toContain('$10,000.00');
    expect(summary).toContain('$3,333.33');
    expect(summary).toContain('Acme');
    expect(summary).not.toContain('APPROVE');
    expect(summary).not.toContain('DECLINE');
  });
});
