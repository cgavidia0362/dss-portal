import { describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { parseVisionExtraction } from '../../ai/visionSchema';
import { extractFromTextPages, printedDepositControlTotalFromSegments } from '../pipeline';
import type { VisionClient } from '../../ai/extractVision';
import type { PageRenderer } from '../renderPages';

const PNC_VERIFIED = `
PNC Simple Checking Statement
Primary account number: XX-XXXX-9999
For the period 07/21/2026 to 08/20/2026
Deposits and Other Additions There were 2 Deposits and Other Additions totaling $150.00.
Date Amount Description
07/21 75.00 Zelle From Avery Example
07/22 75.00 Zel From Blake Sample
Banking/Debit Card Withdrawals and Purchases
Date Amount Description
07/21 13.77 Debit Card Purchase Example Fuel Station
`;

const PNC_MISMATCH = PNC_VERIFIED.replace(
  'There were 2 Deposits and Other Additions totaling $150.00.',
  'There were 3 Deposits and Other Additions totaling $999.00.'
);

const PNC_ESCALATE = PNC_VERIFIED.replace(
  'There were 2 Deposits and Other Additions totaling $150.00.',
  'There were 4 Deposits and Other Additions totaling $999.00.'
);

function visionFromRows(
  rows: Array<{ date: string; description: string; amount: number }>,
  depositTotal: number | null,
  valid = true
): ReturnType<typeof parseVisionExtraction> {
  if (!valid) return parseVisionExtraction(null);
  return parseVisionExtraction({
    bank: 'PNC',
    documentKind: 'bank_statement',
    usedDepositsTable: false,
    ignoredTransactionHistory: false,
    structureAmbiguous: false,
    depositsTablePages: [],
    pagesNeedingReview: [],
    statements: [
      {
        statementSegmentId: 'stmt-1',
        startDate: '2026-07-21',
        endDate: '2026-08-20',
        accountIdentifier: '9999',
        bank: 'PNC',
        beginningBalance: null,
        endingBalance: null,
        depositCreditTotal: depositTotal,
        withdrawalDebitTotal: null,
        pageNumbers: [1],
      },
    ],
    transactions: rows.map((row) => ({
      transactionDate: row.date,
      postedDate: null,
      description: row.description,
      amount: row.amount,
      direction: 'credit',
      accountIdentifier: '9999',
      statementSegmentId: 'stmt-1',
      sourcePage: 1,
      extractionConfidence: 0.8,
      bankCategory: null,
    })),
  });
}

describe('hybrid extraction pipeline', () => {
  it('does not call vision when deterministic parsing reconciles', async () => {
    const calls: string[] = [];
    const vision: VisionClient = async (request) => {
      calls.push(request.role);
      throw new Error('vision should not be called');
    };
    const result = await extractFromTextPages({
      fileName: 'pnc-verified.pdf',
      pages: [PNC_VERIFIED],
      deps: { vision },
    });
    expect(calls).toEqual([]);
    expect(result.transactions.filter((tx) => tx.direction === 'in')).toHaveLength(2);
    expect(result.segments?.[0]?.provenance).toBe('deterministic');
    expect(result.segments?.[0]?.trustState).toBe('verified');
    expect(result.telemetry?.terraPagesProcessed).toBe(0);
    expect(result.telemetry?.solPagesProcessed).toBe(0);
    expect(result.warnings.some((warning) => /PNC parser — verified/i.test(warning.message))).toBe(
      true
    );
  });

  it('uses Terra when deterministic extraction cannot reconcile', async () => {
    const calls: string[] = [];
    const vision: VisionClient = async (request) => {
      calls.push(request.role);
      return visionFromRows(
        [
          { date: '2026-07-21', description: 'Zelle From Avery Example', amount: 75 },
          { date: '2026-07-22', description: 'Zel From Blake Sample', amount: 75 },
          { date: '2026-07-23', description: 'Mobile Deposit Example', amount: 849 },
        ],
        999
      );
    };
    const result = await extractFromTextPages({
      fileName: 'pnc-mismatch.pdf',
      pages: [PNC_MISMATCH],
      deps: { vision },
    });
    expect(calls).toEqual(['vision']);
    expect(result.segments?.[0]?.provenance).toBe('terra_vision');
    expect(result.segments?.[0]?.trustState).toBe('verified');
    expect(result.telemetry?.terraPagesProcessed).toBeGreaterThan(0);
    expect(result.telemetry?.solPagesProcessed).toBe(0);
    expect(result.transactions.filter((tx) => tx.direction === 'in')).toHaveLength(3);
    expect(result.segments?.[0]?.fusionStats?.terraOnlyNew).toBe(1);
  });

  it('escalates to Sol only after Terra fails to reconcile', async () => {
    const calls: string[] = [];
    const vision: VisionClient = async (request) => {
      calls.push(request.role);
      if (request.role === 'vision') {
        return visionFromRows([{ date: '2026-07-23', description: 'Partial Extra', amount: 1 }], 999);
      }
      return visionFromRows(
        [
          { date: '2026-07-23', description: 'Partial Extra', amount: 1 },
          { date: '2026-07-24', description: 'Payroll Example Staffing', amount: 848 },
        ],
        999
      );
    };
    const result = await extractFromTextPages({
      fileName: 'pnc-escalate.pdf',
      pages: [PNC_ESCALATE],
      deps: { vision },
    });
    expect(calls).toEqual(['vision', 'escalation']);
    expect(result.segments?.[0]?.provenance).toBe('sol_escalation');
    expect(result.segments?.[0]?.trustState).toBe('verified');
  });

  it('keeps verified segments when a later statement mismatches after fallback', async () => {
    const vision: VisionClient = async () =>
      visionFromRows([{ date: '2026-07-21', description: 'Still short', amount: 10 }], 999);
    const result = await extractFromTextPages({
      fileName: 'pnc-partial-fail.pdf',
      pages: [
        PNC_VERIFIED,
        `
JPMorgan Chase Bank, N.A.
May 23, 2026 through June 23, 2026
Page 1 of 1
Deposits and Additions 999.00
`,
      ],
      deps: { vision },
    });
    expect(result.segments?.length).toBe(2);
    expect(result.segments?.[0]?.trustState).toBe('verified');
    expect(result.segments?.[1]?.trustState).toBe('mismatch');
    expect(result.transactions.some((tx) => tx.extractionTrustState === 'verified')).toBe(true);
    expect(result.warnings.some((warning) => warning.code === 'extraction_unverified')).toBe(true);
  });

  it('sends concatenated Chase statements to Terra when stacked controls mismatch', async () => {
    const calls: string[] = [];
    const vision: VisionClient = async (request) => {
      calls.push(request.role);
      return visionFromRows(
        [
          { date: '2026-05-24', description: 'Zelle Payment From Example Sender', amount: 40 },
          { date: '2026-06-01', description: 'Payroll Example Staffing', amount: 2000 },
          { date: '2026-06-08', description: 'ATM Cash Deposit Example', amount: 1733.39 },
        ],
        3773.39
      );
    };
    const result = await extractFromTextPages({
      fileName: 'chase-stacked.pdf',
      pages: [
        `
JPMorgan Chase Bank, N.A.
May 23, 2026 through June 23, 2026
Page 1 of 2
$340.23
3,773.39
-2,959.26
-1,153.00
$1.36
05/24 Zelle Payment From Example Sender 40.00 380.23
`,
      ],
      deps: { vision },
    });
    expect(calls).toEqual(['vision']);
    expect(result.segments?.[0]?.provenance).toBe('terra_vision');
    expect(result.segments?.[0]?.trustState).toBe('verified');
    expect(result.segments?.[0]?.reconciliation.expectedCreditTotal).toBe(3773.39);
  });

  it('keeps deterministic rows when vision returns no usable transactions', async () => {
    const vision: VisionClient = async () => visionFromRows([], 3773.39, false);
    const result = await extractFromTextPages({
      fileName: 'chase-keep-deterministic.pdf',
      pages: [
        `
JPMorgan Chase Bank, N.A.
May 23, 2026 through June 23, 2026
Page 1 of 2
$340.23
3,773.39
-2,959.26
-1,153.00
$1.36
05/24 Zelle Payment From Example Sender 40.00 380.23
`,
      ],
      deps: { vision },
    });
    expect(result.segments?.[0]?.provenance).toBe('deterministic');
    expect(result.transactions.filter((tx) => tx.direction === 'in').length).toBeGreaterThan(0);
    expect(result.segments?.[0]?.reconciliation.expectedCreditTotal).toBe(3773.39);
  });

  it('routes image-only TurboPass pages to vision and prefers the Deposits table', async () => {
    const vision: VisionClient = async () =>
      parseVisionExtraction({
        bank: 'TurboPass',
        documentKind: 'turbopass',
        usedDepositsTable: true,
        ignoredTransactionHistory: true,
        structureAmbiguous: false,
        depositsTablePages: [1],
        pagesNeedingReview: [],
        statements: [
          {
            statementSegmentId: 'tp-1',
            startDate: '2026-05-15',
            endDate: '2026-09-12',
            accountIdentifier: '1892',
            bank: 'TurboPass',
            beginningBalance: null,
            endingBalance: null,
            depositCreditTotal: 100,
            withdrawalDebitTotal: null,
            pageNumbers: [1],
          },
        ],
        transactions: [
          {
            transactionDate: '2026-06-01',
            postedDate: null,
            description: 'UNITED MAINTENAN PAYROLL',
            amount: 100,
            direction: 'credit',
            accountIdentifier: '1892',
            statementSegmentId: 'tp-1',
            sourcePage: 1,
            extractionConfidence: 0.92,
            bankCategory: 'IncomePayroll',
          },
          {
            transactionDate: '2026-06-02',
            postedDate: null,
            description: 'History grocery',
            amount: 40,
            direction: 'debit',
            accountIdentifier: '1892',
            statementSegmentId: 'tp-1',
            sourcePage: 2,
            extractionConfidence: 0.7,
            bankCategory: null,
          },
        ],
      });
    const result = await extractFromTextPages({
      fileName: 'TurboPass-scan.pdf',
      pages: ['', ''],
      deps: { vision },
    });
    expect(result.segments?.[0]?.segment.imageOnly).toBe(true);
    expect(result.transactions.filter((tx) => tx.direction === 'in')).toHaveLength(1);
    expect(result.transactions[0]?.turbopassCategory).toBe('IncomePayroll');
    expect(result.transactions.some((tx) => /grocery/i.test(tx.description))).toBe(false);
    expect(result.segments?.[0]?.trustState).toBe('verified');
  });

  it('sends only unresolved pages to Terra and does not invent the control difference', async () => {
    const requested: number[][] = [];
    const vision: VisionClient = async (request) => {
      requested.push(request.images.map((image) => image.pageNumber ?? 0));
      return visionFromRows(
        [{ date: '2026-05-25', description: 'Zelle Payment From Other Sender', amount: 100 }],
        150
      );
    };
    const result = await extractFromTextPages({
      fileName: 'chase-page-fallback.pdf',
      pages: [
        `
JPMorgan Chase Bank, N.A.
May 23, 2026 through June 23, 2026
Page 1 of 2
Deposits and Additions 150.00
05/24 Zelle Payment From Example Sender 50.00 100.00
`,
        `
Page 2 of 2
05/25 Zelle Payment From Other Sender
`,
      ],
      deps: { vision },
    });
    expect(requested).toEqual([[2]]);
    expect(result.segments?.[0]?.aiFallbackPages?.terra).toEqual([2]);
    expect(result.segments?.[0]?.aiFallbackPages?.sol).toEqual([]);
    expect(result.segments?.[0]?.trustState).toBe('verified');
    expect(result.transactions.filter((tx) => tx.direction === 'in').map((tx) => tx.amount).sort((a, b) => a - b)).toEqual([
      50, 100,
    ]);
  });

  it('does not fabricate a transaction to satisfy the printed control total', async () => {
    const vision: VisionClient = async () =>
      visionFromRows([{ date: '2026-07-23', description: 'Still missing the rest', amount: 10 }], 999);
    const result = await extractFromTextPages({
      fileName: 'pnc-no-fabricate.pdf',
      pages: [PNC_MISMATCH],
      deps: { vision },
    });
    const credits = result.transactions.filter((tx) => tx.direction === 'in');
    const total = Math.round(credits.reduce((sum, tx) => sum + tx.amount, 0) * 100) / 100;
    expect(result.segments?.[0]?.trustState).toBe('mismatch');
    expect(credits.some((tx) => tx.amount === 849 || tx.amount === 999)).toBe(false);
    expect(total).not.toBe(999);
    expect(result.segments?.[0]?.reconciliation.creditDifference).not.toBe(0);
  });

  it('escalates only the remaining unresolved page to Sol', async () => {
    const requested: Array<{ role: string; pages: number[] }> = [];
    const vision: VisionClient = async (request) => {
      const pages = request.images.map((image) => image.pageNumber ?? 0);
      requested.push({ role: request.role, pages });
      if (request.role === 'vision') {
        return visionFromRows([], 150);
      }
      return visionFromRows(
        [{ date: '2026-05-25', description: 'Zelle Payment From Other Sender', amount: 100 }],
        150
      );
    };
    const result = await extractFromTextPages({
      fileName: 'chase-page-sol.pdf',
      pages: [
        `
JPMorgan Chase Bank, N.A.
May 23, 2026 through June 23, 2026
Page 1 of 2
Deposits and Additions 150.00
05/24 Zelle Payment From Example Sender 50.00 100.00
`,
        `
Page 2 of 2
05/25 Zelle Payment From Other Sender
`,
      ],
      deps: { vision },
    });
    expect(requested).toEqual([
      { role: 'vision', pages: [2] },
      { role: 'escalation', pages: [2] },
    ]);
    expect(result.segments?.[0]?.aiFallbackPages?.sol).toEqual([2]);
    expect(result.segments?.[0]?.provenance).toBe('sol_escalation');
    expect(result.segments?.[0]?.trustState).toBe('verified');
  });

  it('does not escalate to Sol when printed pages are missing and controls mismatch', async () => {
    const calls: string[] = [];
    const vision: VisionClient = async (request) => {
      calls.push(request.role);
      return visionFromRows([{ date: '2026-05-24', description: 'Partial Extra', amount: 10 }], 999);
    };
    const result = await extractFromTextPages({
      fileName: 'chase-incomplete.pdf',
      pages: [
        `
JPMorgan Chase Bank, N.A.
May 23, 2026 through June 23, 2026
Page 1 of 4
Deposits and Additions 999.00
05/24 Zelle Payment From Example Sender 50.00 100.00
`,
        `
JPMorgan Chase Bank, N.A.
May 23, 2026 through June 23, 2026
Page 3 of 4
`,
      ],
      deps: { vision },
    });
    expect(calls).toEqual(['vision']);
    expect(result.telemetry?.solPagesProcessed).toBe(0);
    expect(result.segments?.[0]?.trustState).toBe('incomplete_source');
    expect(result.segments?.[0]?.fallbackReason).toBe('incomplete_source');
    expect(result.warnings.some((warning) => warning.code === 'incomplete_source')).toBe(true);
    expect(result.warnings.some((warning) => /Missing statement pages: 2 and 4 of 4/.test(warning.message))).toBe(
      true
    );
    expect(result.warnings.some((warning) => warning.code === 'extraction_unverified')).toBe(false);
    expect(result.transactions.filter((tx) => tx.direction === 'in').length).toBeGreaterThan(0);
    const extractedTotal = result.transactions
      .filter((tx) => tx.direction === 'in')
      .reduce((sum, tx) => sum + tx.amount, 0);
    expect(printedDepositControlTotalFromSegments(result.segments)).toBe(999);
    expect(extractedTotal).not.toBe(999);
  });

  it('does not call Terra or Sol when credits already verify and only debits mismatch', async () => {
    const calls: string[] = [];
    const vision: VisionClient = async (request) => {
      calls.push(request.role);
      throw new Error('vision should not be called when credits verify');
    };
    const result = await extractFromTextPages({
      fileName: 'pnc-debit-mismatch.pdf',
      pages: [`${PNC_VERIFIED}\nWithdrawals / Subtractions $999.00\n`],
      deps: { vision },
    });
    expect(calls).toEqual([]);
    expect(result.telemetry?.terraPagesProcessed).toBe(0);
    expect(result.telemetry?.solPagesProcessed).toBe(0);
    expect(result.segments?.[0]?.provenance).toBe('deterministic');
    expect(result.segments?.[0]?.trustState).toBe('verified');
    expect(result.segments?.[0]?.reconciliation.creditStatus).toBe('verified');
    expect(result.segments?.[0]?.reconciliation.debitStatus).toBe('mismatch');
    expect(result.segments?.[0]?.creditReconciliation?.status).toBe('verified');
    expect(result.segments?.[0]?.debitReconciliation?.status).toBe('mismatch');
    expect(result.warnings.some((warning) => warning.code === 'debit_reconciliation_incomplete')).toBe(
      true
    );
    expect(
      result.warnings.some((warning) =>
        /Deposit extraction verified\. Debit transaction reconciliation incomplete/.test(warning.message)
      )
    ).toBe(true);
  });
});

async function makePdf(pageCount: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let index = 0; index < pageCount; index += 1) {
    const page = doc.addPage([612, 792]);
    page.drawText(`Page ${index + 1}`, { x: 72, y: 720, size: 12, font });
  }
  return doc.save();
}

describe('direct PDF vision fallback', () => {
  it('sends one segment PDF per statement period and does not rasterize', async () => {
    const pdfBytes = await makePdf(9);
    const sliced: number[][] = [];
    const rasterCalls: number[] = [];
    const renderPages: PageRenderer = async (_bytes, pageNumbers) => {
      rasterCalls.push(...pageNumbers);
      throw new Error('should not rasterize when PDF input succeeds');
    };
    const vision: VisionClient = async (request) => {
      expect(request.pdf?.bytes.byteLength).toBeGreaterThan(0);
      expect(request.images).toEqual([]);
      const total = request.pdf?.pageNumbers[0] === 1 ? 4135.22 : request.pdf?.pageNumbers[0] === 3 ? 3229.88 : 3773.39;
      return visionFromRows(
        [{ date: '2026-06-01', description: 'Zelle From Avery Example', amount: total }],
        total
      );
    };
    const result = await extractFromTextPages({
      fileName: 'chase-multi.pdf',
      pdfBytes,
      pages: [
        `
JPMorgan Chase Bank, N.A.
July 23, 2026 through August 24, 2026
Page 1 of 2
$28.17
4,135.22
-3,299.92
-846.25
$17.22
July 23, 2026 through August 24, 2026 continuation
`,
        'July 23, 2026 through August 24, 2026 continuation',
        `
JPMorgan Chase Bank, N.A.
June 24, 2026 through July 22, 2026
Page 1 of 3
$1.36
3,229.88
-1,805.92
-1,390.74
$28.17
`,
        'June continuation',
        'June continuation 2',
        `
JPMorgan Chase Bank, N.A.
May 23, 2026 through June 23, 2026
Page 1 of 4
$340.23
3,773.39
-2,959.26
-1,153.00
$1.36
`,
        'May continuation',
        'May continuation 2',
        'May continuation 3',
      ],
      deps: {
        vision,
        renderPages,
        slicePdf: async (_bytes, pageNumbers) => {
          sliced.push([...pageNumbers]);
          return new Uint8Array([37, 80, 68, 70, 45]);
        },
      },
    });

    expect(sliced).toEqual([
      [1, 2],
      [3, 4, 5],
      [6, 7, 8, 9],
    ]);
    expect(rasterCalls).toEqual([]);
    expect(result.telemetry?.pdfInputPagesProcessed).toBe(9);
    expect(result.telemetry?.rasterizedPagesProcessed).toBe(0);
    expect(result.segments?.every((item) => item.usedPdfInput)).toBe(true);
    expect(result.segments?.map((item) => item.trustState)).toEqual([
      'verified',
      'verified',
      'verified',
    ]);
    expect(printedDepositControlTotalFromSegments(result.segments)).toBe(11138.49);
  });

  it('escalates Terra → Sol using the same segment PDF', async () => {
    const pdfBytes = await makePdf(2);
    const roles: string[] = [];
    const pdfPages: number[][] = [];
    const renderPages: PageRenderer = async () => {
      throw new Error('should not rasterize');
    };
    const vision: VisionClient = async (request) => {
      roles.push(request.role);
      pdfPages.push([...(request.pdf?.pageNumbers ?? [])]);
      if (request.role === 'vision') {
        return visionFromRows([{ date: '2026-07-23', description: 'Partial Extra', amount: 1 }], 999);
      }
      return visionFromRows(
        [
          { date: '2026-07-23', description: 'Partial Extra', amount: 1 },
          { date: '2026-07-24', description: 'Payroll Example Staffing', amount: 848 },
        ],
        999
      );
    };
    const result = await extractFromTextPages({
      fileName: 'pnc-pdf-escalate.pdf',
      pdfBytes,
      pages: [PNC_ESCALATE],
      deps: {
        vision,
        renderPages,
        slicePdf: async () => new Uint8Array([37, 80, 68, 70, 45]),
      },
    });
    expect(roles).toEqual(['vision', 'escalation']);
    expect(pdfPages[0]).toEqual(pdfPages[1]);
    expect(result.segments?.[0]?.provenance).toBe('sol_escalation');
    expect(result.segments?.[0]?.usedPdfInput).toBe(true);
    expect(result.telemetry?.rasterizedPagesProcessed).toBe(0);
  });
});
