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
