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
});
