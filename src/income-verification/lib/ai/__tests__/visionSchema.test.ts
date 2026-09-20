import { describe, expect, it } from 'vitest';
import { parseVisionExtraction } from '../visionSchema';

describe('vision structured-output validation', () => {
  it('accepts a complete transaction + statement payload', () => {
    const parsed = parseVisionExtraction({
      bank: 'Chase',
      documentKind: 'bank_statement',
      usedDepositsTable: false,
      ignoredTransactionHistory: false,
      structureAmbiguous: false,
      depositsTablePages: [],
      pagesNeedingReview: [],
      statements: [
        {
          statementSegmentId: 'stmt-1',
          startDate: '2026-05-23',
          endDate: '2026-06-23',
          accountIdentifier: '9999',
          bank: 'Chase',
          beginningBalance: 10,
          endingBalance: 20,
          depositCreditTotal: 100.5,
          withdrawalDebitTotal: 40,
          pageNumbers: [1, 2],
        },
      ],
      transactions: [
        {
          transactionDate: '05/24/2026',
          postedDate: null,
          description: 'Zelle payment from Avery Example',
          amount: 100.5,
          direction: 'credit',
          accountIdentifier: 'xxxx9999',
          statementSegmentId: 'stmt-1',
          sourcePage: 2,
          extractionConfidence: 0.9,
          bankCategory: null,
        },
      ],
    });
    expect(parsed.valid).toBe(true);
    expect(parsed.transactions).toHaveLength(1);
    expect(parsed.transactions[0]?.transactionDate).toBe('2026-05-24');
    expect(parsed.transactions[0]?.direction).toBe('credit');
    expect(parsed.statements[0]?.depositCreditTotal).toBe(100.5);
  });

  it('rejects missing or unreadable rows without inventing amounts', () => {
    const parsed = parseVisionExtraction({
      bank: 'TurboPass',
      documentKind: 'turbopass',
      usedDepositsTable: true,
      ignoredTransactionHistory: true,
      structureAmbiguous: false,
      depositsTablePages: [3],
      pagesNeedingReview: [],
      statements: [],
      transactions: [
        {
          transactionDate: 'not-a-date',
          postedDate: null,
          description: 'Unknown',
          amount: 0,
          direction: 'credit',
          accountIdentifier: null,
          statementSegmentId: 'stmt-1',
          sourcePage: 3,
          extractionConfidence: 0.1,
          bankCategory: 'IncomePayroll',
        },
      ],
    });
    expect(parsed.valid).toBe(false);
    expect(parsed.transactions).toHaveLength(0);
  });
});
