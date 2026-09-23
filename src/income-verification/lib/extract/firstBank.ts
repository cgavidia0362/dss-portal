import { roundMoney } from '../analysis/money';
import type { MoneyDirection, NormalizedTransaction } from '../analysis/types';
import { extractReferenceId } from './candidates';
import type { StatementControlTotals } from './documentModel';
import {
  contextYearFromPeriod,
  extractAccountLast4,
  foldBankText,
  parseAmount,
  parseFlexibleDate,
  type StatementPeriod,
} from './parse';

export const FIRSTBANK_CHECKING_LABEL = 'FirstBank Checking';
export const FIRSTBANK_SAVINGS_LABEL = 'FirstBank Savings';

const SECTION_HEADING =
  /015-cuenta todo\s+(checking|savings)(?:\s*\(cont\.\))?/i;
const DAILY_BALANCE = /^\s*daily balance\s*$/i;
const DATE_ROW = /^(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\s+(.+)$/;
const AMOUNT_ONLY = /^\$?-?[\d,]+\.\d{2}$/;
const TRAILING_AMOUNT = /^(.*?)(?:\s+)(\$?-?[\d,]+\.\d{2})\s*$/;

const SKIP_LINE =
  /^(page\s+\d+|transactions(?:\s+\(continued\))?|date\s+description(?:\s+credits\s+debits)?|date\s+balance|account number|account owner|balance summary|interest summary|checking account statement|statement period|after five days|checks\/items enclosed)/i;

export function isFirstBankStatement(text: string): boolean {
  const folded = foldBankText(text.slice(0, 8000));
  return (
    /015-cuenta todo\s+(checking|savings)/.test(folded) &&
    /deposits and credits\s*\(\d+\)/.test(folded)
  );
}

function sectionLabel(kind: 'checking' | 'savings'): string {
  return kind === 'savings' ? FIRSTBANK_SAVINGS_LABEL : FIRSTBANK_CHECKING_LABEL;
}

function parseSectionKind(line: string): 'checking' | 'savings' | null {
  const match = SECTION_HEADING.exec(foldBankText(line));
  if (!match) return null;
  return match[1] === 'savings' ? 'savings' : 'checking';
}

function isContinuationHeading(line: string): boolean {
  return /\(cont\.\)/i.test(line);
}

function directionForFirstBank(description: string): MoneyDirection | null {
  const folded = foldBankText(description);
  if (/interest paid/.test(folded)) return 'in';
  if (/atm transfer to checking from savings/.test(folded)) return 'in';
  if (/atm transfer from savings to checking/.test(folded)) return 'out';
  if (/transfer from savings|transfer from checking/.test(folded)) return 'in';
  if (/transfer to savings|transfer to checking/.test(folded)) return 'out';
  if (/\bpos credit\b|\bach credit\b|p2p transfer credit|atm cash deposit|\bdeposit\b/.test(folded)) {
    return 'in';
  }
  if (
    /\bpos debit\b|\bach debit\b|p2p transfer debit|atm withdrawal|withdrawal fee|\bfee\b/.test(
      folded
    )
  ) {
    return 'out';
  }
  if (/\bcredit\b/.test(folded) && !/\bdebit\b/.test(folded)) return 'in';
  if (/\bdebit\b/.test(folded)) return 'out';
  return null;
}

function last4FromText(text: string): string | null {
  return extractAccountLast4(text);
}

function splitTrailingAmount(text: string): { description: string; amount: number | null } {
  const trimmed = text.trim();
  if (!trimmed) return { description: '', amount: null };
  if (AMOUNT_ONLY.test(trimmed)) {
    return { description: '', amount: parseAmount(trimmed) };
  }
  const match = TRAILING_AMOUNT.exec(trimmed);
  if (!match) return { description: trimmed, amount: null };
  const amount = parseAmount(match[2]);
  if (amount == null) return { description: trimmed, amount: null };
  return { description: match[1].replace(/\s+/g, ' ').trim(), amount };
}

type PendingRow = {
  date: string;
  description: string;
  rawParts: string[];
  amount: number | null;
  page: number;
  lineIndex: number;
  section: 'checking' | 'savings';
  accountLast4: string | null;
};

function flushPending(
  pending: PendingRow | null,
  transactions: NormalizedTransaction[],
  fileName: string,
  rowOrdinal: { checking: number; savings: number }
): PendingRow | null {
  if (!pending || pending.amount == null || pending.amount === 0 || !pending.description) {
    return null;
  }
  const description = pending.description.replace(/\s+/g, ' ').trim();
  const rawDescription = pending.rawParts.join('\n');
  const direction = directionForFirstBank(description);
  if (!direction) return null;
  rowOrdinal[pending.section] += 1;
  const sourceRowIndex = rowOrdinal[pending.section];
  transactions.push({
    id: `${fileName}:${pending.section}:${pending.page}:${sourceRowIndex}:${pending.date}:${pending.amount}`,
    date: pending.date,
    postedDate: pending.date,
    description,
    rawDescription,
    amount: roundMoney(Math.abs(pending.amount)),
    direction,
    sourceDocument: fileName,
    sourceDocumentType: 'bank_statement',
    sourceAccount: pending.accountLast4,
    sourceAccountLabel: sectionLabel(pending.section),
    sourceRowIndex,
    detectedIncomeSource: null,
    turbopassCategory: null,
    runningBalance: null,
    page: pending.page,
    referenceId: extractReferenceId(`${description} ${rawDescription}`),
    amountSource: 'explicit',
    extractionConfidence: 1,
  });
  return null;
}

export function parseFirstBankLedger(
  text: string,
  fileName: string,
  period: StatementPeriod | null,
  accountLast4: string | null,
  pages?: Array<{ pageNumber: number; text: string }>
): NormalizedTransaction[] {
  const year = contextYearFromPeriod(period);
  const pageItems = pages?.length
    ? pages
    : [{ pageNumber: 1, text }];
  const transactions: NormalizedTransaction[] = [];
  const rowOrdinal = { checking: 0, savings: 0 };
  let section: 'checking' | 'savings' | null = null;
  let inDailyBalance = false;
  let pending: PendingRow | null = null;
  let sectionLast4 = accountLast4;

  for (const page of pageItems) {
    const lines = page.text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      const raw = lines[i] ?? '';
      const trimmed = raw.trim();
      if (!trimmed) continue;

      const kind = parseSectionKind(trimmed);
      if (kind) {
        pending = flushPending(pending, transactions, fileName, rowOrdinal);
        if (!isContinuationHeading(trimmed)) {
          section = kind;
          inDailyBalance = false;
        } else if (!section) {
          section = kind;
        }
        continue;
      }

      const last4Line = /account number[:\s]+([0-9]+)/i.exec(trimmed);
      if (last4Line) {
        sectionLast4 = last4Line[1].slice(-4);
        continue;
      }

      if (DAILY_BALANCE.test(trimmed)) {
        pending = flushPending(pending, transactions, fileName, rowOrdinal);
        inDailyBalance = true;
        continue;
      }
      if (inDailyBalance) continue;
      if (!section) continue;
      if (SKIP_LINE.test(trimmed)) continue;
      if (/^beginning balance|^ending balance|^\+\s*deposits and credits|^\+\s*interest paid|^-\s*withdrawals and debits|^interest earned|^days in statement|^average balance|^annual percentage|^year-to-date/i.test(trimmed)) {
        continue;
      }

      const dateRow = DATE_ROW.exec(trimmed);
      if (dateRow) {
        pending = flushPending(pending, transactions, fileName, rowOrdinal);
        const date = parseFlexibleDate(dateRow[1], year, period);
        if (!date) continue;
        const rest = splitTrailingAmount(dateRow[2]);
        pending = {
          date,
          description: rest.description,
          rawParts: [trimmed],
          amount: rest.amount,
          page: page.pageNumber,
          lineIndex: i,
          section,
          accountLast4: sectionLast4,
        };
        continue;
      }

      if (!pending) continue;
      const cont = splitTrailingAmount(trimmed);
      pending.rawParts.push(trimmed);
      if (cont.description) {
        pending.description = `${pending.description} ${cont.description}`.replace(/\s+/g, ' ').trim();
      }
      if (cont.amount != null) pending.amount = cont.amount;
    }
  }
  flushPending(pending, transactions, fileName, rowOrdinal);
  return transactions;
}

function readControlBlock(lines: string[], start: number): {
  beginningBalance: number | null;
  endingBalance: number | null;
  deposits: number | null;
  depositCount: number | null;
  interest: number | null;
  debits: number | null;
  debitCount: number | null;
  accountLast4: string | null;
} {
  const window = lines.slice(start, Math.min(lines.length, start + 24)).join('\n');
  const compact = window.replace(/\s+/g, ' ');
  const beginning = /beginning balance as of\s+\d{1,2}\/\d{1,2}\/\d{2,4}\s+\$?(-?[\d,]+\.\d{2})/i.exec(compact);
  const ending = /ending balance as of\s+\d{1,2}\/\d{1,2}\/\d{2,4}\s+\$?(-?[\d,]+\.\d{2})/i.exec(compact);
  const deposits = /\+\s*deposits and credits\s*\((\d+)\)\s+\$?(-?[\d,]+\.\d{2})/i.exec(compact);
  const interest = /\+\s*interest paid\s+\$?(-?[\d,]+\.\d{2})/i.exec(compact);
  const debits = /-\s*withdrawals and debits\s*\((\d+)\)\s+\$?(-?[\d,]+\.\d{2})/i.exec(compact);
  const account = /account number[:\s]+([0-9]+)/i.exec(compact);
  return {
    beginningBalance: beginning ? parseAmount(beginning[1]) : null,
    endingBalance: ending ? parseAmount(ending[1]) : null,
    deposits: deposits ? parseAmount(deposits[2]) : null,
    depositCount: deposits ? Number(deposits[1]) : null,
    interest: interest ? parseAmount(interest[1]) : null,
    debits: debits ? parseAmount(debits[2]) : null,
    debitCount: debits ? Number(debits[1]) : null,
    accountLast4: account ? account[1].slice(-4) : last4FromText(compact),
  };
}

export function extractFirstBankControls(text: string): StatementControlTotals[] {
  if (!isFirstBankStatement(text)) return [];
  const lines = text.split(/\r?\n/);
  const controls: StatementControlTotals[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < lines.length; i += 1) {
    const kind = parseSectionKind(lines[i] ?? '');
    if (!kind || isContinuationHeading(lines[i] ?? '')) continue;
    if (seen.has(kind)) continue;
    const block = readControlBlock(lines, i);
    if (block.deposits == null && block.interest == null && block.debits == null) continue;
    seen.add(kind);
    const deposits = block.deposits ?? 0;
    const interest = block.interest ?? 0;
    const incoming = roundMoney(deposits + interest);
    const interestRow = interest > 0 ? 1 : 0;
    controls.push({
      creditTotal: incoming,
      creditCount: (block.depositCount ?? 0) + interestRow,
      debitTotal: block.debits,
      beginningBalance: block.beginningBalance,
      endingBalance: block.endingBalance,
      accountLast4: block.accountLast4,
      accountLabel: sectionLabel(kind),
    });
  }
  return controls;
}
