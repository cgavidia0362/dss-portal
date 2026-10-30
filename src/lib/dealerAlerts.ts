export interface DealerAlert {
  id: string;
  dealerCifNumber?: string;
  dealerName: string;
  reason?: string;
  createdBy?: string;
  createdByName?: string;
  createdAt: string;
}

export function normalizeDealerName(name?: string | null): string {
  return (name || '').trim().toLowerCase();
}

export function dealerAlertMatchesCall(
  alert: Pick<DealerAlert, 'dealerCifNumber' | 'dealerName'>,
  call: { dealerCifNumber?: string | null; dealerName?: string | null },
): boolean {
  const callCif = (call.dealerCifNumber || '').trim();
  const alertCif = (alert.dealerCifNumber || '').trim();
  if (callCif && alertCif && callCif === alertCif) return true;
  const callName = normalizeDealerName(call.dealerName);
  const alertName = normalizeDealerName(alert.dealerName);
  return !!callName && callName === alertName;
}

export function findDealerAlert(
  call: { dealerCifNumber?: string | null; dealerName?: string | null },
  alerts: DealerAlert[],
): DealerAlert | undefined {
  return alerts.find(alert => dealerAlertMatchesCall(alert, call));
}

export function mapDealerAlertRow(row: {
  id: string;
  dealer_cif_number?: string | null;
  dealer_name?: string | null;
  reason?: string | null;
  created_by?: string | null;
  created_by_name?: string | null;
  created_at?: string;
}): DealerAlert {
  return {
    id: row.id,
    dealerCifNumber: row.dealer_cif_number || undefined,
    dealerName: row.dealer_name || '',
    reason: row.reason || undefined,
    createdBy: row.created_by || undefined,
    createdByName: row.created_by_name || undefined,
    createdAt: row.created_at || '',
  };
}
