import { describe, expect, it } from 'vitest';
import {
  DEAL_FOLLOW_UP_MS,
  activityDisplayAt,
  activitySortTime,
  clampFollowUpAt,
  dealShouldReturnToFollowUp,
  followUpPresetOptions,
  followUpShouldClearReminder,
  formatCallActivity,
  formatLastActivity,
  isFollowUpDue,
  isFollowUpWaiting,
  isPendingWaiting,
  mergeFetchedCalls,
  resolveSavedFollowUpAt,
} from '../callActivity';

describe('formatLastActivity', () => {
  it('shows a dash when there is no FU/note stamp', () => {
    expect(formatLastActivity(undefined).text).toBe('—');
    expect(formatLastActivity(null).text).toBe('—');
  });

  it('shows today plus time for a same-day stamp', () => {
    const now = new Date(2026, 8, 24, 16, 0, 0);
    const stamped = new Date(2026, 8, 24, 14, 14, 0);
    const result = formatLastActivity(stamped, 'Chris', now);
    expect(result.text).toMatch(/^Today /);
    expect(result.isToday).toBe(true);
    expect(result.byName).toBe('Chris');
  });
});

describe('activitySortTime', () => {
  it('sorts missing activity below stamped rows', () => {
    expect(activitySortTime(undefined)).toBeNull();
    expect(activitySortTime(new Date(2026, 8, 24, 14, 14, 0))).toBeGreaterThan(0);
  });
});

describe('formatCallActivity', () => {
  const now = new Date(2026, 8, 24, 16, 0, 0);
  const updatedAt = new Date(2026, 8, 24, 14, 20, 0);
  const dealDate = new Date(2026, 8, 15, 11, 0, 0);

  it('shows a dash when FU Status is empty even if updatedAt is set', () => {
    expect(formatCallActivity({ updatedAt }, now).text).toBe('—');
    expect(formatCallActivity({ fuStatus: undefined, updatedAt }, now).text).toBe('—');
  });

  it('does not treat an upload/updatedAt bump as the Deal date', () => {
    expect(formatCallActivity({ fuStatus: 'Deal', updatedAt }, now).text).toBe('—');
  });

  it('shows updatedAt for No Answer and other non-deal statuses', () => {
    const result = formatCallActivity({ fuStatus: 'No Answer', updatedAt }, now);
    expect(result.text).toMatch(/^Today /);
    expect(activityDisplayAt({ fuStatus: 'No Answer', updatedAt })?.getTime()).toBe(updatedAt.getTime());
    expect(formatCallActivity({ fuStatus: 'Pending', updatedAt }, now).text).toMatch(/^Today /);
  });

  it('uses dealDate for Deal rows that have no dedicated FU stamp', () => {
    const result = formatCallActivity({ fuStatus: 'Deal', updatedAt, dealDate }, now);
    expect(result.text).toBe('Sep 15');
    expect(result.isToday).toBe(false);
    expect(activityDisplayAt({ fuStatus: 'Deal', updatedAt, dealDate })?.getTime()).toBe(dealDate.getTime());
  });

  it('prefers lastActivityAt over dealDate and updatedAt', () => {
    const stamped = new Date(2026, 8, 24, 14, 14, 0);
    const at = activityDisplayAt({
      fuStatus: 'Deal',
      lastActivityAt: stamped,
      updatedAt,
      dealDate,
    });
    expect(at?.getTime()).toBe(stamped.getTime());
  });
});

describe('follow-up reminders', () => {
  const now = new Date(2026, 8, 24, 10, 0, 0);

  it('caps reminders at 24 hours and allows the next calendar day', () => {
    const fourteenHours = clampFollowUpAt(new Date(now.getTime() + 14 * 60 * 60 * 1000), now);
    expect(fourteenHours?.getHours()).toBe(0);
    expect(fourteenHours?.getDate()).toBe(25);

    const late = new Date(2026, 8, 24, 20, 0, 0);
    const pastMidnight = clampFollowUpAt(new Date(2026, 8, 25, 8, 0, 0), late);
    expect(pastMidnight?.getDate()).toBe(25);
    expect(pastMidnight?.getHours()).toBe(8);

    const tooFar = clampFollowUpAt(new Date(now.getTime() + 30 * 60 * 60 * 1000), now);
    expect(tooFar?.getTime()).toBe(now.getTime() + 24 * 60 * 60 * 1000);
  });

  it('rejects times in the past', () => {
    expect(clampFollowUpAt(new Date(now.getTime() - 60_000), now)).toBeNull();
  });

  it('offers hour presets that fit inside 24 hours, including overnight', () => {
    const evening = new Date(2026, 8, 24, 20, 0, 0);
    const hours = followUpPresetOptions(evening).map(option => option.hours);
    expect(hours).toEqual([1, 2, 3, 4, 6, 8, 12, 18, 24]);
  });

  it('keeps a valid picked reminder time and drops due-now or past times', () => {
    const nowMs = now.getTime();
    const inTwoHours = new Date(nowMs + 2 * 60 * 60 * 1000);
    expect(resolveSavedFollowUpAt(inTwoHours, nowMs)?.getTime()).toBe(inTwoHours.getTime());
    expect(resolveSavedFollowUpAt(new Date(nowMs + 1000), nowMs)?.getTime()).toBe(nowMs + 1000);
    expect(resolveSavedFollowUpAt(new Date(nowMs), nowMs)).toBeNull();
    expect(resolveSavedFollowUpAt(new Date(nowMs - 1000), nowMs)).toBeNull();
    expect(resolveSavedFollowUpAt(null, nowMs)).toBeNull();
  });

  it('hides scheduled Follow Up until due, then returns it to the queue', () => {
    const later = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    const scheduled = { fuStatus: 'Follow Up', followUpAt: later };
    expect(isFollowUpWaiting(scheduled, now)).toBe(true);
    expect(isFollowUpDue(scheduled, now)).toBe(false);
    expect(isFollowUpWaiting(scheduled, later)).toBe(false);
    expect(isFollowUpDue(scheduled, later)).toBe(true);
  });

  it('clears the reminder only once the due time has passed', () => {
    const leftover = {
      fuStatus: 'Follow Up' as const,
      followUpAt: new Date(2026, 8, 25, 8, 0, 0),
    };
    expect(followUpShouldClearReminder(leftover, new Date(2026, 8, 25, 0, 1, 0))).toBe(false);
    expect(followUpShouldClearReminder(leftover, new Date(2026, 8, 25, 8, 0, 0))).toBe(true);
  });
});

describe('dealShouldReturnToFollowUp', () => {
  const now = new Date(2026, 8, 24, 12, 0, 0).getTime();

  it('moves Deal to Follow Up after 5 days', () => {
    const sixDaysAgo = new Date(now - DEAL_FOLLOW_UP_MS - 60_000);
    expect(dealShouldReturnToFollowUp({ fuStatus: 'Deal', lastActivityAt: sixDaysAgo }, now)).toBe(true);
  });

  it('leaves Confirmed Deal, recent deals, and closed rows alone', () => {
    const sixDaysAgo = new Date(now - DEAL_FOLLOW_UP_MS - 60_000);
    const yesterday = new Date(now - 24 * 60 * 60 * 1000);
    expect(dealShouldReturnToFollowUp({ fuStatus: 'Confirmed Deal', dealDate: sixDaysAgo }, now)).toBe(false);
    expect(dealShouldReturnToFollowUp({ fuStatus: 'Deal', lastActivityAt: yesterday }, now)).toBe(false);
    expect(dealShouldReturnToFollowUp({ fuStatus: 'Closed', lastActivityAt: sixDaysAgo }, now)).toBe(false);
    expect(dealShouldReturnToFollowUp({ fuStatus: 'Pending', lastActivityAt: sixDaysAgo }, now)).toBe(false);
  });
});

describe('isPendingWaiting', () => {
  it('keeps Pending out of the queue until the start of the local day 2 days later', () => {
    const stamped = new Date(2026, 8, 28, 16, 30, 0);
    const pending = { fuStatus: 'Pending', fuStatusAt: stamped };
    expect(isPendingWaiting(pending, new Date(2026, 8, 28, 17, 0, 0))).toBe(true);
    expect(isPendingWaiting(pending, new Date(2026, 8, 29, 23, 59, 0))).toBe(true);
    expect(isPendingWaiting(pending, new Date(2026, 8, 30, 0, 0, 0))).toBe(false);
  });

  it('does not restart the hold when a later note stamps lastActivityAt', () => {
    const pendingSet = new Date(2026, 8, 28, 16, 30, 0);
    const noteAt = new Date(2026, 8, 30, 10, 0, 0);
    const pending = { fuStatus: 'Pending', fuStatusAt: pendingSet, lastActivityAt: noteAt };
    expect(isPendingWaiting(pending, new Date(2026, 8, 30, 10, 5, 0))).toBe(false);
  });

  it('does not park other statuses', () => {
    const stamped = new Date(2026, 8, 28, 16, 30, 0);
    expect(isPendingWaiting({ fuStatus: 'No Answer', lastActivityAt: stamped }, new Date(2026, 8, 28, 17, 0, 0))).toBe(false);
    expect(isPendingWaiting({ fuStatus: 'Follow Up', lastActivityAt: stamped }, new Date(2026, 8, 28, 17, 0, 0))).toBe(false);
  });
});

describe('mergeFetchedCalls', () => {
  it('keeps a newer local FU write instead of overwriting with a stale fetch', () => {
    const older = new Date('2026-09-24T16:00:00.000Z');
    const newer = new Date('2026-09-24T16:00:05.000Z');
    const merged = mergeFetchedCalls(
      [{ id: '1', fuStatus: 'Pending', lastActivityAt: older }],
      [{ id: '1', fuStatus: 'No Answer', lastActivityAt: newer }],
    );
    expect(merged[0].fuStatus).toBe('No Answer');
    expect(merged[0].lastActivityAt).toBe(newer);
  });
});
