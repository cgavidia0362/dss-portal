export function normalizeStatusLast(status: string): string {
  return (status || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function statusMatchesLabel(normalized: string, label: string): boolean {
  switch (label) {
    case 'Approved':
      return normalized === 'approved' || normalized === 'approval';
    case 'Counter':
      return normalized === 'counter' || normalized.startsWith('counter ');
    case 'New Application':
      return normalized === 'new application' || normalized.includes('new app');
    case 'Pending Approval':
      return normalized === 'pending approval' || normalized === 'pending';
    case 'Reconsider':
      return normalized.includes('reconsider');
    case 'Accepted':
      return normalized === 'accepted';
    case 'Denial':
      return normalized.includes('denial') || normalized.includes('declined');
    case 'Documents Received':
      return normalized === 'documents received' || normalized === 'document received';
    case 'Duplicate':
      return normalized.includes('duplicate');
    case 'Funding Pending':
      return normalized === 'funding pending';
    case 'Follow Up':
      return normalized === 'follow up';
    default:
      return normalized === label.toLowerCase();
  }
}

export function statusMatchesFilter(statusLast: string, selected: Set<string>): boolean {
  const normalized = normalizeStatusLast(statusLast);
  if (!normalized) return false;
  for (const label of selected) {
    if (statusMatchesLabel(normalized, label)) return true;
  }
  return false;
}
