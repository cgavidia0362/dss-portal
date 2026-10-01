import { describe, expect, it } from 'vitest';
import { functionInvokeErrorMessage } from '../supabaseFunctionError';

describe('functionInvokeErrorMessage', () => {
  it('prefers the function JSON error body', async () => {
    expect(await functionInvokeErrorMessage(
      { message: 'Edge Function returned a non-2xx status code' },
      { error: 'You have no credits remaining.' },
    )).toBe('You have no credits remaining.');
  });

  it('reads the error from a Response context when data is empty', async () => {
    const context = new Response(
      JSON.stringify({ error: 'You have no credits remaining.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
    expect(await functionInvokeErrorMessage(
      { message: 'Edge Function returned a non-2xx status code', context },
      null,
      'Failed to analyze vehicle. Please try again.',
    )).toBe('You have no credits remaining.');
  });

  it('falls back when the body has no useful error', async () => {
    expect(await functionInvokeErrorMessage(
      { message: 'Edge Function returned a non-2xx status code' },
      null,
      'Failed to analyze vehicle. Please try again.',
    )).toBe('Failed to analyze vehicle. Please try again.');
  });
});
