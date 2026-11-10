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
 * Same App ID is one deal, even when the call and the Daily Deal name different reps.
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
    return true;
  });
}

/**
 * Sticky / conversion dedupe: match Manual to a Call that was booked
 * (has deal_date), even if FU status later left Deal/Confirmed.
 * A different rep on the Daily Deal does not make a second deal.
 */
export function manualDealMatchedByBookedCall(
  manual: DealMatchManual,
  calls: DealMatchCall[],
  isInBounds?: (date: Date) => boolean,
): boolean {
  const appKey = normalizeAppId(manual.appId);
  if (!appKey) return false;

  return calls.some(c => {
    if (normalizeAppId(c.applicationId) !== appKey) return false;
    if (!c.dealDate) return false;
    if (isInBounds) {
      const d = c.dealDate instanceof Date ? c.dealDate : new Date(c.dealDate);
      if (Number.isNaN(d.getTime()) || !isInBounds(d)) return false;
    }
    return true;
  });
}

export function duplicateDailyDealMessage(hit: {
  addedByName?: string | null;
  dealDate?: string | null;
  fuStatus?: string | null;
}): string {
  const who = (hit.addedByName || '').trim() || 'another rep';
  const detail = [(hit.dealDate || '').trim(), (hit.fuStatus || '').trim()].filter(Boolean).join(', ');
  return detail
    ? `This App ID is already a deal for ${who} (${detail}). A second deal was not added.`
    : `This App ID is already a deal for ${who}. A second deal was not added.`;
}

/** Keep the earliest Daily Deal when the same App ID was entered more than once. */
export function oneManualPerAppId<T extends { appId?: string | null; dealDate?: string | null; createdAt?: string | null }>(deals: T[]): T[] {
  const kept = new Map<string, T>();
  const blank: T[] = [];
  const rank = (row: T) => row.dealDate || row.createdAt || '9999';
  for (const deal of deals) {
    const key = normalizeAppId(deal.appId);
    if (!key) {
      blank.push(deal);
      continue;
    }
    const current = kept.get(key);
    if (!current || rank(deal) < rank(current)) kept.set(key, deal);
  }
  return [...kept.values(), ...blank];
}
