export const isDealLikeStatus = (s?: string | null) => s === 'Deal' || s === 'Confirmed Deal';

/** Mistaken Deal → other status within this window drops out of sticky Deals. */
export const DEAL_STICKY_GRACE_MS = 24 * 60 * 60 * 1000;

export interface DealCreditExisting {
  dealBy?: string;
  dealByName?: string;
  dealDate?: Date;
}

export interface DealCreditActor {
  id: string;
  name?: string;
}

export function getDealTimestamp(dealDate?: Date | string | null): Date | null {
  if (!dealDate) return null;
  if (dealDate instanceof Date) {
    return Number.isNaN(dealDate.getTime()) ? null : dealDate;
  }
  const s = String(dealDate).trim();
  if (!s) return null;
  // Date-only YYYY-MM-DD → local midnight
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  const parsed = new Date(s);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** True once the deal has been booked longer than the grace window. */
export function isDealCreditLocked(
  dealDate?: Date | string | null,
  now: Date = new Date(),
): boolean {
  const ts = getDealTimestamp(dealDate);
  if (!ts) return false;
  return now.getTime() - ts.getTime() >= DEAL_STICKY_GRACE_MS;
}

/**
 * Sticky All Deals / Rep Deals inclusion:
 * - Current Deal or Confirmed → always
 * - Any other status → only if deal_date is older than 24h (locked)
 */
export function countsAsStickyBookedDeal(
  fuStatus?: string | null,
  dealDate?: Date | string | null,
  now: Date = new Date(),
): boolean {
  if (!getDealTimestamp(dealDate)) return false;
  if (fuStatus === 'Deal' || fuStatus === 'Confirmed Deal') return true;
  return isDealCreditLocked(dealDate, now);
}

export function resolveDealCredit(
  newStatus: string | undefined | null,
  existing: DealCreditExisting,
  actor?: DealCreditActor,
) {
  const isDeal = newStatus === 'Deal';
  const isDealLike = isDealLikeStatus(newStatus);

  let dealBy = existing.dealBy;
  let dealByName = existing.dealByName;
  let dealDate = existing.dealDate;

  if (isDeal && !dealBy && actor?.id) {
    dealBy = actor.id;
    dealByName = actor.name;
  }
  if (isDealLike && !dealDate) {
    dealDate = new Date();
  }

  // Leave Deal/Confirmed:
  // - within 24h of deal_date → clear credit (mistake / early undo)
  // - after 24h → keep credit so sticky Deals / conversion still count it
  if (!isDealLike) {
    if (!isDealCreditLocked(dealDate)) {
      dealBy = undefined;
      dealByName = undefined;
      dealDate = undefined;
    }
  }

  return { dealBy, dealByName, dealDate };
}

export function dealCreditDbFields(
  newStatus: string | undefined | null,
  existing: DealCreditExisting,
  actor?: DealCreditActor,
) {
  const { dealBy, dealByName, dealDate } = resolveDealCredit(newStatus, existing, actor);
  return {
    fu_status: newStatus || null,
    deal_by: dealBy || null,
    deal_by_name: dealByName || null,
    deal_date: dealDate ? new Date(dealDate).toISOString() : null,
  };
}

/**
 * Manager/admin force-set deal credit (and status).
 * Overwrites existing deal_by. Preserves deal_date when already set.
 */
export function forceDealCreditDbFields(
  newStatus: string | undefined | null,
  credit: { id: string; name: string },
  existingDealDate?: Date | string | null,
) {
  const isDealLike = isDealLikeStatus(newStatus);
  if (!isDealLike) {
    return dealCreditDbFields(newStatus, {
      dealBy: credit.id,
      dealByName: credit.name,
      dealDate: existingDealDate
        ? existingDealDate instanceof Date
          ? existingDealDate
          : getDealTimestamp(existingDealDate) || undefined
        : undefined,
    });
  }

  const dealDate =
    (existingDealDate
      ? existingDealDate instanceof Date
        ? existingDealDate
        : getDealTimestamp(existingDealDate)
      : null) || new Date();

  return {
    fu_status: newStatus || null,
    deal_by: credit.id,
    deal_by_name: credit.name,
    deal_date: dealDate.toISOString(),
  };
}
