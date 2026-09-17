import { formatMoney } from '@income-verification/lib/analysis/format';
import type { Transaction } from '@income-verification/lib/analysis/types';
import { CategoryBadge } from './CategoryBadge';

export function ExcludedList({ transactions }: { transactions: Transaction[] }) {
  const excluded = transactions.filter((tx) => tx.direction === 'in' && !tx.included);

  return (
    <section className="rounded border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold">Excluded deposits</h2>
        <p className="text-xs text-slate-500">
          {excluded.length} incoming item{excluded.length === 1 ? '' : 's'} not counted in included deposits.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-xs">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Date</th>
              <th className="px-3 py-2 font-medium">Description</th>
              <th className="px-3 py-2 font-medium">Amount</th>
              <th className="px-3 py-2 font-medium">Category</th>
              <th className="px-3 py-2 font-medium">Reason</th>
            </tr>
          </thead>
          <tbody>
            {excluded.map((tx) => (
              <tr key={tx.id} className="border-t border-slate-200 bg-white">
                <td className="whitespace-nowrap px-3 py-2">
                  {tx.date}
                </td>
                <td className="px-3 py-2">{tx.description}</td>
                <td className="px-3 py-2 tabular-nums">{formatMoney(tx.amount)}</td>
                <td className="px-3 py-2">
                  <CategoryBadge category={tx.finalClassification.category} />
                </td>
                <td className="px-3 py-2 text-slate-600">{tx.exclusionReason || 'Excluded.'}</td>
              </tr>
            ))}
            {excluded.length === 0 && (
              <tr>
                <td className="px-3 py-6 text-slate-500" colSpan={5}>
                  No incoming deposits are currently excluded.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
