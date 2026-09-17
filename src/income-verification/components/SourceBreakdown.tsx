import { formatMoney, formatPercent } from '@income-verification/lib/analysis/format';
import type { IncomeAnalysis } from '@income-verification/lib/analysis/types';
import { CategoryBadge } from './CategoryBadge';

export function SourceBreakdown({
  analysis,
  selectedSource,
  onSelectSource,
  onIncludeSource,
}: {
  analysis: IncomeAnalysis;
  selectedSource: string | null;
  onSelectSource: (source: string | null) => void;
  onIncludeSource: (source: string, included: boolean) => void;
}) {
  const months = analysis.months;

  return (
    <section className="rounded border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold">Deposits by source</h2>
        <p className="text-xs text-slate-500">
          {selectedSource
            ? `Showing ${selectedSource}. Click again to clear.`
            : 'Click a source to inspect every contributing transaction, or include/exclude that sender.'}
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-xs">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Category</th>
              <th className="px-3 py-2 font-medium">Source</th>
              <th className="px-3 py-2 font-medium">Deposits</th>
              {months.map((month) => (
                <th key={month.month} className="px-3 py-2 font-medium">
                  {month.label.replace(/ 20/, ' ')}
                </th>
              ))}
              <th className="px-3 py-2 font-medium">Total deposits</th>
              <th className="px-3 py-2 font-medium">Monthly avg</th>
              <th className="px-3 py-2 font-medium">% of included</th>
              <th className="px-3 py-2 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {analysis.sources.map((source) => {
              const category = source.category;
              return (
                <tr
                  key={source.source}
                  className={`border-t border-slate-200 ${
                    selectedSource === source.source ? 'bg-slate-50' : 'bg-white'
                  }`}
                >
                  <td className="bg-inherit px-3 py-2">
                    <CategoryBadge category={category} />
                  </td>
                  <td
                    className="cursor-pointer bg-inherit px-3 py-2 font-medium text-slate-800"
                    onClick={() =>
                      onSelectSource(selectedSource === source.source ? null : source.source)
                    }
                  >
                    {source.source}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{source.count}</td>
                  {months.map((month) => (
                    <td key={month.month} className="px-3 py-2 tabular-nums">
                      {formatMoney(source.monthly[month.month] || 0)}
                    </td>
                  ))}
                  <td className="px-3 py-2 tabular-nums">{formatMoney(source.totalDeposits)}</td>
                  <td className="px-3 py-2 tabular-nums">{formatMoney(source.monthlyAverage)}</td>
                  <td className="px-3 py-2 tabular-nums">{formatPercent(source.percentOfIncluded)}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        className="rounded border border-slate-400 bg-white px-2 py-1 text-[11px] hover:bg-slate-100"
                        onClick={() => onIncludeSource(source.source, true)}
                      >
                        Include
                      </button>
                      <button
                        type="button"
                        className="rounded border border-slate-400 bg-white px-2 py-1 text-[11px] hover:bg-slate-100"
                        onClick={() => onIncludeSource(source.source, false)}
                      >
                        Exclude
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {analysis.sources.length === 0 && (
              <tr>
                <td className="px-3 py-6 text-slate-500" colSpan={months.length + 7}>
                  No incoming deposits were extracted.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
