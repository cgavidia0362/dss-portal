import { roundMoney } from '../analysis/money';
import type {
  AnalysisWarning,
  DocumentPeriod,
  MoneyDirection,
  NormalizedTransaction,
} from '../analysis/types';
import {
  contextYearFromPeriod,
  extractAccountLast4,
  extractAmounts,
  extractDates,
  parseStatementPeriod,
  stripAmountTokens,
} from './parse';
import type { ExtractedDocument } from './types';

const SKIP_LINE =
  /opening balance|closing balance|beginning balance|ending balance|statement period|page \d|continued|total deposits|total withdrawals|average balance|days in period/i;

const OUTGOING_HINT =
  /\b(withdrawal|withdrwl|debit|checkcard|bill pay|payment to|fee|charge|atm with|transfer to|zelle payment to|pmnt sent)\b/i;

const INCOMING_HINT =
  /\b(deposit|credit|payroll|direct dep|zelle payment from|incoming|wire in|ach|mobile deposit|atm deposit|refund|reversal)\b/i;

function directionFromDescription(
  description: string,
  signedAmount: number
): MoneyDirection {
  if (/\b(refund|reversal|chargeback)\b/i.test(description)) return 'in';
  if (/\bpurchase\b/i.test(description) && !/\brefund\b/i.test(description)) {
    return 'out';
  }
  if (OUTGOING_HINT.test(description) && !INCOMING_HINT.test(description)) {
    return 'out';
  }
  if (INCOMING_HINT.test(description)) return 'in';
  return signedAmount < 0 ? 'out' : 'in';
}

function stripDateAndAmounts(line: string): string {
  return stripAmountTokens(
    line
      .replace(/\b\d{4}-\d{2}-\d{2}\b/g, ' ')
      .replace(/\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseBankStatementText(
  text: string,
  fileName: string
): ExtractedDocument {
  const warnings: AnalysisWarning[] = [];
  const headerPeriod = parseStatementPeriod(text);
  const year = contextYearFromPeriod(headerPeriod);
  const accountLast4 = extractAccountLast4(text);
  const transactions: NormalizedTransaction[] = [];
  const lines = text.split(/\r?\n/);

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed || SKIP_LINE.test(trimmed) || trimmed.length < 8) return;

    const dates = extractDates(trimmed, year);
    const amounts = extractAmounts(trimmed);
    if (!dates.length || !amounts.length) return;

    const date = dates[0];
    const signedAmount =
      amounts.length >= 2 ? amounts[0] : amounts[amounts.length - 1];
    const runningBalance = amounts.length >= 2 ? amounts[amounts.length - 1] : null;
    const description = stripDateAndAmounts(trimmed);
    if (!description) return;

    const direction = directionFromDescription(description, signedAmount);
    const amount = roundMoney(Math.abs(signedAmount));
    if (amount === 0) return;

    transactions.push({
      id: `${fileName}:${date}:${amount}:${index}`,
      date,
      description,
      rawDescription: trimmed,
      amount,
      direction,
      sourceDocument: fileName,
      sourceDocumentType: 'bank_statement',
      sourceAccount: accountLast4,
      detectedIncomeSource: null,
      turbopassCategory: null,
      runningBalance,
      page: null,
    });
  });

  if (!transactions.length) {
    warnings.push({
      code: 'no_transactions',
      message: `Unable to identify transactions in ${fileName}.`,
      documentName: fileName,
    });
  }

  const txDates = transactions.map((tx) => tx.date).sort();
  const period: DocumentPeriod = {
    documentName: fileName,
    startDate: headerPeriod?.startDate ?? txDates[0] ?? null,
    endDate: headerPeriod?.endDate ?? txDates[txDates.length - 1] ?? null,
    source: headerPeriod ? 'statement_header' : txDates.length ? 'transaction_dates' : 'unknown',
    accountLast4,
  };

  if (!headerPeriod) {
    warnings.push({
      code: 'statement_period_inferred',
      message: `Statement date could not be determined from a header in ${fileName}; period was inferred from transactions.`,
      documentName: fileName,
    });
  }

  return {
    fileName,
    text,
    transactions,
    period,
    warnings,
  };
}
