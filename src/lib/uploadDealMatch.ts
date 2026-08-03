import { normalizeAppId } from './manualDealMatch';

export type UploadMatchAction = 'link' | 'duplicate' | 'leave';
export type UploadMatchType = 'exact' | 'soft';

export interface ManualDealForMatch {
  id: string;
  appId: string;
  dealerName: string;
  customerName: string;
  amount: string;
  fuStatus: string;
  addedBy: string;
  addedByName: string;
  dealDate: string;
}

export interface UploadMatchCandidate {
  id: string;
  matchType: UploadMatchType;
  applicationId: string;
  callDealerName: string;
  callCustomerName: string;
  callAmount: string;
  callStatusLast: string;
  manual: ManualDealForMatch;
  action: UploadMatchAction;
}

export function normalizePersonName(name?: string | null): string {
  return (name || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeDealerName(name?: string | null): string {
  return normalizePersonName(name)
    .replace(/\b(llc|inc|corp|company|co|ltd)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** True when every word in the shorter name appears in the longer name. */
export function personNamesSoftMatch(a?: string | null, b?: string | null): boolean {
  const left = normalizePersonName(a);
  const right = normalizePersonName(b);
  if (!left || !right) return false;
  if (left === right) return true;

  const leftTokens = left.split(' ').filter(Boolean);
  const rightTokens = right.split(' ').filter(Boolean);
  if (leftTokens.length === 0 || rightTokens.length === 0) return false;

  const [shorter, longer] =
    leftTokens.length <= rightTokens.length
      ? [leftTokens, rightTokens]
      : [rightTokens, leftTokens];

  // Require at least 2 tokens on the shorter side to avoid loose single-name hits.
  if (shorter.length < 2) return false;

  const longerSet = new Set(longer);
  return shorter.every(token => longerSet.has(token));
}

type SoftMatchCall = {
  applicationId?: string | null;
  application_id?: string | null;
  dealerName?: string | null;
  dealer_name?: string | null;
  customerName?: string | null;
  customer_full_name?: string | null;
};

/**
 * Same dealer + soft customer match, optionally excluding an App ID
 * (so exact App ID conflicts stay in the hard-block UI).
 */
export function findCallsByDealerCustomer<T extends SoftMatchCall>(
  calls: T[],
  dealerName: string,
  customerName: string,
  excludeAppId?: string,
): T[] {
  const dealerKey = normalizeDealerName(dealerName);
  const customerKey = normalizePersonName(customerName);
  if (!dealerKey || !customerKey) return [];

  const exclude = normalizeAppId(excludeAppId);
  return calls.filter(c => {
    const app = normalizeAppId(c.applicationId ?? c.application_id);
    if (exclude && app === exclude) return false;
    const d = normalizeDealerName(c.dealerName ?? c.dealer_name);
    if (!d || d !== dealerKey) return false;
    return personNamesSoftMatch(customerName, c.customerName ?? c.customer_full_name);
  });
}

function parseManualDealDate(dealDate: string, createdAt?: string): Date {
  if (dealDate) {
    const parts = String(dealDate).split('-');
    if (parts.length >= 3) {
      return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    }
  }
  return createdAt ? new Date(createdAt) : new Date();
}

export function mapDailyDealRow(d: any): ManualDealForMatch {
  return {
    id: d.id,
    appId: d.app_id || '',
    dealerName: d.dealer_name || '',
    customerName: d.customer_name || '',
    amount: d.amount || '0',
    fuStatus: d.fu_status || 'Deal',
    addedBy: d.added_by || '',
    addedByName: d.added_by_name || 'Unknown',
    dealDate: d.deal_date || '',
  };
}

/** Find spreadsheet rows that match Deal/Confirmed Daily Deals entries. */
export function findUploadDealMatches(
  calls: Array<{
    applicationId: string;
    dealerName: string;
    customerName?: string;
    buyerFinal?: string;
    statusLast: string;
  }>,
  manuals: ManualDealForMatch[],
): UploadMatchCandidate[] {
  const usedManualIds = new Set<string>();
  const usedCallApps = new Set<string>();
  const matches: UploadMatchCandidate[] = [];

  const manualsByApp = new Map<string, ManualDealForMatch>();
  manuals.forEach(m => {
    const key = normalizeAppId(m.appId);
    if (key && !manualsByApp.has(key)) manualsByApp.set(key, m);
  });

  // Pass 1: exact App ID
  calls.forEach((call, index) => {
    const appKey = normalizeAppId(call.applicationId);
    if (!appKey || usedCallApps.has(appKey)) return;
    const manual = manualsByApp.get(appKey);
    if (!manual || usedManualIds.has(manual.id)) return;

    usedManualIds.add(manual.id);
    usedCallApps.add(appKey);
    matches.push({
      id: `match-${index}-${manual.id}`,
      matchType: 'exact',
      applicationId: call.applicationId,
      callDealerName: call.dealerName,
      callCustomerName: call.customerName || '',
      callAmount: call.buyerFinal || '0',
      callStatusLast: call.statusLast,
      manual,
      action: 'link',
    });
  });

  // Pass 2: soft dealer + customer (only if both sides have a customer name)
  calls.forEach((call, index) => {
    const appKey = normalizeAppId(call.applicationId);
    if (!appKey || usedCallApps.has(appKey)) return;
    const callDealer = normalizeDealerName(call.dealerName);
    const callCustomer = normalizePersonName(call.customerName);
    if (!callDealer || !callCustomer) return;

    const manual = manuals.find(m => {
      if (usedManualIds.has(m.id)) return false;
      const mDealer = normalizeDealerName(m.dealerName);
      if (!mDealer || mDealer !== callDealer) return false;
      return personNamesSoftMatch(m.customerName, call.customerName);
    });
    if (!manual) return;

    usedManualIds.add(manual.id);
    usedCallApps.add(appKey);
    matches.push({
      id: `match-soft-${index}-${manual.id}`,
      matchType: 'soft',
      applicationId: call.applicationId,
      callDealerName: call.dealerName,
      callCustomerName: call.customerName || '',
      callAmount: call.buyerFinal || '0',
      callStatusLast: call.statusLast,
      manual,
      action: 'leave',
    });
  });

  return matches;
}

export function applyMatchActionToCall<T extends {
  applicationId: string;
  fuStatus?: string;
  dealDate?: Date;
  dealBy?: string;
  dealByName?: string;
  assignedTo?: string;
  assignedToName?: string;
  isDuplicate?: boolean;
}>(call: T, match: UploadMatchCandidate): T {
  if (match.action === 'leave') return call;

  if (match.action === 'duplicate') {
    return {
      ...call,
      fuStatus: 'Duplicates',
      isDuplicate: true,
    };
  }

  // link — Daily Deals / Public Deals credit always wins
  const dealDate = parseManualDealDate(match.manual.dealDate);
  const fuStatus = match.manual.fuStatus === 'Confirmed Deal' ? 'Confirmed Deal' : 'Deal';
  return {
    ...call,
    fuStatus,
    dealDate,
    dealBy: match.manual.addedBy,
    dealByName: match.manual.addedByName,
    assignedTo: match.manual.addedBy,
    assignedToName: match.manual.addedByName,
    isDuplicate: false,
  };
}
