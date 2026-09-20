import { describe, expect, it } from 'vitest';
import { reconstructBalanceDeltas, type LedgerDraft } from '../balanceDelta';

function row(overrides: Partial<LedgerDraft> & Pick<LedgerDraft, 'description'>): LedgerDraft {
  return {
    date: '2026-05-24',
    dateRaw: '05/24',
    rawDescription: overrides.description,
    signedAmount: null,
    runningBalance: null,
    accountLast4: '7999',
    page: 1,
    lineIndex: 1,
    continuityBreak: false,
    referenceId: null,
    ...overrides,
  };
}

describe('balance-delta reconstruction', () => {
  it('reconstructs a missing credit amount from surrounding running balances', () => {
    const result = reconstructBalanceDeltas(
      [
        row({
          description: 'Opening marker',
          signedAmount: 10,
          runningBalance: 100,
          lineIndex: 0,
        }),
        row({
          description: 'Zelle payment from Avery Example',
          runningBalance: 175.5,
          lineIndex: 1,
        }),
      ],
      90
    );
    expect(result.recoveredCount).toBe(1);
    expect(result.rows[1]?.signedAmount).toBe(75.5);
    expect(result.rows[1]?.amountSource).toBe('balance_delta_reconstructed');
    expect(result.rows[1]?.conflict).toBe(false);
  });

  it('treats a negative balance delta as a debit', () => {
    const result = reconstructBalanceDeltas([
      row({
        description: 'Card purchase Example Grocery',
        runningBalance: 80,
        lineIndex: 1,
      }),
    ], 100);
    expect(result.rows[0]?.signedAmount).toBe(-20);
    expect(result.rows[0]?.amountSource).toBe('balance_delta_reconstructed');
  });

  it('flags descriptor vs delta conflicts instead of choosing silently', () => {
    const result = reconstructBalanceDeltas([
      row({
        description: 'Zelle payment to Blake Sample',
        runningBalance: 150,
        lineIndex: 1,
      }),
    ], 100);
    expect(result.rows[0]?.signedAmount).toBeNull();
    expect(result.rows[0]?.conflict).toBe(true);
    expect(result.recoveredCount).toBe(0);
    expect(result.conflictCount).toBe(1);
  });

  it('does not reconstruct across a page-boundary continuity break', () => {
    const result = reconstructBalanceDeltas([
      row({
        description: 'Zelle payment from Avery Example',
        runningBalance: 200,
        page: 1,
        lineIndex: 1,
      }),
      row({
        description: 'Zelle payment from Blake Sample',
        runningBalance: 275,
        page: 2,
        lineIndex: 2,
        continuityBreak: true,
      }),
    ], 100);
    expect(result.rows[1]?.signedAmount).toBeNull();
    expect(result.incompletePages).toContain(2);
  });

  it('does not reconstruct when two rows share an unresolved balance transition', () => {
    const result = reconstructBalanceDeltas([
      row({
        description: 'Zelle payment from Avery Example',
        lineIndex: 1,
      }),
      row({
        description: 'Zelle payment from Blake Sample',
        runningBalance: 200,
        lineIndex: 2,
      }),
    ], 100);
    expect(result.rows.every((item) => item.signedAmount == null)).toBe(true);
    expect(result.recoveredCount).toBe(0);
  });
});
