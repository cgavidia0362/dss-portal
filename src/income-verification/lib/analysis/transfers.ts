import { daysBetween } from './dates';
import { amountsEqual } from './money';
import { normalizeText } from './source';
import type { DepositClassification, Transaction, TransferMatch } from './types';

const TRANSFER_HINTS = [
  'TRANSFER',
  'SAVINGS',
  'CHECKING',
  'FROM ACCOUNT',
  'TO ACCOUNT',
];

function hasTransferHint(tx: Transaction): boolean {
  const text = normalizeText(tx.rawDescription || tx.description);
  return TRANSFER_HINTS.some((hint) => text.includes(hint));
}

function differentAccounts(a: Transaction, b: Transaction): boolean {
  if (a.sourceAccount && b.sourceAccount && a.sourceAccount !== b.sourceAccount) {
    return true;
  }
  return a.sourceDocument !== b.sourceDocument;
}

export function detectTransfers(transactions: Transaction[]): Transaction[] {
  const usedOut = new Set<string>();
  const matchById = new Map<string, { classification: DepositClassification; match: TransferMatch }>();

  const inflows = transactions.filter((tx) => tx.direction === 'in');
  const outflows = transactions.filter((tx) => tx.direction === 'out');

  for (const inflow of inflows) {
    let best: { outflow: Transaction; days: number; confidence: number } | null = null;

    for (const outflow of outflows) {
      if (usedOut.has(outflow.id)) continue;
      if (!amountsEqual(inflow.amount, outflow.amount)) continue;
      if (!differentAccounts(inflow, outflow)) continue;

      const days = daysBetween(inflow.date, outflow.date);
      if (days > 2) continue;

      const hinted = hasTransferHint(inflow) || hasTransferHint(outflow);
      const confidence = hinted ? 0.93 : 0.72;
      if (!best || confidence > best.confidence || (confidence === best.confidence && days < best.days)) {
        best = { outflow, days, confidence };
      }
    }

    if (!best) continue;
    usedOut.add(best.outflow.id);

    const classification: DepositClassification = {
      category: 'account_transfer',
      subcategory: 'matched_transfer',
      source: 'rule',
      confidence: best.confidence,
      reason: `Matching ${inflow.amount.toFixed(2)} movement found in ${best.outflow.sourceDocument} ${best.days} day(s) apart.`,
    };

    matchById.set(inflow.id, {
      classification,
      match: {
        matchedTransactionId: best.outflow.id,
        amount: inflow.amount,
        dateDistanceDays: best.days,
        reason: classification.reason,
        confidence: best.confidence,
      },
    });
  }

  return transactions.map((tx) => {
    const found = matchById.get(tx.id);
    if (!found) return tx;
    return {
      ...tx,
      ruleClassification: found.classification,
      transferMatch: found.match,
    };
  });
}
