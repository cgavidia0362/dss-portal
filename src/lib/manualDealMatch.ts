import { isDealLikeStatus } from './dealCredit';

export function normalizeAppId(appId?: string | null): string {
  return (appId || '').trim().toLowerCase();
}

/** Exact App ID match (case/whitespace-insensitive) against a list of calls. */
export function findCallsByAppId<T extends { applicationId?: string | null; application_id?: string | null }>(
  calls: T[],
  appId: string,
): T[] {
  const key = normalizeAppId(appId);
  if (!key) return [];
  return calls.filter(c => normalizeAppId(c.applicationId ?? c.application_id) === key);
}

export function getCallDealCreditId(call: {
  dealBy?: string;
  assignedTo?: string;
}): string | undefined {
  return call.dealBy || call.assignedTo;
}

export interface DealMatchCall {
  applicationId: string;
  fuStatus?: string | null;
  dealDate?: Date | string | null;
  dealBy?: string;
  dealByName?: string;
  assignedTo?: string;
  assignedToName?: string;
}

export interface DealMatchManual {
  appId: string;
  addedBy: string;
  addedByName?: string;
  fuStatus?: string | null;
}

/**
 * Resolve who gets credit for a Deal/Confirmed call.
 * Prefer deal_by, then assigned_to, then matching Daily Deals manual entry.
 * Returns null when no real rep credit exists (Unassigned deals do not count).
 */
export function resolveCallDealCredit(
  call: DealMatchCall,
  manualByApp?: Map<string, DealMatchManual>,
): { id: string; name: string; fromManual: boolean } | null {
  if (call.dealBy) {
    return { id: call.dealBy, name: call.dealByName || 'Unknown', fromManual: false };
  }
  if (call.assignedTo) {
    return { id: call.assignedTo, name: call.assignedToName || 'Unknown', fromManual: false };
  }
  const manual = manualByApp?.get(normalizeAppId(call.applicationId));
  if (manual?.addedBy) {
    return { id: manual.addedBy, name: manual.addedByName || 'Unknown', fromManual: true };
  }
  return null;
}

export function buildManualCreditByApp(manuals: DealMatchManual[]): Map<string, DealMatchManual> {
  const map = new Map<string, DealMatchManual>();
  manuals.forEach(m => {
    const key = normalizeAppId(m.appId);
    if (!key || !m.addedBy) return;
    if (!map.has(key)) map.set(key, m);
  });
  return map;
}

/**
 * True when a call already represents this manual entry.
 * Same App ID + deal-like status + dealDate in range is enough to dedupe —
 * even if the call is still missing stored deal_by (credit will come from the call after resolve).
 */
export function manualDealMatchedByCall(
  manual: DealMatchManual,
  calls: DealMatchCall[],
  isInBounds?: (date: Date) => boolean,
): boolean {
  const appKey = normalizeAppId(manual.appId);
  if (!appKey) return false;

  return calls.some(c => {
    if (normalizeAppId(c.applicationId) !== appKey) return false;
    if (!isDealLikeStatus(c.fuStatus)) return false;
    if (isInBounds) {
      if (!c.dealDate) return false;
      const d = c.dealDate instanceof Date ? c.dealDate : new Date(c.dealDate);
      if (Number.isNaN(d.getTime()) || !isInBounds(d)) return false;
    }
    const stored = getCallDealCreditId(c);
    // If the call already has a different credit rep, don't treat as the same deal for this manual.
    if (stored && manual.addedBy && stored !== manual.addedBy) return false;
    return true;
  });
}
