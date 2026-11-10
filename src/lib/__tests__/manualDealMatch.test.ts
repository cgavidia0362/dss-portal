import { describe, expect, it } from 'vitest';
import {
  duplicateDailyDealMessage,
  manualDealMatchedByBookedCall,
  oneManualPerAppId,
} from '../manualDealMatch';

describe('manual deal double count', () => {
  it('treats a booked call and a Daily Deal as one deal even when the reps differ', () => {
    const matched = manualDealMatchedByBookedCall(
      { appId: 'DTBFK7987010', addedBy: 'fatima', addedByName: 'Fatima Valdez', fuStatus: 'Deal' },
      [{
        applicationId: 'dtbfk7987010',
        fuStatus: 'Confirmed Deal',
        dealDate: '2026-11-05',
        dealBy: 'ivan',
        dealByName: 'Ivan Aguilar',
      }],
    );
    expect(matched).toBe(true);
  });

  it('keeps the earliest Daily Deal when the same App ID was entered twice', () => {
    const kept = oneManualPerAppId([
      { id: 'later', appId: 'ABC', dealDate: '2026-11-09', createdAt: '2026-11-09T12:00:00Z' },
      { id: 'earlier', appId: 'abc', dealDate: '2026-11-04', createdAt: '2026-11-04T12:00:00Z' },
      { id: 'blank', appId: '  ', dealDate: '2026-11-01' },
    ]);
    expect(kept.map(row => row.id)).toEqual(['earlier', 'blank']);
  });

  it('names the rep already on the deal', () => {
    expect(duplicateDailyDealMessage({
      addedByName: 'Amsi Munoz',
      dealDate: '2026-11-06',
      fuStatus: 'Deal',
    })).toBe('This App ID is already a deal for Amsi Munoz (2026-11-06, Deal). A second deal was not added.');
  });
});
