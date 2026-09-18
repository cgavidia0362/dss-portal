import { formatMoney, formatPercent } from '@income-verification/lib/analysis/format';
import type { DepositCategory, IncomeAnalysis } from '@income-verification/lib/analysis/types';
import { CategoryBadge } from './CategoryBadge';

const inactiveActionClass =
  'rounded border border-slate-400 bg-white px-2 py-1 text-[11px] hover:bg-slate-100';
const includeActiveClass =
  'rounded border border-emerald-700 bg-emerald-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-emerald-700';
const excludeActiveClass =
  'rounded border border-rose-700 bg-rose-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-rose-700';

export function CategoryBreakdown({
  analysis,
  onIncludeCategory,
}: {
  analysis: IncomeAnalysis;
  onIncludeCategory: (category: DepositCategory, included: boolean) => void;
}) {
  return (
    <section className="rounded border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold">Deposits by category</h2>
        <p className="text-xs text-slate-500">
          All extracted incoming deposits start included. Exclude a category if it should not count as income.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-xs">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Category</th>
              <th className="px-3 py-2 font-medium">Count</th>
              <th className="px-3 py-2 font-medium">Total</th>
              <th className="px-3 py-2 font-medium">Included</th>
              <th className="px-3 py-2 font-medium">% of deposits</th>
              <th className="px-3 py-2 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {analysis.categories.map((category) => {
              const fullyIncluded =
                category.count > 0 && category.includedCount === category.count;
              const fullyExcluded =
                category.count > 0 && category.includedCount === 0;
              return (
                <tr key={category.category} className="border-t border-slate-200 bg-white">
                  <td className="bg-white px-3 py-2 font-medium text-slate-800">
                    <CategoryBadge category={category.category} />
                  </td>
                  <td className="bg-white px-3 py-2 tabular-nums">{category.count}</td>
                  <td className="bg-white px-3 py-2 tabular-nums">{formatMoney(category.total)}</td>
                  <td className="bg-white px-3 py-2 tabular-nums">{formatMoney(category.includedTotal)}</td>
                  <td className="bg-white px-3 py-2 tabular-nums">{formatPercent(category.percentOfTotal)}</td>
                  <td className="bg-white px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        className={fullyIncluded ? includeActiveClass : inactiveActionClass}
                        onClick={() => onIncludeCategory(category.category, true)}
                      >
                        Include all
                      </button>
                      <button
                        type="button"
                        className={fullyExcluded ? excludeActiveClass : inactiveActionClass}
                        onClick={() => onIncludeCategory(category.category, false)}
                      >
                        Exclude all
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
