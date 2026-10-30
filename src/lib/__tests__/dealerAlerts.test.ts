import { describe, expect, it } from 'vitest';
import { dealerAlertMatchesCall, findDealerAlert } from '../dealerAlerts';

describe('dealerAlertMatchesCall', () => {
  it('matches by CIF when both sides have it', () => {
    expect(dealerAlertMatchesCall(
      { dealerCifNumber: '123', dealerName: 'Old Name' },
      { dealerCifNumber: '123', dealerName: 'New Name' },
    )).toBe(true);
  });

  it('matches by dealer name when CIF is missing', () => {
    expect(dealerAlertMatchesCall(
      { dealerName: 'Road Pro Auto' },
      { dealerName: 'road pro auto' },
    )).toBe(true);
  });

  it('does not match a different dealer', () => {
    expect(dealerAlertMatchesCall(
      { dealerCifNumber: '123', dealerName: 'Road Pro Auto' },
      { dealerCifNumber: '999', dealerName: 'Other Motors' },
    )).toBe(false);
  });
});

describe('findDealerAlert', () => {
  const alerts = [
    { id: '1', dealerName: 'Kennedy Auto Center', dealerCifNumber: 'K1', createdAt: '' },
  ];

  it('finds the flag for a matching call', () => {
    expect(findDealerAlert({ dealerName: 'kennedy auto center' }, alerts)?.id).toBe('1');
  });

  it('returns undefined when the dealer is not flagged', () => {
    expect(findDealerAlert({ dealerName: 'Other' }, alerts)).toBeUndefined();
  });
});
