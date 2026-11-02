import { describe, expect, it } from 'vitest';
import {
  excludeKnownDealersFromLenders,
  isKnownDealerName,
  latestNotePerApplication,
  uniqueDealerNames,
} from '../notesInsights';

describe('uniqueDealerNames', () => {
  it('dedupes case and spacing', () => {
    expect(uniqueDealerNames([
      'Smart Buy Auto Finance',
      '  smart buy auto finance ',
      'Driveway Deals',
      '',
      null,
    ])).toEqual(['Smart Buy Auto Finance', 'Driveway Deals']);
  });
});

describe('excludeKnownDealersFromLenders', () => {
  const rows = [
    { competitor: 'Westlake', mentionCount: 9, howTheyBeatUs: 'Lower APR' },
    { competitor: 'Smart Buy Auto Finance', mentionCount: 7, howTheyBeatUs: 'Customer went to Smart Buy' },
    { competitor: 'Driveway Deals', mentionCount: 6, howTheyBeatUs: 'Deals sent to Driveway Deals' },
    { competitor: 'Credit Acceptance', mentionCount: 1, howTheyBeatUs: 'Named once' },
  ];

  it('drops rooftops that match known dealer names', () => {
    const kept = excludeKnownDealersFromLenders(rows, [
      'SMART BUY AUTO FINANCE',
      'Driveway Deals',
    ]);
    expect(kept.map(r => r.competitor)).toEqual(['Westlake', 'Credit Acceptance']);
  });

  it('treats a shortened rooftop name as a dealer', () => {
    expect(isKnownDealerName('Smart Buy', ['Smart Buy Auto Finance'])).toBe(true);
    expect(isKnownDealerName('Westlake', ['Smart Buy Auto Finance'])).toBe(false);
  });
});

describe('latestNotePerApplication', () => {
  it('keeps the newest note for each application', () => {
    const rows = latestNotePerApplication([
      { appId: 'DTBFJ1', noteText: 'No answer', createdAt: '2026-11-01T10:00:00' },
      { appId: 'DTBFJ1', noteText: 'Sent it elsewhere', createdAt: '2026-11-02T15:00:00' },
      { appId: 'DTBFJ2', noteText: 'Better APR at Westlake', createdAt: '2026-11-02T09:00:00' },
    ]);
    expect(rows.map((row) => row.noteText)).toEqual([
      'Sent it elsewhere',
      'Better APR at Westlake',
    ]);
  });

  it('collapses the same app from calls and daily deals', () => {
    const rows = latestNotePerApplication([
      { appId: 'dtbfj1', source: 'calls', noteText: 'No answer', createdAt: '2026-11-01T10:00:00' },
      { appId: 'DTBFJ1', source: 'daily_deals', noteText: 'Asked for a cobuyer', createdAt: '2026-11-02T11:00:00' },
    ]);
    expect(rows).toEqual([
      { appId: 'DTBFJ1', source: 'daily_deals', noteText: 'Asked for a cobuyer', createdAt: '2026-11-02T11:00:00' },
    ]);
  });

  it('leaves notes with no app id on their own rows', () => {
    const rows = latestNotePerApplication([
      { appId: '', noteText: 'First', createdAt: '2026-11-02T12:00:00' },
      { appId: '  ', noteText: 'Second', createdAt: '2026-11-02T13:00:00' },
    ]);
    expect(rows.map((row) => row.noteText)).toEqual(['Second', 'First']);
  });
});
