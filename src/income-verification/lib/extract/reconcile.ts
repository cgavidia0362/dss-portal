import { fromCents, roundMoney, toCents } from '../analysis/money';
import type { MoneyDirection } from '../analysis/types';
import type { StatementControlTotals } from './documentModel';

export type ReconciliationStatus = 'verified' | 'partial' | 'mismatch' | 'unavailable';

export interface DirectionReconciliation {
  expectedTotal: number | null;
  extractedTotal: number;
  difference: number | null;
  status: ReconciliationStatus;
}

export interface ReconciliationResult {
  expectedCreditTotal: number | null;
  extractedCreditTotal: number;
  creditDifference: number | null;
  expectedDebitTotal: number | null;
  extractedDebitTotal: number;
  debitDifference: number | null;
  expectedTransactionCount: number | null;
  extractedTransactionCount: number;
  /** Income/deposit trust uses credit status only. */
  status: ReconciliationStatus;
  creditStatus: ReconciliationStatus;
  debitStatus: ReconciliationStatus;
  creditReconciliation: DirectionReconciliation;
  debitReconciliation: DirectionReconciliation;
  accountLast4: string | null;
  accountLabel: string | null;
}

type ReconTransaction = {
  direction: MoneyDirection;
  amount: number;
  sourceAccount?: string | null;
};

function centsOrNull(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return toCents(value);
}

function moneyFromCents(value: number | null): number | null {
  return value == null ? null : fromCents(value);
}

export function sumDirection(transactions: ReconTransaction[], direction: MoneyDirection): number {
  return roundMoney(
    transactions
      .filter((tx) => tx.direction === direction)
      .reduce((sum, tx) => sum + tx.amount, 0)
  );
}

function statusFromExpected(
  expectedCents: number | null,
  extractedCents: number,
  extraMismatch = false
): ReconciliationStatus {
  if (expectedCents == null) return 'unavailable';
  if (extraMismatch || expectedCents !== extractedCents) return 'mismatch';
  return 'verified';
}

function directionView(
  expectedTotal: number | null,
  extractedTotal: number,
  difference: number | null,
  status: ReconciliationStatus
): DirectionReconciliation {
  return { expectedTotal, extractedTotal, difference, status };
}

function withDirectionViews(result: Omit<ReconciliationResult, 'creditReconciliation' | 'debitReconciliation'>): ReconciliationResult {
  return {
    ...result,
    creditReconciliation: directionView(
      result.expectedCreditTotal,
      result.extractedCreditTotal,
      result.creditDifference,
      result.creditStatus
    ),
    debitReconciliation: directionView(
      result.expectedDebitTotal,
      result.extractedDebitTotal,
      result.debitDifference,
      result.debitStatus
    ),
  };
}

export function reconcileTransactions(params: {
  transactions: ReconTransaction[];
  expectedCreditTotal?: number | null;
  expectedDebitTotal?: number | null;
  expectedCreditCount?: number | null;
  accountLast4?: string | null;
  accountLabel?: string | null;
}): ReconciliationResult {
  const extractedCreditTotal = sumDirection(params.transactions, 'in');
  const extractedDebitTotal = sumDirection(params.transactions, 'out');
  const extractedCreditCount = params.transactions.filter((tx) => tx.direction === 'in').length;

  const expectedCreditCents = centsOrNull(params.expectedCreditTotal);
  const expectedDebitCents = centsOrNull(params.expectedDebitTotal);
  const extractedCreditCents = toCents(extractedCreditTotal);
  const extractedDebitCents = toCents(extractedDebitTotal);

  const creditDifference =
    expectedCreditCents == null ? null : fromCents(extractedCreditCents - expectedCreditCents);
  const debitDifference =
    expectedDebitCents == null ? null : fromCents(extractedDebitCents - expectedDebitCents);

  const countMismatch =
    params.expectedCreditCount != null && extractedCreditCount !== params.expectedCreditCount;
  const creditStatus = statusFromExpected(expectedCreditCents, extractedCreditCents, countMismatch);
  const debitStatus = statusFromExpected(expectedDebitCents, extractedDebitCents);

  return withDirectionViews({
    expectedCreditTotal: moneyFromCents(expectedCreditCents),
    extractedCreditTotal,
    creditDifference,
    expectedDebitTotal: moneyFromCents(expectedDebitCents),
    extractedDebitTotal,
    debitDifference,
    expectedTransactionCount: params.expectedCreditCount ?? null,
    extractedTransactionCount: extractedCreditCount,
    status: creditStatus,
    creditStatus,
    debitStatus,
    accountLast4: params.accountLast4 ?? null,
    accountLabel: params.accountLabel ?? null,
  });
}

export function reconcileAgainstControls(
  transactions: ReconTransaction[],
  controls: StatementControlTotals[]
): ReconciliationResult {
  if (!controls.length) {
    return reconcileTransactions({ transactions });
  }

  const results = controls.map((control) => {
    const scoped =
      control.accountLast4 == null
        ? transactions
        : transactions.filter(
            (tx) => !tx.sourceAccount || tx.sourceAccount === control.accountLast4
          );
    return reconcileTransactions({
      transactions: scoped,
      expectedCreditTotal: control.creditTotal,
      expectedDebitTotal: control.debitTotal,
      expectedCreditCount: control.creditCount,
      accountLast4: control.accountLast4,
      accountLabel: control.accountLabel,
    });
  });

  return combineReconciliations(results);
}

function combineStatuses(statuses: ReconciliationStatus[]): ReconciliationStatus {
  const unique = new Set(statuses);
  if (unique.has('mismatch')) return 'mismatch';
  if (unique.has('partial')) return 'partial';
  if (unique.size === 1 && unique.has('verified')) return 'verified';
  if (unique.size === 1 && unique.has('unavailable')) return 'unavailable';
  if (unique.has('verified') && unique.has('unavailable')) return 'partial';
  return 'partial';
}

export function combineReconciliations(results: ReconciliationResult[]): ReconciliationResult {
  if (!results.length) {
    return reconcileTransactions({ transactions: [] });
  }
  if (results.length === 1) return results[0];

  const expectedCreditCents = sumNullableCents(results.map((r) => r.expectedCreditTotal));
  const extractedCreditCents = results.reduce((sum, r) => sum + toCents(r.extractedCreditTotal), 0);
  const expectedDebitCents = sumNullableCents(results.map((r) => r.expectedDebitTotal));
  const extractedDebitCents = results.reduce((sum, r) => sum + toCents(r.extractedDebitTotal), 0);
  const expectedCount = sumNullableInts(results.map((r) => r.expectedTransactionCount));
  const extractedCount = results.reduce((sum, r) => sum + r.extractedTransactionCount, 0);
  const creditStatus = combineStatuses(results.map((r) => r.creditStatus));
  const debitStatus = combineStatuses(results.map((r) => r.debitStatus));

  return withDirectionViews({
    expectedCreditTotal: expectedCreditCents == null ? null : fromCents(expectedCreditCents),
    extractedCreditTotal: fromCents(extractedCreditCents),
    creditDifference:
      expectedCreditCents == null ? null : fromCents(extractedCreditCents - expectedCreditCents),
    expectedDebitTotal: expectedDebitCents == null ? null : fromCents(expectedDebitCents),
    extractedDebitTotal: fromCents(extractedDebitCents),
    debitDifference:
      expectedDebitCents == null ? null : fromCents(extractedDebitCents - expectedDebitCents),
    expectedTransactionCount: expectedCount,
    extractedTransactionCount: extractedCount,
    status: creditStatus,
    creditStatus,
    debitStatus,
    accountLast4: null,
    accountLabel: results.length > 1 ? 'combined' : results[0]?.accountLabel ?? null,
  });
}

function sumNullableCents(values: Array<number | null>): number | null {
  const present = values.filter((value): value is number => value != null);
  if (!present.length) return null;
  return present.reduce((sum, value) => sum + toCents(value), 0);
}

function sumNullableInts(values: Array<number | null>): number | null {
  const present = values.filter((value): value is number => value != null);
  if (!present.length) return null;
  return present.reduce((sum, value) => sum + value, 0);
}

export function isImplausiblyFew(
  extractedCount: number,
  extractedTotal: number,
  expectedCount: number | null,
  expectedTotal: number | null
): boolean {
  if (extractedCount === 0) return true;
  if (expectedCount != null && expectedCount > 0 && extractedCount < Math.max(1, Math.ceil(expectedCount * 0.5))) {
    return true;
  }
  if (expectedTotal != null && expectedTotal > 0) {
    return toCents(extractedTotal) < Math.round(toCents(expectedTotal) * 0.5);
  }
  return false;
}
