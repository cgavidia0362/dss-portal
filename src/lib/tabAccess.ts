export type AppRole = 'admin' | 'manager' | 'rep' | 'buying_assistant';

export type TabId =
  | 'calls'
  | 'upload'
  | 'assign'
  | 'users'
  | 'analytics'
  | 'daily-deals'
  | 'notes'
  | 'vehicle-risk'
  | 'income-verification'
  | 'reporting';

/** Tabs an admin can grant beyond role defaults. */
export const GRANTABLE_TABS: Array<{ id: TabId; label: string }> = [
  { id: 'income-verification', label: 'Income Verification' },
  { id: 'vehicle-risk', label: 'Vehicle Risk' },
];

const GRANTABLE_TAB_IDS = new Set<string>(GRANTABLE_TABS.map((tab) => tab.id));

const ALL_TAB_IDS: TabId[] = [
  'calls',
  'upload',
  'assign',
  'users',
  'analytics',
  'daily-deals',
  'notes',
  'vehicle-risk',
  'income-verification',
  'reporting',
];

export function getBaseTabsForRole(role: string): TabId[] {
  if (role === 'admin') {
    return ALL_TAB_IDS.filter((id) => id !== 'analytics');
  }
  if (role === 'manager') {
    return ALL_TAB_IDS.filter((id) => id !== 'users' && id !== 'analytics');
  }
  if (role === 'buying_assistant') {
    return ['calls', 'daily-deals', 'notes'];
  }
  // rep (default)
  return ['calls', 'analytics', 'daily-deals', 'notes'];
}

function sanitizeAllowedTabs(allowedTabs: string[] | null | undefined): TabId[] {
  if (!Array.isArray(allowedTabs)) return [];
  const seen = new Set<string>();
  const result: TabId[] = [];
  for (const raw of allowedTabs) {
    if (typeof raw !== 'string') continue;
    const id = raw.trim();
    if (!GRANTABLE_TAB_IDS.has(id) || seen.has(id)) continue;
    seen.add(id);
    result.push(id as TabId);
  }
  return result;
}

/** Effective visible tabs = role base ∪ sanitized grantable extras. */
export function resolveVisibleTabIds(
  role: string,
  allowedTabs?: string[] | null
): TabId[] {
  const base = getBaseTabsForRole(role);
  const extras = sanitizeAllowedTabs(allowedTabs).filter((id) => !base.includes(id));
  return [...base, ...extras];
}

export function canAccessTab(
  role: string,
  allowedTabs: string[] | null | undefined,
  tabId: string
): boolean {
  return resolveVisibleTabIds(role, allowedTabs).includes(tabId as TabId);
}

export function isTabIncludedWithRole(role: string, tabId: string): boolean {
  return getBaseTabsForRole(role).includes(tabId as TabId);
}
