export type DealerIdentity = {
  dealerCifNumber?: string | null;
  dealerName?: string | null;
};

export type DistributableCall = DealerIdentity & {
  id: string;
};

export type DistributeRep = {
  id: string;
  name: string;
};

export type DealerGroup = {
  key: string;
  sortName: string;
  sortCif: string;
  callIds: string[];
};

export type RepShare = {
  repId: string;
  repName: string;
  dealerCount: number;
  callCount: number;
  callIds: string[];
  dealerKeys: string[];
};

export type DistributeResult = {
  shares: RepShare[];
  assignmentByCallId: Record<string, { repId: string; repName: string }>;
  dealerCount: number;
  callCount: number;
};

export function normalizeDealerCif(cif?: string | null): string {
  return (cif || '').trim();
}

export function normalizeDealerName(name?: string | null): string {
  return (name || '').trim().toLowerCase();
}

export function dealerKey(call: DealerIdentity): string {
  const cif = normalizeDealerCif(call.dealerCifNumber);
  if (cif) return `cif:${cif}`;
  const name = normalizeDealerName(call.dealerName);
  return name ? `name:${name}` : '';
}

function findRoot(parent: number[], index: number): number {
  let current = index;
  while (parent[current] !== current) {
    parent[current] = parent[parent[current]];
    current = parent[current];
  }
  return current;
}

function union(parent: number[], a: number, b: number) {
  const rootA = findRoot(parent, a);
  const rootB = findRoot(parent, b);
  if (rootA !== rootB) parent[rootB] = rootA;
}

function groupKey(sortCif: string, sortName: string, fallbackCallId: string): string {
  if (sortCif) return `cif:${sortCif}`;
  if (sortName) return `name:${sortName}`;
  return `call:${fallbackCallId}`;
}

/** Group apps that share a CIF or the same dealer name so one rooftop is never split. */
export function groupCallsByDealer(calls: DistributableCall[]): DealerGroup[] {
  const parent = calls.map((_, index) => index);
  const cifFirst = new Map<string, number>();
  const nameFirst = new Map<string, number>();

  calls.forEach((call, index) => {
    const cif = normalizeDealerCif(call.dealerCifNumber);
    const name = normalizeDealerName(call.dealerName);
    if (cif) {
      const existing = cifFirst.get(cif);
      if (existing === undefined) cifFirst.set(cif, index);
      else union(parent, existing, index);
    }
    if (name) {
      const existing = nameFirst.get(name);
      if (existing === undefined) nameFirst.set(name, index);
      else union(parent, existing, index);
    }
  });

  const groups = new Map<number, DealerGroup>();
  calls.forEach((call, index) => {
    const root = findRoot(parent, index);
    const cif = normalizeDealerCif(call.dealerCifNumber);
    const name = normalizeDealerName(call.dealerName);
    const existing = groups.get(root);
    if (existing) {
      existing.callIds.push(call.id);
      if (name && (!existing.sortName || name.localeCompare(existing.sortName) < 0)) {
        existing.sortName = name;
      }
      if (cif && (!existing.sortCif || cif.localeCompare(existing.sortCif) < 0)) {
        existing.sortCif = cif;
      }
      existing.key = groupKey(existing.sortCif, existing.sortName, existing.callIds[0]);
      return;
    }
    groups.set(root, {
      key: groupKey(cif, name, call.id),
      sortName: name,
      sortCif: cif,
      callIds: [call.id],
    });
  });

  return Array.from(groups.values()).sort((a, b) => {
    const byName = a.sortName.localeCompare(b.sortName);
    if (byName !== 0) return byName;
    const byCif = a.sortCif.localeCompare(b.sortCif);
    if (byCif !== 0) return byCif;
    return a.key.localeCompare(b.key);
  });
}

export function uniqueDealerCount(calls: DistributableCall[]): number {
  return groupCallsByDealer(calls).length;
}

export function distributeDealersToReps(
  calls: DistributableCall[],
  reps: DistributeRep[],
): DistributeResult {
  if (reps.length === 0) {
    return { shares: [], assignmentByCallId: {}, dealerCount: 0, callCount: 0 };
  }

  const groups = groupCallsByDealer(calls);
  const shares: RepShare[] = reps.map(rep => ({
    repId: rep.id,
    repName: rep.name,
    dealerCount: 0,
    callCount: 0,
    callIds: [],
    dealerKeys: [],
  }));

  for (const group of groups) {
    let best = 0;
    for (let i = 1; i < shares.length; i++) {
      if (shares[i].dealerCount < shares[best].dealerCount) best = i;
    }
    const share = shares[best];
    share.dealerCount += 1;
    share.callIds.push(...group.callIds);
    share.callCount += group.callIds.length;
    share.dealerKeys.push(group.key);
  }

  const assignmentByCallId: Record<string, { repId: string; repName: string }> = {};
  for (const share of shares) {
    for (const id of share.callIds) {
      assignmentByCallId[id] = { repId: share.repId, repName: share.repName };
    }
  }

  return {
    shares,
    assignmentByCallId,
    dealerCount: groups.length,
    callCount: calls.length,
  };
}
