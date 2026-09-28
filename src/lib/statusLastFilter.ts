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
    case 'Cancelled':
      return normalized === 'cancelled' || normalized === 'canceled' || normalized.includes('cancelled') || normalized.includes('canceled');
    case 'Funded':
      return normalized === 'funded';
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

/** Collapse spreadsheet spelling variants onto one Status Last chip. */
export function canonicalStatusLastLabel(status: string): string {
  const n = normalizeStatusLast(status);
  if (!n) return '';
  if (n === 'documents received' || n === 'document received') return 'Documents Received';
  if (n.includes('denial') || n.includes('declined')) return 'Denial';
  return status.trim();
}

const AUTO_CLOSE_STATUS_LAST = new Set(['Denial', 'Duplicate', 'Cancelled']);
const IMPORT_AUTO_CLOSE_STATUS_LAST = new Set(['Documents Received', 'Funded', 'Funding Pending']);
export const NO_ANSWER_AUTO_CLOSE_MS = 15 * 24 * 60 * 60 * 1000;

export function statusLastShouldAutoClose(statusLast: string): boolean {
  return statusMatchesFilter(statusLast, AUTO_CLOSE_STATUS_LAST);
}

export function statusLastShouldImportAutoClose(statusLast: string): boolean {
  return statusMatchesFilter(statusLast, IMPORT_AUTO_CLOSE_STATUS_LAST);
}

function hasManualFuStatus(fuStatus?: string | null): boolean {
  return !!fuStatus;
}

export function isBookedDealFu(fuStatus?: string | null): boolean {
  return fuStatus === 'Deal' || fuStatus === 'Confirmed Deal';
}

export function resolveAutoCloseFuStatus(params: {
  statusLast: string;
  fuStatus?: string | null;
  createdAt?: Date | string | null;
  now?: number;
}): string | null | undefined {
  const current = params.fuStatus;
  if (isBookedDealFu(current)) return current;
  if (statusLastShouldAutoClose(params.statusLast)) return 'Closed';
  if (statusLastShouldImportAutoClose(params.statusLast) && !hasManualFuStatus(current)) return 'Closed';
  if (current === 'No Answer' && params.createdAt) {
    const createdMs =
      params.createdAt instanceof Date
        ? params.createdAt.getTime()
        : new Date(params.createdAt).getTime();
    if (!Number.isNaN(createdMs)) {
      const now = params.now ?? Date.now();
      if (now - createdMs >= NO_ANSWER_AUTO_CLOSE_MS) return 'Closed';
    }
  }
  return current;
}

export function callShouldAutoClose(params: {
  statusLast: string;
  fuStatus?: string | null;
  createdAt?: Date | string | null;
  now?: number;
}): boolean {
  if (isBookedDealFu(params.fuStatus) || params.fuStatus === 'Closed') return false;
  return resolveAutoCloseFuStatus(params) === 'Closed';
}
