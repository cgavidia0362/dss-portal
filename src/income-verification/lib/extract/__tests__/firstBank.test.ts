import { describe, expect, it } from 'vitest';
import { analyzeIncome } from '../../analysis';
import { applyInclusion } from '../../analysis/overrides';
import { fuseTransactionCandidates } from '../candidates';
import { detectInstitution } from '../detect';
import {
  extractFirstBankControls,
  FIRSTBANK_CHECKING_LABEL,
  FIRSTBANK_SAVINGS_LABEL,
  isFirstBankStatement,
  parseFirstBankLedger,
} from '../firstBank';
import { extractFromTextPages } from '../pipeline';
import { parseBankStatementText } from '../bankStatement';
import { reconcileAgainstControls } from '../reconcile';
import type { NormalizedTransaction } from '../../analysis/types';

const PERIOD = { startDate: '2026-05-28', endDate: '2026-06-25' };

const JUNE_CHECKING_PAGE1 = `
CHECKING ACCOUNT STATEMENT
STATEMENT PERIOD
May 28, 2026 to Jun 25, 2026
015-CUENTA TODO CHECKING
Account Number: 0000009999
Balance Summary Interest Summary
Beginning Balance as of 05/28/2026 $244.12
+ Deposits and Credits (4) 1,430.62
+ Interest Paid 0.00
- Withdrawals and Debits (2) 20.00
Ending Balance as of 06/25/2026 $1,654.74
Transactions
Date Description Credits Debits
06/01 ATM CASH DEPOSIT -EXAMPLE BRANCH
EXAMPLE CITY PR -1111*2222
5.00
06/01 ATM CASH DEPOSIT -EXAMPLE BRANCH
EXAMPLE CITY PR -1111*2222
10.00
06/01 ATH MOVIL -P2P TRANSFER CREDIT
-1111*2222
55.00
06/01 POS CREDIT -EXAMPLE RENTAL
EXAMPLE CITY PR -1111*2222
154.62
06/01 POS DEBIT -EXAMPLE CAFE
EXAMPLE CITY PR -1111*2222
8.55
`;

const JUNE_CHECKING_PAGE2 = `
Page 2
015-CUENTA TODO CHECKING (cont.)
Account Number: 0000009999
Transactions (Continued)
Date Description Credits Debits
06/08 ATH MOVIL -P2P TRANSFER CREDIT
-1111*2222
75.00
06/08 ACH CREDIT -EXAMPLE PAYROLL -ACH PAYMEN
1,296.00
06/08 POS DEBIT -EXAMPLE STORE
11.45
`;

const JUNE_PAGE_SPLIT = `
Page 5
015-CUENTA TODO CHECKING (cont.)
Account Number: 0000009999
Transactions (Continued)
Date Description Credits Debits
06/16 TRANSFER FROM SAVINGS 25.48
06/25 TRANSFER TO SAVINGS 300.00
Daily Balance
Date Balance
05/27 244.12
06/25 851.00
015-CUENTA TODO SAVINGS
Account Number: 0000009999
Beginning Balance as of 05/28/2026 $0.03
+ Deposits and Credits (3) 1,125.45
+ Interest Paid 0.01
- Withdrawals and Debits (1) 25.48
Ending Balance as of 06/25/2026 $1,100.01
Transactions
Date Description Credits Debits
06/15 TRANSFER FROM CHECKING 25.45
06/23 ATM CASH DEPOSIT -EXAMPLE BRANCH
800.00
06/25 TRANSFER FROM CHECKING 300.00
06/25 INTEREST PAID 0.01
06/16 TRANSFER TO CHECKING 25.48
Daily Balance
Date Balance
05/27 0.03
06/25 1,100.01
`;

const JULY_TRANSFERS = `
CHECKING ACCOUNT STATEMENT
STATEMENT PERIOD
Jun 26, 2026 to Jul 28, 2026
015-CUENTA TODO CHECKING
Account Number: 0000009999
Beginning Balance as of 06/26/2026 $851.00
+ Deposits and Credits (15) 2,813.75
+ Interest Paid 0.00
- Withdrawals and Debits (0) 0.00
Ending Balance as of 07/28/2026 $3,664.75
Transactions
Date Description Credits Debits
06/29 TRANSFER FROM SAVINGS 75.00
06/29 TRANSFER FROM SAVINGS 125.00
07/10 ATH MOVIL -P2P TRANSFER CREDIT
-1111*2222 0245193
13.75
07/10 TRANSFER FROM SAVINGS 150.00
07/10 TRANSFER FROM SAVINGS 500.00
07/13 POS CREDIT -EXAMPLE RENTAL
EXAMPLE CITY PR -1111*2222 0090180
200.00
07/16 TRANSFER FROM SAVINGS 50.00
07/16 TRANSFER FROM SAVINGS 50.00
07/20 TRANSFER FROM SAVINGS 100.00
07/20 TRANSFER FROM SAVINGS 100.00
07/20 TRANSFER FROM SAVINGS 400.00
07/20 TRANSFER FROM SAVINGS 400.00
07/21 TRANSFER FROM SAVINGS 300.00
07/27 ATM TRANSFER TO CHECKING FROM SAVINGS
-EXAMPLE BRANCH -1111*2222 0006937
200.00
07/27 TRANSFER FROM SAVINGS 150.00
Daily Balance
Date Balance
07/28 3,039.75
015-CUENTA TODO SAVINGS
Account Number: 0000009999
Beginning Balance as of 06/26/2026 $1,100.01
+ Deposits and Credits (2) 1,200.00
+ Interest Paid 0.10
- Withdrawals and Debits (1) 200.00
Ending Balance as of 07/28/2026 $2,100.11
Transactions
Date Description Credits Debits
07/15 TRANSFER FROM CHECKING 1,000.00
07/15 TRANSFER FROM CHECKING 200.00
07/27 ATM TRANSFER FROM SAVINGS TO CHECKING
-EXAMPLE BRANCH -1111*2222 0006937
200.00
07/28 INTEREST PAID 0.10
Daily Balance
Date Balance
07/28 2,100.11
`;

const COVERAGE_MAY_JUNE = `
CHECKING ACCOUNT STATEMENT
STATEMENT PERIOD
May 28, 2026 to Jun 25, 2026
015-CUENTA TODO CHECKING
Account Number: 0000009999
Beginning Balance as of 05/28/2026 $0.00
+ Deposits and Credits (1) 10.00
+ Interest Paid 0.00
- Withdrawals and Debits (0) 0.00
Ending Balance as of 06/25/2026 $10.00
Transactions
Date Description Credits Debits
06/01 ATM CASH DEPOSIT 10.00
015-CUENTA TODO SAVINGS
Account Number: 0000009999
Beginning Balance as of 05/28/2026 $0.00
+ Deposits and Credits (0) 0.00
+ Interest Paid 0.00
- Withdrawals and Debits (0) 0.00
Ending Balance as of 06/25/2026 $0.00
`;

const AUGUST_SAVINGS_INTEREST = `
CHECKING ACCOUNT STATEMENT
STATEMENT PERIOD
Jul 29, 2026 to Aug 26, 2026
015-CUENTA TODO CHECKING
Account Number: 0000009999
Beginning Balance as of 07/29/2026 $340.37
+ Deposits and Credits (2) 75.00
+ Interest Paid 0.00
- Withdrawals and Debits (0) 0.00
Ending Balance as of 08/26/2026 $415.37
Transactions
Date Description Credits Debits
08/03 TRANSFER FROM SAVINGS 25.00
08/03 TRANSFER FROM SAVINGS 50.00
Daily Balance
Date Balance
08/26 415.37
015-CUENTA TODO SAVINGS
Account Number: 0000009999
Beginning Balance as of 07/29/2026 $500.11
+ Deposits and Credits (0) 0.00
+ Interest Paid 0.01
- Withdrawals and Debits (0) 0.00
Ending Balance as of 08/26/2026 $500.12
Transactions
Date Description Credits Debits
08/26 INTEREST PAID 0.01
Daily Balance
Date Balance
08/26 500.12
`;

function credits(txs: NormalizedTransaction[], label?: string) {
  return txs.filter(
    (tx) =>
      tx.direction === 'in' &&
      (!label || tx.sourceAccountLabel === label)
  );
}

function sum(txs: NormalizedTransaction[]) {
  return Math.round(txs.reduce((s, tx) => s + tx.amount, 0) * 100) / 100;
}

function incomingKey(tx: NormalizedTransaction) {
  return [
    tx.sourceDocument,
    tx.sourceAccountLabel,
    tx.date,
    tx.amount,
    tx.sourceRowIndex,
    tx.direction,
  ].join(':');
}

describe('FirstBank section identity and ledger', () => {
  it('detects FirstBank and keeps checking/savings distinct with the same last4', () => {
    const text = JUNE_CHECKING_PAGE1 + JUNE_PAGE_SPLIT;
    expect(isFirstBankStatement(text)).toBe(true);
    expect(detectInstitution('stmt.pdf', text)).toBe('first_bank');
    const controls = extractFirstBankControls(text);
    expect(controls).toHaveLength(2);
    expect(controls.map((c) => c.accountLabel)).toEqual([
      FIRSTBANK_CHECKING_LABEL,
      FIRSTBANK_SAVINGS_LABEL,
    ]);
    expect(new Set(controls.map((c) => c.accountLast4))).toEqual(new Set(['9999']));
    expect(controls[0]?.creditTotal).toBe(1430.62);
    expect(controls[1]?.creditTotal).toBe(1125.46);
    expect(controls[1]?.creditCount).toBe(4);
  });

  it('recovers wrapped credits and does not turn daily balances into deposits', () => {
    const pages = [
      { pageNumber: 1, text: JUNE_CHECKING_PAGE1 },
      { pageNumber: 2, text: JUNE_CHECKING_PAGE2 },
      { pageNumber: 5, text: JUNE_PAGE_SPLIT },
    ];
    const txs = parseFirstBankLedger(
      pages.map((p) => p.text).join('\n'),
      'june.pdf',
      PERIOD,
      '9999',
      pages
    );
    const checkingIn = credits(txs, FIRSTBANK_CHECKING_LABEL);
    expect(checkingIn.some((tx) => tx.amount === 75 && tx.date === '2026-06-08')).toBe(true);
    expect(checkingIn.some((tx) => tx.amount === 1296 && tx.date === '2026-06-08')).toBe(true);
    expect(txs.some((tx) => tx.direction === 'out' && tx.amount === 8.55)).toBe(true);
    expect(txs.filter((tx) => tx.amount === 244.12 || tx.amount === 851)).toHaveLength(0);
    expect(checkingIn.every((tx) => tx.postedDate === tx.date)).toBe(true);
  });

  it('keeps identical-looking source rows and opposing transfer legs', () => {
    const txs = parseFirstBankLedger(JULY_TRANSFERS, 'july.pdf', {
      startDate: '2026-06-26',
      endDate: '2026-07-28',
    }, '9999');
    const checkingIn = credits(txs, FIRSTBANK_CHECKING_LABEL);
    expect(checkingIn.filter((tx) => tx.date === '2026-07-16' && tx.amount === 50)).toHaveLength(2);
    expect(checkingIn.filter((tx) => tx.date === '2026-07-20' && tx.amount === 100)).toHaveLength(2);
    expect(checkingIn.filter((tx) => tx.date === '2026-07-20' && tx.amount === 400)).toHaveLength(2);
    expect(checkingIn.filter((tx) => tx.date === '2026-07-10' && tx.amount === 13.75)).toHaveLength(1);
    expect(checkingIn.filter((tx) => tx.date === '2026-07-13' && tx.amount === 200)).toHaveLength(1);
    const atmCredit = checkingIn.find((tx) => tx.amount === 200 && /ATM TRANSFER/i.test(tx.description));
    const atmDebit = txs.find(
      (tx) =>
        tx.direction === 'out' &&
        tx.amount === 200 &&
        tx.sourceAccountLabel === FIRSTBANK_SAVINGS_LABEL
    );
    expect(atmCredit?.direction).toBe('in');
    expect(atmDebit?.direction).toBe('out');
    expect(atmCredit?.sourceAccountLabel).not.toBe(atmDebit?.sourceAccountLabel);
    expect(credits(txs, FIRSTBANK_SAVINGS_LABEL).some((tx) => tx.amount === 1000)).toBe(true);
  });

  it('treats August savings zero deposits plus interest as valid incoming', () => {
    const txs = parseFirstBankLedger(AUGUST_SAVINGS_INTEREST, 'aug.pdf', {
      startDate: '2026-07-29',
      endDate: '2026-08-26',
    }, '9999');
    const savingsIn = credits(txs, FIRSTBANK_SAVINGS_LABEL);
    expect(savingsIn).toHaveLength(1);
    expect(savingsIn[0]?.amount).toBe(0.01);
    expect(credits(txs, FIRSTBANK_CHECKING_LABEL).filter((tx) => tx.date === '2026-08-03')).toHaveLength(2);
    const controls = extractFirstBankControls(AUGUST_SAVINGS_INTEREST);
    const savings = controls.find((c) => c.accountLabel === FIRSTBANK_SAVINGS_LABEL);
    expect(savings?.creditTotal).toBe(0.01);
    expect(savings?.creditCount).toBe(1);
  });
});

describe('FirstBank fusion and reconciliation', () => {
  it('does not collapse distinct same-day transfers from the same extractor', () => {
    const parsed = parseFirstBankLedger(JULY_TRANSFERS, 'july.pdf', {
      startDate: '2026-06-26',
      endDate: '2026-07-28',
    }, '9999').map((tx) => ({
      ...tx,
      extractionProvenance: 'deterministic' as const,
      extractionProvenanceSources: ['deterministic' as const],
    }));
    const fused = fuseTransactionCandidates({ deterministic: parsed });
    const checkingIn = credits(fused.transactions, FIRSTBANK_CHECKING_LABEL);
    expect(checkingIn.filter((tx) => tx.date === '2026-07-16' && tx.amount === 50)).toHaveLength(2);
    expect(checkingIn.filter((tx) => tx.date === '2026-07-20' && tx.amount === 400)).toHaveLength(2);
  });

  it('fails account-section reconciliation when section errors offset in the grand total', () => {
    const txs = [
      {
        direction: 'in' as const,
        amount: 100,
        sourceAccount: '9999',
        sourceAccountLabel: FIRSTBANK_CHECKING_LABEL,
      },
      {
        direction: 'in' as const,
        amount: 50,
        sourceAccount: '9999',
        sourceAccountLabel: FIRSTBANK_SAVINGS_LABEL,
      },
    ];
    const result = reconcileAgainstControls(txs, [
      {
        creditTotal: 101,
        creditCount: 1,
        debitTotal: null,
        beginningBalance: null,
        endingBalance: null,
        accountLast4: '9999',
        accountLabel: FIRSTBANK_CHECKING_LABEL,
      },
      {
        creditTotal: 49,
        creditCount: 1,
        debitTotal: null,
        beginningBalance: null,
        endingBalance: null,
        accountLast4: '9999',
        accountLabel: FIRSTBANK_SAVINGS_LABEL,
      },
    ]);
    expect(result.extractedCreditTotal).toBe(150);
    expect(result.expectedCreditTotal).toBe(150);
    expect(result.creditStatus).toBe('mismatch');
  });

  it('leaves raw section reconciliation unchanged after a manual exclusion', () => {
    const parsed = parseBankStatementText(AUGUST_SAVINGS_INTEREST, 'aug.pdf');
    const before = credits(parsed.transactions);
    const analysis = analyzeIncome(parsed.transactions);
    const excluded = applyInclusion(analysis, analysis.transactions[0]!.id, false, 'test');
    expect(sum(before)).toBe(75.01);
    expect(excluded.transactions.find((tx) => tx.id === analysis.transactions[0]!.id)?.included).toBe(false);
    expect(sum(parsed.transactions.filter((tx) => tx.direction === 'in'))).toBe(75.01);
  });
});

describe('FirstBank hybrid extract path', () => {
  it('reconciles labeled sections without vision and keeps batch order stable', async () => {
    const pages = [AUGUST_SAVINGS_INTEREST];
    const first = await extractFromTextPages({
      fileName: 'aug-a.pdf',
      pages,
      deps: { vision: async () => { throw new Error('vision should not run'); } },
    });
    const second = await extractFromTextPages({
      fileName: 'aug-b.pdf',
      pages,
      deps: { vision: async () => { throw new Error('vision should not run'); } },
    });
    expect(first.segments?.[0]?.trustState).toBe('verified');
    expect(credits(first.transactions)).toHaveLength(credits(second.transactions).length);
    expect(sum(credits(first.transactions))).toBe(sum(credits(second.transactions)));
    expect(first.segments?.[0]?.reconciliation.creditStatus).toBe('verified');
  });

  it('produces the same canonical incoming totals for one file and a repeated batch file', async () => {
    const pages = [JULY_TRANSFERS];
    const single = await extractFromTextPages({ fileName: 'july.pdf', pages });
    const again = await extractFromTextPages({ fileName: 'july.pdf', pages });
    expect(sum(credits(single.transactions))).toBe(sum(credits(again.transactions)));
    expect(credits(single.transactions).map((tx) => `${tx.date}:${tx.amount}:${tx.sourceAccountLabel}`).sort()).toEqual(
      credits(again.transactions).map((tx) => `${tx.date}:${tx.amount}:${tx.sourceAccountLabel}`).sort()
    );
  });

  it('keeps canonical rows stable when upload order changes', async () => {
    const noVision = { vision: async () => { throw new Error('vision should not run'); } };
    const july = await extractFromTextPages({
      fileName: 'july.pdf',
      pages: [JULY_TRANSFERS],
      deps: noVision,
    });
    const august = await extractFromTextPages({
      fileName: 'aug.pdf',
      pages: [AUGUST_SAVINGS_INTEREST],
      deps: noVision,
    });
    const forward = [...credits(july.transactions), ...credits(august.transactions)]
      .map(incomingKey)
      .sort();
    const reverse = [...credits(august.transactions), ...credits(july.transactions)]
      .map(incomingKey)
      .sort();
    expect(forward).toEqual(reverse);
    expect(sum(credits(july.transactions))).toBe(4013.85);
    expect(sum(credits(august.transactions))).toBe(75.01);
  });

  it('uses the printed statement window for coverage, including a May partial with no deposits', async () => {
    const extracted = await extractFromTextPages({
      fileName: 'june.pdf',
      pages: [COVERAGE_MAY_JUNE],
      deps: { vision: async () => { throw new Error('vision should not run'); } },
    });
    expect(extracted.segments?.[0]?.trustState).toBe('verified');
    expect(extracted.documentPeriods[0]?.startDate).toBe('2026-05-28');
    expect(extracted.documentPeriods[0]?.endDate).toBe('2026-06-25');
    const analysis = analyzeIncome(extracted.transactions, {
      documentPeriods: extracted.documentPeriods,
    });
    const may = analysis.months.find((month) => month.month === '2026-05');
    const june = analysis.months.find((month) => month.month === '2026-06');
    expect(may?.includedTotal).toBe(0);
    expect(may?.completeness).toBe('partial');
    expect(may?.periodStartDate).toBe('2026-05-28');
    expect(may?.periodEndDate).toBe('2026-05-31');
    expect(june?.completeness).toBe('partial');
    expect(june?.includedTotal).toBe(10);
    expect(analysis.totals.trustedAverageAvailable).toBe(true);
    expect(analysis.totals.averageMonthlyIncluded).toBe(5);
  });

  it('does not treat an unlabeled FirstBank amount as trusted incoming', async () => {
    const pages = [
      `
CHECKING ACCOUNT STATEMENT
STATEMENT PERIOD
May 28, 2026 to Jun 25, 2026
015-CUENTA TODO CHECKING
Account Number: 0000009999
Beginning Balance as of 05/28/2026 $0.00
+ Deposits and Credits (1) 100.00
+ Interest Paid 0.00
- Withdrawals and Debits (0) 0.00
Ending Balance as of 06/25/2026 $100.00
Transactions
Date Description Credits Debits
06/01 EXAMPLE MERCHANT DOWNTOWN
100.00
`,
    ];
    const parsed = parseFirstBankLedger(pages[0]!, 'ambig.pdf', PERIOD, '9999');
    expect(credits(parsed)).toHaveLength(0);
    const extracted = await extractFromTextPages({
      fileName: 'ambig.pdf',
      pages,
    });
    expect(credits(extracted.transactions)).toHaveLength(0);
    expect(extracted.segments?.[0]?.trustState).toBe('mismatch');
    expect(extracted.segments?.[0]?.reconciliation.creditStatus).toBe('mismatch');
    expect(extracted.segments?.[0]?.reconciliation.status).toBe('mismatch');
  });
});
