export function SummaryCard({
  summary,
  reviewAlert,
  onCopy,
  copied,
}: {
  summary: string;
  reviewAlert?: string | null;
  onCopy: () => void;
  copied: boolean;
}) {
  return (
    <section className="rounded border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">Underwriter summary</h2>
          <p className="text-xs text-slate-500">
            Concise underwriting snapshot from application-calculated totals. Not a credit decision —
            review the statement and transactions.
          </p>
        </div>
        <button
          type="button"
          onClick={onCopy}
          className="iv-no-print rounded border border-slate-400 bg-white px-3 py-1.5 text-xs font-medium hover:bg-slate-100"
        >
          {copied ? 'Copied' : 'Copy summary'}
        </button>
      </div>
      <p className="px-4 py-4 text-sm leading-6 text-slate-800">{summary}</p>
      {reviewAlert ? (
        <div className="border-t border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-800">
            Review alert
          </p>
          <p className="mt-1 text-sm leading-6 text-amber-950">{reviewAlert}</p>
        </div>
      ) : null}
    </section>
  );
}
