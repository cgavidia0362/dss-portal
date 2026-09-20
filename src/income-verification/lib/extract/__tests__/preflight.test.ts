import { describe, expect, it } from 'vitest';
import { buildPreflight } from '../preflight';

const CHASE_MAY = `
JPMorgan Chase Bank, N.A.
May 23, 2026 through June 23, 2026
Chase Total Checking 000002907827999
Page 1 of 4
Deposits and Additions 1,000.00
`;

const CHASE_JUNE = `
JPMorgan Chase Bank, N.A.
June 24, 2026 through July 22, 2026
Chase Total Checking 000002907827999
Page 1 of 4
Deposits and Additions 2,000.00
`;

const CHASE_JULY = `
JPMorgan Chase Bank, N.A.
July 23, 2026 through August 24, 2026
Chase Total Checking 000002907827999
Chase Savings 000005070665888
Page 1 of 6
Deposits and Additions 3,000.00
`;

const EMPTY_PAGE = '\n\n   \n';

describe('document preflight', () => {
  it('classifies image-only pages when extracted text is unusable', () => {
    const preflight = buildPreflight({
      fileName: 'turbopass-scan.pdf',
      pages: [EMPTY_PAGE, EMPTY_PAGE],
    });
    expect(preflight.imageOnly).toBe(true);
    expect(preflight.pages.every((page) => page.imageOnly)).toBe(true);
    expect(preflight.knownParser).toBe(false);
  });

  it('segments concatenated Chase statements before extraction', () => {
    const preflight = buildPreflight({
      fileName: 'chase-multi.pdf',
      pages: [CHASE_MAY, 'continuation page of May statement', CHASE_JUNE, CHASE_JULY],
    });
    expect(preflight.statementPeriods).toHaveLength(3);
    expect(preflight.segments).toHaveLength(3);
    expect(preflight.segments.map((segment) => segment.period)).toEqual([
      { startDate: '2026-05-23', endDate: '2026-06-23' },
      { startDate: '2026-06-24', endDate: '2026-07-22' },
      { startDate: '2026-07-23', endDate: '2026-08-24' },
    ]);
    expect(preflight.segments[0]?.pageNumbers).toEqual([1, 2]);
    expect(preflight.institution).toBe('chase');
    expect(preflight.knownParser).toBe(true);
  });

  it('records multiple accounts on a statement segment', () => {
    const preflight = buildPreflight({
      fileName: 'chase-multi-acct.pdf',
      pages: [CHASE_JULY],
    });
    expect(preflight.accountLast4s.sort()).toEqual(['5888', '7999']);
    expect(preflight.segments[0]?.accounts.length).toBeGreaterThanOrEqual(1);
  });

  it('captures stacked Chase summary deposit totals as segment controls', () => {
    const preflight = buildPreflight({
      fileName: 'chase-stacked.pdf',
      pages: [
        `
JPMorgan Chase Bank, N.A.
May 23, 2026 through June 23, 2026
Page 1 of 4
$340.23
3,773.39
-2,959.26
-1,153.00
$1.36
`,
      ],
    });
    expect(preflight.segments[0]?.controls[0]?.creditTotal).toBe(3773.39);
  });
});
