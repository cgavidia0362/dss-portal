import type { DepositCategory, Transaction } from '@income-verification/lib/analysis/types';

export const CATEGORY_TONES: Record<DepositCategory, { badge: string; select: string; dot: string }> = {
  payroll: {
    badge: 'border-emerald-200 bg-emerald-100/90 text-emerald-800',
    select: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    dot: 'bg-emerald-400',
  },
  p2p_transfer: {
    badge: 'border-sky-200 bg-sky-100/90 text-sky-800',
    select: 'border-sky-200 bg-sky-50 text-sky-900',
    dot: 'bg-sky-400',
  },
  cash_deposit: {
    badge: 'border-amber-200 bg-amber-100/90 text-amber-800',
    select: 'border-amber-200 bg-amber-50 text-amber-900',
    dot: 'bg-amber-400',
  },
  account_transfer: {
    badge: 'border-violet-200 bg-violet-100/90 text-violet-800',
    select: 'border-violet-200 bg-violet-50 text-violet-900',
    dot: 'bg-violet-400',
  },
  check: {
    badge: 'border-teal-200 bg-teal-100/90 text-teal-800',
    select: 'border-teal-200 bg-teal-50 text-teal-900',
    dot: 'bg-teal-400',
  },
  miscellaneous: {
    badge: 'border-stone-200 bg-stone-100 text-stone-700',
    select: 'border-stone-200 bg-stone-50 text-stone-800',
    dot: 'bg-stone-400',
  },
};

export function primaryCategoryForSource(
  transactions: Transaction[],
  sourceName: string
): DepositCategory {
  const totals: Partial<Record<DepositCategory, number>> = {};

  for (const tx of transactions) {
    if (tx.direction !== 'in' || tx.duplicateOf) continue;
    if ((tx.detectedIncomeSource || 'Unknown source') !== sourceName) continue;
    const category = tx.finalClassification.category;
    totals[category] = (totals[category] || 0) + tx.amount;
  }

  return (
    (Object.entries(totals) as Array<[DepositCategory, number]>).sort(
      (a, b) => b[1] - a[1]
    )[0]?.[0] ?? 'miscellaneous'
  );
}
