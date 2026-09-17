import type {
  LocationHit,
  LocationReview,
  NormalizedTransaction,
} from './types';

const US_STATE_CODES = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DC', 'DE', 'FL', 'GA', 'HI', 'IA',
  'ID', 'IL', 'IN', 'KS', 'KY', 'LA', 'MA', 'MD', 'ME', 'MI', 'MN', 'MO', 'MS',
  'MT', 'NC', 'ND', 'NE', 'NH', 'NJ', 'NM', 'NV', 'NY', 'OH', 'OK', 'OR', 'PA',
  'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VA', 'VT', 'WA', 'WI', 'WV', 'WY',
]);

const STATE_NAMES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DC: 'District of Columbia', DE: 'Delaware',
  FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', IA: 'Iowa', ID: 'Idaho',
  IL: 'Illinois', IN: 'Indiana', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana',
  MA: 'Massachusetts', MD: 'Maryland', ME: 'Maine', MI: 'Michigan', MN: 'Minnesota',
  MO: 'Missouri', MS: 'Mississippi', MT: 'Montana', NC: 'North Carolina',
  ND: 'North Dakota', NE: 'Nebraska', NH: 'New Hampshire', NJ: 'New Jersey',
  NM: 'New Mexico', NV: 'Nevada', NY: 'New York', OH: 'Ohio', OK: 'Oklahoma',
  OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VA: 'Virginia',
  VT: 'Vermont', WA: 'Washington', WI: 'Wisconsin', WV: 'West Virginia', WY: 'Wyoming',
};

/** Digital / online processors whose HQ state should not count as physical travel. */
const DIGITAL_MERCHANT =
  /\b(?:apple(?:\.com)?|google|uber|lyft|paypal|venmo|cash\s*app|chime|roku|netflix|spotify|amazon|doordash|playstation|steam|meta|facebook|instagram|youtube|microsoft|xbox|prime\s*video|tilt(?:\.co)?|jointrue|float\s*me)\b|\.com\b|\.net\b|\.co\b/i;

const PHYSICAL_ACTIVITY =
  /\b(?:atm\s+withdrawal|debit\s+card\s+purchase|pos\s+purchase|checkcard|point\s+of\s+sale)\b/i;

const RECURRING_OR_ONLINE =
  /\b(?:recurring\s+debit\s+card|web\s+pmt|online|electronic\s+banking|zelle|zel\s+to|zel\s+from|instpmntin|ach\s+web)\b/i;

/**
 * Conservative alert threshold for out-of-state physical activity.
 * Requires a meaningful sample, repeated out-of-state hits, and material share.
 */
export const LOCATION_ALERT_MIN_PHYSICAL = 5;
export const LOCATION_ALERT_MIN_OUT_OF_STATE = 4;
export const LOCATION_ALERT_MIN_SHARE = 0.25;

export function stateDisplayName(code: string): string {
  const upper = code.toUpperCase();
  return STATE_NAMES[upper] ?? upper;
}

export function normalizeStateCode(raw: string): string | null {
  const upper = raw.trim().toUpperCase();
  return US_STATE_CODES.has(upper) ? upper : null;
}

/**
 * Derive customer home state from mailing/account-holder address blocks only.
 * Prefers CITY ST ZIP without a preceding comma (common customer block) and
 * skips bank letterhead / PO Box addresses.
 */
export function extractHomeState(text: string): string | null {
  if (!text.trim()) return null;
  const normalized = text.replace(/\u00a0/g, ' ');
  const pattern =
    /\b([A-Z][A-Z0-9 .'-]{1,40}?)\s+([A-Z]{2})\s+(\d{5})(?:-\d{4})?\b/g;
  const counts = new Map<string, number>();

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(normalized))) {
    const state = normalizeStateCode(match[2]);
    if (!state) continue;
    const city = match[1].trim();
    if (/^(pnc|bank|po|box|page|for|the|period|account|primary)$/i.test(city)) continue;

    const before = normalized.slice(Math.max(0, match.index - 70), match.index);
    if (/\b(?:p\.?\s*o\.?\s*box|po box|pittsburgh)\b/i.test(before)) continue;
    if (/\bpnc bank\b/i.test(before) && /\b(?:po box|p\.?\s*o\.?\s*box)\b/i.test(before)) continue;
    // Bank letterhead often uses "City, ST ZIP"
    const immediateBefore = normalized.slice(Math.max(0, match.index - 2), match.index);
    if (immediateBefore.includes(',')) continue;

    counts.set(state, (counts.get(state) ?? 0) + 1);
  }

  if (!counts.size) return null;
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return ranked[0]?.[0] ?? null;
}

function isDigitalDescription(text: string): boolean {
  return DIGITAL_MERCHANT.test(text) || RECURRING_OR_ONLINE.test(text);
}

function extractTrailingState(text: string): string | null {
  // PNC often prints title-case abbrev: "Gary In", "Merrillville In", "Playstation. Ca"
  const titled = /\b([A-Za-z][A-Za-z.'-]*)\s+([A-Za-z]{2})\s*$/.exec(text.trim());
  if (titled) {
    const state = normalizeStateCode(titled[2]);
    if (state) return state;
  }
  const upper = /\b([A-Z]{2})\s*$/.exec(text.trim());
  if (upper) return normalizeStateCode(upper[1]);
  return null;
}

/** Merge soft-wrapped purchase/ATM continuation lines for location scanning. */
export function mergeWrappedActivityLines(text: string): string[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const merged: string[] = [];

  for (const line of lines) {
    const startsTxn = /^\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/.test(line);
    const looksHeader =
      /^(page\s+\d|date amount|deposits and|banking\/?debit|checks and|online and|activity detail|for the period)/i.test(
        line
      );
    if (
      merged.length &&
      !startsTxn &&
      !looksHeader &&
      PHYSICAL_ACTIVITY.test(merged[merged.length - 1])
    ) {
      merged[merged.length - 1] = `${merged[merged.length - 1]} ${line}`;
      continue;
    }
    merged.push(line);
  }

  return merged;
}

export function detectPhysicalLocation(description: string): LocationHit | null {
  const text = description.replace(/\s+/g, ' ').trim();
  if (!text || !PHYSICAL_ACTIVITY.test(text)) return null;
  if (isDigitalDescription(text)) return null;
  if (/\batm\s+transaction\s+fee\b/i.test(text)) return null;

  const state = extractTrailingState(text);
  if (!state) return null;

  return {
    state,
    description: text,
    physical: true,
  };
}

function collectHits(params: {
  transactions?: Array<Pick<NormalizedTransaction, 'description' | 'rawDescription'>>;
  documentTexts?: string[];
}): LocationHit[] {
  const hits: LocationHit[] = [];
  const seen = new Set<string>();

  const consider = (text: string) => {
    const hit = detectPhysicalLocation(text);
    if (!hit) return;
    const key = `${hit.state}|${hit.description}`;
    if (seen.has(key)) return;
    seen.add(key);
    hits.push(hit);
  };

  for (const text of params.documentTexts ?? []) {
    for (const line of mergeWrappedActivityLines(text)) {
      consider(line);
    }
  }

  for (const tx of params.transactions ?? []) {
    consider(tx.description);
    if (tx.rawDescription && tx.rawDescription !== tx.description) {
      consider(tx.rawDescription);
    }
  }

  return hits;
}

export function emptyLocationReview(homeState: string | null = null): LocationReview {
  return {
    homeState,
    physicalLocationCount: 0,
    outOfStateCount: 0,
    outOfStatePercent: 0,
    primaryOutOfStateStates: [],
    stateCounts: {},
    alert: false,
    alertMessage: null,
  };
}

export function buildLocationReview(params: {
  homeState?: string | null;
  documentTexts?: string[];
  transactions?: Array<Pick<NormalizedTransaction, 'description' | 'rawDescription'>>;
}): LocationReview {
  const homeState = params.homeState ? normalizeStateCode(params.homeState) : null;
  const hits = collectHits({
    documentTexts: params.documentTexts,
    transactions: params.transactions,
  });

  const stateCounts: Record<string, number> = {};
  for (const hit of hits) {
    stateCounts[hit.state] = (stateCounts[hit.state] ?? 0) + 1;
  }

  const physicalLocationCount = hits.length;
  const outOfStateHits = homeState
    ? hits.filter((hit) => hit.state !== homeState)
    : [];
  const outOfStateCount = outOfStateHits.length;
  const outOfStatePercent =
    physicalLocationCount === 0
      ? 0
      : Math.round((outOfStateCount / physicalLocationCount) * 1000) / 10;

  const outCounts = new Map<string, number>();
  for (const hit of outOfStateHits) {
    outCounts.set(hit.state, (outCounts.get(hit.state) ?? 0) + 1);
  }
  const primaryOutOfStateStates = [...outCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([state]) => state);

  const share = physicalLocationCount === 0 ? 0 : outOfStateCount / physicalLocationCount;
  const alert =
    Boolean(homeState) &&
    physicalLocationCount >= LOCATION_ALERT_MIN_PHYSICAL &&
    outOfStateCount >= LOCATION_ALERT_MIN_OUT_OF_STATE &&
    share >= LOCATION_ALERT_MIN_SHARE;

  let alertMessage: string | null = null;
  if (alert && homeState) {
    const primary = primaryOutOfStateStates[0];
    const primarily = primary
      ? `, primarily in ${stateDisplayName(primary)}`
      : '';
    alertMessage = `Review Alert: Frequent transaction activity was identified outside the customer's home state of ${stateDisplayName(homeState)}${primarily}. Buyer should review the statement activity.`;
  }

  return {
    homeState,
    physicalLocationCount,
    outOfStateCount,
    outOfStatePercent,
    primaryOutOfStateStates,
    stateCounts,
    alert,
    alertMessage,
  };
}
