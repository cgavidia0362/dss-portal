import type { MoneyDirection } from '../analysis/types';
import { amountsEqual, roundMoney } from '../analysis/money';
import { foldBankText } from './parse';

export type AmountSource = 'explicit' | 'balance_delta_reconstructed' | 'model';

export interface LedgerDraft {
  date: string;
  dateRaw: string;
  description: string;
  rawDescription: string;
  signedAmount: number | null;
  runningBalance: number | null;
  accountLast4: string | null;
  page: number | null;
  lineIndex: number;
  continuityBreak: boolean;
  referenceId: string | null;
  forceOutgoing?: boolean;
  queuedCredit?: boolean;
}

export interface ReconstructedLedgerRow extends LedgerDraft {
  amountSource: AmountSource;
  conflict: boolean;
}

export function directionHintFromDescription(description: string): MoneyDirection | null {
  const folded = foldBankText(description);
  if (
    /zelle payment to|payment sent|card purchase|compra con tarjeta|atm withdrawal|retiro|online transfer to|cargo mensual|service fee|pago enviado|electronic withdrawal/i.test(
      folded
    )
  ) {
    return 'out';
  }
  if (
    /zelle payment from|zelle from|zel from|deposito|deposit|payroll|online transfer from|reversal|atm cash deposit|mobile deposit|payment received/i.test(
      folded
    )
  ) {
    return 'in';
  }
  return null;
}

export function reconstructBalanceDeltas(
  rows: LedgerDraft[],
  initialBalance: number | null = null
): {
  rows: ReconstructedLedgerRow[];
  recoveredCount: number;
  conflictCount: number;
  incompletePages: number[];
} {
  const reconstructed: ReconstructedLedgerRow[] = [];
  let previousBalance = initialBalance;
  let previousPage: number | null = null;
  let recoveredCount = 0;
  let conflictCount = 0;
  let pendingUnresolved = false;
  const incompletePages = new Set<number>();

  for (const row of rows) {
    const pageChanged =
      row.page != null && previousPage != null && row.page !== previousPage;
    if (row.continuityBreak || pageChanged) {
      previousBalance = pageChanged || row.continuityBreak ? null : previousBalance;
      if (row.continuityBreak || pageChanged) {
        previousBalance = null;
        pendingUnresolved = false;
      }
    }

    let signedAmount = row.signedAmount;
    let amountSource: AmountSource = signedAmount != null ? 'explicit' : 'model';
    let conflict = false;
    const hint = directionHintFromDescription(row.description);
    const sharedUnresolvedTransition = pendingUnresolved && signedAmount == null;

    if (sharedUnresolvedTransition) {
      conflict = true;
      conflictCount += 1;
      if (row.page != null) incompletePages.add(row.page);
    } else if (
      previousBalance != null &&
      row.runningBalance != null &&
      !row.continuityBreak &&
      !pageChanged &&
      !sharedUnresolvedTransition
    ) {
      const delta = roundMoney(row.runningBalance - previousBalance);
      const implied: MoneyDirection | null = delta === 0 ? null : delta > 0 ? 'in' : 'out';

      if (signedAmount != null && implied && !amountsEqual(signedAmount, delta)) {
        if (row.queuedCredit && (!hint || hint === implied)) {
          signedAmount = delta;
          amountSource = 'balance_delta_reconstructed';
          recoveredCount += 1;
        } else {
          conflict = true;
          conflictCount += 1;
        }
      } else if (signedAmount == null && implied) {
        if (hint && implied !== hint) {
          conflict = true;
          conflictCount += 1;
          if (row.page != null) incompletePages.add(row.page);
        } else {
          signedAmount = delta;
          amountSource = 'balance_delta_reconstructed';
          recoveredCount += 1;
        }
      }
    } else if (signedAmount == null) {
      pendingUnresolved = true;
      if (row.page != null) incompletePages.add(row.page);
    }

    if (signedAmount != null && !conflict) pendingUnresolved = false;
    if (row.runningBalance != null) previousBalance = row.runningBalance;
    if (row.page != null) previousPage = row.page;

    reconstructed.push({
      ...row,
      signedAmount,
      amountSource,
      conflict,
    });
  }

  return {
    rows: reconstructed,
    recoveredCount,
    conflictCount,
    incompletePages: [...incompletePages].sort((a, b) => a - b),
  };
}
