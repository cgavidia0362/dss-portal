import { describe, expect, it } from 'vitest';
import { AuthError, json } from '../../src/income-verification/server/auth';

describe('income verification auth helpers', () => {
  it('AuthError defaults to 401', () => {
    const error = new AuthError();
    expect(error.status).toBe(401);
    expect(error.message).toBe('Authentication required.');
  });

  it('json responses are application/json', async () => {
    const response = json({ ok: true }, 201);
    expect(response.status).toBe(201);
    expect(response.headers.get('Content-Type')).toBe('application/json');
    await expect(response.json()).resolves.toEqual({ ok: true });
  });
});
