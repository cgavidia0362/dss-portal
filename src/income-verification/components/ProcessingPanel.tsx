const STAGES = [
  'Reading documents',
  'Extracting transactions',
  'Applying classification rules',
  'Detecting transfers and duplicates',
  'Classifying ambiguous deposits',
  'Calculating deposit totals',
];

export function ProcessingPanel({ status }: { status: string }) {
  return (
    <section className="mx-auto max-w-xl rounded border border-slate-200 bg-white px-6 py-8">
      <div className="flex items-center gap-3">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-dss-navy-soft" />
        <h2 className="text-base font-semibold">Processing</h2>
      </div>
      <p className="mt-2 text-sm text-slate-600">{status || 'Analyzing uploaded documents.'}</p>
      <ul className="mt-4 space-y-1 text-sm text-slate-600">
        {STAGES.map((stage) => (
          <li key={stage} className="flex gap-2">
            <span className="text-slate-400">–</span>
            {stage}
          </li>
        ))}
      </ul>
    </section>
  );
}
