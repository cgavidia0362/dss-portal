import { formatMoney } from '@income-verification/lib/analysis/format';
import type { DepositCategory, IncomeAnalysis } from '@income-verification/lib/analysis/types';
import { ExcludedList } from './ExcludedList';
import { CategoryBreakdown } from './ReviewQueue';
import { SourceBreakdown } from './SourceBreakdown';
import { SummaryCard } from './SummaryCard';
import { TransactionTable } from './TransactionTable';

function completenessLabel(value: string) {
  if (value === 'complete') return 'Complete';
  if (value === 'partial') return 'Partial';
  return 'Unconfirmed';
}

export function ResultsDashboard({
  analysis,
  documents,
  summary,
  copied,
  sourceFilter,
  onSourceFilter,
  onInclude,
  onCategory,
  onIncludeCategory,
  onIncludeSource,
  onCopy,
  onReset,
}: {
  analysis: IncomeAnalysis;
  documents: Array<{ fileName: string; documentType: string; transactionCount: number; warningCount: number }>;
  summary: string;
  copied: boolean;
  sourceFilter: string | null;
  onSourceFilter: (source: string | null) => void;
  onInclude: (id: string, included: boolean) => void;
  onCategory: (id: string, category: DepositCategory) => void;
  onIncludeCategory: (category: DepositCategory, included: boolean) => void;
  onIncludeSource: (source: string, included: boolean) => void;
  onCopy: () => void;
  onReset: () => void;
}) {
  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Analysis results</h2>
          <p className="text-sm text-slate-600">
            {documents.length} document{documents.length === 1 ? '' : 's'}
            {documents.length ? ` · ${documents.map((doc) => doc.fileName).join(', ')}` : ''}
            {' · '}session only · not a credit decision
          </p>
        </div>
        <button
          type="button"
          onClick={onReset}
          className="rounded border border-slate-400 bg-white px-3 py-1.5 text-sm hover:bg-slate-100"
        >
          New analysis
        </button>
      </div>

      {analysis.warnings.length > 0 && (
        <div className="border border-slate-300 bg-white px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Processing notes</p>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-slate-700">
            {analysis.warnings.map((warning, index) => (
              <li key={`${warning.code}-${index}`}>{warning.message}</li>
            ))}
          </ul>
        </div>
      )}

      <section className="grid grid-cols-12 gap-4">
        <div className="col-span-12 rounded border border-slate-900 bg-slate-900 px-5 py-5 text-white md:col-span-4">
          <p className="text-[11px] uppercase tracking-[0.16em] text-slate-300">
            Average monthly included income
          </p>
          <p className="mt-2 text-4xl font-semibold tabular-nums">
            {formatMoney(analysis.totals.averageMonthlyIncluded)}
          </p>
          <p className="mt-2 text-sm text-slate-300">
            / month across {analysis.totals.monthsAnalyzed} coverage{' '}
            {analysis.totals.monthsAnalyzed === 1 ? 'month' : 'months'}
          </p>
        </div>
        <div className="col-span-12 grid grid-cols-2 gap-4 md:col-span-8 md:grid-cols-3">
          {[
            ['Total deposits', formatMoney(analysis.totals.totalDeposits)],
            ['Included deposits', formatMoney(analysis.totals.includedDeposits)],
            ['Excluded deposits', formatMoney(analysis.totals.excludedDeposits)],
          ].map(([label, value]) => (
            <div key={label} className="rounded border border-slate-200 bg-white px-4 py-4">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
              <p className="mt-2 text-xl font-semibold tabular-nums">{value}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded border border-slate-200 bg-white px-4 py-4">
        <h3 className="text-sm font-semibold">Monthly included deposits</h3>
        <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-6">
          {analysis.months.map((month) => (
            <div key={month.month} className="border border-slate-200 px-3 py-3">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">{month.label}</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">{formatMoney(month.includedTotal)}</p>
              <p className="text-[11px] text-slate-500">{completenessLabel(month.completeness)}</p>
            </div>
          ))}
          <div className="border border-slate-900 bg-slate-900 px-3 py-3 text-white">
            <p className="text-[11px] uppercase tracking-wide text-slate-300">Avg</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">
              {formatMoney(analysis.totals.averageMonthlyIncluded)}
            </p>
            <p className="text-[11px] text-slate-300">Coverage period</p>
          </div>
        </div>
      </section>

      <SummaryCard
        summary={summary}
        reviewAlert={analysis.locationReview.alert ? analysis.locationReview.alertMessage : null}
        onCopy={onCopy}
        copied={copied}
      />

      <CategoryBreakdown analysis={analysis} onIncludeCategory={onIncludeCategory} />
      <SourceBreakdown
        analysis={analysis}
        selectedSource={sourceFilter}
        onSelectSource={onSourceFilter}
        onIncludeSource={onIncludeSource}
      />
      <TransactionTable
        transactions={analysis.transactions}
        months={analysis.months.map((month) => month.month)}
        sourceFilter={sourceFilter}
        onInclude={onInclude}
        onCategory={onCategory}
        onClearSource={() => onSourceFilter(null)}
      />
      <ExcludedList transactions={analysis.transactions} />
    </div>
  );
}
