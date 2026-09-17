import { amountsEqual, roundMoney } from '../analysis/money';
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
  extractDepositControlTotal,
  parseAmount,
  parseStatementPeriod,
  stripAmountTokens,
  type StatementPeriod,
} from './parse';
import { extractHomeState } from '../analysis/location';
import type { ExtractedDocument } from './types';

const SKIP_LINE =
  /opening balance|closing balance|beginning balance|ending balance|statement period|for the period|page \d|average balance|days in period|date amount description|primary account number|account number:/i;

const OUTGOING_HINT =
  /\b(withdrawal|withdrwl|debit|checkcard|bill pay|payment to|fee|charge|atm with|transfer to|zelle payment to|pmnt sent)\b/i;

const INCOMING_HINT =
  /\b(deposit|credit|payroll|direct dep|zelle payment from|zelle from|zel from|incoming|wire in|ach|mobile deposit|atm deposit|refund|reversal|reverse ach|instpmntin)\b/i;

const DEPOSIT_SECTION_START =
  /deposits and other additions|\bdeposits?\s+and\s+credits\b|^\s*deposits\s*$/i;

const DEPOSIT_SECTION_END =
  /banking\s*\/?\s*debit card withdrawals|withdrawals and purchases|checks and other deductions|other deductions|online and electronic banking deductions|electronic (?:banking )?withdrawals|fees?\s+and\s+charges|daily balance summary|^\s*checks\s*$/i;

const SECTION_CONTINUE_ONLY = /^\s*-\s*continued\s*$/i;

const PNC_STYLE_ROW =
  /^(\d{1,2}\/\d{1,2})\s+(\$?\d{1,3}(?:,\d{3})*\.\d{2}|\$?\d+\.\d{2})\s+(.+)$/i;

function directionFromDescription(
  description: string,
  signedAmount: number
): MoneyDirection {
  if (/\b(refund|reversal|chargeback|reverse ach)\b/i.test(description)) return 'in';
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

function hasDepositSection(text: string): boolean {
  return DEPOSIT_SECTION_START.test(text);
}

function pushTransaction(
  transactions: NormalizedTransaction[],
  params: {
    fileName: string;
    date: string;
    amount: number;
    description: string;
    rawDescription: string;
    direction: MoneyDirection;
    accountLast4: string | null;
    runningBalance: number | null;
    index: number;
  }
) {
  if (params.amount === 0 || !params.description) return;
  transactions.push({
    id: `${params.fileName}:${params.date}:${params.amount}:${params.index}`,
    date: params.date,
    description: params.description,
    rawDescription: params.rawDescription,
    amount: params.amount,
    direction: params.direction,
    sourceDocument: params.fileName,
    sourceDocumentType: 'bank_statement',
    sourceAccount: params.accountLast4,
    detectedIncomeSource: null,
    turbopassCategory: null,
    runningBalance: params.runningBalance,
    page: null,
  });
}

function parseLegacyLines(
  lines: string[],
  fileName: string,
  period: StatementPeriod | null,
  accountLast4: string | null
): NormalizedTransaction[] {
  const year = contextYearFromPeriod(period);
  const transactions: NormalizedTransaction[] = [];

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed || SKIP_LINE.test(trimmed) || trimmed.length < 8) return;
    if (/continued on next page/i.test(trimmed)) return;

    const dates = extractDates(trimmed, year, period);
    const amounts = extractAmounts(trimmed);
    if (!dates.length || !amounts.length) return;

    const date = dates[0];
    const signedAmount =
      amounts.length >= 2 ? amounts[0] : amounts[amounts.length - 1];
    const runningBalance = amounts.length >= 2 ? amounts[amounts.length - 1] : null;
    const description = stripDateAndAmounts(trimmed);
    if (!description) return;

    pushTransaction(transactions, {
      fileName,
      date,
      amount: roundMoney(Math.abs(signedAmount)),
      description,
      rawDescription: trimmed,
      direction: directionFromDescription(description, signedAmount),
      accountLast4,
      runningBalance,
      index,
    });
  });

  return transactions;
}

function parseDepositSections(
  lines: string[],
  fileName: string,
  period: StatementPeriod | null,
  accountLast4: string | null
): NormalizedTransaction[] {
  const year = contextYearFromPeriod(period);
  const transactions: NormalizedTransaction[] = [];
  let inDepositSection = false;

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    if (DEPOSIT_SECTION_END.test(trimmed) && !DEPOSIT_SECTION_START.test(trimmed)) {
      inDepositSection = false;
      return;
    }

    if (DEPOSIT_SECTION_START.test(trimmed)) {
      inDepositSection = true;
      return;
    }

    // Bare "- continued" appears under both deposit and withdrawal headers;
    // only keep parsing when we are already inside a deposit section.
    if (SECTION_CONTINUE_ONLY.test(trimmed)) return;

    if (!inDepositSection) return;
    if (SKIP_LINE.test(trimmed) || /continued on next page/i.test(trimmed)) return;
    if (/^effective\b/i.test(trimmed)) return;

    const pnc = PNC_STYLE_ROW.exec(trimmed);
    if (pnc) {
      const date = extractDates(pnc[1], year, period)[0];
      const amount = parseAmount(pnc[2]);
      const description = pnc[3].replace(/\s+/g, ' ').trim();
      if (!date || amount == null) return;
      pushTransaction(transactions, {
        fileName,
        date,
        amount: roundMoney(Math.abs(amount)),
        description,
        rawDescription: trimmed,
        direction: 'in',
        accountLast4,
        runningBalance: null,
        index,
      });
      return;
    }

    // Fallback inside deposit sections for banks that keep fuller date formats.
    const dates = extractDates(trimmed, year, period);
    const amounts = extractAmounts(trimmed);
    if (!dates.length || !amounts.length) return;
    const description = stripDateAndAmounts(trimmed);
    if (!description || DEPOSIT_SECTION_START.test(description)) return;
    const signedAmount = amounts[0];
    pushTransaction(transactions, {
      fileName,
      date: dates[0],
      amount: roundMoney(Math.abs(signedAmount)),
      description,
      rawDescription: trimmed,
      direction: 'in',
      accountLast4,
      runningBalance: amounts.length >= 2 ? amounts[amounts.length - 1] : null,
      index,
    });
  });

  return transactions;
}

export function parseBankStatementText(
  text: string,
  fileName: string
): ExtractedDocument {
  const warnings: AnalysisWarning[] = [];
  const headerPeriod = parseStatementPeriod(text);
  const accountLast4 = extractAccountLast4(text);
  const lines = text.split(/\r?\n/);
  const control = extractDepositControlTotal(text);

  const sectionMode = hasDepositSection(text);
  const transactions = sectionMode
    ? parseDepositSections(lines, fileName, headerPeriod, accountLast4)
    : parseLegacyLines(lines, fileName, headerPeriod, accountLast4);

  if (!transactions.length) {
    warnings.push({
      code: 'no_transactions',
      message: `Unable to identify transactions in ${fileName}.`,
      documentName: fileName,
    });
  }

  if (control) {
    const depositTxs = transactions.filter((tx) => tx.direction === 'in');
    const extractedTotal = roundMoney(
      depositTxs.reduce((sum, tx) => sum + tx.amount, 0)
    );
    if (depositTxs.length !== control.count || !amountsEqual(extractedTotal, control.total)) {
      warnings.push({
        code: 'deposit_control_mismatch',
        message: `Deposit control total mismatch in ${fileName}: statement reports ${control.count} deposits totaling $${control.total.toFixed(2)}, but extracted ${depositTxs.length} deposits totaling $${extractedTotal.toFixed(2)}.`,
        documentName: fileName,
      });
    }
  }

  const txDates = transactions.map((tx) => tx.date).sort();
  const homeState = extractHomeState(text);
  const period: DocumentPeriod = {
    documentName: fileName,
    startDate: headerPeriod?.startDate ?? txDates[0] ?? null,
    endDate: headerPeriod?.endDate ?? txDates[txDates.length - 1] ?? null,
    source: headerPeriod ? 'statement_header' : txDates.length ? 'transaction_dates' : 'unknown',
    accountLast4,
    homeState,
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
