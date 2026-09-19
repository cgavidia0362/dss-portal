type Stage = 'upload' | 'processing' | 'results';

const STEPS: Array<{ id: Stage; label: string }> = [
  { id: 'upload', label: 'Upload' },
  { id: 'processing', label: 'Processing' },
  { id: 'results', label: 'Review / Results' },
];

export function AppShell({
  stage,
  headerActions,
  children,
}: {
  stage: Stage;
  headerActions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-dss-canvas text-dss-ink">
      <header className="iv-no-print border-b border-white/10 bg-dss-navy text-white">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-6 py-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-white/45">
              Internal underwriting
            </p>
            <h1 className="text-lg font-semibold tracking-tight">Income Verification</h1>
            <p className="text-sm text-white/65">AI-assisted income analysis</p>
          </div>
          <div className="flex items-center gap-3">
            {headerActions}
            <nav className="flex items-center gap-2 text-xs">
              {STEPS.map((step, index) => {
                const active = step.id === stage;
                const done =
                  (stage === 'processing' && step.id === 'upload') ||
                  (stage === 'results' && step.id !== 'results');
                return (
                  <div key={step.id} className="flex items-center gap-2">
                    {index > 0 && <span className="text-white/35">/</span>}
                    <span className={active ? 'font-semibold text-white' : done ? 'text-white/65' : 'text-white/40'}>
                      {step.label}
                    </span>
                  </div>
                );
              })}
            </nav>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1600px] px-6 py-6">{children}</main>
    </div>
  );
}
