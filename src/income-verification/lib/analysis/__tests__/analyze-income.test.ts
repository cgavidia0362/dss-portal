import { describe, expect, it } from 'vitest';
import {
  analyzeIncome,
  applyCategoryInclusion,
  applyCategoryOverride,
  applyInclusion,
  applySourceInclusion,
  classifyTransaction,
} from '../index';
import type { NormalizedTransaction } from '../types';

function tx(
  partial: Partial<NormalizedTransaction> &
    Pick<NormalizedTransaction, 'id' | 'date' | 'amount' | 'description'>
): NormalizedTransaction {
  return {
    rawDescription: partial.rawDescription ?? partial.description,
    direction: partial.direction ?? 'in',
    sourceDocument: partial.sourceDocument ?? 'jan-statement.pdf',
    sourceDocumentType: partial.sourceDocumentType ?? 'bank_statement',
    sourceAccount: partial.sourceAccount ?? '1234',
    detectedIncomeSource: partial.detectedIncomeSource ?? null,
    turbopassCategory: partial.turbopassCategory ?? null,
    ...partial,
  };
}

describe('income calculation', () => {
  it('includes all unique incoming deposits by default, including transfers and refunds', () => {
    const analysis = analyzeIncome([
      tx({
        id: 'p1',
        date: '2026-01-07',
        amount: 2000,
        description: 'ADP PAYROLL TINEDALE FARMS',
      }),
      tx({
        id: 'p2',
        date: '2026-01-21',
        amount: 2000,
        description: 'ADP PAYROLL TINEDALE FARMS',
      }),
      tx({
        id: 't1',
        date: '2026-01-10',
        amount: 3000,
        description: 'TRANSFER FROM SAVINGS XXXX1234',
      }),
      tx({
        id: 'r1',
        date: '2026-01-18',
        amount: 500,
        description: 'CAPITAL ONE PURCHASE REFUND',
      }),
    ]);

    expect(analysis.totals.totalDeposits).toBe(7500);
    expect(analysis.totals.includedDeposits).toBe(7500);
    expect(analysis.totals.excludedDeposits).toBe(0);
    expect(analysis.totals.averageMonthlyIncluded).toBe(7500);
    expect(analysis.months[0]?.includedTotal).toBe(7500);
    expect(analysis.transactions.find((item) => item.id === 'r1')?.finalClassification.category).toBe(
      'miscellaneous'
    );
    expect(analysis.transactions.find((item) => item.id === 't1')?.finalClassification.category).toBe(
      'account_transfer'
    );
  });

  it('includes P2P and cash deposits by default while categorizing them', () => {
    const analysis = analyzeIncome([
      tx({
        id: 'z1',
        date: '2026-02-14',
        amount: 1200,
        description: 'Zelle payment from JOHN SMITH',
      }),
      tx({
        id: 'c1',
        date: '2026-02-20',
        amount: 740,
        description: 'BKOFAMERICA ATM DEPOSIT',
      }),
    ]);

    expect(analysis.totals.includedDeposits).toBe(1940);
    expect(analysis.totals.excludedDeposits).toBe(0);
    expect(analysis.transactions.find((item) => item.id === 'z1')?.finalClassification.category).toBe(
      'p2p_transfer'
    );
    expect(analysis.transactions.find((item) => item.id === 'c1')?.finalClassification.category).toBe(
      'cash_deposit'
    );
  });

  it('does not fill a gap between two separate monthly statements', () => {
    const analysis = analyzeIncome(
      [
        tx({
          id: 'jan',
          date: '2026-01-15',
          amount: 3000,
          description: 'ADP PAYROLL ACME',
        }),
        tx({
          id: 'mar',
          date: '2026-03-15',
          amount: 1000,
          description: 'ADP PAYROLL ACME',
          sourceDocument: 'mar-statement.pdf',
        }),
      ],
      {
        documentPeriods: [
          {
            documentName: 'jan-statement.pdf',
            startDate: '2026-01-01',
            endDate: '2026-01-31',
            source: 'statement_header',
            accountLast4: '1234',
          },
          {
            documentName: 'mar-statement.pdf',
            startDate: '2026-03-01',
            endDate: '2026-03-31',
            source: 'statement_header',
            accountLast4: '1234',
          },
        ],
      }
    );

    expect(analysis.totals.monthsAnalyzed).toBe(2);
    expect(analysis.totals.averageMonthlyIncluded).toBe(2000);
    expect(analysis.months.map((month) => month.month)).toEqual(['2026-01', '2026-03']);
  });

  it('keeps a $0 complete month in the average denominator', () => {
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

    expect(analysis.totals.includedDeposits).toBe(10000);
    expect(analysis.totals.monthsAnalyzed).toBe(3);
    expect(analysis.totals.completeMonthsAnalyzed).toBe(3);
    expect(analysis.totals.averageMonthlyIncluded).toBe(3333.33);
    expect(analysis.months[1]?.month).toBe('2026-02');
    expect(analysis.months[1]?.includedTotal).toBe(0);
    expect(analysis.months[1]?.completeness).toBe('complete');
  });

  it('flags partial-month statement coverage instead of treating it as complete', () => {
    const analysis = analyzeIncome(
      [
        tx({
          id: 'mar',
          date: '2026-03-04',
          amount: 5000,
          description: 'ADP PAYROLL ACME',
          sourceDocument: 'partial.pdf',
        }),
      ],
      {
        documentPeriods: [
          {
            documentName: 'partial.pdf',
            startDate: '2026-03-01',
            endDate: '2026-03-15',
            source: 'statement_header',
            accountLast4: '1234',
          },
        ],
      }
    );

    expect(analysis.months[0]?.completeness).toBe('partial');
    expect(analysis.totals.partialMonthsAnalyzed).toBe(1);
    expect(analysis.warnings.some((warning) => warning.code === 'partial_period')).toBe(true);
  });

  it('labels inferred coverage as an unknown statement period', () => {
    const analysis = analyzeIncome([
      tx({
        id: 'jan',
        date: '2026-01-15',
        amount: 5000,
        description: 'ADP PAYROLL ACME',
      }),
    ]);

    expect(analysis.months[0]?.completeness).toBe('unknown');
    expect(analysis.warnings.some((warning) => warning.message.includes('is an unknown'))).toBe(
      true
    );
    expect(analysis.warnings.some((warning) => warning.message.includes('is a unknown'))).toBe(
      false
    );
  });

  it('initially includes $23,314.40 from a mixed-category deposit document', () => {
    const analysis = analyzeIncome([
      tx({ id: 'payroll', date: '2026-07-11', amount: 13415.06, description: 'R E D LOGISTICS DES:PAYROLL PPD' }),
      tx({ id: 'atm', date: '2026-06-12', amount: 7544, description: 'BKOFAMERICA ATM DEPOSIT' }),
      tx({ id: 'p2p', date: '2026-08-17', amount: 2311.1, description: 'Zelle payment from ADRIANA GOVEA' }),
      tx({ id: 'ext', date: '2026-08-11', amount: 19.96, description: 'GUSTO DES:ACCTVERIFY' }),
      tx({ id: 'misc', date: '2026-06-18', amount: 24.28, description: 'TEMPORARY CREDIT ADJUSTMENT' }),
    ]);

    expect(analysis.totals.totalDeposits).toBe(23314.4);
    expect(analysis.totals.includedDeposits).toBe(23314.4);
    expect(analysis.totals.excludedDeposits).toBe(0);
  });
});

describe('classification rules', () => {
  it('categorizes obvious payroll without excluding it', () => {
    const result = classifyTransaction(
      tx({
        id: 'p',
        date: '2026-01-01',
        amount: 1,
        description: 'UNITED MAINTENAN DES:PAYROLL PPD',
      })
    );
    expect(result.category).toBe('payroll');
  });

  it('categorizes mobile check deposits without excluding them', () => {
    const analysis = analyzeIncome([
      tx({
        id: 'chk',
        date: '2026-01-12',
        amount: 975,
        description: 'MOBILE DEPOSIT',
      }),
    ]);
    expect(analysis.transactions[0]?.finalClassification.category).toBe('check');
    expect(analysis.transactions[0]?.included).toBe(true);
    expect(analysis.totals.includedDeposits).toBe(975);
  });

  it('does not count outgoing debit transactions as deposits', () => {
    const analysis = analyzeIncome([
      tx({
        id: 'in',
        date: '2026-01-07',
        amount: 2000,
        description: 'ADP PAYROLL ACME',
      }),
      tx({
        id: 'out',
        date: '2026-01-16',
        amount: 45.23,
        description: 'CHECKCARD GROCERY STORE',
        direction: 'out',
      }),
    ]);
    expect(analysis.totals.totalDeposits).toBe(2000);
    expect(analysis.totals.includedDeposits).toBe(2000);
    expect(analysis.totals.excludedDeposits).toBe(0);
    expect(analysis.transactions.find((item) => item.id === 'out')?.included).toBe(false);
  });

  it('categorizes Zelle as P2P without removing it from included deposits', () => {
    const result = classifyTransaction(
      tx({
        id: 'z',
        date: '2026-01-01',
        amount: 1,
        description: 'Zelle payment from JOHN SMITH',
      })
    );
    expect(result.category).toBe('p2p_transfer');
    expect(result.subcategory).toBe('zelle');
  });

  it('categorizes TurboPass P2PCredits as P2P and still includes them', () => {
    const analysis = analyzeIncome([
      tx({
        id: 'p2p',
        date: '2026-01-05',
        amount: 7,
        description: 'P2PCredits KAROLL SANMIGUEL',
        sourceDocumentType: 'turbopass',
        turbopassCategory: 'P2PCredits',
        sourceDocument: 'turbopass.pdf',
      }),
    ]);

    expect(analysis.totals.includedDeposits).toBe(7);
    expect(analysis.transactions[0]?.finalClassification.category).toBe('p2p_transfer');
  });

  it('categorizes TurboPass transfers, refunds, and loan advances without auto-excluding them', () => {
    const analysis = analyzeIncome([
      tx({
        id: 'tr',
        date: '2026-01-02',
        amount: 2000,
        description: 'Internal Transfers SAVINGS',
        sourceDocumentType: 'turbopass',
        turbopassCategory: 'Internal Transfers',
        sourceDocument: 'turbopass.pdf',
      }),
      tx({
        id: 'rf',
        date: '2026-01-03',
        amount: 450,
        description: 'Refunds CAPITAL ONE',
        sourceDocumentType: 'turbopass',
        turbopassCategory: 'Refunds',
        sourceDocument: 'turbopass.pdf',
      }),
      tx({
        id: 'ln',
        date: '2026-01-04',
        amount: 800,
        description: 'Loan Advances',
        sourceDocumentType: 'turbopass',
        turbopassCategory: 'Loan Advances',
        sourceDocument: 'turbopass.pdf',
      }),
    ]);

    expect(analysis.totals.includedDeposits).toBe(3250);
    expect(analysis.totals.excludedDeposits).toBe(0);
    expect(analysis.transactions.find((item) => item.id === 'tr')?.finalClassification.category).toBe(
      'account_transfer'
    );
    expect(analysis.transactions.find((item) => item.id === 'rf')?.finalClassification.category).toBe(
      'miscellaneous'
    );
    expect(analysis.transactions.find((item) => item.id === 'ln')?.finalClassification.category).toBe(
      'miscellaneous'
    );
  });

  it('keeps similar source names grouped without merging distinct businesses', () => {
    const analysis = analyzeIncome([
      tx({
        id: 'a',
        date: '2026-01-07',
        amount: 3700,
        description: 'TINEDALE FARMS PAYROLL',
      }),
      tx({
        id: 'b',
        date: '2026-02-07',
        amount: 3900,
        description: 'TINEDALE FARMS INC PAYROLL',
        sourceDocument: 'feb.pdf',
      }),
      tx({
        id: 'c',
        date: '2026-01-12',
        amount: 1400,
        description: 'ABC PAINTING CUSTOMERS PAYROLL',
      }),
    ]);

    expect(analysis.sources.map((source) => source.source)).toEqual([
      'Tinedale Farms',
      'Abc Painting Customers',
    ]);
    expect(analysis.sources[0]?.total).toBe(7600);
    expect(analysis.sources[0]?.count).toBe(2);
  });
});

describe('duplicates and transfers', () => {
  it('does not double-count the same inflow appearing in two documents', () => {
    const analysis = analyzeIncome([
      tx({
        id: 'bank',
        date: '2026-01-09',
        amount: 843.19,
        description: 'UNITED MAINTENAN DES:PAYROLL PPD',
        sourceDocument: 'bank.pdf',
      }),
      tx({
        id: 'turbo',
        date: '2026-01-09',
        amount: 843.19,
        description: 'UNITED MAINTENAN DES:PAYROLL PPD',
        sourceDocument: 'turbopass.pdf',
        sourceDocumentType: 'turbopass',
      }),
    ]);

    expect(analysis.totals.includedDeposits).toBe(843.19);
    expect(analysis.totals.totalDeposits).toBe(843.19);
    expect(analysis.totals.duplicateCount).toBe(1);
    expect(analysis.transactions[1]?.duplicateOf).toBe('bank');
  });

  it('still counts two genuine same-amount payroll deposits in one account', () => {
    const analysis = analyzeIncome([
      tx({
        id: 'p1',
        date: '2026-01-07',
        amount: 2000,
        description: 'ADP PAYROLL ACME',
      }),
      tx({
        id: 'p2',
        date: '2026-01-21',
        amount: 2000,
        description: 'ADP PAYROLL ACME',
      }),
    ]);

    expect(analysis.totals.includedDeposits).toBe(4000);
  });

  it('categorizes a matched internal transfer but still includes it until the underwriter excludes it', () => {
    const analysis = analyzeIncome([
      tx({
        id: 'out',
        date: '2026-01-09',
        amount: 2000,
        description: 'ONLINE TRANSFER TO SAVINGS',
        direction: 'out',
        sourceAccount: '1111',
        sourceDocument: 'checking.pdf',
      }),
      tx({
        id: 'inn',
        date: '2026-01-10',
        amount: 2000,
        description: 'ONLINE TRANSFER FROM CHECKING',
        sourceAccount: '2222',
        sourceDocument: 'savings.pdf',
      }),
    ]);

    const inflow = analysis.transactions.find((item) => item.id === 'inn');
    expect(inflow?.finalClassification.category).toBe('account_transfer');
    expect(inflow?.transferMatch?.matchedTransactionId).toBe('out');
    expect(inflow?.included).toBe(true);
    expect(analysis.totals.includedDeposits).toBe(2000);
    expect(analysis.totals.excludedDeposits).toBe(0);
  });

  it('categorizes a possible matched movement without excluding it', () => {
    const analysis = analyzeIncome([
      tx({
        id: 'out',
        date: '2026-01-09',
        amount: 1500,
        description: 'POS PURCHASE STORE 12',
        direction: 'out',
        sourceAccount: '1111',
        sourceDocument: 'checking.pdf',
      }),
      tx({
        id: 'inn',
        date: '2026-01-11',
        amount: 1500,
        description: 'MOBILE DEPOSIT',
        sourceAccount: '2222',
        sourceDocument: 'savings.pdf',
      }),
    ]);

    const inflow = analysis.transactions.find((item) => item.id === 'inn');
    expect(inflow?.finalClassification.category).toBe('account_transfer');
    expect(inflow?.included).toBe(true);
    expect(analysis.totals.includedDeposits).toBe(1500);
  });
});

describe('underwriter overrides', () => {
  it('recalculates totals immediately after include/exclude', () => {
    const initial = analyzeIncome([
      tx({
        id: 'z1',
        date: '2026-02-14',
        amount: 2400,
        description: 'Zelle payment from JOHN SMITH',
      }),
      tx({
        id: 'p1',
        date: '2026-02-01',
        amount: 3600,
        description: 'ADP PAYROLL TINEDALE FARMS',
      }),
    ]);

    expect(initial.totals.includedDeposits).toBe(6000);

    const excluded = applyInclusion(initial, 'z1', false, 'Not income.');
    expect(excluded.totals.includedDeposits).toBe(3600);
    expect(excluded.totals.excludedDeposits).toBe(2400);
    expect(excluded.transactions.find((item) => item.id === 'z1')?.inclusionSource).toBe(
      'underwriter'
    );
    expect(excluded.transactions.find((item) => item.id === 'z1')?.finalClassification.category).toBe(
      'p2p_transfer'
    );

    const restored = applyInclusion(excluded, 'z1', true);
    expect(restored.totals.includedDeposits).toBe(6000);
  });

  it('can exclude an entire category and recalc immediately', () => {
    const initial = analyzeIncome([
      tx({ id: 'p', date: '2026-01-01', amount: 1000, description: 'ADP PAYROLL ACME' }),
      tx({ id: 'z', date: '2026-01-02', amount: 200, description: 'Zelle payment from ANN' }),
    ]);
    const excluded = applyCategoryInclusion(initial, 'p2p_transfer', false);
    expect(excluded.totals.includedDeposits).toBe(1000);
    expect(excluded.totals.excludedDeposits).toBe(200);
  });

  it('can change a transaction category without changing inclusion', () => {
    const initial = analyzeIncome([
      tx({
        id: 't1',
        date: '2026-01-10',
        amount: 3000,
        description: 'TRANSFER FROM SAVINGS XXXX1234',
      }),
    ]);
    expect(initial.transactions[0]?.finalClassification.category).toBe('account_transfer');
    expect(initial.transactions[0]?.included).toBe(true);

    const recategorized = applyCategoryOverride(initial, 't1', 'payroll');
    expect(recategorized.transactions[0]?.finalClassification.category).toBe('payroll');
    expect(recategorized.transactions[0]?.included).toBe(true);
    expect(recategorized.totals.includedDeposits).toBe(3000);
  });

  it('can exclude all deposits from a particular source and recalc immediately', () => {
    const initial = analyzeIncome([
      tx({
        id: 'z1',
        date: '2026-02-14',
        amount: 1200,
        description: 'Zelle payment from JOHN SMITH',
      }),
      tx({
        id: 'p1',
        date: '2026-02-01',
        amount: 3600,
        description: 'ADP PAYROLL TINEDALE FARMS',
      }),
    ]);
    const source = initial.transactions.find((item) => item.id === 'z1')?.detectedIncomeSource;
    expect(source).toBeTruthy();
    const excluded = applySourceInclusion(initial, source!, false);
    expect(excluded.totals.includedDeposits).toBe(3600);
    expect(excluded.totals.excludedDeposits).toBe(1200);
  });
});
