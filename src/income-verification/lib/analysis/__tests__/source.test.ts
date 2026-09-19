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

  it('treats PNC-truncated Zelle ("Zel From") as the same P2P source family', () => {
    expect(parseIncomeSource('Zel From Blake Sample').source).toBe('Blake Sample');
    const analysis = analyzeIncome([
      tx({
        id: 'zel1',
        date: '2026-07-22',
        amount: 50,
        description: 'Zel From Blake Sample',
      }),
      tx({
        id: 'zelle1',
        date: '2026-07-21',
        amount: 75,
        description: 'Zelle From Avery Example',
      }),
    ]);
    expect(analysis.transactions.every((item) => item.finalClassification.category === 'p2p_transfer')).toBe(
      true
    );
    expect(analysis.transactions.find((item) => item.id === 'zel1')?.normalizedSource).toBe(
      'Blake Sample'
    );
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

  it('groups Chase Zelle senders across different transaction IDs without merging deposits', () => {
    const analysis = analyzeIncome([
      tx({
        id: 'c1',
        date: '2026-07-20',
        amount: 1350,
        description:
          'Depósito quickpay por internet. Zelle payment from jed roofing corp. 30075819083',
        rawDescription:
          '07/20 Depósito quickpay por internet. Zelle payment from jed roofing corp. | 30075819083 1,371.46',
      }),
      tx({
        id: 'c2',
        date: '2026-07-27',
        amount: 1250,
        description:
          'Depósito quickpay por internet. Zelle payment from jed roofing corp. 30162192404',
      }),
      tx({
        id: 'c3',
        date: '2026-08-03',
        amount: 750,
        description:
          'Depósito quickpay por internet. Zelle payment from jed roofing corp. 30254388093',
      }),
      tx({
        id: 'c4',
        date: '2026-07-20',
        amount: 75,
        description:
          'Depósito quickpay por internet. Zelle payment from fernando coraizaca 30066842205',
      }),
      tx({
        id: 'c5',
        date: '2026-08-03',
        amount: 40,
        description:
          'Depósito quickpay por internet. Zelle payment from fernando coraizaca 30245794820',
      }),
    ]);

    expect(analysis.transactions).toHaveLength(5);
    expect(analysis.totals.includedDeposits).toBe(3465);
    const jed = analysis.sources.find((source) => /Jed Roofing/i.test(source.source));
    const fernando = analysis.sources.find((source) => /Fernando Coraizaca/i.test(source.source));
    expect(jed?.count).toBe(3);
    expect(jed?.totalDeposits).toBe(3350);
    expect(fernando?.count).toBe(2);
    expect(fernando?.totalDeposits).toBe(115);
    expect(jed?.source).not.toMatch(/\d{8,}/);
    expect(fernando?.source).not.toMatch(/\d{8,}/);
    // Transaction IDs remain in raw/description metadata, not the source key.
    expect(analysis.transactions[0]?.rawDescription).toMatch(/30075819083/);
    expect(analysis.transactions[0]?.description).toMatch(/30075819083/);
    expect(analysis.transactions.map((item) => item.id).sort()).toEqual([
      'c1',
      'c2',
      'c3',
      'c4',
      'c5',
    ]);
  });

  it('groups Chase savings/checking transfer origins without transaction numbers', () => {
    const analysis = analyzeIncome([
      tx({
        id: 't1',
        date: '2026-07-16',
        amount: 10,
        description:
          'Depósito preautorizado. Online transfer from sav ...5296 Transaction#: 30027542922',
      }),
      tx({
        id: 't2',
        date: '2026-07-17',
        amount: 20,
        description:
          'Depósito preautorizado. Online transfer from sav ...5296 Transaction#: 30042619291',
      }),
      tx({
        id: 't3',
        date: '2026-07-21',
        amount: 25,
        description:
          'Transferencia desde cuenta de cheques. Online transfer from chk ...9727 Transaction#: 30089569349',
      }),
      tx({
        id: 't4',
        date: '2026-07-28',
        amount: 25,
        description:
          'Transferencia desde cuenta de cheques. Online transfer from chk ...9727 Transaction#: 30173722729',
      }),
    ]);

    expect(analysis.transactions).toHaveLength(4);
    expect(analysis.totals.includedDeposits).toBe(80);
    const savings = analysis.sources.find((source) => /Savings/i.test(source.source));
    const checking = analysis.sources.find((source) => /Checking/i.test(source.source));
    expect(savings?.count).toBe(2);
    expect(savings?.totalDeposits).toBe(30);
    expect(checking?.count).toBe(2);
    expect(checking?.totalDeposits).toBe(50);
    expect(savings?.source).toMatch(/Transfer from Savings/i);
    expect(savings?.source).toMatch(/\.\.\.5296/);
    expect(savings?.source).not.toMatch(/Transaction|30027542922/i);
    expect(checking?.source).not.toMatch(/Transaction|30089569349/i);
    expect(analysis.transactions[0]?.description).toMatch(/30027542922/);
  });
});
