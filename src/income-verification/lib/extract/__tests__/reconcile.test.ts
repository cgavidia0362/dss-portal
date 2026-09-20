import { describe, expect, it } from 'vitest';
import { toCents } from '../../analysis/money';
import {
  combineReconciliations,
  isImplausiblyFew,
  reconcileTransactions,
} from '../reconcile';

describe('reconciliation engine', () => {
  it('compares using integer cents rather than float equality', () => {
    const result = reconcileTransactions({
      transactions: [
        { direction: 'in', amount: 10.1 },
        { direction: 'in', amount: 0.2 },
      ],
      expectedCreditTotal: 10.3,
    });
    expect(toCents(result.extractedCreditTotal)).toBe(1030);
    expect(result.status).toBe('verified');
    expect(result.creditDifference).toBe(0);
  });

  it('marks a mismatch when extracted credits disagree', () => {
    const result = reconcileTransactions({
      transactions: [{ direction: 'in', amount: 100 }],
      expectedCreditTotal: 125,
    });
    expect(result.status).toBe('mismatch');
    expect(result.creditDifference).toBe(-25);
  });

  it('is unavailable when the statement has no control totals', () => {
    const result = reconcileTransactions({
      transactions: [{ direction: 'in', amount: 50 }],
    });
    expect(result.status).toBe('unavailable');
    expect(result.creditDifference).toBeNull();
  });

  it('combines per-account results without hiding a mismatch', () => {
    const combined = combineReconciliations([
      reconcileTransactions({
        transactions: [{ direction: 'in', amount: 100 }],
        expectedCreditTotal: 100,
        accountLabel: 'Checking',
      }),
      reconcileTransactions({
        transactions: [{ direction: 'in', amount: 20 }],
        expectedCreditTotal: 50,
        accountLabel: 'Savings',
      }),
    ]);
    expect(combined.status).toBe('mismatch');
  });

  it('detects implausibly few extracted rows', () => {
    expect(isImplausiblyFew(2, 40, 20, 400)).toBe(true);
    expect(isImplausiblyFew(20, 400, 20, 400)).toBe(false);
  });
});
