import { parseAmount, parseFlexibleDate } from '../extract/parse';
import type { TurboPassCategory } from '../analysis/types';

export const VISION_JSON_SCHEMA = {
  name: 'statement_extraction',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      bank: { type: 'string' },
      documentKind: { type: 'string' },
      usedDepositsTable: { type: 'boolean' },
      ignoredTransactionHistory: { type: 'boolean' },
      structureAmbiguous: { type: 'boolean' },
      depositsTablePages: { type: 'array', items: { type: 'number' } },
      pagesNeedingReview: { type: 'array', items: { type: 'number' } },
      statements: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            statementSegmentId: { type: 'string' },
            startDate: { type: 'string' },
            endDate: { type: 'string' },
            accountIdentifier: { type: 'string' },
            bank: { type: 'string' },
            beginningBalance: { type: ['number', 'null'] },
            endingBalance: { type: ['number', 'null'] },
            depositCreditTotal: { type: ['number', 'null'] },
            withdrawalDebitTotal: { type: ['number', 'null'] },
            extractedCreditCount: { type: ['number', 'null'] },
            extractedCreditSum: { type: ['number', 'null'] },
            pageNumbers: { type: 'array', items: { type: 'number' } },
          },
          required: [
            'statementSegmentId',
            'startDate',
            'endDate',
            'accountIdentifier',
            'bank',
            'beginningBalance',
            'endingBalance',
            'depositCreditTotal',
            'withdrawalDebitTotal',
            'extractedCreditCount',
            'extractedCreditSum',
            'pageNumbers',
          ],
        },
      },
      transactions: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            transactionDate: { type: 'string' },
            postedDate: { type: ['string', 'null'] },
            description: { type: 'string' },
            amount: { type: 'number' },
            direction: { type: 'string' },
            accountIdentifier: { type: ['string', 'null'] },
            statementSegmentId: { type: 'string' },
            sourcePage: { type: 'number' },
            extractionConfidence: { type: 'number' },
            bankCategory: { type: ['string', 'null'] },
            runningBalance: { type: ['number', 'null'] },
            referenceId: { type: ['string', 'null'] },
          },
          required: [
            'transactionDate',
            'postedDate',
            'description',
            'amount',
            'direction',
            'accountIdentifier',
            'statementSegmentId',
            'sourcePage',
            'extractionConfidence',
            'bankCategory',
            'runningBalance',
            'referenceId',
          ],
        },
      },
    },
    required: [
      'bank',
      'documentKind',
      'usedDepositsTable',
      'ignoredTransactionHistory',
      'structureAmbiguous',
      'depositsTablePages',
      'pagesNeedingReview',
      'statements',
      'transactions',
    ],
  },
} as const;

export interface VisionStatementMeta {
  statementSegmentId: string;
  startDate: string | null;
  endDate: string | null;
  accountIdentifier: string | null;
  bank: string | null;
  beginningBalance: number | null;
  endingBalance: number | null;
  depositCreditTotal: number | null;
  withdrawalDebitTotal: number | null;
  extractedCreditCount: number | null;
  extractedCreditSum: number | null;
  pageNumbers: number[];
}

export interface VisionTransactionRow {
  transactionDate: string | null;
  postedDate: string | null;
  description: string;
  amount: number;
  direction: 'credit' | 'debit';
  accountIdentifier: string | null;
  statementSegmentId: string;
  sourcePage: number | null;
  extractionConfidence: number;
  bankCategory: string | null;
  runningBalance: number | null;
  referenceId: string | null;
}

export interface VisionExtraction {
  bank: string | null;
  documentKind: 'turbopass' | 'bank_statement' | 'unknown';
  usedDepositsTable: boolean;
  ignoredTransactionHistory: boolean;
  structureAmbiguous: boolean;
  depositsTablePages: number[];
  pagesNeedingReview: number[];
  statements: VisionStatementMeta[];
  transactions: VisionTransactionRow[];
  valid: boolean;
  error?: string;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') return parseAmount(value);
  return null;
}

function asString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  return null;
}

function mapTurboCategory(value: string | null): TurboPassCategory | null {
  if (!value) return null;
  const text = value.toLowerCase().replace(/\s+/g, '');
  if (text.includes('incomepayroll')) return 'IncomePayroll';
  if (text.includes('p2p')) return 'P2PCredits';
  if (text.includes('generaldeposit')) return 'General Deposit';
  if (text.includes('atm')) return 'ATMDeposits';
  if (text.includes('externaltransfer')) return 'External Transfers';
  if (text.includes('internaltransfer')) return 'Internal Transfers';
  if (text.includes('misc') && text.includes('credit')) return 'MiscCredits';
  if (text.includes('refund')) return 'Refunds';
  if (text.includes('loan')) return 'Loan Advances';
  return null;
}

export { mapTurboCategory };

export function parseVisionExtraction(raw: unknown): VisionExtraction {
  if (!raw || typeof raw !== 'object') {
    return emptyVision('Vision output was not a JSON object.');
  }
  const data = raw as Record<string, unknown>;
  const documentKindRaw = asString(data.documentKind)?.toLowerCase() ?? 'unknown';
  const documentKind: VisionExtraction['documentKind'] =
    documentKindRaw === 'turbopass'
      ? 'turbopass'
      : documentKindRaw === 'bank_statement'
        ? 'bank_statement'
        : 'unknown';

  const statements = Array.isArray(data.statements)
    ? data.statements.map((item, index) => parseStatement(item, index))
    : [];
  const transactions = Array.isArray(data.transactions)
    ? data.transactions
        .map((item) => parseTransaction(item))
        .filter((row): row is VisionTransactionRow => row != null)
    : [];

  if (!transactions.length && !statements.length) {
    return {
      ...emptyVision('Vision output did not contain structured transactions.'),
      bank: asString(data.bank),
      documentKind,
      structureAmbiguous: Boolean(data.structureAmbiguous),
    };
  }

  return {
    bank: asString(data.bank),
    documentKind,
    usedDepositsTable: Boolean(data.usedDepositsTable),
    ignoredTransactionHistory: Boolean(data.ignoredTransactionHistory),
    structureAmbiguous: Boolean(data.structureAmbiguous),
    depositsTablePages: numberArray(data.depositsTablePages),
    pagesNeedingReview: numberArray(data.pagesNeedingReview),
    statements,
    transactions,
    valid: true,
  };
}

function parseStatement(raw: unknown, index: number): VisionStatementMeta {
  const data = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    statementSegmentId: asString(data.statementSegmentId) || `vision-stmt-${index + 1}`,
    startDate: parseFlexibleDate(String(data.startDate ?? '')) ?? asString(data.startDate),
    endDate: parseFlexibleDate(String(data.endDate ?? '')) ?? asString(data.endDate),
    accountIdentifier: asString(data.accountIdentifier),
    bank: asString(data.bank),
    beginningBalance: asNumber(data.beginningBalance),
    endingBalance: asNumber(data.endingBalance),
    depositCreditTotal: asNumber(data.depositCreditTotal),
    withdrawalDebitTotal: asNumber(data.withdrawalDebitTotal),
    extractedCreditCount: asNumber(data.extractedCreditCount),
    extractedCreditSum: asNumber(data.extractedCreditSum),
    pageNumbers: numberArray(data.pageNumbers),
  };
}

function parseTransaction(raw: unknown): VisionTransactionRow | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  const amount = Math.abs(asNumber(data.amount) ?? 0);
  const date =
    parseFlexibleDate(String(data.transactionDate ?? data.date ?? '')) ??
    asString(data.transactionDate);
  if (!date || !amount) return null;
  const directionRaw = asString(data.direction)?.toLowerCase();
  const direction: 'credit' | 'debit' =
    directionRaw === 'debit' || directionRaw === 'out' ? 'debit' : 'credit';
  const confidence = asNumber(data.extractionConfidence);
  return {
    transactionDate: date,
    postedDate: parseFlexibleDate(String(data.postedDate ?? '')) ?? asString(data.postedDate),
    description: asString(data.description) || 'Extracted transaction',
    amount,
    direction,
    accountIdentifier: asString(data.accountIdentifier),
    statementSegmentId: asString(data.statementSegmentId) || 'vision-stmt-1',
    sourcePage: asNumber(data.sourcePage),
    extractionConfidence: Math.min(1, Math.max(0, confidence ?? 0.5)),
    bankCategory: asString(data.bankCategory),
    runningBalance: asNumber(data.runningBalance),
    referenceId: asString(data.referenceId),
  };
}

function numberArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'number' ? item : Number(item)))
    .filter((item) => Number.isFinite(item));
}

function emptyVision(error: string): VisionExtraction {
  return {
    bank: null,
    documentKind: 'unknown',
    usedDepositsTable: false,
    ignoredTransactionHistory: false,
    structureAmbiguous: true,
    depositsTablePages: [],
    pagesNeedingReview: [],
    statements: [],
    transactions: [],
    valid: false,
    error,
  };
}

export function visionSystemPrompt(kindHint?: string): string {
  return [
    'Extract bank-statement or TurboPass tables into the provided JSON schema.',
    'Return structured rows only. Do not calculate monthly totals, averages, or inclusion decisions.',
    'Do not invent missing amounts, dates, or transactions. Omit unreadable rows.',
    'Never fabricate a transaction to satisfy a printed statement control total. The missing difference must remain missing.',
    'Statement control totals (beginning/ending balance, deposit total, withdrawal total) are bank-printed figures, not your calculations.',
    'extractedCreditCount and extractedCreditSum are informational self-checks for the pages you were given. TypeScript performs authoritative arithmetic.',
    'If a TurboPass Deposits table is present, extract that table and ignore Transaction History credits to avoid double counting.',
    'For Chase, treat each statement period independently. Never copy dates or totals from one period onto another.',
    'For Chase credits, extract date, description, amount, running balance if visible, and transaction/reference ID.',
    'Direction must be credit or debit as printed. Zelle FROM / Depósito / payroll / cash deposit / reversal-refund are credits. Zelle TO / payment sent / purchases are debits.',
    kindHint ? `Document hint: ${kindHint}.` : '',
  ]
    .filter(Boolean)
    .join(' ');
}
