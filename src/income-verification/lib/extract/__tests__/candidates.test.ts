import { describe, expect, it } from 'vitest';
import type { NormalizedTransaction } from '../../analysis/types';
import { fuseTransactionCandidates } from '../candidates';

function tx(
  overrides: Partial<NormalizedTransaction> &
    Pick<NormalizedTransaction, 'description' | 'amount' | 'extractionProvenance'>
): NormalizedTransaction {
  return {
    id: overrides.id ?? `${overrides.description}:${overrides.amount}`,
    date: overrides.date ?? '2026-05-24',
    description: overrides.description,
    rawDescription: overrides.rawDescription ?? overrides.description,
    amount: overrides.amount,
    direction: overrides.direction ?? 'in',
    sourceDocument: 'chase.pdf',
    sourceDocumentType: 'bank_statement',
    sourceAccount: overrides.sourceAccount ?? '7999',
    statementSegmentId: overrides.statementSegmentId ?? 'seg-1',
    extractionProvenance: overrides.extractionProvenance,
    extractionProvenanceSources: overrides.extractionProvenanceSources,
    amountSource: overrides.amountSource,
    referenceId: overrides.referenceId,
    runningBalance: overrides.runningBalance,
    page: overrides.page,
  };
}

describe('candidate fusion', () => {
  it('merges deterministic and Terra candidates without double counting duplicates', () => {
    const fused = fuseTransactionCandidates({
      deterministic: [
        tx({
          description: 'Zelle payment from Avery Example',
          amount: 40,
          extractionProvenance: 'deterministic',
          amountSource: 'explicit',
        }),
      ],
      terra: [
        tx({
          description: 'Zelle payment from Avery Example',
          amount: 40,
          extractionProvenance: 'terra_vision',
          amountSource: 'model',
        }),
        tx({
          description: 'Payroll Example Staffing',
          amount: 200,
          extractionProvenance: 'terra_vision',
          amountSource: 'model',
          date: '2026-05-25',
        }),
      ],
    });
    expect(fused.transactions).toHaveLength(2);
    expect(fused.stats.duplicatesRemoved).toBe(1);
    expect(fused.stats.terraOnlyNew).toBe(1);
    const zelle = fused.transactions.find((item) => /Avery/i.test(item.description));
    expect(zelle?.extractionProvenanceSources).toEqual(['deterministic', 'terra_vision']);
  });

  it('merges Terra and Sol duplicates by reference identity', () => {
    const fused = fuseTransactionCandidates({
      terra: [
        tx({
          description: 'Zelle payment from Avery Example 30161522395',
          amount: 64.23,
          extractionProvenance: 'terra_vision',
          referenceId: '30161522395',
        }),
      ],
      sol: [
        tx({
          description: 'Zelle from Avery Example',
          amount: 64.23,
          extractionProvenance: 'sol_escalation',
          referenceId: '30161522395',
        }),
      ],
    });
    expect(fused.transactions).toHaveLength(1);
    expect(fused.stats.duplicatesRemoved).toBe(1);
    expect(fused.transactions[0]?.extractionProvenanceSources).toEqual([
      'terra_vision',
      'sol_escalation',
    ]);
  });

  it('prefers an explicit amount over a conflicting model amount and flags the row', () => {
    const fused = fuseTransactionCandidates({
      deterministic: [
        tx({
          description: 'Zelle payment from Avery Example',
          amount: 75,
          extractionProvenance: 'deterministic',
          amountSource: 'explicit',
        }),
      ],
      terra: [
        tx({
          description: 'Zelle payment from Avery Example',
          amount: 500,
          extractionProvenance: 'terra_vision',
          amountSource: 'model',
        }),
      ],
    });
    expect(fused.transactions).toHaveLength(1);
    expect(fused.transactions[0]?.amount).toBe(75);
    expect(fused.transactions[0]?.extractionConflict).toBe(true);
    expect(fused.stats.conflicts).toBe(1);
  });

  it('does not add a plug transaction for the control-total difference', () => {
    const fused = fuseTransactionCandidates({
      deterministic: [
        tx({
          description: 'Zelle payment from Avery Example',
          amount: 75,
          extractionProvenance: 'deterministic',
          amountSource: 'explicit',
        }),
      ],
    });
    expect(fused.transactions).toHaveLength(1);
    expect(fused.transactions.reduce((sum, item) => sum + item.amount, 0)).toBe(75);
  });

  it('merges the same physical payroll row from deterministic and Terra descriptions', () => {
    const fused = fuseTransactionCandidates({
      deterministic: [
        tx({
          date: '2026-07-24',
          description: 'Example Staffing Payroll PPD ID: 1000000000',
          amount: 749.44,
          extractionProvenance: 'deterministic',
          amountSource: 'explicit',
          runningBalance: 1800.12,
          page: 2,
        }),
      ],
      terra: [
        tx({
          date: '2026-07-24',
          description: 'EXAMPLE STAFFING DIRECT DEP',
          amount: 749.44,
          extractionProvenance: 'terra_vision',
          amountSource: 'model',
          page: 2,
        }),
      ],
    });
    expect(fused.transactions).toHaveLength(1);
    expect(fused.stats.duplicatesRemoved).toBe(1);
    expect(fused.transactions[0]?.amount).toBe(749.44);
    expect(fused.transactions[0]?.extractionProvenanceSources).toEqual([
      'deterministic',
      'terra_vision',
    ]);
  });

  it('merges remote online deposit with an alternate mobile-deposit description', () => {
    const fused = fuseTransactionCandidates({
      deterministic: [
        tx({
          date: '2026-06-12',
          description: 'Remote Online Deposit 06/12',
          amount: 625.56,
          extractionProvenance: 'deterministic',
          runningBalance: 900,
        }),
      ],
      terra: [
        tx({
          date: '2026-06-12',
          description: 'Mobile Deposit',
          amount: 625.56,
          extractionProvenance: 'terra_vision',
          runningBalance: 900,
        }),
      ],
    });
    expect(fused.transactions).toHaveLength(1);
    expect(fused.transactions[0]?.amount).toBe(625.56);
  });

  it('keeps same-day same-amount deposits distinct when row identity differs', () => {
    const fused = fuseTransactionCandidates({
      deterministic: [
        tx({
          date: '2026-07-27',
          description: 'Zelle payment from Avery Example',
          amount: 50,
          extractionProvenance: 'deterministic',
          runningBalance: 200,
          referenceId: '30111111111',
        }),
        tx({
          date: '2026-07-27',
          description: 'Zelle payment from Blake Sample',
          amount: 50,
          extractionProvenance: 'deterministic',
          runningBalance: 250,
          referenceId: '30222222222',
        }),
      ],
    });
    expect(fused.transactions).toHaveLength(2);
  });

  it('does not merge a generic deposit with a different same-day same-amount credit', () => {
    const fused = fuseTransactionCandidates({
      deterministic: [
        tx({
          date: '2026-06-12',
          description: 'Remote Online Deposit 06/12',
          amount: 625.56,
          extractionProvenance: 'deterministic',
        }),
        tx({
          date: '2026-06-12',
          description: 'Zelle payment from Avery Example',
          amount: 625.56,
          extractionProvenance: 'deterministic',
        }),
      ],
    });
    expect(fused.transactions).toHaveLength(2);
  });

  it('keeps same-day similar payroll-style credits distinct when amounts differ', () => {
    const fused = fuseTransactionCandidates({
      deterministic: [
        tx({
          date: '2026-08-03',
          description: 'Payment Received 08/01 Payactiv San Jose CA Card 6915 1,188.16',
          amount: 90,
          extractionProvenance: 'deterministic',
        }),
        tx({
          date: '2026-08-03',
          description: 'Payment Received 08/03 Payactiv San Jose CA Card 6915 1,273.16',
          amount: 85,
          extractionProvenance: 'deterministic',
        }),
        tx({
          date: '2026-08-03',
          description: 'Payment Received 08/03 Payactiv San Jose CA Card 6915 1,279.16',
          amount: 6,
          extractionProvenance: 'deterministic',
        }),
      ],
    });
    expect(fused.transactions).toHaveLength(3);
    expect(fused.transactions.map((item) => item.amount).sort((a, b) => a - b)).toEqual([6, 85, 90]);
  });

  it('does not merge distinct payroll rows that share a misleading numeric token', () => {
    const fused = fuseTransactionCandidates({
      terra: [
        tx({
          date: '2026-05-01',
          description: 'IncomePayroll ACME 12345678901',
          amount: 1200,
          extractionProvenance: 'terra_vision',
          referenceId: '12345678901',
        }),
        tx({
          date: '2026-05-15',
          description: 'IncomePayroll ACME 12345678901',
          amount: 1250,
          extractionProvenance: 'terra_vision',
          referenceId: '12345678901',
        }),
      ],
    });
    expect(fused.transactions).toHaveLength(2);
  });
});

describe('posted-date vs embedded-transaction-date identity', () => {
  it('merges one Chase ATM cash deposit represented with posting and embedded transaction dates', () => {
    const fused = fuseTransactionCandidates({
      deterministic: [
        tx({
          id: 'atm-posted',
          date: '2026-07-27',
          postedDate: '2026-07-27',
          transactionDate: '2026-07-25',
          description: 'ATM cash deposit 1000 Example St Example City IL card 4048',
          amount: 260,
          extractionProvenance: 'deterministic',
          amountSource: 'explicit',
          runningBalance: 317.76,
          page: 4,
        }),
      ],
      terra: [
        tx({
          id: 'atm-embedded',
          date: '2026-07-25',
          postedDate: null,
          transactionDate: '2026-07-25',
          description: 'ATM Cash Deposit 07/25 1000 Example St Example City IL Card 4048',
          amount: 260,
          extractionProvenance: 'terra_vision',
          amountSource: 'model',
          page: 4,
        }),
      ],
    });
    expect(fused.transactions).toHaveLength(1);
    expect(fused.stats.duplicatesRemoved).toBe(1);
    const atm = fused.transactions[0];
    expect(atm?.amount).toBe(260);
    expect(atm?.date).toBe('2026-07-27');
    expect(atm?.postedDate).toBe('2026-07-27');
    expect(atm?.transactionDate).toBe('2026-07-25');
    expect(atm?.extractionProvenanceSources).toEqual(['deterministic', 'terra_vision']);
  });

  it('keeps legitimate nearby same-amount transactions separate without matching row identity', () => {
    const fused = fuseTransactionCandidates({
      deterministic: [
        tx({
          id: 'atm-example',
          date: '2026-07-27',
          description: 'ATM Cash Deposit 07/25 1000 Example St Example City IL Card 4048',
          amount: 260,
          extractionProvenance: 'deterministic',
          runningBalance: 317.76,
          page: 4,
        }),
        tx({
          id: 'zelle-camilo',
          date: '2026-07-25',
          description: 'Zelle payment from Camilo Example 30161522999',
          amount: 260,
          extractionProvenance: 'deterministic',
          runningBalance: 416.76,
          page: 4,
          referenceId: '30161522999',
        }),
      ],
      terra: [
        tx({
          id: 'atm-aurora',
          date: '2026-07-25',
          description: 'ATM Cash Deposit 200 Other Rd Other Town IL Card 8821',
          amount: 260,
          extractionProvenance: 'terra_vision',
          runningBalance: 900.12,
          page: 6,
        }),
      ],
    });
    expect(fused.transactions).toHaveLength(3);
    expect(fused.transactions.filter((item) => item.amount === 260)).toHaveLength(3);
  });

  it('does not merge two same-extractor nearby ATM deposits of the same amount', () => {
    const fused = fuseTransactionCandidates({
      deterministic: [
        tx({
          id: 'atm-one',
          date: '2026-07-25',
          description: 'ATM Cash Deposit 07/25 1000 Example St Example City IL Card 4048',
          amount: 145.01,
          extractionProvenance: 'deterministic',
          page: 4,
        }),
        tx({
          id: 'atm-two',
          date: '2026-07-27',
          description: 'ATM Cash Deposit 07/27 1000 Example St Example City IL Card 4048',
          amount: 145.01,
          extractionProvenance: 'deterministic',
          page: 4,
        }),
      ],
    });
    expect(fused.transactions).toHaveLength(2);
    expect(fused.transactions.reduce((sum, item) => sum + item.amount, 0)).toBe(290.02);
  });
});
