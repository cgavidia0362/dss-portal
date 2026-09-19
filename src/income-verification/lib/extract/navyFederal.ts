import { roundMoney } from '../analysis/money';
import type { MoneyDirection, NormalizedTransaction } from '../analysis/types';
import {
  contextYearFromPeriod,
  parseAmount,
  parseFlexibleDate,
  type StatementPeriod,
} from './parse';

const NFCU_MARKERS =
  /navy federal|nfcu|everyday checking|membership savings|items paid/i;

const DESC_LINE = /^(\d{2}-\d{2})\s+(.+)$/;
const AMOUNT_BALANCE_LINE =
  /^(\$?[\d,]+\.\d{2})(-)?(?:\s+(\$?[\d,]+\.\d{2})(-)?)?$/;

/** Hard stop — Items Paid and disclosures are never part of the deposit ledger. */
const LEDGER_STOP =
  /^items paid$|^disclosure information$|^what to do if you think|^errors related|^average daily balance|^no transactions this period$/i;

/** Navy Federal "Items Paid" summary rows (POS/ACH/ATMO) — never deposits. */
const ITEMS_PAID_ROW =
  /^\d{2}-\d{2}\s+(POS|ACH|ATMO)(?:\s+\$?[\d,]+\.\d{2})?\s*$/i;

const SKIP_DESC =
  /^beginning balance$|^ending balance$|^no transactions this period$/i;

const PAGE_META =
  /date transaction detail|everyday checking|joint owner|^for\b|^page \d|statement period|access no|statement of account|date item amount|^checking$|^savings$|continued from previous page/i;

const CREDIT_HINT =
  /\bzelle\s+cr\b|\bpos\s+credit\b|\bdeposit\b|\bcredit adjustment\b|\bpayroll\b|\bpaid from\b/i;

const DEBIT_HINT =
  /\bzelle\s+db\b|\bpos\s+debit\b|\batm\s+withdrawal\b|\batm\s+fee\b|\batmo\b|\bpaid to\b|\bwithdrawal\b|\bfee\b/i;

export function isNavyFederalStatement(text: string): boolean {
  const head = text.slice(0, 5000);
  return (
    NFCU_MARKERS.test(head) ||
    (/statement of account/i.test(head) &&
      /\b\d{2}-\d{2}\s+zelle\s+cr\b/i.test(text) &&
      /items paid/i.test(text))
  );
}

function directionForNfcu(
  description: string,
  amountIsDebit: boolean
): MoneyDirection {
  if (CREDIT_HINT.test(description) && !DEBIT_HINT.test(description)) return 'in';
  if (DEBIT_HINT.test(description)) return 'out';
  // Trailing minus on amount or balance in NFCU extracts marks withdrawals.
  return amountIsDebit ? 'out' : 'in';
}

function parseNfcuDate(
  mmdd: string,
  period: StatementPeriod | null,
  year?: number
): string | null {
  return parseFlexibleDate(mmdd.replace(/-/g, '/'), year, period);
}

type DescRow = { dateRaw: string; description: string; index: number };
type AmountRow = {
  amount: number;
  balance: number | null;
  amountIsDebit: boolean;
  raw: string;
  index: number;
};

function parseAmountPair(line: string, index: number): AmountRow | null {
  const trimmed = line.trim();
  const pair = AMOUNT_BALANCE_LINE.exec(trimmed);
  // NFCU pairs always have Amount($) + Balance($). Solo balances are skipped.
  if (!pair?.[3]) return null;

  const amount = parseAmount(`${pair[2] ? '-' : ''}${pair[1]}`);
  if (amount == null || amount === 0) return null;
  const balance = parseAmount(pair[3]);
  // Debit marker often lands on the balance token in PDF extracts.
  const amountIsDebit = Boolean(pair[2]) || Boolean(pair[4]);
  return {
    amount: roundMoney(Math.abs(amount)),
    balance,
    amountIsDebit,
    raw: trimmed,
    index,
  };
}

function isWrapContinuation(raw: string, hasDesc: boolean): boolean {
  return (
    hasDesc &&
    Boolean(raw) &&
    !AMOUNT_BALANCE_LINE.test(raw) &&
    !PAGE_META.test(raw) &&
    !LEDGER_STOP.test(raw) &&
    !/^\d/.test(raw) &&
    raw.length <= 48
  );
}

/**
 * Navy Federal PDFs emit Date/Detail rows and Amount/Balance rows in separate
 * column blocks (often across page boundaries). Collect every detail row and
 * every amount/balance pair until Items Paid, then zip them in document order.
 */
export function parseNavyFederalLedger(
  text: string,
  fileName: string,
  period: StatementPeriod | null,
  accountLast4: string | null
): NormalizedTransaction[] {
  const year = contextYearFromPeriod(period);
  const lines = text.split(/\r?\n/);
  const descs: DescRow[] = [];
  const amounts: AmountRow[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i]?.trim() ?? '';
    if (!raw) continue;
    if (LEDGER_STOP.test(raw)) break;
    if (ITEMS_PAID_ROW.test(raw)) continue;

    const descMatch = DESC_LINE.exec(raw);
    if (descMatch) {
      const description = descMatch[2].replace(/\s+/g, ' ').trim();
      if (SKIP_DESC.test(description)) continue;
      descs.push({
        dateRaw: descMatch[1],
        description,
        index: i,
      });
      continue;
    }

    if (isWrapContinuation(raw, descs.length > 0)) {
      const last = descs[descs.length - 1];
      last.description = `${last.description} ${raw}`.replace(/\s+/g, ' ').trim();
      continue;
    }

    const amountRow = parseAmountPair(raw, i);
    if (amountRow) {
      amounts.push(amountRow);
    }
  }

  const pairCount = Math.min(descs.length, amounts.length);
  const transactions: NormalizedTransaction[] = [];

  for (let p = 0; p < pairCount; p += 1) {
    const desc = descs[p];
    const amt = amounts[p];
    const date = parseNfcuDate(desc.dateRaw, period, year);
    if (!date) continue;

    const direction = directionForNfcu(desc.description, amt.amountIsDebit);
    transactions.push({
      id: `${fileName}:${date}:${amt.amount}:${desc.index}`,
      date,
      description: desc.description,
      rawDescription: `${desc.dateRaw} ${desc.description} | ${amt.raw}`,
      amount: amt.amount,
      direction,
      sourceDocument: fileName,
      sourceDocumentType: 'bank_statement',
      sourceAccount: accountLast4,
      detectedIncomeSource: null,
      turbopassCategory: null,
      runningBalance: amt.balance,
      page: null,
    });
  }

  return transactions;
}
