import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzeIncome } from '../../analysis';
import { extractPdfPages } from '../pdf';
import { extractFromTextPages } from '../pipeline';
import {
  FIRSTBANK_CHECKING_LABEL,
  FIRSTBANK_SAVINGS_LABEL,
  isFirstBankStatement,
} from '../firstBank';
import type { NormalizedTransaction } from '../../analysis/types';

const LIVE_DIR = process.env.FIRSTBANK_LIVE_PDF_DIR;

function credits(txs: NormalizedTransaction[], label?: string) {
  return txs.filter(
    (tx) => tx.direction === 'in' && (!label || tx.sourceAccountLabel === label)
  );
}

function debits(txs: NormalizedTransaction[], label?: string) {
  return txs.filter(
    (tx) => tx.direction === 'out' && (!label || tx.sourceAccountLabel === label)
  );
}

function sum(txs: NormalizedTransaction[]) {
  return Math.round(txs.reduce((s, tx) => s + tx.amount, 0) * 100) / 100;
}

const EXPECTED = {
  '2026-05-28:2026-06-25': {
    checkingInCount: 16,
    checkingIn: 5866.73,
    savingsInCount: 4,
    savingsIn: 1125.46,
    checkingOutCount: 76,
    checkingOut: 5259.85,
    savingsOutCount: 1,
    savingsOut: 25.48,
    incomingCount: 20,
    incoming: 6992.19,
  },
  '2026-06-26:2026-07-28': {
    checkingInCount: 27,
    checkingIn: 9780.27,
    savingsInCount: 6,
    savingsIn: 3650.1,
    checkingOutCount: 131,
    checkingOut: 10290.9,
    savingsOutCount: 21,
    savingsOut: 4250,
    incomingCount: 33,
    incoming: 13430.37,
  },
  '2026-07-29:2026-08-26': {
    checkingInCount: 10,
    checkingIn: 1053,
    savingsInCount: 1,
    savingsIn: 0.01,
    checkingOutCount: 45,
    checkingOut: 1350.86,
    savingsOutCount: 6,
    savingsOut: 500,
    incomingCount: 11,
    incoming: 1053.01,
  },
} as const;

describe('FirstBank live PDF reconciliation', () => {
  it.skipIf(!LIVE_DIR || !existsSync(LIVE_DIR))(
    'reconciles each account section and calendar months from local PDFs',
    async () => {
      const pdfs = readdirSync(LIVE_DIR!)
        .filter((name) => name.toLowerCase().endsWith('.pdf'))
        .map((name) => join(LIVE_DIR!, name));
      expect(pdfs.length).toBeGreaterThanOrEqual(3);

      const allTx: NormalizedTransaction[] = [];
      const periods = [];
      const seenPeriods = new Set<string>();

      for (const path of pdfs) {
        const bytes = new Uint8Array(readFileSync(path));
        const pdf = await extractPdfPages(bytes);
        if (!isFirstBankStatement(pdf.text)) continue;
        const result = await extractFromTextPages({
          fileName: path.split(/[/\\]/).pop() || 'statement.pdf',
          pages: pdf.pages,
          pdfBytes: bytes,
          deps: { vision: async () => { throw new Error('vision should not run'); } },
        });
        expect(result.segments?.every((segment) => segment.trustState === 'verified')).toBe(true);
        const period = result.documentPeriods[0];
        const key = `${period?.startDate}:${period?.endDate}`;
        const expected = EXPECTED[key as keyof typeof EXPECTED];
        expect(expected, `unexpected statement period ${key}`).toBeTruthy();
        expect(seenPeriods.has(key)).toBe(false);
        seenPeriods.add(key);

        const checkingIn = credits(result.transactions, FIRSTBANK_CHECKING_LABEL);
        const savingsIn = credits(result.transactions, FIRSTBANK_SAVINGS_LABEL);
        const checkingOut = debits(result.transactions, FIRSTBANK_CHECKING_LABEL);
        const savingsOut = debits(result.transactions, FIRSTBANK_SAVINGS_LABEL);
        expect(checkingIn).toHaveLength(expected.checkingInCount);
        expect(sum(checkingIn)).toBe(expected.checkingIn);
        expect(savingsIn).toHaveLength(expected.savingsInCount);
        expect(sum(savingsIn)).toBe(expected.savingsIn);
        expect(checkingOut).toHaveLength(expected.checkingOutCount);
        expect(sum(checkingOut)).toBe(expected.checkingOut);
        expect(savingsOut).toHaveLength(expected.savingsOutCount);
        expect(sum(savingsOut)).toBe(expected.savingsOut);
        expect(credits(result.transactions)).toHaveLength(expected.incomingCount);
        expect(sum(credits(result.transactions))).toBe(expected.incoming);

        allTx.push(...result.transactions);
        periods.push(...result.documentPeriods);
      }

      expect(seenPeriods.size).toBe(3);
      expect(credits(allTx)).toHaveLength(64);
      expect(sum(credits(allTx))).toBe(21475.57);

      const analysis = analyzeIncome(allTx, { documentPeriods: periods });
      const byMonth = Object.fromEntries(
        analysis.months.map((month) => [
          month.month,
          {
            included: month.includedTotal,
            completeness: month.completeness,
            start: month.periodStartDate,
            end: month.periodEndDate,
          },
        ])
      );
      expect(byMonth['2026-05']).toMatchObject({
        included: 0,
        completeness: 'partial',
        start: '2026-05-28',
        end: '2026-05-31',
      });
      expect(byMonth['2026-06']).toMatchObject({
        included: 7192.19,
        completeness: 'complete',
      });
      expect(byMonth['2026-07']).toMatchObject({
        included: 13580.37,
        completeness: 'complete',
      });
      expect(byMonth['2026-08']).toMatchObject({
        included: 703.01,
        completeness: 'partial',
        start: '2026-08-01',
        end: '2026-08-26',
      });
      expect(analysis.totals.averageMonthlyIncluded).toBe(5368.89);
      expect(analysis.totals.completeMonthsAnalyzed).toBe(2);
      expect(analysis.totals.trustedAverageAvailable).toBe(true);
      expect(analysis.extractionTrust).toBe('verified');
    },
    60_000
  );
});
