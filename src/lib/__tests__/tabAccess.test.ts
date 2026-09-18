import { describe, expect, it } from 'vitest';
import {
  canAccessTab,
  getBaseTabsForRole,
  resolveVisibleTabIds,
} from '../tabAccess';

describe('tabAccess', () => {
  it('returns role base tabs for admin and rep', () => {
    expect(getBaseTabsForRole('admin')).toContain('income-verification');
    expect(getBaseTabsForRole('admin')).toContain('vehicle-risk');
    expect(getBaseTabsForRole('admin')).not.toContain('analytics');

    expect(getBaseTabsForRole('rep')).toEqual([
      'calls',
      'analytics',
      'daily-deals',
      'notes',
    ]);
    expect(getBaseTabsForRole('buying_assistant')).toEqual([
      'calls',
      'daily-deals',
      'notes',
    ]);
  });

  it('adds grantable tabs for reps without duplicating role base', () => {
    expect(
      resolveVisibleTabIds('rep', ['income-verification', 'vehicle-risk']),
    ).toEqual([
      'calls',
      'analytics',
      'daily-deals',
      'notes',
      'income-verification',
      'vehicle-risk',
    ]);
  });

  it('ignores unknown tab ids and non-arrays', () => {
    expect(resolveVisibleTabIds('rep', ['upload', 'not-a-tab', 'income-verification'])).toEqual([
      'calls',
      'analytics',
      'daily-deals',
      'notes',
      'income-verification',
    ]);
    expect(resolveVisibleTabIds('rep', null)).toEqual([
      'calls',
      'analytics',
      'daily-deals',
      'notes',
    ]);
  });

  it('does not change admin visibility when grants are present', () => {
    const base = resolveVisibleTabIds('admin', []);
    const withGrants = resolveVisibleTabIds('admin', [
      'income-verification',
      'vehicle-risk',
      'upload',
    ]);
    expect(withGrants).toEqual(base);
  });

  it('canAccessTab honors role and grants', () => {
    expect(canAccessTab('admin', [], 'income-verification')).toBe(true);
    expect(canAccessTab('manager', [], 'vehicle-risk')).toBe(true);
    expect(canAccessTab('rep', [], 'income-verification')).toBe(false);
    expect(canAccessTab('rep', ['income-verification'], 'income-verification')).toBe(true);
    expect(canAccessTab('buying_assistant', ['vehicle-risk'], 'vehicle-risk')).toBe(true);
    expect(canAccessTab('rep', ['vehicle-risk'], 'income-verification')).toBe(false);
  });
});
