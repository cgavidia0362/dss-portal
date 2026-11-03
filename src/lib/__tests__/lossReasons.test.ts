import { describe, expect, it } from 'vitest';
import {
  classifyLossReasons,
  countNoStatusApplications,
  ensureOtherBankRow,
  excelFlag,
  isUnnamedSendOut,
  splitTextByAppIds,
} from '../lossReasons';

const blank = {
  apr: false,
  fees: false,
  stips: false,
  noReason: false,
};

describe('classifyLossReasons', () => {
  it('flags a better APR elsewhere', () => {
    expect(classifyLossReasons('11% APR at another dealer')).toEqual({
      ...blank,
      apr: true,
    });
  });

  it('flags a better fee at another lender', () => {
    expect(classifyLossReasons('$95 Fee with Strike')).toEqual({
      ...blank,
      fees: true,
    });
  });

  it('flags too many stips or docs', () => {
    expect(classifyLossReasons('Too many extra stips and additional docs')).toEqual({
      ...blank,
      stips: true,
    });
  });

  it('counts a counter or cutback as Stips', () => {
    expect(classifyLossReasons('Westlake called the full amount, we countered')).toEqual({
      ...blank,
      stips: true,
    });
    expect(classifyLossReasons('They got more money and a higher advance')).toEqual({
      ...blank,
      stips: true,
    });
    expect(classifyLossReasons('We did not approve the full amount, we cut them back')).toEqual({
      ...blank,
      stips: true,
    });
  });

  it('counts a cobuyer or cosigner ask as Stips', () => {
    expect(classifyLossReasons('Need a cobuyer to get this done')).toEqual({
      ...blank,
      stips: true,
    });
    expect(classifyLossReasons('Asked for a co-signer')).toEqual({
      ...blank,
      stips: true,
    });
  });

  it('flags sent elsewhere with no why as No reason', () => {
    expect(classifyLossReasons('Sent it elsewhere')).toEqual({
      ...blank,
      noReason: true,
    });
    expect(classifyLossReasons('Closed it out, no reason listed')).toMatchObject({
      noReason: true,
    });
  });

  it('leaves unmatched operational notes blank', () => {
    expect(classifyLossReasons('No answer')).toEqual(blank);
    expect(classifyLossReasons('Customer not working')).toEqual(blank);
    expect(classifyLossReasons('No down')).toEqual(blank);
    expect(classifyLossReasons('   ')).toEqual(blank);
  });

  it('does not mark No reason when a real KPI is present', () => {
    expect(classifyLossReasons('Sent it elsewhere for a better APR')).toEqual({
      ...blank,
      apr: true,
    });
  });
});

describe('isUnnamedSendOut', () => {
  it('treats unnamed send-outs as Other bank', () => {
    expect(isUnnamedSendOut('Sent it elsewhere')).toBe(true);
    expect(isUnnamedSendOut('Went with Westlake')).toBe(false);
  });
});

describe('ensureOtherBankRow', () => {
  it('adds Other bank and sorts by most notes', () => {
    const rows = ensureOtherBankRow(
      [
        { competitor: 'Westlake', mentionCount: 2, howTheyBeatUs: 'Better APR' },
        { competitor: 'Strike', mentionCount: 5, howTheyBeatUs: 'Lower fee' },
      ],
      [
        { noteText: 'Sent it elsewhere' },
        { noteText: 'Closed it out' },
        { noteText: 'Went with Westlake' },
      ],
    );
    expect(rows.map((r) => r.competitor)).toEqual(['Strike', 'Westlake', 'Other bank']);
    expect(rows[2].mentionCount).toBe(2);
  });
});

describe('splitTextByAppIds', () => {
  it('turns known app ids into clickable parts', () => {
    expect(splitTextByAppIds('See DTBFJ6821943 vs Westlake', ['DTBFJ6821943'])).toEqual([
      { type: 'text', value: 'See ' },
      { type: 'app', value: 'DTBFJ6821943' },
      { type: 'text', value: ' vs Westlake' },
    ]);
  });
});

describe('countNoStatusApplications', () => {
  it('counts Closed, Pending, No Answer, and Follow Up once per application', () => {
    expect(countNoStatusApplications([
      { appId: 'A1', fuStatus: 'Closed' },
      { appId: 'a1', fuStatus: 'Closed' },
      { appId: 'A2', fuStatus: 'Pending' },
      { appId: 'A3', fuStatus: 'No Answer' },
      { appId: 'A4', fuStatus: 'Follow Up' },
      { appId: 'A5', fuStatus: 'No Deal' },
      { appId: 'A6', fuStatus: 'Deal' },
      { appId: 'A7', fuStatus: 'Confirmed Deal' },
      { appId: 'A8', fuStatus: 'Duplicates' },
      { appId: 'A9', fuStatus: 'Closed', statusLast: 'Denial' },
      { appId: 'A10', fuStatus: 'Closed', statusLast: 'Declined - credit' },
      { appId: 'A11', fuStatus: 'Closed', statusLast: 'Cancelled' },
    ])).toBe(5);
  });
});

describe('excelFlag', () => {
  it('writes 1 or blank like the spreadsheet', () => {
    expect(excelFlag(true)).toBe(1);
    expect(excelFlag(false)).toBe('');
  });
});
