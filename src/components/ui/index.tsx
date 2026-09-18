import type { ReactNode } from 'react';

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-xl font-semibold tracking-tight text-dss-ink">{title}</h2>
        {description ? (
          <p className="mt-0.5 text-sm text-dss-muted">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Badge({
  children,
  tone = 'neutral',
  className = '',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info';
  className?: string;
}) {
  const toneClass =
    tone === 'success'
      ? 'dss-badge-success'
      : tone === 'warning'
        ? 'dss-badge-warning'
        : tone === 'danger'
          ? 'dss-badge-danger'
          : tone === 'info'
            ? 'dss-badge-info'
            : 'dss-badge-neutral';
  return <span className={`${toneClass} ${className}`.trim()}>{children}</span>;
}

export const btn = {
  primary: 'dss-btn-primary',
  secondary: 'dss-btn-secondary',
  ghost: 'dss-btn-ghost',
  danger: 'dss-btn-danger',
  compact: 'dss-btn-compact',
} as const;
