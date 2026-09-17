export function StatusBadge({ included }: { included: boolean }) {
  return (
    <span
      className={`inline-flex rounded border px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide ${
        included
          ? 'border-slate-300 bg-white text-slate-800'
          : 'border-slate-300 bg-slate-100 text-slate-600'
      }`}
    >
      {included ? 'Included' : 'Excluded'}
    </span>
  );
}
