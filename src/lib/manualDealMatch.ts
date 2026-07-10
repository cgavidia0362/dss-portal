import { isDealLikeStatus } from './dealCredit';

export function normalizeAppId(appId?: string | null): string {
  return (appId || '').trim().toLowerCase();
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
  assignedTo?: string;
}

export interface DealMatchManual {
  appId: string;
  addedBy: string;
  fuStatus?: string | null;
}

/** True when a call already represents this manual entry (same app + same credit rep). */
export function manualDealMatchedByCall(
  manual: DealMatchManual,
  calls: DealMatchCall[],
  isInBounds?: (date: Date) => boolean,
): boolean {
  const appKey = normalizeAppId(manual.appId);
  if (!appKey || !manual.addedBy) return false;

  return calls.some(c => {
    if (normalizeAppId(c.applicationId) !== appKey) return false;
    if (!isDealLikeStatus(c.fuStatus)) return false;
    if (getCallDealCreditId(c) !== manual.addedBy) return false;
    if (isInBounds) {
      if (!c.dealDate) return false;
      const d = c.dealDate instanceof Date ? c.dealDate : new Date(c.dealDate);
      if (Number.isNaN(d.getTime()) || !isInBounds(d)) return false;
    }
    return true;
  });
}
