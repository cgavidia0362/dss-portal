import type { Transaction } from './types';
import { normalizeText } from './source';

function duplicateKey(tx: Transaction): string {
  return `${tx.date}|${tx.amount.toFixed(2)}|${normalizeText(tx.rawDescription || tx.description)}`;
}

export function detectDuplicates(transactions: Transaction[]): Transaction[] {
  const seen = new Map<string, Transaction>();

  return transactions.map((tx) => {
    if (tx.direction !== 'in') return tx;

    const key = duplicateKey(tx);
    const original = seen.get(key);

    if (!original) {
      seen.set(key, tx);
      return tx;
    }

    if (original.sourceDocument === tx.sourceDocument) {
      return tx;
    }

    return {
      ...tx,
      included: false,
      inclusionSource: 'duplicate',
      duplicateOf: original.id,
      exclusionReason: `Duplicate of ${original.sourceDocument} transaction ${original.id}.`,
    };
  });
}
