export function SummaryCard({
  summary,
  onCopy,
  copied,
}: {
  summary: string;
  onCopy: () => void;
  copied: boolean;
}) {
  return (
    <section className="rounded border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">Underwriter summary</h2>
          <p className="text-xs text-slate-500">
            Narrative uses application-calculated totals. It is not a credit decision.
          </p>
        </div>
        <button
          type="button"
          onClick={onCopy}
          className="rounded border border-slate-400 bg-white px-3 py-1.5 text-xs font-medium hover:bg-slate-100"
        >
          {copied ? 'Copied' : 'Copy summary'}
        </button>
      </div>
      <p className="px-4 py-4 text-sm leading-6 text-slate-800">{summary}</p>
    </section>
  );
}
