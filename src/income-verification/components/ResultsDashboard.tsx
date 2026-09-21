import { formatMoney } from '@income-verification/lib/analysis/format';
import type { DepositCategory, IncomeAnalysis } from '@income-verification/lib/analysis/types';
import { ExcludedList } from './ExcludedList';
import {
  incompleteSourceHeadlineCopy,
  isIncompleteSourceAnalysis,
  reviewOnlyExtractedTotal,
} from './incomeHeadline';
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
  savedApplicantName,
  onSourceFilter,
  onInclude,
  onCategory,
  onIncludeCategory,
  onIncludeSource,
  onCopy,
  onReset,
  onSave,
  onPrint,
}: {
  analysis: IncomeAnalysis;
  documents: Array<{ fileName: string; documentType: string; transactionCount: number; warningCount: number }>;
  summary: string;
  copied: boolean;
  sourceFilter: string | null;
  savedApplicantName?: string | null;
  onSourceFilter: (source: string | null) => void;
  onInclude: (id: string, included: boolean) => void;
  onCategory: (id: string, category: DepositCategory) => void;
  onIncludeCategory: (category: DepositCategory, included: boolean) => void;
  onIncludeSource: (source: string, included: boolean) => void;
  onCopy: () => void;
  onReset: () => void;
  onSave: () => void;
  onPrint: () => void;
}) {
  return (
    <div className="iv-print-root space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Analysis results</h2>
          <p className="text-sm text-slate-600">
            {documents.length} document{documents.length === 1 ? '' : 's'}
            {documents.length ? ` · ${documents.map((doc) => doc.fileName).join(', ')}` : ''}
            {savedApplicantName
              ? ` · Saved view · ${savedApplicantName}`
              : ' · session only · not a credit decision'}
          </p>
        </div>
        <div className="iv-no-print flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onSave}
            className="rounded border border-dss-navy-soft bg-dss-navy-soft px-3 py-1.5 text-sm text-white hover:bg-dss-navy"
          >
            Save report
          </button>
          <button
            type="button"
            onClick={onPrint}
            className="rounded border border-slate-400 bg-white px-3 py-1.5 text-sm hover:bg-slate-100"
          >
            Print
          </button>
          <button
            type="button"
            onClick={onReset}
            className="rounded border border-slate-400 bg-white px-3 py-1.5 text-sm hover:bg-slate-100"
          >
            New analysis
          </button>
        </div>
      </div>

      {savedApplicantName && (
        <div className="iv-no-print border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Viewing saved report for <span className="font-semibold">{savedApplicantName}</span>.
          Include/exclude changes stay on this screen until you save again.
        </div>
      )}

      {isIncompleteSourceAnalysis(analysis) && (
        <div className="border border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-semibold">Incomplete source</p>
          <p className="mt-1">{incompleteSourceHeadlineCopy().notice}</p>
        </div>
      )}

      {analysis.extractionTrust === 'mismatch' && (
        <div className="border border-red-400 bg-red-50 px-4 py-3 text-sm text-red-950">
          <p className="font-semibold">Extraction could not be verified. Buyer review required.</p>
          <p className="mt-1">
            Statement control totals do not match the extracted deposits. Missing transactions were
            not invented. Review the flagged periods below before relying on these figures.
          </p>
        </div>
      )}

      {analysis.warnings.some((warning) => warning.code === 'debit_reconciliation_incomplete') && (
        <div className="border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-800">
          <p className="font-semibold">Debit reconciliation incomplete</p>
          <p className="mt-1">
            Deposit extraction verified. Debit transaction reconciliation incomplete.
          </p>
        </div>
      )}

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
        <div className="col-span-12 rounded border border-dss-navy bg-dss-navy px-5 py-5 text-white md:col-span-4">
          {isIncompleteSourceAnalysis(analysis) ? (
            <>
              <p className="text-[11px] uppercase tracking-[0.16em] text-white/60">
                {incompleteSourceHeadlineCopy().title}
              </p>
              <p className="mt-2 text-sm text-white/80">
                {incompleteSourceHeadlineCopy().extractedLabel}:
              </p>
              <p className="mt-1 text-4xl font-semibold tabular-nums">
                {formatMoney(reviewOnlyExtractedTotal(analysis))}
              </p>
              <p className="mt-2 text-sm text-white/65">{incompleteSourceHeadlineCopy().notice}</p>
            </>
          ) : (
            <>
              <p className="text-[11px] uppercase tracking-[0.16em] text-white/60">
                Average monthly included income
              </p>
              <p className="mt-2 text-4xl font-semibold tabular-nums">
                {formatMoney(analysis.totals.averageMonthlyIncluded)}
              </p>
              <p className="mt-2 text-sm text-white/65">
                / month across {analysis.totals.monthsAnalyzed} coverage{' '}
                {analysis.totals.monthsAnalyzed === 1 ? 'month' : 'months'}
              </p>
            </>
          )}
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
              <p className="text-[11px] text-slate-500">
                {month.extractionTrust === 'incomplete_source'
                  ? incompleteSourceHeadlineCopy().monthLabel
                  : month.reviewRequired
                    ? 'Buyer review required'
                    : completenessLabel(month.completeness)}
              </p>
            </div>
          ))}
          <div className="border border-dss-navy bg-dss-navy px-3 py-3 text-white">
            {isIncompleteSourceAnalysis(analysis) ? (
              <>
                <p className="text-[11px] uppercase tracking-wide text-white/60">Review only</p>
                <p className="mt-1 text-lg font-semibold tabular-nums">
                  {formatMoney(reviewOnlyExtractedTotal(analysis))}
                </p>
                <p className="text-[11px] text-white/60">Incomplete source</p>
              </>
            ) : (
              <>
                <p className="text-[11px] uppercase tracking-wide text-white/60">Avg</p>
                <p className="mt-1 text-lg font-semibold tabular-nums">
                  {formatMoney(analysis.totals.averageMonthlyIncluded)}
                </p>
                <p className="text-[11px] text-white/60">Coverage period</p>
              </>
            )}
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
