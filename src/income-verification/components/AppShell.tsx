type Stage = 'upload' | 'processing' | 'results';

const STEPS: Array<{ id: Stage; label: string }> = [
  { id: 'upload', label: 'Upload' },
  { id: 'processing', label: 'Processing' },
  { id: 'results', label: 'Review / Results' },
];

export function AppShell({
  stage,
  children,
}: {
  stage: Stage;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-[#f4f6f8] text-slate-900 min-h-[calc(100vh-8.5rem)]">
      <header className="border-b border-slate-800 bg-slate-900 text-white">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-6 py-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
              Internal underwriting
            </p>
            <h1 className="text-lg font-semibold tracking-tight">Income Verification</h1>
            <p className="text-sm text-slate-300">AI-assisted income analysis</p>
          </div>
          <nav className="flex items-center gap-2 text-xs">
            {STEPS.map((step, index) => {
              const active = step.id === stage;
              const done =
                (stage === 'processing' && step.id === 'upload') ||
                (stage === 'results' && step.id !== 'results');
              return (
                <div key={step.id} className="flex items-center gap-2">
                  {index > 0 && <span className="text-slate-500">/</span>}
                  <span className={active ? 'font-semibold text-white' : done ? 'text-slate-300' : 'text-slate-500'}>
                    {step.label}
                  </span>
                </div>
              );
            })}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-[1600px] px-6 py-6">{children}</main>
    </div>
  );
}
