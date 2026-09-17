import { describe, expect, it } from 'vitest';
import { analyzeIncome, parseIncomeSource } from '../index';
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

describe('source parsing', () => {
  it('extracts an ATM depositor name and ignores changing ATM numbers', () => {
    const first = parseIncomeSource(
      'BKOFAMERICA ATM XXXXX7196 DEPOSIT BOLINGBROOK LILY C BOLINGBROOK IL'
    );
    const second = parseIncomeSource(
      'BKOFAMERICA ATM XXXXX1325 DEPOSIT BOLINGBROOK LILY C BOLINGBROOK IL'
    );
    const third = parseIncomeSource(
      'BKOFAMERICA ATM XXXXX9819 DEPOSIT BOLINGBROOK LILY C BOLINGBROOK IL'
    );
    expect(first.source).toBe('Lily C');
    expect(second.source).toBe('Lily C');
    expect(third.source).toBe('Lily C');
  });

  it('extracts a Zelle sender and ignores confirmation numbers', () => {
    expect(
      parseIncomeSource('ZELLE PAYMENT FROM MARILI MATEO CONF XXXXX7FE').source
    ).toBe('Marili Mateo');
    expect(
      parseIncomeSource('Zelle payment from MARILI MATEO for "p"; Conf# 99cv3y7fe').source
    ).toBe('Marili Mateo');
  });

  it('extracts a payroll company and ignores ACH identifiers', () => {
    expect(
      parseIncomeSource(
        'R E D LOGISTICS DES:ACH ID: INDN:Jane Doe CO ID:XXXXX63899 PPD'
      ).source
    ).toBe('R E D Logistics');
    expect(
      parseIncomeSource(
        'R E D LOGISTICS DES:ACH ID: INDN:Jane Doe CO ID:XXXXX11111 PPD'
      ).source
    ).toBe('R E D Logistics');
  });

  it('uses the cleaned description instead of a raw CSV line with extra commas', () => {
    expect(
      parseIncomeSource(
        'ADP PAYROLL TINEDALE FARMS',
        '01/07/2026,ADP PAYROLL TINEDALE FARMS,,3700.00'
      ).source
    ).toBe('Tinedale Farms');
  });
});

describe('source grouping', () => {
  it('groups ATM deposits with changing reference numbers without merging the transactions', () => {
    const analysis = analyzeIncome([
      tx({
        id: 'atm1',
        date: '2026-06-12',
        amount: 850,
        description: 'BKOFAMERICA ATM XXXXX7196 DEPOSIT BOLINGBROOK LILY C BOLINGBROOK IL',
      }),
      tx({
        id: 'atm2',
        date: '2026-07-08',
        amount: 900,
        description: 'BKOFAMERICA ATM XXXXX1325 DEPOSIT BOLINGBROOK LILY C BOLINGBROOK IL',
      }),
      tx({
        id: 'atm3',
        date: '2026-08-03',
        amount: 775,
        description: 'BKOFAMERICA ATM XXXXX9819 DEPOSIT BOLINGBROOK LILY C BOLINGBROOK IL',
      }),
    ]);

    expect(analysis.transactions).toHaveLength(3);
    expect(analysis.transactions.every((item) => item.included)).toBe(true);
    expect(analysis.transactions.map((item) => item.normalizedSource)).toEqual([
      'Lily C',
      'Lily C',
      'Lily C',
    ]);
    expect(analysis.sources).toHaveLength(1);
    expect(analysis.sources[0]?.source).toBe('Lily C');
    expect(analysis.sources[0]?.category).toBe('cash_deposit');
    expect(analysis.sources[0]?.count).toBe(3);
    expect(analysis.sources[0]?.totalDeposits).toBe(2525);
    expect(analysis.totals.includedDeposits).toBe(2525);
    expect(analysis.sources[0]?.transactionIds).toEqual(['atm1', 'atm2', 'atm3']);
  });

  it('groups Zelle payments from the same person while keeping different people separate', () => {
    const analysis = analyzeIncome([
      tx({
        id: 'z1',
        date: '2026-08-01',
        amount: 50,
        description: 'Zelle payment from MARILI MATEO for "p"; Conf# 99cv3y7fe',
      }),
      tx({
        id: 'z2',
        date: '2026-08-17',
        amount: 75,
        description: 'ZELLE PAYMENT FROM MARILI MATEO CONF ab12cd34',
      }),
      tx({
        id: 'z3',
        date: '2026-08-20',
        amount: 40,
        description: 'Zelle payment from KAROLL SANMIGUEL Conf# xyz987',
      }),
    ]);

    expect(analysis.transactions).toHaveLength(3);
    expect(analysis.sources.map((source) => source.source).sort()).toEqual([
      'Karoll Sanmiguel',
      'Marili Mateo',
    ]);
    expect(analysis.sources.find((source) => source.source === 'Marili Mateo')?.count).toBe(2);
    expect(analysis.sources.find((source) => source.source === 'Marili Mateo')?.totalDeposits).toBe(
      125
    );
    expect(analysis.sources.find((source) => source.source === 'Karoll Sanmiguel')?.count).toBe(1);
    expect(analysis.totals.includedDeposits).toBe(165);
  });

  it('groups payroll ACH rows with different IDs as one employer', () => {
    const analysis = analyzeIncome([
      tx({
        id: 'p1',
        date: '2026-07-11',
        amount: 1325.1,
        description: 'R E D LOGISTICS DES:ACH ID: INDN:Jane Doe CO ID:XXXXX63899 PPD',
      }),
      tx({
        id: 'p2',
        date: '2026-08-11',
        amount: 1325.1,
        description: 'R E D LOGISTICS DES:ACH ID: INDN:Jane Doe CO ID:XXXXX11111 PPD',
      }),
    ]);

    expect(analysis.transactions).toHaveLength(2);
    expect(analysis.sources).toHaveLength(1);
    expect(analysis.sources[0]?.source).toBe('R E D Logistics');
    expect(analysis.sources[0]?.count).toBe(2);
    expect(analysis.totals.includedDeposits).toBe(2650.2);
  });
});
