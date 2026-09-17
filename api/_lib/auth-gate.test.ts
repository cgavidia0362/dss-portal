import { describe, expect, it } from 'vitest';
import { handleBlobStatus } from '../../src/income-verification/server/blobStatus';
import { handleBlobDiscard } from '../../src/income-verification/server/blobDiscard';
import { handleAnalyzeIncome } from '../../src/income-verification/server/analyzeIncome';
import { handleBlobUpload } from '../../src/income-verification/server/blobUpload';

describe('income verification API auth gate', () => {
  it('rejects blob status without Authorization', async () => {
    const response = await handleBlobStatus(new Request('http://localhost/api/blob/status'));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: 'Authentication required.' });
  });

  it('rejects analyze without Authorization', async () => {
    const response = await handleAnalyzeIncome(
      new Request('http://localhost/api/analyze-income', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pathnames: [] }),
      }),
    );
    expect(response.status).toBe(401);
  });

  it('rejects blob upload without Authorization', async () => {
    const response = await handleBlobUpload(
      new Request('http://localhost/api/blob/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
    );
    expect(response.status).toBe(401);
  });

  it('rejects blob discard without Authorization', async () => {
    const response = await handleBlobDiscard(
      new Request('http://localhost/api/blob/discard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pathnames: [] }),
      }),
    );
    expect(response.status).toBe(401);
  });
});
