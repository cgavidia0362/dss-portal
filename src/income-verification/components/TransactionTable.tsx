import { useMemo, useState } from 'react';
import { formatConfidence, formatMoney } from '@income-verification/lib/analysis/format';
import { DEPOSIT_CATEGORIES, DEPOSIT_CATEGORY_LABELS } from '@income-verification/lib/analysis/labels';
import type { DepositCategory, Transaction } from '@income-verification/lib/analysis/types';
import { CategorySelect } from './OverrideSelect';
import { StatusBadge } from './StatusBadge';

type SortKey = 'date' | 'description' | 'amount' | 'classification' | 'confidence';

export function TransactionTable({
  transactions,
  months,
  sourceFilter,
  onInclude,
  onCategory,
  onClearSource,
}: {
  transactions: Transaction[];
  months: string[];
  sourceFilter: string | null;
  onInclude: (id: string, included: boolean) => void;
  onCategory: (id: string, category: DepositCategory) => void;
  onClearSource: () => void;
}) {
  const [search, setSearch] = useState('');
  const [month, setMonth] = useState('');
  const [status, setStatus] = useState<'included' | 'excluded' | ''>('');
  const [classification, setClassification] = useState<DepositCategory | ''>('');
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const inflows = transactions.filter((tx) => tx.direction === 'in');

  const rows = useMemo(() => {
    const filtered = inflows.filter((tx) => {
      const haystack = `${tx.description} ${tx.rawDescription} ${tx.detectedIncomeSource ?? ''}`.toLowerCase();
      if (search && !haystack.includes(search.toLowerCase())) return false;
      if (month && !tx.date.startsWith(month)) return false;
      if (status === 'included' && !tx.included) return false;
      if (status === 'excluded' && tx.included) return false;
      if (classification && tx.finalClassification.category !== classification) return false;
      if (
        sourceFilter &&
        tx.normalizedSource !== sourceFilter &&
        tx.detectedIncomeSource !== sourceFilter
      ) {
        return false;
      }
      return true;
    });

    return filtered.sort((a, b) => {
      const direction = sortDir === 'asc' ? 1 : -1;
      if (sortKey === 'amount') return (a.amount - b.amount) * direction;
      if (sortKey === 'confidence') {
        return (a.finalClassification.confidence - b.finalClassification.confidence) * direction;
      }
      if (sortKey === 'classification') {
        return DEPOSIT_CATEGORY_LABELS[a.finalClassification.category].localeCompare(
          DEPOSIT_CATEGORY_LABELS[b.finalClassification.category]
        ) * direction;
      }
      if (sortKey === 'description') return a.description.localeCompare(b.description) * direction;
      return a.date.localeCompare(b.date) * direction;
    });
  }, [inflows, search, month, status, classification, sourceFilter, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'date' || key === 'amount' ? 'desc' : 'asc');
    }
  }

  return (
    <section className="rounded border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">Transactions</h2>
          <p className="text-xs text-slate-500">{rows.length} shown</p>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-5">
          <input
            className="rounded border border-slate-300 px-2 py-1.5 text-xs"
            placeholder="Search description"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select className="rounded border border-slate-300 px-2 py-1.5 text-xs" value={month} onChange={(event) => setMonth(event.target.value)}>
            <option value="">All months</option>
            {months.map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
          <select className="rounded border border-slate-300 px-2 py-1.5 text-xs" value={status} onChange={(event) => setStatus(event.target.value as 'included' | 'excluded' | '')}>
            <option value="">All statuses</option>
            <option value="included">Included</option>
            <option value="excluded">Excluded</option>
          </select>
          <select className="rounded border border-slate-300 px-2 py-1.5 text-xs" value={classification} onChange={(event) => setClassification(event.target.value as DepositCategory | '')}>
            <option value="">All categories</option>
            {DEPOSIT_CATEGORIES.map((category) => (
              <option key={category} value={category}>{DEPOSIT_CATEGORY_LABELS[category]}</option>
            ))}
          </select>
          {sourceFilter ? (
            <button
              type="button"
              className="rounded border border-slate-400 bg-white px-2 py-1.5 text-left text-xs hover:bg-slate-100"
              onClick={onClearSource}
            >
              Clear source: {sourceFilter}
            </button>
          ) : (
            <p className="self-center text-xs text-slate-500">Click a source above to filter</p>
          )}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-xs">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              {([
                ['date', 'Date'],
                ['description', 'Description'],
                ['amount', 'Amount'],
                ['classification', 'Category'],
                ['confidence', 'Confidence'],
              ] as Array<[SortKey, string]>).map(([key, label]) => (
                <th key={key} className="px-3 py-2 font-medium">
                  <button type="button" onClick={() => toggleSort(key)} className="hover:text-slate-800">
                    {label}
                    {sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                  </button>
                </th>
              ))}
              <th className="px-3 py-2 font-medium">Source</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((tx) => (
              <tr key={tx.id} className="border-t border-slate-200 bg-white align-top">
                <td className="whitespace-nowrap bg-white px-3 py-2">
                  {tx.date}
                </td>
                <td className="bg-white px-3 py-2">
                  <div>{tx.description}</div>
                  <div className="text-[11px] text-slate-500">{tx.sourceDocument}</div>
                  {tx.finalClassification.subcategory && (
                    <div className="text-[11px] text-slate-500">{tx.finalClassification.reason}</div>
                  )}
                </td>
                <td className="bg-white px-3 py-2 tabular-nums">{formatMoney(tx.amount)}</td>
                <td className="bg-white px-3 py-2">
                  <CategorySelect
                    value={tx.finalClassification.category}
                    onChange={(category) => onCategory(tx.id, category)}
                  />
                </td>
                <td className="bg-white px-3 py-2">{formatConfidence(tx.finalClassification.confidence)}</td>
                <td className="bg-white px-3 py-2">{tx.normalizedSource || tx.detectedIncomeSource || '—'}</td>
                <td className="bg-white px-3 py-2">
                  <StatusBadge included={tx.included} />
                </td>
                <td className="bg-white px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    <button
                      type="button"
                      className="rounded border border-slate-400 bg-white px-2 py-1 text-[11px] hover:bg-slate-100"
                      onClick={() => onInclude(tx.id, true)}
                    >
                      Include
                    </button>
                    <button
                      type="button"
                      className="rounded border border-slate-400 bg-white px-2 py-1 text-[11px] hover:bg-slate-100"
                      onClick={() => onInclude(tx.id, false)}
                    >
                      Exclude
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="px-3 py-6 text-slate-500" colSpan={8}>
                  No transactions match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
