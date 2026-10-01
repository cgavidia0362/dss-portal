import { describe, expect, it } from 'vitest';
import {
  NO_ANSWER_AUTO_CLOSE_MS,
  callShouldAutoClose,
  canonicalStatusLastLabel,
  resolveAutoCloseFuStatus,
  statusLastShouldAutoClose,
  statusLastShouldImportAutoClose,
  statusMatchesFilter,
} from '../statusLastFilter';

describe('statusLastShouldAutoClose', () => {
  it('closes Denial, Declined, Duplicate, and Cancelled status last values', () => {
    expect(statusLastShouldAutoClose('Denial')).toBe(true);
    expect(statusLastShouldAutoClose('Declined')).toBe(true);
    expect(statusLastShouldAutoClose('Application Denial')).toBe(true);
    expect(statusLastShouldAutoClose('Duplicate')).toBe(true);
    expect(statusLastShouldAutoClose('Possible Duplicate')).toBe(true);
    expect(statusLastShouldAutoClose('Cancelled')).toBe(true);
    expect(statusLastShouldAutoClose('Canceled')).toBe(true);
  });

  it('leaves working and booked status last values alone', () => {
    expect(statusLastShouldAutoClose('Approved')).toBe(false);
    expect(statusLastShouldAutoClose('Pending Approval')).toBe(false);
    expect(statusLastShouldAutoClose('Accepted')).toBe(false);
    expect(statusLastShouldAutoClose('Funded')).toBe(false);
    expect(statusLastShouldAutoClose('Funding Pending')).toBe(false);
    expect(statusLastShouldAutoClose('Documents Received')).toBe(false);
    expect(statusLastShouldAutoClose('')).toBe(false);
  });
});

describe('statusLastShouldImportAutoClose', () => {
  it('closes Documents Received, Funded, and Funding Pending on import', () => {
    expect(statusLastShouldImportAutoClose('Documents Received')).toBe(true);
    expect(statusLastShouldImportAutoClose('Document Received')).toBe(true);
    expect(statusLastShouldImportAutoClose('Funded')).toBe(true);
    expect(statusLastShouldImportAutoClose('Funding Pending')).toBe(true);
  });

  it('does not treat Denial or Approved as import-only closes', () => {
    expect(statusLastShouldImportAutoClose('Denial')).toBe(false);
    expect(statusLastShouldImportAutoClose('Approved')).toBe(false);
  });
});

describe('canonicalStatusLastLabel', () => {
  it('groups Document Received with Documents Received and Declined with Denial', () => {
    expect(canonicalStatusLastLabel('Document Received')).toBe('Documents Received');
    expect(canonicalStatusLastLabel('Documents Received')).toBe('Documents Received');
    expect(canonicalStatusLastLabel('Declined')).toBe('Denial');
    expect(canonicalStatusLastLabel('Denial')).toBe('Denial');
    expect(canonicalStatusLastLabel('Approved')).toBe('Approved');
  });
});

describe('statusMatchesFilter', () => {
  it('lets the Documents Received chip match Document Received rows', () => {
    expect(statusMatchesFilter('Document Received', new Set(['Documents Received']))).toBe(true);
    expect(statusMatchesFilter('Documents Received', new Set(['Documents Received']))).toBe(true);
  });

  it('lets the Denial chip match Declined rows', () => {
    expect(statusMatchesFilter('Declined', new Set(['Denial']))).toBe(true);
    expect(statusMatchesFilter('Denial', new Set(['Denial']))).toBe(true);
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
    expect(resolveAutoCloseFuStatus({ statusLast: 'Cancelled', fuStatus: 'Pending' })).toBe('Closed');
    expect(resolveAutoCloseFuStatus({ statusLast: 'Canceled', fuStatus: 'No Answer' })).toBe('Closed');
    expect(resolveAutoCloseFuStatus({ statusLast: 'Cancelled', fuStatus: 'Deal' })).toBe('Deal');
  });

  it('closes Documents Received, Funded, and Funding Pending only when FU is still empty', () => {
    expect(resolveAutoCloseFuStatus({ statusLast: 'Documents Received' })).toBe('Closed');
    expect(resolveAutoCloseFuStatus({ statusLast: 'Document Received', fuStatus: undefined })).toBe('Closed');
    expect(resolveAutoCloseFuStatus({ statusLast: 'Funded', fuStatus: null })).toBe('Closed');
    expect(resolveAutoCloseFuStatus({ statusLast: 'Funding Pending' })).toBe('Closed');
    expect(resolveAutoCloseFuStatus({ statusLast: 'Documents Received', fuStatus: 'Pending' })).toBe('Pending');
    expect(resolveAutoCloseFuStatus({ statusLast: 'Funded', fuStatus: 'Follow Up' })).toBe('Follow Up');
    expect(resolveAutoCloseFuStatus({ statusLast: 'Funding Pending', fuStatus: 'Deal' })).toBe('Deal');
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
    expect(callShouldAutoClose({ statusLast: 'Funded', fuStatus: undefined })).toBe(true);
    expect(callShouldAutoClose({ statusLast: 'Documents Received', fuStatus: 'Pending' })).toBe(false);
    expect(
      callShouldAutoClose({
        statusLast: 'Approved',
        fuStatus: 'No Answer',
        createdAt: sixteenDaysAgo,
      }),
    ).toBe(true);
  });
});
