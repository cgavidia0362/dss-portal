import { roundMoney } from '../analysis/money';
import type { MoneyDirection, NormalizedTransaction } from '../analysis/types';
import {
  contextYearFromPeriod,
  foldBankText,
  parseAmount,
  parseFlexibleDate,
  type StatementPeriod,
} from './parse';

const LF_MARKERS =
  /lakeforestbank|lake forest bank|total access checking|funds transfer frm dep|funds transfer to dep|preauthorized credit/i;

const MONTH_DAY_START =
  /^(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})\s+(.+)$/i;

const SIGNED_AMOUNT = /^(-)?\s*\$?([\d,]+\.\d{2})$/;

const SKIP_ROW =
  /^beginning balance|^ending balance|^balance summary|^transaction detail|^date description|^analysis or maintenance|^number of days|^account number|^statement date|^page\s*:/i;

const LEDGER_STOP = /^apbj|^aing|^achif|^ahh|^adop|^ag|^ddll|^2539\s/i;

export function isLakeForestStyleStatement(text: string): boolean {
  const head = text.slice(0, 6000);
  return (
    LF_MARKERS.test(head) ||
    (/deposits and credits\s*\(\d+\)/i.test(head) &&
      /withdrawals and debits\s*\(\d+\)/i.test(head) &&
      /funds transfer (?:frm|to) dep/i.test(text))
  );
}

function directionForLf(
  description: string,
  signedAmount: number
): MoneyDirection {
  const folded = foldBankText(description);
  if (/funds transfer to dep/.test(folded)) return 'out';
  if (/funds transfer frm dep|funds transfer from dep/.test(folded)) return 'in';
  if (/preauthorized credit|\bpayroll\b/.test(folded)) return 'in';
  if (/pos purchase|merchant purchase|a2a pmt debit|svc chg|eft s\/c/.test(folded)) {
    return 'out';
  }
  return signedAmount < 0 ? 'out' : 'in';
}

/**
 * Community-bank style ledgers (e.g. Lake Forest): Month Day + Description across
 * multiple lines, then a signed $amount on its own line for Deposits vs Withdrawals.
 */
export function parseLakeForestStyleLedger(
  text: string,
  fileName: string,
  period: StatementPeriod | null,
  accountLast4: string | null
): NormalizedTransaction[] {
  const year = contextYearFromPeriod(period);
  const lines = text.split(/\r?\n/);
  const transactions: NormalizedTransaction[] = [];

  let i = 0;
  while (i < lines.length) {
    const raw = lines[i]?.trim() ?? '';
    if (!raw) {
      i += 1;
      continue;
    }

    const start = MONTH_DAY_START.exec(raw);
    if (!start) {
      i += 1;
      continue;
    }

    const dateLabel = `${start[1]} ${start[2]}`;
    let description = start[3].trim();
    if (SKIP_ROW.test(description) || SKIP_ROW.test(raw)) {
      i += 1;
      continue;
    }

    const rawParts: string[] = [raw];
    const startIndex = i;
    i += 1;

    let signedAmount: number | null = null;
    while (i < lines.length) {
      const next = lines[i]?.trim() ?? '';
      if (!next) {
        i += 1;
        break;
      }
      if (MONTH_DAY_START.test(next)) break;
      if (LEDGER_STOP.test(next)) break;
      if (/^date description|^transaction detail|^account number|^statement date|^page\s*:/i.test(next)) {
        break;
      }

      const money = SIGNED_AMOUNT.exec(next);
      if (money) {
        const amount = parseAmount(money[2]);
        if (amount != null) {
          signedAmount = money[1] ? -amount : amount;
        }
        rawParts.push(next);
        i += 1;
        break;
      }

      // Skip barcode / noise blocks mid-page.
      if (LEDGER_STOP.test(next) || /^[A-Z]{20,}$/.test(next)) {
        i += 1;
        continue;
      }

      description = `${description} ${next}`;
      rawParts.push(next);
      i += 1;
    }

    description = description.replace(/\s+/g, ' ').trim();
    if (!description || signedAmount == null || signedAmount === 0) continue;

    const date = parseFlexibleDate(dateLabel, year, period);
    if (!date) continue;

    const direction = directionForLf(description, signedAmount);
    const amountAbs = roundMoney(Math.abs(signedAmount));

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
      runningBalance: null,
      page: null,
    });
  }

  return transactions;
}
