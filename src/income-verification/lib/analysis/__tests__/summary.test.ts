import { describe, expect, it } from 'vitest';
import { analyzeIncome } from '../index';
import {
  buildCopyableSummary,
  buildSummaryFacts,
  buildUnderwriterSummary,
} from '../summary';
import {
  buildLocationReview,
  detectPhysicalLocation,
  extractHomeState,
  LOCATION_ALERT_MIN_OUT_OF_STATE,
  LOCATION_ALERT_MIN_PHYSICAL,
} from '../location';
import type { NormalizedTransaction } from '../types';

function tx(
  partial: Partial<NormalizedTransaction> &
    Pick<NormalizedTransaction, 'id' | 'date' | 'amount' | 'description'>
): NormalizedTransaction {
  return {
    rawDescription: partial.rawDescription ?? partial.description,
    direction: partial.direction ?? 'in',
    sourceDocument: partial.sourceDocument ?? 'jan.pdf',
    sourceDocumentType: partial.sourceDocumentType ?? 'bank_statement',
    sourceAccount: partial.sourceAccount ?? '1234',
    detectedIncomeSource: partial.detectedIncomeSource ?? null,
    turbopassCategory: partial.turbopassCategory ?? null,
    ...partial,
  };
}

describe('underwriter summary', () => {
  it('reports full-month totals, coverage average, and meaningful categories only', () => {
    const analysis = analyzeIncome(
      [
        tx({
          id: 'jun',
          date: '2026-06-15',
          amount: 5840,
          description: 'ADP PAYROLL ACME',
          sourceDocument: 'q.pdf',
        }),
        tx({
          id: 'jul',
          date: '2026-07-15',
          amount: 6210,
          description: 'ADP PAYROLL ACME',
          sourceDocument: 'q.pdf',
        }),
        tx({
          id: 'aug',
          date: '2026-08-15',
          amount: 5970,
          description: 'ADP PAYROLL ACME',
          sourceDocument: 'q.pdf',
        }),
        tx({
          id: 'p2p',
          date: '2026-07-20',
          amount: 400,
          description: 'Zelle payment from Jamie Example',
          sourceDocument: 'q.pdf',
        }),
      ],
      {
        documentPeriods: [
          {
            documentName: 'q.pdf',
            startDate: '2026-06-01',
            endDate: '2026-08-31',
            source: 'statement_header',
            accountLast4: '1234',
          },
        ],
      }
    );

    expect(analysis.months.every((month) => month.completeness === 'complete')).toBe(true);
    const facts = buildSummaryFacts(analysis);
    expect(facts.fullMonthDeposits.map((item) => item.amount)).toEqual([5840, 6610, 5970]);
    expect(facts.averageMonthlyIncluded).toBe(analysis.totals.averageMonthlyIncluded);
    expect(facts.meaningfulCategories.map((item) => item.category)).toEqual([
      'Payroll',
      'P2P / Transfers',
    ]);

    const summary = buildUnderwriterSummary(analysis);
    expect(summary).toContain('Full-month deposits were');
    expect(summary).toContain('$5,840.00 in June');
    expect(summary).toContain('$6,610.00 in July');
    expect(summary).toContain('$5,970.00 in August');
    expect(summary).toContain(
      `Across the full statement period reviewed, including partial months, deposits averaged ${facts.averageMonthlyIncluded.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} per month.`
    );
    expect(summary).toContain('Payroll');
    expect(summary).toContain('P2P / Transfers');
    expect(summary).not.toContain('Cash Deposits');
    expect(summary).not.toContain('APPROVE');
    expect(summary).not.toContain('DECLINE');
  });

  it('does not describe partial months as full-month deposits', () => {
    const analysis = analyzeIncome(
      [
        tx({
          id: 'partial',
          date: '2026-07-25',
          amount: 2000,
          description: 'ADP PAYROLL ACME',
          sourceDocument: 'partial.pdf',
        }),
      ],
      {
        documentPeriods: [
          {
            documentName: 'partial.pdf',
            startDate: '2026-07-21',
            endDate: '2026-08-20',
            source: 'statement_header',
            accountLast4: '9999',
          },
        ],
      }
    );

    expect(analysis.months.every((month) => month.completeness === 'partial')).toBe(true);
    const facts = buildSummaryFacts(analysis);
    expect(facts.fullMonthDeposits).toEqual([]);
    const summary = buildUnderwriterSummary(analysis);
    expect(summary).toContain('No complete calendar months were available');
    expect(summary).toContain('$1,000.00 per month');
    expect(summary).not.toMatch(/Full-month deposits were \$/);
  });

  it('does not present a $0.00 coverage average for incomplete source', () => {
    const analysis = analyzeIncome(
      [
        tx({
          id: 'observed',
          date: '2026-07-27',
          amount: 6533.63,
          description: 'ATM Cash Deposit Example',
          extractionTrustState: 'incomplete_source',
        }),
      ],
      {
        printedDepositControlTotal: 11138.49,
        documentPeriods: [
          {
            documentName: 'chase.pdf',
            startDate: '2026-05-23',
            endDate: '2026-08-24',
            source: 'statement_header',
            accountLast4: '1234',
          },
        ],
      }
    );

    const summary = buildUnderwriterSummary(analysis);
    expect(summary).toContain(
      'A verified monthly average is unavailable because the source statement is incomplete.'
    );
    expect(summary).toContain('Printed statement deposit controls totaled $11,138.49');
    expect(summary).toContain('Extracted deposits from available pages were $6,533.63');
    expect(summary).not.toMatch(/\$0\.00/);
    expect(summary).not.toMatch(/averaged \$0/i);
    expect(summary).not.toMatch(/coverage average including partial months/i);
  });
});

describe('home state extraction', () => {
  it('extracts customer mailing state and ignores bank letterhead', () => {
    const text = `
PNC Bank PO Box 609
Pittsburgh, PA 15230-9738
JANE Q EXAMPLE For 24-hour banking
123 MAIN STREET
SPRINGFIELD IL 62701-0001 PNC Bank Online Banking at pnc.com
For the period 07/21/2026 to 08/20/2026
`;
    expect(extractHomeState(text)).toBe('IL');
  });

  it('returns null when no reliable address is present', () => {
    expect(extractHomeState('Statement Period: 01/01/2026 - 01/31/2026\nDeposits')).toBeNull();
  });
});

describe('physical location detection', () => {
  it('detects clear physical merchant/ATM locations', () => {
    expect(
      detectPhysicalLocation('07/30 63.25 ATM Withdrawal 5208 Broadway Gary In')?.state
    ).toBe('IN');
    expect(
      detectPhysicalLocation('POS Purchase Save A Lot #45 Merrillville In')?.state
    ).toBe('IN');
    expect(
      detectPhysicalLocation('7098 Debit Card Purchase All Star Gary In')?.state
    ).toBe('IN');
  });

  it('ignores online/digital merchant headquarters locations', () => {
    expect(detectPhysicalLocation('Recurring Debit Card Apple.Com/Bill')).toBeNull();
    expect(detectPhysicalLocation('Debit Card Purchase Chime chime.com Ca')).toBeNull();
    expect(detectPhysicalLocation('POS Purchase Google *Gamuro Mountain Vie Ca')).toBeNull();
    expect(detectPhysicalLocation('POS Purchase Uber *One Memb San Francisc Ca')).toBeNull();
    expect(detectPhysicalLocation('POS Purchase Uber * Eats Pe Wilmington De')).toBeNull();
    expect(detectPhysicalLocation('POS Purchase Playstatio Playstation. Ca')).toBeNull();
  });
});

describe('out-of-state review alert', () => {
  const indianaLines = Array.from({ length: LOCATION_ALERT_MIN_OUT_OF_STATE }, (_, index) =>
    `07/${20 + index} 20.00 Debit Card Purchase All Star Gary In`
  );
  const illinoisLines = Array.from({ length: 4 }, (_, index) =>
    `07/${10 + index} 15.00 Debit Card Purchase Local Market Chicago Il`
  );

  it('does not alert for an isolated out-of-state transaction', () => {
    const review = buildLocationReview({
      homeState: 'IL',
      documentTexts: [
        [...illinoisLines, '07/30 63.25 ATM Withdrawal 5208 Broadway Gary In'].join('\n'),
      ],
    });
    expect(review.outOfStateCount).toBe(1);
    expect(review.alert).toBe(false);
    expect(review.alertMessage).toBeNull();
  });

  it('does not alert when home state is unknown', () => {
    const review = buildLocationReview({
      homeState: null,
      documentTexts: [[...indianaLines, ...illinoisLines].join('\n')],
    });
    expect(review.physicalLocationCount).toBeGreaterThanOrEqual(LOCATION_ALERT_MIN_PHYSICAL);
    expect(review.alert).toBe(false);
  });

  it('does not false-alert from digital merchant locations', () => {
    const review = buildLocationReview({
      homeState: 'IL',
      documentTexts: [
        [
          ...illinoisLines,
          '08/03 9.99 POS Purchase Uber *One Memb San Francisc Ca',
          '08/03 5.51 POS Purchase Google *Gamuro Mountain Vie Ca',
          '08/04 9.93 Recurring Debit Card Apple.Com/Bill',
          '08/05 10.00 Debit Card Purchase Chime chime.com Ca',
        ].join('\n'),
      ],
    });
    expect(review.outOfStateCount).toBe(0);
    expect(review.alert).toBe(false);
  });

  it('alerts for repeated/material physical activity outside home state', () => {
    const review = buildLocationReview({
      homeState: 'IL',
      documentTexts: [[...illinoisLines, ...indianaLines].join('\n')],
    });
    expect(review.physicalLocationCount).toBeGreaterThanOrEqual(LOCATION_ALERT_MIN_PHYSICAL);
    expect(review.outOfStateCount).toBeGreaterThanOrEqual(LOCATION_ALERT_MIN_OUT_OF_STATE);
    expect(review.alert).toBe(true);
    expect(review.primaryOutOfStateStates[0]).toBe('IN');
    expect(review.alertMessage).toContain('Illinois');
    expect(review.alertMessage).toContain('Indiana');
    expect(review.alertMessage).toMatch(/Review Alert:/);
    expect(review.alertMessage).not.toMatch(/fraud|suspicious|decline/i);
  });

  it('includes the review alert in copyable summary text only when triggered', () => {
    const analysis = analyzeIncome(
      [tx({ id: 'a', date: '2026-07-15', amount: 1000, description: 'ADP PAYROLL ACME' })],
      {
        documentPeriods: [
          {
            documentName: 'jan.pdf',
            startDate: '2026-07-01',
            endDate: '2026-07-31',
            source: 'statement_header',
            accountLast4: '1',
            homeState: 'IL',
          },
        ],
        documentTexts: [[...illinoisLines, ...indianaLines].join('\n')],
        homeState: 'IL',
      }
    );
    expect(analysis.locationReview.alert).toBe(true);
    const narrative = buildUnderwriterSummary(analysis);
    expect(narrative).not.toContain('Review Alert');
    expect(buildCopyableSummary(analysis, narrative)).toContain('Review Alert');
  });
});
