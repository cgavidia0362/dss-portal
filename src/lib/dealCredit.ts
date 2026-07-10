export const isDealLikeStatus = (s?: string | null) => s === 'Deal' || s === 'Confirmed Deal';

export interface DealCreditExisting {
  dealBy?: string;
  dealByName?: string;
  dealDate?: Date;
}

export interface DealCreditActor {
  id: string;
  name?: string;
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
  if (!isDealLike) {
    dealBy = undefined;
    dealByName = undefined;
    dealDate = undefined;
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
