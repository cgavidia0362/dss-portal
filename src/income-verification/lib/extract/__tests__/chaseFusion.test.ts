import { describe, expect, it } from 'vitest';
import { reconstructBalanceDeltas } from '../balanceDelta';
import { parseChaseLedger } from '../chase';

describe('Chase split-column and page-level reconstruction', () => {
  it('reconstructs a detached Spanish credit amount from running-balance continuity', () => {
    const text = `
JPMorgan Chase Bank, N.A.
July 23, 2026 through August 24, 2026
Chase Total Checking 000002907827999
Beginning Balance $28.17
DETALLE
TRANSACCIONES
FECHA DESCRIPCION CANTIDAD SALDO
07/24
Zelle Payment From Example Sender One
58.17
07/27
Card Purchase Example Grocery
-10.00
48.17
`;
    const extracted = parseChaseLedger(text, 'chase-balance-delta.pdf', {
      startDate: '2026-07-23',
      endDate: '2026-08-24',
    }, '7999');
    const credits = extracted.filter((tx) => tx.direction === 'in');
    expect(credits.some((tx) => tx.amount === 30 && tx.amountSource === 'balance_delta_reconstructed')).toBe(
      true
    );
    expect(extracted.some((tx) => tx.direction === 'out' && tx.amount === 10)).toBe(true);
  });

  it('does not reconstruct when page boundaries make continuity uncertain', () => {
    const extracted = parseChaseLedger(
      'unused',
      'chase-page-break.pdf',
      { startDate: '2026-07-23', endDate: '2026-08-24' },
      '7999',
      [
        {
          pageNumber: 1,
          text: `
JPMorgan Chase Bank, N.A.
July 23, 2026 through August 24, 2026
Chase Total Checking 000002907827999
Beginning Balance $28.17
07/24 Zelle Payment From Example Sender
58.17
`,
        },
        {
          pageNumber: 2,
          text: `
07/25 Zelle Payment From Other Sender
158.17
`,
        },
      ]
    );
    const pageTwo = extracted.filter((tx) => tx.page === 2);
    expect(pageTwo.every((tx) => tx.amountSource !== 'balance_delta_reconstructed')).toBe(true);
  });
});

describe('reconstructBalanceDeltas page-boundary helper', () => {
  it('keeps the reconstructed debit/credit sign from the delta', () => {
    const result = reconstructBalanceDeltas(
      [
        {
          date: '2026-07-24',
          dateRaw: '07/24',
          description: 'ATM withdrawal Example',
          rawDescription: 'ATM withdrawal Example',
          signedAmount: null,
          runningBalance: 80,
          accountLast4: '7999',
          page: 1,
          lineIndex: 1,
          continuityBreak: false,
          referenceId: null,
        },
      ],
      100
    );
    expect(result.rows[0]?.signedAmount).toBe(-20);
  });
});

describe('Chase trailing amount/balance alignment', () => {
  it('does not attach a $260 ATM cash deposit to the following $99 Zelle', () => {
    const text = `
JPMorgan Chase Bank, N.A.
July 16, 2026 through August 17, 2026
Chase Total Checking 000002907827999
Beginning Balance $1,240.00
DATE DESCRIPTION AMOUNT BALANCE
07/27 ATM Cash Deposit 07/26 1000 Example St Example City IL Card 6915
07/27 Zelle Payment From Camilo Example 30161522999
260.00 1,500.00
99.00 1,599.00
`;
    const extracted = parseChaseLedger(
      text,
      'chase-atm-zelle-align.pdf',
      { startDate: '2026-07-16', endDate: '2026-08-17' },
      '7999'
    );
    const atm = extracted.find((tx) => /atm cash deposit/i.test(tx.description));
    const zelle = extracted.find((tx) => /zelle payment from camilo/i.test(tx.description));
    expect(atm?.amount).toBe(260);
    expect(atm?.direction).toBe('in');
    expect(zelle?.amount).toBe(99);
    expect(zelle?.direction).toBe('in');
  });

  it('splits glued Chase amount/date text so ATM $260 does not attach to the following $99 Zelle', () => {
    const text = `
JPMorgan Chase Bank, N.A.
July 16, 2026 through August 17, 2026
Chase Total Checking 000002907827999
Beginning Balance $57.76
DATE DESCRIPTION AMOUNT BALANCE
07/27
ATM cash deposit 1000 Example St Example City IL card 4048
07/25 260.00 317.7607/27
Zelle payment from Camilo Example
30161522999 99.00
416.76
`;
    const extracted = parseChaseLedger(
      text,
      'chase-glued-atm-zelle.pdf',
      { startDate: '2026-07-16', endDate: '2026-08-17' },
      '7999'
    );
    const atm = extracted.find((tx) => /atm cash deposit/i.test(tx.description));
    const zelle = extracted.find((tx) => /zelle payment from camilo/i.test(tx.description));
    expect(atm?.amount).toBe(260);
    expect(atm?.date).toBe('2026-07-27');
    expect(atm?.postedDate).toBe('2026-07-27');
    expect(zelle?.amount).toBe(99);
    expect(zelle?.date).toBe('2026-07-27');
    expect(extracted.filter((tx) => tx.amount === 260 && tx.direction === 'in')).toHaveLength(1);
    expect(extracted.filter((tx) => tx.amount === 99 && tx.direction === 'in')).toHaveLength(1);
  });
});
