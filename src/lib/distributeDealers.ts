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

export function dealerKey(call: DealerIdentity): string {
  const cif = (call.dealerCifNumber || '').trim();
  if (cif) return `cif:${cif}`;
  const name = (call.dealerName || '').trim().toLowerCase();
  return name ? `name:${name}` : '';
}

export function groupCallsByDealer(calls: DistributableCall[]): DealerGroup[] {
  const map = new Map<string, DealerGroup>();
  for (const call of calls) {
    let key = dealerKey(call);
    if (!key) key = `call:${call.id}`;
    const existing = map.get(key);
    if (existing) {
      existing.callIds.push(call.id);
      continue;
    }
    map.set(key, {
      key,
      sortName: (call.dealerName || '').trim().toLowerCase(),
      sortCif: (call.dealerCifNumber || '').trim(),
      callIds: [call.id],
    });
  }
  return Array.from(map.values()).sort((a, b) => {
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
