import { afterEach, describe, expect, it } from 'vitest';
import { requestVisionExtraction } from '../extractVision';

const originalFetch = globalThis.fetch;
const originalKey = process.env.OPENAI_API_KEY;
const originalVision = process.env.OPENAI_VISION_MODEL;
const originalEscalation = process.env.OPENAI_ESCALATION_MODEL;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalKey == null) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = originalKey;
  if (originalVision == null) delete process.env.OPENAI_VISION_MODEL;
  else process.env.OPENAI_VISION_MODEL = originalVision;
  if (originalEscalation == null) delete process.env.OPENAI_ESCALATION_MODEL;
  else process.env.OPENAI_ESCALATION_MODEL = originalEscalation;
});

const VALID_PAYLOAD = {
  bank: 'Chase',
  documentKind: 'bank_statement',
  usedDepositsTable: false,
  ignoredTransactionHistory: false,
  structureAmbiguous: false,
  depositsTablePages: [],
  pagesNeedingReview: [],
  statements: [
    {
      statementSegmentId: 'stmt-1',
      startDate: '2026-05-23',
      endDate: '2026-06-23',
      accountIdentifier: '9999',
      bank: 'Chase',
      beginningBalance: 10,
      endingBalance: 20,
      depositCreditTotal: 3773.39,
      withdrawalDebitTotal: null,
      pageNumbers: [6, 7, 8, 9],
    },
  ],
  transactions: [
    {
      transactionDate: '2026-05-24',
      postedDate: null,
      description: 'Zelle payment from Avery Example',
      amount: 3773.39,
      direction: 'credit',
      accountIdentifier: '9999',
      statementSegmentId: 'stmt-1',
      sourcePage: 6,
      extractionConfidence: 0.9,
      bankCategory: null,
    },
  ],
};

describe('direct PDF file-input routing', () => {
  it('sends a segment PDF to the Responses API as input_file with high detail', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.OPENAI_VISION_MODEL = 'gpt-5.6-terra';
    let url = '';
    let body: Record<string, unknown> = {};
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      url = String(input);
      body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      return new Response(JSON.stringify({ output_text: JSON.stringify(VALID_PAYLOAD) }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    const result = await requestVisionExtraction({
      fileName: 'chase_1.pdf',
      images: [{ pageNumber: 1, mimeType: 'image/png', bytes: new Uint8Array([9, 9, 9]) }],
      pdf: {
        fileName: 'chase_1.pdf',
        bytes: new Uint8Array([37, 80, 68, 70]),
        pageNumbers: [6, 7, 8, 9],
      },
      role: 'vision',
      statementHint: 'Statement period 2026-05-23 to 2026-06-23.',
    });

    expect(url).toContain('/v1/responses');
    expect(url).not.toContain('/chat/completions');
    expect(body.model).toBe('gpt-5.6-terra');
    const input = body.input as Array<{ content: Array<Record<string, unknown>> }>;
    const file = input[0]?.content.find((item) => item.type === 'input_file');
    expect(file?.detail).toBe('high');
    expect(String(file?.file_data ?? '')).toMatch(/^data:application\/pdf;base64,/);
    expect(result.valid).toBe(true);
    expect(result.transactions).toHaveLength(1);
  });

  it('uses Sol on the Responses API for escalation PDF input', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.OPENAI_ESCALATION_MODEL = 'gpt-5.6-sol';
    let model = '';
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as { model?: string };
      model = body.model ?? '';
      return new Response(JSON.stringify({ output_text: JSON.stringify(VALID_PAYLOAD) }), {
        status: 200,
      });
    }) as typeof fetch;

    await requestVisionExtraction({
      fileName: 'chase_1.pdf',
      images: [],
      pdf: {
        fileName: 'chase_1.pdf',
        bytes: new Uint8Array([37, 80, 68, 70]),
        pageNumbers: [1, 2],
      },
      role: 'escalation',
    });
    expect(model).toBe('gpt-5.6-sol');
  });
});
