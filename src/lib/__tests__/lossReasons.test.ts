import { describe, expect, it } from 'vitest';
import {
  classifyLossReasons,
  excelFlag,
  groupNotesByLossReason,
  splitTextByAppIds,
} from '../lossReasons';

describe('classifyLossReasons', () => {
  it('flags the spreadsheet fee example', () => {
    expect(classifyLossReasons('$95 Fee with Strike')).toEqual({
      apr: false,
      fees: true,
      stips: false,
      other: false,
      noReason: false,
    });
  });

  it('flags the spreadsheet APR example', () => {
    expect(classifyLossReasons('11% APR at another dealer')).toEqual({
      apr: true,
      fees: false,
      stips: false,
      other: false,
      noReason: false,
    });
  });

  it('flags No Reason Listed', () => {
    expect(classifyLossReasons('No Reason Listed')).toEqual({
      apr: false,
      fees: false,
      stips: false,
      other: false,
      noReason: true,
    });
  });

  it('treats empty notes as no reason', () => {
    expect(classifyLossReasons('   ')).toMatchObject({ noReason: true, other: false });
  });

  it('flags stips language', () => {
    expect(classifyLossReasons('Too many extra stips and additional docs')).toMatchObject({
      stips: true,
      noReason: false,
    });
  });

  it('allows APR and fees on the same note', () => {
    expect(classifyLossReasons('Lost on 12% APR and a $150 fee')).toEqual({
      apr: true,
      fees: true,
      stips: false,
      other: false,
      noReason: false,
    });
  });

  it('uses Other when there is a reason that is not APR, fees, or stips', () => {
    expect(classifyLossReasons('Customer went with Westlake for more money')).toEqual({
      apr: false,
      fees: false,
      stips: false,
      other: true,
      noReason: false,
    });
  });
});

describe('groupNotesByLossReason', () => {
  it('counts notes and unique app ids per bucket', () => {
    const buckets = groupNotesByLossReason([
      { appId: 'DTBFJ1', noteText: '11% APR at another dealer' },
      { appId: 'DTBFJ2', noteText: '$95 Fee with Strike' },
      { appId: 'DTBFJ1', noteText: 'No Reason Listed' },
    ]);
    const byKey = Object.fromEntries(buckets.map((b) => [b.key, b]));
    expect(byKey.apr.count).toBe(1);
    expect(byKey.apr.appIds).toEqual(['DTBFJ1']);
    expect(byKey.fees.count).toBe(1);
    expect(byKey.noReason.count).toBe(1);
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

describe('excelFlag', () => {
  it('writes 1 or blank like the spreadsheet', () => {
    expect(excelFlag(true)).toBe(1);
    expect(excelFlag(false)).toBe('');
  });
});
