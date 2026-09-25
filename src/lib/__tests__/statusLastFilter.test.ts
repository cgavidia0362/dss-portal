import { describe, expect, it } from 'vitest';
import {
  NO_ANSWER_AUTO_CLOSE_MS,
  callShouldAutoClose,
  resolveAutoCloseFuStatus,
  statusLastShouldAutoClose,
} from '../statusLastFilter';

describe('statusLastShouldAutoClose', () => {
  it('closes Denial, Declined, and Duplicate status last values', () => {
    expect(statusLastShouldAutoClose('Denial')).toBe(true);
    expect(statusLastShouldAutoClose('Declined')).toBe(true);
    expect(statusLastShouldAutoClose('Application Denial')).toBe(true);
    expect(statusLastShouldAutoClose('Duplicate')).toBe(true);
    expect(statusLastShouldAutoClose('Possible Duplicate')).toBe(true);
  });

  it('leaves working and booked status last values alone', () => {
    expect(statusLastShouldAutoClose('Approved')).toBe(false);
    expect(statusLastShouldAutoClose('Pending Approval')).toBe(false);
    expect(statusLastShouldAutoClose('Accepted')).toBe(false);
    expect(statusLastShouldAutoClose('')).toBe(false);
  });
});

describe('resolveAutoCloseFuStatus', () => {
  const sixteenDaysAgo = new Date(Date.now() - NO_ANSWER_AUTO_CLOSE_MS - 60_000);
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  it('sets Closed for auto-close status last unless the row is a booked deal', () => {
    expect(resolveAutoCloseFuStatus({ statusLast: 'Declined', fuStatus: undefined })).toBe('Closed');
    expect(resolveAutoCloseFuStatus({ statusLast: 'Duplicate', fuStatus: 'Pending' })).toBe('Closed');
    expect(resolveAutoCloseFuStatus({ statusLast: 'Duplicates', fuStatus: 'No Answer' })).toBe('Closed');
    expect(resolveAutoCloseFuStatus({ statusLast: 'Denial', fuStatus: 'Deal' })).toBe('Deal');
    expect(resolveAutoCloseFuStatus({ statusLast: 'Denial', fuStatus: 'Confirmed Deal' })).toBe('Confirmed Deal');
  });

  it('closes No Answer after 15 days from original upload', () => {
    expect(
      resolveAutoCloseFuStatus({
        statusLast: 'Approved',
        fuStatus: 'No Answer',
        createdAt: sixteenDaysAgo,
      }),
    ).toBe('Closed');
    expect(
      resolveAutoCloseFuStatus({
        statusLast: 'Approved',
        fuStatus: 'No Answer',
        createdAt: oneDayAgo,
      }),
    ).toBe('No Answer');
    expect(
      resolveAutoCloseFuStatus({
        statusLast: 'Approved',
        fuStatus: 'Pending',
        createdAt: sixteenDaysAgo,
      }),
    ).toBe('Pending');
  });

  it('does not treat already-closed or booked rows as needing a sweep', () => {
    expect(callShouldAutoClose({ statusLast: 'Denial', fuStatus: 'Closed' })).toBe(false);
    expect(callShouldAutoClose({ statusLast: 'Denial', fuStatus: 'Deal' })).toBe(false);
    expect(callShouldAutoClose({ statusLast: 'Denial', fuStatus: 'Pending' })).toBe(true);
    expect(
      callShouldAutoClose({
        statusLast: 'Approved',
        fuStatus: 'No Answer',
        createdAt: sixteenDaysAgo,
      }),
    ).toBe(true);
  });
});
