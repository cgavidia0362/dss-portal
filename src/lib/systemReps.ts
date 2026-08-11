/** System / non-login reps used for deal credit only. */

export const PRONTO_REP_ID = 'a0000000-0000-4000-8000-000000000001';
export const PRONTO_REP_NAME = 'Pronto Rep';

export interface SystemRep {
  id: string;
  name: string;
  role: 'rep';
  isSystem: true;
}

export const PRONTO_REP: SystemRep = {
  id: PRONTO_REP_ID,
  name: PRONTO_REP_NAME,
  role: 'rep',
  isSystem: true,
};

export function isProntoRep(id?: string | null): boolean {
  return !!id && id === PRONTO_REP_ID;
}

export function isSystemRepId(id?: string | null): boolean {
  return isProntoRep(id);
}

export type CreditPickerUser = {
  id: string;
  name: string;
  role?: string;
};

/** Managers/admins may credit any active user + Pronto. Everyone else: real users only (no Pronto). */
export function getDealCreditOptions(
  users: CreditPickerUser[],
  role: string | undefined,
): CreditPickerUser[] {
  const canPickSystem = role === 'admin' || role === 'manager';
  const seen = new Set<string>();
  const list: CreditPickerUser[] = [];

  for (const u of users) {
    if (!u.id || seen.has(u.id)) continue;
    if (isSystemRepId(u.id) && !canPickSystem) continue;
    seen.add(u.id);
    list.push(u);
  }

  if (canPickSystem && !seen.has(PRONTO_REP_ID)) {
    list.push({ id: PRONTO_REP.id, name: PRONTO_REP.name, role: PRONTO_REP.role });
  }

  return list.sort((a, b) => a.name.localeCompare(b.name));
}

export function resolveCreditName(
  creditId: string,
  users: CreditPickerUser[],
): string {
  if (isProntoRep(creditId)) return PRONTO_REP_NAME;
  return users.find(u => u.id === creditId)?.name || 'Unknown';
}
