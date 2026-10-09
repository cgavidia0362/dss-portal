export type LenderCompetitor = {
  competitor: string;
  mentionCount: number;
  howTheyBeatUs: string;
};

function normalizeDealerLabel(value?: string | null): string {
  return (value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function uniqueDealerNames(names: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const name of names) {
    const trimmed = (name || '').trim();
    const key = normalizeDealerLabel(trimmed);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(trimmed);
  }
  return unique;
}

export function isKnownDealerName(competitor: string, dealerNames: string[]): boolean {
  const needle = normalizeDealerLabel(competitor);
  if (needle.length < 4) return false;
  return dealerNames.some((name) => {
    const hay = normalizeDealerLabel(name);
    if (hay.length < 4) return false;
    return needle === hay || needle.includes(hay) || hay.includes(needle);
  });
}

export function excludeKnownDealersFromLenders<T extends LenderCompetitor>(
  rows: T[],
  dealerNames: string[],
): T[] {
  if (dealerNames.length === 0) return rows;
  return rows.filter((row) => !isKnownDealerName(row.competitor, dealerNames));
}
