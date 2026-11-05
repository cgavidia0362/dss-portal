import { ExternalLink } from 'lucide-react';
import { canAccessTab } from '../lib/tabAccess';

const DATA_PORTAL_URL = 'https://datatportal.vercel.app/';

interface DataPortalTabProps {
  currentUser: {
    role: string;
    allowedTabs?: string[];
  };
}

export default function DataPortalTab({ currentUser }: DataPortalTabProps) {
  const isAllowed = canAccessTab(currentUser.role, currentUser.allowedTabs, 'data-portal');

  if (!isAllowed) {
    return (
      <div className="bg-rose-50 bg-opacity-30 border border-rose-200 rounded-dss-sm px-6 py-8 text-center">
        <p className="text-lg font-semibold text-dss-danger">Access restricted</p>
        <p className="text-sm text-dss-danger/80 mt-2">
          Data Portal is available to admin or users granted access.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center">
      <div className="w-full max-w-md rounded-dss border border-dss-border bg-dss-surface p-8 text-center shadow-sm">
        <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-dss border border-dss-accent/30 bg-dss-accent-soft text-dss-accent">
          <ExternalLink className="h-5 w-5" />
        </div>
        <h2 className="text-2xl font-bold text-dss-ink">Data Portal</h2>
        <p className="mt-2 text-sm text-dss-muted">Buying Analysis workspace</p>
        <a
          href={DATA_PORTAL_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-7 inline-flex w-full items-center justify-center gap-2 rounded-dss-sm bg-dss-navy-soft px-5 py-3 text-sm font-medium text-white transition hover:bg-dss-navy"
        >
          Open Data Portal
          <ExternalLink className="h-4 w-4" />
        </a>
        <p className="mt-3 text-xs text-dss-muted">Opens in a new tab. DSS Portal stays open.</p>
      </div>
    </div>
  );
}
