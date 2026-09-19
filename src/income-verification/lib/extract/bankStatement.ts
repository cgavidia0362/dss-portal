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
  extractChaseAccountDepositControls,
  foldBankText,
  parseAmount,
  parseStatementPeriod,
  stripAmountTokens,
  type StatementPeriod,
} from './parse';
import { extractHomeState } from '../analysis/location';
import type { ExtractedDocument } from './types';
import { isNavyFederalStatement, parseNavyFederalLedger } from './navyFederal';
import { isChaseStatement, parseChaseLedger } from './chase';
import { isWellsFargoStatement, parseWellsFargoLedger } from './wellsFargo';
import {
  isLakeForestStyleStatement,
  parseLakeForestStyleLedger,
} from './lakeForest';

const SKIP_LINE =
  /opening balance|closing balance|beginning balance|ending balance|statement period|for the period|page \d|average balance|days in period|date amount description|date description amount|date transaction description|primary account number|account number:/i;

const OUTGOING_HINT =
  /\b(withdrawal|withdrwl|debit|checkcard|bill pay|payment to|fee|charge|atm with|atm withdrawal|\batmo\b|transfer to|zelle payment to|zel(?:le)?\s+to|zelle\s+db|pos\s+debit|pmnt sent|mobile purchase|paid to|retiro|compra con tarjeta|pago enviado)\b/i;

const INCOMING_HINT =
  /\b(deposit|credit|payroll|direct dep|dayforce|zelle payment from|zelle from|zel from|zelle\s+cr|pos\s+credit|incoming|wire in|ach|mobile deposit|atm deposit|refund|reversal|reverse ach|instpmntin|paid from|deposito)\b/i;

/** Detail-section headers (not account-summary totals). */
const DEPOSIT_SECTION_START =
  /deposits and other additions|\bdeposits?\s+and\s+credits\b|^\s*deposits\s*$|depositos y adiciones/i;

const DEPOSIT_SECTION_END =
  /total deposits and other additions|withdrawals and other subtractions|atm and debit card subtractions|other subtractions|service fees|banking\s*\/?\s*debit card withdrawals|withdrawals and purchases|checks and other deductions|other deductions|online and electronic banking deductions|electronic (?:banking )?withdrawals|fees?\s+and\s+charges|daily balance summary|^\s*checks\s*$|retiros de cajeros automaticos|retiros electronicos|otros retiros|^\s*cargos\s*$/i;

const SECTION_CONTINUE_ONLY = /^\s*-\s*continued\s*$/i;

const PNC_STYLE_ROW =
  /^(\d{1,2}\/\d{1,2})\s+(\$?\d{1,3}(?:,\d{3})*\.\d{2}|\$?\d+\.\d{2})\s+(.+)$/i;

/** BoA detail rows: MM/DD/YY description, amount often on the same or following line. */
const BOA_ROW_START =
  /^(\d{1,2}\/\d{1,2}\/\d{2,4})\s+(.+)$/i;

const AMOUNT_ONLY_LINE = /^\$?-?[\d,]+\.\d{2}$/;

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

/**
 * True for deposit *detail* headers. Account-summary lines like
 * "Deposits and other additions 3,026.00" must not open the detail section.
 */
function isDepositSectionHeader(line: string): boolean {
  const folded = foldBankText(line);
  if (!DEPOSIT_SECTION_START.test(folded) && !DEPOSIT_SECTION_START.test(line)) {
    return false;
  }
  const remainder = foldBankText(line)
    .replace(/deposits and other additions/i, ' ')
    .replace(/\bdeposits?\s+and\s+credits\b/i, ' ')
    .replace(/depositos y adiciones/i, ' ')
    .replace(/^\s*deposits\s*$/i, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!remainder) return true;
  // PNC prose header: "Deposits and Other Additions There were 5..."
  if (/there were/i.test(remainder)) return true;
  // Pure money leftover => account summary total, not the detail section.
  if (AMOUNT_ONLY_LINE.test(remainder)) return false;
  return true;
}

function isDepositSectionEnd(line: string): boolean {
  if (isDepositSectionHeader(line)) return false;
  const folded = foldBankText(line);
  return DEPOSIT_SECTION_END.test(folded) || DEPOSIT_SECTION_END.test(line);
}

function hasDepositSection(text: string): boolean {
  return text.split(/\r?\n/).some((line) => isDepositSectionHeader(line.trim()));
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
    if (/continued on next page|continued on the next page/i.test(trimmed)) return;

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

type PendingBoaRow = {
  date: string;
  descriptionParts: string[];
  rawParts: string[];
  index: number;
};

function finalizeDepositRow(
  transactions: NormalizedTransaction[],
  params: {
    fileName: string;
    date: string;
    amount: number;
    description: string;
    rawDescription: string;
    accountLast4: string | null;
    runningBalance: number | null;
    index: number;
  }
) {
  // Deposit sections are credit-only. Never coerce signed withdrawals into deposits.
  if (params.amount <= 0) return;
  const description = params.description.replace(/\s+/g, ' ').trim();
  if (!description) return;
  if (OUTGOING_HINT.test(description) && !INCOMING_HINT.test(description)) return;
  if (/\bpurchase\b/i.test(description) && !/\brefund\b/i.test(description)) return;

  pushTransaction(transactions, {
    fileName: params.fileName,
    date: params.date,
    amount: roundMoney(params.amount),
    description,
    rawDescription: params.rawDescription,
    direction: 'in',
    accountLast4: params.accountLast4,
    runningBalance: params.runningBalance,
    index: params.index,
  });
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
  let pending: PendingBoaRow | null = null;

  const flushPendingAmount = (amountLine: string, index: number) => {
    if (!pending) return;
    const amount = parseAmount(amountLine);
    if (amount == null) return;
    finalizeDepositRow(transactions, {
      fileName,
      date: pending.date,
      amount,
      description: pending.descriptionParts.join(' '),
      rawDescription: [...pending.rawParts, amountLine].join('\n'),
      accountLast4,
      runningBalance: null,
      index: pending.index,
    });
    pending = null;
    void index;
  };

  const abandonPending = () => {
    pending = null;
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    if (isDepositSectionEnd(trimmed)) {
      abandonPending();
      inDepositSection = false;
      return;
    }

    if (isDepositSectionHeader(trimmed)) {
      abandonPending();
      inDepositSection = true;
      return;
    }

    // Bare "- continued" appears under both deposit and withdrawal headers;
    // only keep parsing when we are already inside a deposit section.
    if (SECTION_CONTINUE_ONLY.test(trimmed)) return;

    if (!inDepositSection) return;
    if (SKIP_LINE.test(trimmed) || /continued on (the )?next page/i.test(trimmed)) return;
    if (/^effective\b/i.test(trimmed)) return;

    // Complete a multiline BoA row when the next line is amount-only.
    if (pending && AMOUNT_ONLY_LINE.test(trimmed)) {
      flushPendingAmount(trimmed, index);
      return;
    }

    const pnc = PNC_STYLE_ROW.exec(trimmed);
    if (pnc) {
      abandonPending();
      const date = extractDates(pnc[1], year, period)[0];
      const amount = parseAmount(pnc[2]);
      const description = pnc[3].replace(/\s+/g, ' ').trim();
      if (!date || amount == null) return;
      finalizeDepositRow(transactions, {
        fileName,
        date,
        amount,
        description,
        rawDescription: trimmed,
        accountLast4,
        runningBalance: null,
        index,
      });
      return;
    }

    const boa = BOA_ROW_START.exec(trimmed);
    if (boa) {
      abandonPending();
      const date = extractDates(boa[1], year, period)[0];
      if (!date) return;
      const rest = boa[2].replace(/\s+/g, ' ').trim();
      const amounts = extractAmounts(rest);
      if (amounts.length) {
        // Prefer the rightmost amount on BoA deposit rows (no running balance column).
        const amount = amounts[amounts.length - 1];
        const description = stripAmountTokens(rest).replace(/\s+/g, ' ').trim();
        finalizeDepositRow(transactions, {
          fileName,
          date,
          amount,
          description,
          rawDescription: trimmed,
          accountLast4,
          runningBalance: null,
          index,
        });
        return;
      }

      pending = {
        date,
        descriptionParts: [rest],
        rawParts: [trimmed],
        index,
      };
      return;
    }

    // Continuation lines for an open multiline BoA deposit (e.g. ACH ID rows).
    if (pending) {
      pending.descriptionParts.push(trimmed);
      pending.rawParts.push(trimmed);
      return;
    }

    // Fallback inside deposit sections for banks that keep fuller date formats.
    const dates = extractDates(trimmed, year, period);
    const amounts = extractAmounts(trimmed);
    if (!dates.length || !amounts.length) return;
    const description = stripDateAndAmounts(trimmed);
    if (!description || DEPOSIT_SECTION_START.test(description)) return;
    const signedAmount = amounts[0];
    finalizeDepositRow(transactions, {
      fileName,
      date: dates[0],
      amount: signedAmount,
      description,
      rawDescription: trimmed,
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
  const chaseMode = isChaseStatement(text);
  const wellsMode = isWellsFargoStatement(text);
  const lakeForestMode = isLakeForestStyleStatement(text);
  const transactions = chaseMode
    ? parseChaseLedger(text, fileName, headerPeriod, accountLast4)
    : wellsMode
      ? parseWellsFargoLedger(text, fileName, headerPeriod, accountLast4)
      : lakeForestMode
        ? parseLakeForestStyleLedger(text, fileName, headerPeriod, accountLast4)
        : isNavyFederalStatement(text)
          ? parseNavyFederalLedger(text, fileName, headerPeriod, accountLast4)
          : sectionMode
            ? parseDepositSections(lines, fileName, headerPeriod, accountLast4)
            : parseLegacyLines(lines, fileName, headerPeriod, accountLast4);

  if (!transactions.length) {
    warnings.push({
      code: 'no_transactions',
      message: `Unable to identify transactions in ${fileName}.`,
      documentName: fileName,
    });
  }

  const chaseControls = chaseMode ? extractChaseAccountDepositControls(text) : [];
  if (chaseControls.length) {
    for (const accountControl of chaseControls) {
      const depositTxs = transactions.filter(
        (tx) =>
          tx.direction === 'in' &&
          (accountControl.accountLast4 == null ||
            tx.sourceAccount === accountControl.accountLast4)
      );
      const extractedTotal = roundMoney(
        depositTxs.reduce((sum, tx) => sum + tx.amount, 0)
      );
      if (!amountsEqual(extractedTotal, accountControl.total)) {
        warnings.push({
          code: 'deposit_control_mismatch',
          message: `Deposit control total mismatch in ${fileName} (${accountControl.accountLabel}): statement reports deposits totaling $${accountControl.total.toFixed(2)}, but extracted ${depositTxs.length} deposits totaling $${extractedTotal.toFixed(2)}.`,
          documentName: fileName,
        });
      }
    }
  } else if (control) {
    const depositTxs = transactions.filter((tx) => tx.direction === 'in');
    const extractedTotal = roundMoney(
      depositTxs.reduce((sum, tx) => sum + tx.amount, 0)
    );
    const countMismatch =
      control.count != null && depositTxs.length !== control.count;
    const totalMismatch = !amountsEqual(extractedTotal, control.total);
    if (countMismatch || totalMismatch) {
      const reported =
        control.count != null
          ? `${control.count} deposits totaling $${control.total.toFixed(2)}`
          : `deposits totaling $${control.total.toFixed(2)}`;
      warnings.push({
        code: 'deposit_control_mismatch',
        message: `Deposit control total mismatch in ${fileName}: statement reports ${reported}, but extracted ${depositTxs.length} deposits totaling $${extractedTotal.toFixed(2)}.`,
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
