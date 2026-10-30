import { describe, expect, it } from 'vitest';
import {
  excludeKnownDealersFromLenders,
  isKnownDealerName,
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
