import { describe, expect, it } from 'vitest';
import {
  dealerKey,
  distributeDealersToReps,
  groupCallsByDealer,
  uniqueDealerCount,
  type DistributableCall,
} from '../distributeDealers';

const reps = [
  { id: 'r1', name: 'Alex' },
  { id: 'r2', name: 'Blair' },
  { id: 'r3', name: 'Casey' },
];

function call(
  id: string,
  dealer: { cif?: string; name: string },
): DistributableCall {
  return { id, dealerCifNumber: dealer.cif, dealerName: dealer.name };
}

function dealers(n: number, callsPerDealer = 1): DistributableCall[] {
  const list: DistributableCall[] = [];
  for (let i = 0; i < n; i++) {
    const name = `Dealer ${String(i + 1).padStart(2, '0')}`;
    const cif = `CIF${String(i + 1).padStart(3, '0')}`;
    for (let j = 0; j < callsPerDealer; j++) {
      list.push(call(`${i}-${j}`, { cif, name }));
    }
  }
  return list;
}

describe('dealerKey', () => {
  it('prefers CIF over name', () => {
    expect(dealerKey({ dealerCifNumber: ' 123 ', dealerName: 'Acme' })).toBe('cif:123');
  });

  it('falls back to normalized name', () => {
    expect(dealerKey({ dealerName: ' Acme Motors ' })).toBe('name:acme motors');
  });
});

describe('distributeDealersToReps', () => {
  it('splits 10 dealers across 3 reps as 4/3/3', () => {
    const result = distributeDealersToReps(dealers(10), reps);
    expect(result.dealerCount).toBe(10);
    expect(result.shares.map(s => s.dealerCount)).toEqual([4, 3, 3]);
    expect(result.shares.map(s => s.callCount)).toEqual([4, 3, 3]);
  });

  it('keeps every call for a dealer on the same rep', () => {
    const result = distributeDealersToReps(dealers(10, 3), reps);
    expect(result.shares.map(s => s.dealerCount)).toEqual([4, 3, 3]);
    expect(result.shares.map(s => s.callCount)).toEqual([12, 9, 9]);

    const groups = groupCallsByDealer(dealers(10, 3));
    for (const group of groups) {
      const assignees = new Set(
        group.callIds.map(id => result.assignmentByCallId[id]?.repId),
      );
      expect(assignees.size).toBe(1);
    }
  });

  it('gives leftover dealers to reps with fewer dealers', () => {
    const result = distributeDealersToReps(dealers(8), reps);
    expect(result.shares.map(s => s.dealerCount).sort((a, b) => b - a)).toEqual([3, 3, 2]);
    const max = Math.max(...result.shares.map(s => s.dealerCount));
    const min = Math.min(...result.shares.map(s => s.dealerCount));
    expect(max - min).toBeLessThanOrEqual(1);
  });

  it('treats same CIF with different names as one dealer', () => {
    const calls = [
      call('a', { cif: '111', name: 'Acme North' }),
      call('b', { cif: '111', name: 'Acme South' }),
      call('c', { cif: '222', name: 'Beta' }),
    ];
    expect(uniqueDealerCount(calls)).toBe(2);
    const result = distributeDealersToReps(calls, [reps[0], reps[1]]);
    expect(result.assignmentByCallId.a.repId).toBe(result.assignmentByCallId.b.repId);
    expect(result.assignmentByCallId.a.repId).not.toBe(result.assignmentByCallId.c.repId);
  });

  it('treats same name with different CIFs as different dealers', () => {
    const calls = [
      call('a', { cif: '111', name: 'Acme' }),
      call('b', { cif: '222', name: 'Acme' }),
    ];
    expect(uniqueDealerCount(calls)).toBe(2);
  });

  it('assigns every dealer to one rep when only one rep is selected', () => {
    const result = distributeDealersToReps(dealers(7, 2), [reps[0]]);
    expect(result.shares).toHaveLength(1);
    expect(result.shares[0].dealerCount).toBe(7);
    expect(result.shares[0].callCount).toBe(14);
    expect(result.shares[0].repId).toBe('r1');
  });

  it('returns empty shares when there are no reps', () => {
    const result = distributeDealersToReps(dealers(5), []);
    expect(result.shares).toEqual([]);
    expect(result.dealerCount).toBe(0);
    expect(Object.keys(result.assignmentByCallId)).toHaveLength(0);
  });

  it('keeps selected reps with zero dealers when there are no calls', () => {
    const result = distributeDealersToReps([], reps);
    expect(result.dealerCount).toBe(0);
    expect(result.shares.map(s => s.dealerCount)).toEqual([0, 0, 0]);
  });
});
