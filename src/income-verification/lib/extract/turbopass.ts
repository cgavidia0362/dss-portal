import { roundMoney } from '../analysis/money';
import type {
  AnalysisWarning,
  DocumentPeriod,
  MoneyDirection,
  NormalizedTransaction,
  TurboPassCategory,
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

type ParserSection = 'deposits' | 'history' | TurboPassCategory | null;

const CATEGORY_MAP: Array<{ match: RegExp; category: TurboPassCategory }> = [
  { match: /incomepayroll|income\s*payroll/i, category: 'IncomePayroll' },
  { match: /p2pcredits?/i, category: 'P2PCredits' },
  { match: /general deposit/i, category: 'General Deposit' },
  { match: /atmdeposits?/i, category: 'ATMDeposits' },
  { match: /external\s*transfers?/i, category: 'External Transfers' },
  { match: /internal\s*transfers?/i, category: 'Internal Transfers' },
  { match: /misc\.?\s*credits?/i, category: 'MiscCredits' },
  { match: /tax\s*refunds?|refunds?/i, category: 'Refunds' },
  { match: /loan\s*advances?/i, category: 'Loan Advances' },
];

const LABELED_SECTIONS: Record<string, TurboPassCategory> = {
  'internal transfers': 'Internal Transfers',
  'internal transfer': 'Internal Transfers',
  refunds: 'Refunds',
  refund: 'Refunds',
  'loan advances': 'Loan Advances',
  'loan advance': 'Loan Advances',
};

function detectCategory(line: string): TurboPassCategory | null {
  for (const item of CATEGORY_MAP) {
    if (item.match.test(line)) return item.category;
  }
  return null;
}

function isDepositsTableHeader(line: string): boolean {
  const normalized = line.toUpperCase();
  return (
    normalized.includes('DATE') &&
    normalized.includes('DESCRIPTION') &&
    normalized.includes('CATEGORY') &&
    normalized.includes('AMOUNT') &&
    !normalized.includes('DEBIT')
  );
}

function isHistoryTableHeader(line: string): boolean {
  const normalized = line.toUpperCase();
  return (
    normalized.includes('DATE') &&
    normalized.includes('DESCRIPTION') &&
    normalized.includes('DEBIT') &&
    normalized.includes('CREDIT')
  );
}

function sectionOf(line: string): ParserSection {
  const trimmed = line.trim();
  if (/^transaction history\b/i.test(trimmed)) return 'history';
  if (/^deposits?\s*$/i.test(trimmed) || /^credits?\s*$/i.test(trimmed)) return 'deposits';

  const labeled = LABELED_SECTIONS[trimmed.toLowerCase()];
  return labeled ?? null;
}

function isDateStart(line: string): boolean {
  return /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/.test(line.trim());
}

function isBoilerplate(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return true;
  return (
    /bravo banking report/i.test(trimmed) ||
    /terms of service/i.test(trimmed) ||
    /legal information/i.test(trimmed) ||
    /turbopassusa\.com|turbopassreport\.com/i.test(trimmed) ||
    /^page \d+\s+of\s+\d+/i.test(trimmed) ||
    /^--\s*\d+\s+of\s+\d+\s*--/i.test(trimmed) ||
    /^prepared for\b/i.test(trimmed) ||
    /^for \d{1,2}\/\d{1,2}\/\d{4}\s*-\s*\d{1,2}\/\d{1,2}\/\d{4}/i.test(trimmed) ||
    /turbopass report requested/i.test(trimmed) ||
    /hereby attests/i.test(trimmed) ||
    /consumer has explicitly authorized/i.test(trimmed) ||
    /^click here\b/i.test(trimmed) ||
    /^trusted download/i.test(trimmed) ||
    /^learn about income categories/i.test(trimmed) ||
    /^cash flow over time/i.test(trimmed) ||
    /^quick view$/i.test(trimmed) ||
    /^account details$/i.test(trimmed) ||
    /^applicant summary$/i.test(trimmed)
  );
}

function directionForCategory(
  category: TurboPassCategory | null,
  description: string
): MoneyDirection {
  if (category === 'Internal Transfers' && /to\b|from savings|to checking/i.test(description)) {
    return /to\b/i.test(description) ? 'out' : 'in';
  }
  return 'in';
}

function stripMeta(line: string): string {
  return stripAmountTokens(
    line
      .replace(
        /incomepayroll|income\s*payroll|p2pcredits?|general deposit|atmdeposits?|external\s*transfers?|internal\s*transfers?|misc\.?\s*credits?|tax\s*refunds?|refunds?|loan\s*advances?/gi,
        ' '
      )
      .replace(/\*{4,}\s*\d{4}/g, ' ')
      .replace(/\(checking\)/gi, ' ')
      .replace(/\badv safebalance banking\b/gi, ' ')
      .replace(/\b\d{4}-\d{2}-\d{2}\b/g, ' ')
      .replace(/\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim();
}

function sectionProvidesCategory(section: ParserSection): section is TurboPassCategory {
  return Boolean(section && section !== 'deposits' && section !== 'history');
}

export function parseTurboPassText(text: string, fileName: string): ExtractedDocument {
  const warnings: AnalysisWarning[] = [];
  const headerPeriod = parseStatementPeriod(text);
  const year = contextYearFromPeriod(headerPeriod);
  const accountLast4 = extractAccountLast4(text);
  const lines = text.split(/\r?\n/);
  const transactions: NormalizedTransaction[] = [];

  let section: ParserSection = null;
  let sawDepositSection = false;
  let sawHistorySection = false;
  let depositRowCount = 0;
  let buffer: string[] = [];
  let bufferIndex = 0;

  function parseAssembled(assembled: string, index: number, fromDeposits: boolean) {
    const startLine = assembled.split('\n')[0] ?? assembled;
    const date = extractDates(startLine, year)[0] ?? extractDates(assembled, year)[0];
    const amounts = extractAmounts(assembled.replace(/\n/g, ' '));
    if (!date || !amounts.length) return;
    const amount = roundMoney(Math.abs(amounts[amounts.length - 1]));
    if (!amount) return;

    const flat = assembled.replace(/\s+/g, ' ').trim();
    const category =
      detectCategory(flat) ?? (sectionProvidesCategory(section) ? section : null);
    const description = stripMeta(flat);
    if (!description) return;

    const direction = directionForCategory(category, description);

    transactions.push({
      id: `${fileName}:${date}:${amount}:${index}`,
      date,
      description,
      rawDescription: flat,
      amount,
      direction,
      sourceDocument: fileName,
      sourceDocumentType: 'turbopass',
      sourceAccount: accountLast4,
      detectedIncomeSource: null,
      turbopassCategory: category,
      runningBalance: amounts.length > 1 ? amounts[0] : null,
      page: null,
    });
    if (fromDeposits) depositRowCount += 1;
  }

  function flushBuffer() {
    if (!buffer.length) return;
    const fromDeposits = section === 'deposits' || sawDepositSection;
    parseAssembled(buffer.join('\n'), bufferIndex, fromDeposits && section !== 'history');
    buffer = [];
  }

  function enterSection(next: ParserSection) {
    flushBuffer();
    section = next;
    if (next === 'deposits') sawDepositSection = true;
    if (next === 'history') sawHistorySection = true;
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();

    if (isDepositsTableHeader(trimmed)) {
      enterSection('deposits');
      continue;
    }
    if (isHistoryTableHeader(trimmed) || /^transaction history\b/i.test(trimmed)) {
      enterSection('history');
      continue;
    }

    const nextSection = sectionOf(trimmed);
    if (nextSection) {
      enterSection(nextSection);
      continue;
    }

    if (section === 'history' && depositRowCount > 0) {
      continue;
    }

    if (!trimmed || isBoilerplate(trimmed)) {
      continue;
    }

    if (isDateStart(trimmed)) {
      flushBuffer();
      buffer = [trimmed];
      bufferIndex = index;
      continue;
    }

    if (buffer.length) {
      buffer.push(trimmed);
    }
  }

  flushBuffer();

  if (!transactions.length) {
    warnings.push({
      code: 'no_transactions',
      message: sawDepositSection
        ? `Found a TurboPass Deposits table in ${fileName} but could not parse its rows.`
        : `Unable to identify TurboPass transactions in ${fileName}.`,
      documentName: fileName,
    });
  } else if (sawDepositSection) {
    warnings.push({
      code: 'turbopass_deposits_section',
      message: sawHistorySection
        ? `Used the TurboPass Deposits section in ${fileName} and ignored Transaction History to avoid double counting.`
        : `Used the TurboPass Deposits section in ${fileName}.`,
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

  return {
    fileName,
    text,
    transactions,
    period,
    warnings,
  };
}
