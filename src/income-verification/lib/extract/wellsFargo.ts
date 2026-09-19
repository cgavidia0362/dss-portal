import { roundMoney } from '../analysis/money';
import type { MoneyDirection, NormalizedTransaction } from '../analysis/types';
import {
  contextYearFromPeriod,
  extractAmounts,
  parseFlexibleDate,
  type StatementPeriod,
} from './parse';

const WF_MARKERS = /wells fargo|wellsfargo\.com|clear access banking/i;

const DESC_START = /^(\d{1,2}\/\d{1,2})\s+(.+)$/;
const AMOUNT_ONLY = /^-?\s*\$?[\d,]+\.\d{2}(?:\s+-?\s*\$?[\d,]+\.\d{2})?$/;

const LEDGER_STOP =
  /^totals\b|the ending daily balance|fee period|monthly service fee|in case of errors|important account/i;

const INCOMING =
  /\bmobile deposit\b|\batm cash deposit\b|\bzelle from\b|\bpayroll\b|\bdirect dep\b|\bdeposit\b|\bcredit\b/i;

const OUTGOING =
  /\bpurchase authorized\b|\batm withdrawal\b|\bzelle to\b|\bmoney transfer\b|\brecurring payment\b|\bpayment authorized\b|\bwithdrawal\b|\bfee\b|\bprem(?:ium)?\s*&\s*pmt\b|\bpremium payment\b/i;

export function isWellsFargoStatement(text: string): boolean {
  return WF_MARKERS.test(text.slice(0, 5000));
}

function directionForWf(description: string): MoneyDirection {
  if (/zelle to\b/i.test(description)) return 'out';
  if (INCOMING.test(description) && !OUTGOING.test(description)) return 'in';
  if (OUTGOING.test(description)) return 'out';
  return 'in';
}

function stripTrailingAmounts(text: string): string {
  return text
    .replace(/(?:-?\s*\$?[\d,]+\.\d{2}\s*)+$/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Wells Fargo transaction history: Date + Description may appear without an
 * amount on the same line; Deposits/Additions and Withdrawals/Subtractions
 * amounts often follow on subsequent lines (sometimes with Ending daily balance).
 */
export function parseWellsFargoLedger(
  text: string,
  fileName: string,
  period: StatementPeriod | null,
  accountLast4: string | null
): NormalizedTransaction[] {
  const year = contextYearFromPeriod(period);
  const lines = text.split(/\r?\n/);
  const transactions: NormalizedTransaction[] = [];

  let i = 0;
  // Skip until transaction history header.
  while (i < lines.length && !/transaction history/i.test(lines[i] ?? '')) i += 1;

  while (i < lines.length) {
    const raw = lines[i]?.trim() ?? '';
    if (LEDGER_STOP.test(raw)) break;
    if (/transaction history \(continued\)/i.test(raw)) {
      i += 1;
      continue;
    }

    const start = DESC_START.exec(raw);
    if (!start) {
      i += 1;
      continue;
    }

    const dateRaw = start[1];
    let description = start[2].trim();
    const rawParts: string[] = [raw];
    let amounts = extractAmounts(description);
    let signedAmount: number | null = null;
    let balance: number | null = null;

    if (amounts.length >= 1) {
      // Trailing money on the date line — last may be ending daily balance.
      if (amounts.length >= 2) {
        signedAmount = amounts[0];
        balance = amounts[amounts.length - 1];
      } else {
        signedAmount = amounts[0];
      }
      description = stripTrailingAmounts(description);
    }

    const startIndex = i;
    i += 1;

    while (i < lines.length && signedAmount == null) {
      const next = lines[i]?.trim() ?? '';
      if (!next) {
        i += 1;
        break;
      }
      if (DESC_START.test(next) || LEDGER_STOP.test(next)) break;
      if (/transaction history/i.test(next)) break;

      if (AMOUNT_ONLY.test(next)) {
        const money = extractAmounts(next);
        if (money.length >= 2) {
          signedAmount = money[0];
          balance = money[money.length - 1];
        } else if (money.length === 1) {
          signedAmount = money[0];
        }
        rawParts.push(next);
        i += 1;
        break;
      }

      // Description wrap (no money yet).
      description = `${description} ${next}`;
      rawParts.push(next);
      i += 1;

      // Re-check if wrap line ended with an amount.
      amounts = extractAmounts(next);
      if (amounts.length >= 1 && /[\d,]+\.\d{2}\s*$/.test(next)) {
        if (amounts.length >= 2) {
          signedAmount = amounts[0];
          balance = amounts[amounts.length - 1];
        } else {
          signedAmount = amounts[0];
        }
        description = stripTrailingAmounts(description);
        break;
      }
    }

    // Some rows put amount on a later wrap after card/ref lines.
    while (i < lines.length && signedAmount == null) {
      const next = lines[i]?.trim() ?? '';
      if (!next || DESC_START.test(next) || LEDGER_STOP.test(next)) break;
      if (AMOUNT_ONLY.test(next)) {
        const money = extractAmounts(next);
        if (money.length >= 2) {
          signedAmount = money[0];
          balance = money[money.length - 1];
        } else if (money.length === 1) {
          signedAmount = money[0];
        }
        rawParts.push(next);
        i += 1;
        break;
      }
      description = `${description} ${next}`;
      rawParts.push(next);
      i += 1;
    }

    description = description.replace(/\s+/g, ' ').trim();
    if (!description || signedAmount == null || signedAmount === 0) continue;

    const direction = directionForWf(description);
    // Wells deposits/withdrawals columns are unsigned in the extract; direction
    // comes from descriptors. Never flip an identified withdrawal into a credit.
    const amountAbs = roundMoney(Math.abs(signedAmount));
    const date = parseFlexibleDate(dateRaw, year, period);
    if (!date) continue;

    transactions.push({
      id: `${fileName}:${date}:${amountAbs}:${startIndex}`,
      date,
      description,
      rawDescription: rawParts.join(' | '),
      amount: amountAbs,
      direction,
      sourceDocument: fileName,
      sourceDocumentType: 'bank_statement',
      sourceAccount: accountLast4,
      detectedIncomeSource: null,
      turbopassCategory: null,
      runningBalance: balance,
      page: null,
    });
  }

  return transactions;
}
