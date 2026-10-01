import { describe, expect, it } from 'vitest';
import { functionInvokeErrorMessage } from '../supabaseFunctionError';

describe('functionInvokeErrorMessage', () => {
  it('prefers the function JSON error body', () => {
    expect(functionInvokeErrorMessage(
      { message: 'Edge Function returned a non-2xx status code' },
      { error: 'OPENAI_API_KEY is not configured' },
    )).toBe('OPENAI_API_KEY is not configured');
  });

  it('falls back when the body has no useful error', () => {
    expect(functionInvokeErrorMessage(
      { message: 'Edge Function returned a non-2xx status code' },
      null,
      'Failed to analyze vehicle. Please try again.',
    )).toBe('Failed to analyze vehicle. Please try again.');
  });
});
