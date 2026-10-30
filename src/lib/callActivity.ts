export const DEAL_FOLLOW_UP_MS = 5 * 24 * 60 * 60 * 1000;
export const FOLLOW_UP_MAX_MS = 24 * 60 * 60 * 1000;
export const FOLLOW_UP_HOUR_OPTIONS = [1, 2, 3, 4, 6, 8, 12, 18, 24] as const;
export const PENDING_QUEUE_HOLD_DAYS = 2;

export type ActivityActor = { id?: string; name?: string } | null | undefined;

export interface ActivityCallFields {
  fuStatus?: string | null;
  lastActivityAt?: Date | string | null;
  lastActivityBy?: string | null;
  lastActivityByName?: string | null;
  fuStatusAt?: Date | string | null;
  followUpAt?: Date | string | null;
  dealDate?: Date | string | null;
  updatedAt?: Date | string | null;
  updatedByName?: string | null;
}

function asDate(value?: Date | string | null): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function startOfLocalDay(now = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function endOfLocalDay(now = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
}

export function activityDbFields(actor?: ActivityActor, at = new Date()) {
  const iso = at.toISOString();
  return {
    last_activity_at: iso,
    last_activity_by: actor?.id || null,
    last_activity_by_name: actor?.name || null,
    updated_at: iso,
    updated_by: actor?.id || null,
    updated_by_name: actor?.name || null,
  };
}

export function activityLocalFields(actor?: ActivityActor, at = new Date()) {
  return {
    lastActivityAt: at,
    lastActivityBy: actor?.id || undefined,
    lastActivityByName: actor?.name || undefined,
    updatedAt: at,
    updatedBy: actor?.id || undefined,
    updatedByName: actor?.name || undefined,
  };
}

/** Stamp when FU status actually changes. Notes must not write this. */
export function fuStatusAtDbFields(at = new Date()) {
  return { fu_status_at: at.toISOString() };
}

export function fuStatusAtLocalFields(at = new Date()) {
  return { fuStatusAt: at };
}

/** Bump row metadata without treating it as a call (amount / Status Last). */
export function touchDbFields(actor?: ActivityActor, at = new Date()) {
  return {
    updated_at: at.toISOString(),
    updated_by: actor?.id || null,
    updated_by_name: actor?.name || null,
  };
}

export function formatLastActivity(
  at?: Date | string | null,
  byName?: string | null,
  now = new Date(),
): { text: string; isToday: boolean; byName?: string } {
  const date = asDate(at);
  if (!date) return { text: '—', isToday: false };
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();
  const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    .replace(' AM', 'am').replace(' PM', 'pm');
  const name = byName || undefined;
  if (isToday) return { text: `Today ${timeStr}`, isToday: true, byName: name };
  const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return { text: dateStr, isToday: false, byName: name };
}

export function activitySortTime(at?: Date | string | null): number | null {
  const date = asDate(at);
  return date ? date.getTime() : null;
}

/** True FU/note stamp. Deals use dealDate, not upload-bumped updatedAt. Other FU statuses can use updatedAt. */
export function activityDisplayAt(
  call: Pick<ActivityCallFields, 'fuStatus' | 'lastActivityAt' | 'updatedAt' | 'dealDate'>,
): Date | null {
  const stamped = asDate(call.lastActivityAt);
  if (stamped) return stamped;
  if (call.fuStatus === 'Deal' || call.fuStatus === 'Confirmed Deal') {
    return asDate(call.dealDate);
  }
  if (call.fuStatus) return asDate(call.updatedAt);
  return null;
}

export function formatCallActivity(
  call: Pick<ActivityCallFields, 'fuStatus' | 'lastActivityAt' | 'lastActivityByName' | 'updatedAt' | 'updatedByName' | 'dealDate'>,
  now = new Date(),
): { text: string; isToday: boolean; byName?: string } {
  const at = activityDisplayAt(call);
  const byName = call.lastActivityAt
    ? call.lastActivityByName
    : (call.fuStatus === 'Deal' || call.fuStatus === 'Confirmed Deal' ? undefined : call.updatedByName);
  return formatLastActivity(at, byName, now);
}

/** Keep a picked Follow Up time when it is still in the future; otherwise treat as due now. */
export function resolveSavedFollowUpAt(desired?: Date | null, now = Date.now()): Date | null {
  if (!desired) return null;
  const time = desired.getTime();
  if (Number.isNaN(time) || time <= now) return null;
  return desired;
}

export function clampFollowUpAt(desired: Date, now = new Date()): Date | null {
  const desiredTime = desired.getTime();
  if (Number.isNaN(desiredTime) || desiredTime <= now.getTime()) return null;
  const cap = now.getTime() + FOLLOW_UP_MAX_MS;
  return new Date(Math.min(desiredTime, cap));
}

export function followUpPresetOptions(now = new Date()): { hours: number; at: Date }[] {
  const seen = new Set<number>();
  const options: { hours: number; at: Date }[] = [];
  for (const hours of FOLLOW_UP_HOUR_OPTIONS) {
    const desired = new Date(now.getTime() + hours * 60 * 60 * 1000);
    const at = clampFollowUpAt(desired, now);
    if (!at) continue;
    const key = at.getTime();
    if (seen.has(key)) continue;
    seen.add(key);
    options.push({ hours, at });
  }
  return options;
}

export function isFollowUpWaiting(
  call: Pick<ActivityCallFields, 'fuStatus' | 'followUpAt'>,
  now = new Date(),
): boolean {
  if (call.fuStatus !== 'Follow Up') return false;
  const at = asDate(call.followUpAt);
  return !!at && at.getTime() > now.getTime();
}

export function isFollowUpDue(
  call: Pick<ActivityCallFields, 'fuStatus' | 'followUpAt'>,
  now = new Date(),
): boolean {
  if (call.fuStatus !== 'Follow Up') return false;
  return !isFollowUpWaiting(call, now);
}

export function followUpShouldClearReminder(
  call: Pick<ActivityCallFields, 'fuStatus' | 'followUpAt'>,
  now = new Date(),
): boolean {
  if (call.fuStatus !== 'Follow Up') return false;
  const at = asDate(call.followUpAt);
  if (!at) return false;
  return at.getTime() <= now.getTime();
}

export function formatFollowUpDue(at?: Date | string | null, now = new Date()): string | null {
  const date = asDate(at);
  if (!date) return null;
  if (date.getTime() <= now.getTime()) return 'due now';
  const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    .replace(' AM', 'am').replace(' PM', 'pm');
  const sameDay =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();
  if (sameDay) return `due ${timeStr}`;
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const isTomorrow =
    date.getDate() === tomorrow.getDate() &&
    date.getMonth() === tomorrow.getMonth() &&
    date.getFullYear() === tomorrow.getFullYear();
  if (isTomorrow) return `due tomorrow ${timeStr}`;
  const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `due ${dateStr} ${timeStr}`;
}

/** Pending stays out of a rep's queue until the start of the local day 2 days after it was set. */
export function isPendingWaiting(
  call: Pick<ActivityCallFields, 'fuStatus' | 'fuStatusAt' | 'lastActivityAt' | 'updatedAt'>,
  now = new Date(),
): boolean {
  if (call.fuStatus !== 'Pending') return false;
  const stamp = asDate(call.fuStatusAt) || asDate(call.lastActivityAt) || asDate(call.updatedAt);
  if (!stamp) return false;
  const returnAt = startOfLocalDay(stamp);
  returnAt.setDate(returnAt.getDate() + PENDING_QUEUE_HOLD_DAYS);
  return now.getTime() < returnAt.getTime();
}

export function dealShouldReturnToFollowUp(
  call: Pick<ActivityCallFields, 'fuStatus' | 'lastActivityAt' | 'dealDate'>,
  now = Date.now(),
): boolean {
  if (call.fuStatus !== 'Deal') return false;
  const stamp = asDate(call.lastActivityAt) || asDate(call.dealDate);
  if (!stamp) return false;
  return now - stamp.getTime() >= DEAL_FOLLOW_UP_MS;
}

export function mergeFetchedCalls<T extends {
  id: string;
  lastActivityAt?: Date;
  fuStatus?: string;
  fuStatusAt?: Date;
  followUpAt?: Date;
  dealDate?: Date;
  dealBy?: string;
  dealByName?: string;
  lastActivityBy?: string;
  lastActivityByName?: string;
}>(fetched: T[], prev: T[]): T[] {
  if (prev.length === 0) return fetched;
  const prevById = new Map(prev.map(call => [call.id, call]));
  return fetched.map(incoming => {
    const local = prevById.get(incoming.id);
    if (!local?.lastActivityAt) return incoming;
    const localT = local.lastActivityAt.getTime();
    const remoteT = incoming.lastActivityAt?.getTime() || 0;
    if (localT <= remoteT) return incoming;
    return {
      ...incoming,
      fuStatus: local.fuStatus,
      fuStatusAt: local.fuStatusAt,
      lastActivityAt: local.lastActivityAt,
      lastActivityBy: local.lastActivityBy,
      lastActivityByName: local.lastActivityByName,
      followUpAt: local.followUpAt,
      dealDate: local.dealDate,
      dealBy: local.dealBy,
      dealByName: local.dealByName,
    };
  });
}
