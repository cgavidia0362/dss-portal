import {
  extractAccountLast4,
  extractChaseAccountDepositControls,
  extractChaseStackedBlockForDeposit,
  extractDepositControlTotal,
  foldBankText,
  parseAmount,
  parseStatementPeriod,
  type StatementPeriod,
} from './parse';
import type { StatementControlTotals, StatementDebitControls } from './documentModel';
import { roundMoney } from '../analysis/money';

const NAMED_MONTH =
  'January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|Enero|Febrero|Marzo|Abril|Mayo|Junio|Julio|Agosto|Septiembre|Setiembre|Octubre|Noviembre|Diciembre';

function uniquePeriods(periods: StatementPeriod[]): StatementPeriod[] {
  const seen = new Set<string>();
  const unique: StatementPeriod[] = [];
  for (const period of periods) {
    const key = `${period.startDate}:${period.endDate}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(period);
  }
  return unique;
}

/**
 * Find every distinct statement coverage window. A concatenated PDF may contain
 * several independent monthly statements; callers must not inherit dates from
 * the first window.
 */
export function parseAllStatementPeriods(text: string): StatementPeriod[] {
  const first = parseStatementPeriod(text);
  const periods: StatementPeriod[] = first ? [first] : [];
  const normalized = text.replace(/\u2013|\u2014/g, '-');

  const namedRange = new RegExp(
    `(${NAMED_MONTH})\\s+(\\d{1,2}),?\\s+(\\d{4})\\s*(?:-|–|—|a|al|to|through)\\s*(${NAMED_MONTH})\\s+(\\d{1,2}),?\\s+(\\d{4})`,
    'gi'
  );
  let named: RegExpExecArray | null;
  while ((named = namedRange.exec(normalized))) {
    const start = `${named[1]} ${named[2]}, ${named[3]}`;
    const end = `${named[4]} ${named[5]}, ${named[6]}`;
    const parsed = parseStatementPeriod(`${start} to ${end}`);
    if (parsed) periods.push(parsed);
  }

  const numericHeader =
    /(?:statement\s+period|for the period|period)[:\s]+(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\s*(?:-|to|through)\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/gi;
  let numeric: RegExpExecArray | null;
  while ((numeric = numericHeader.exec(normalized))) {
    const parsed = parseStatementPeriod(`${numeric[1]} to ${numeric[2]}`);
    if (parsed) periods.push(parsed);
  }

  return uniquePeriods(periods);
}

export function parsePeriodFromPageHeader(pageText: string): StatementPeriod | null {
  const header = pageText.slice(0, 1200);
  const periods = parseAllStatementPeriods(header);
  return periods[0] ?? parseStatementPeriod(header);
}

export function extractDebitControlTotal(text: string): number | null {
  const compact = text.replace(/\s+/g, ' ');
  const folded = foldBankText(compact);
  const patterns = [
    /there were\s+\d+\s+(?:banking(?:\s*\/\s*debit card)?\s+)?withdrawals[^.]*totaling\s+\$?([\d,]+\.\d{2})/i,
    /total (?:atm and debit card subtractions|other subtractions|withdrawals and other subtractions|service fees)\s+-?\$?([\d,]+\.\d{2})/i,
    /withdrawals\s*\/\s*subtractions\s+-?\$?([\d,]+\.\d{2})/i,
    /retiros de cajeros automaticos y compras con tarjeta de debito\s+-?\$?([\d,]+\.\d{2})/i,
    /retiros electronicos\s+-?\$?([\d,]+\.\d{2})/i,
    /-\s*withdrawals and debits\s*\(\d+\)\s+\$?([\d,]+\.\d{2})/i,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(compact) || pattern.exec(folded);
    if (!match) continue;
    const amount = parseAmount(match[1]);
    if (amount != null) return Math.abs(amount);
  }
  return null;
}

export function extractBalanceControls(text: string): {
  beginningBalance: number | null;
  endingBalance: number | null;
} {
  const compact = text.replace(/\s+/g, ' ');
  const beginning =
    /(?:beginning balance|saldo inicial)(?:\s+on|\s+as of)?[^$\d]{0,40}\$?(-?[\d,]+\.\d{2})/i.exec(
      compact
    );
  const ending =
    /(?:ending balance|saldo final)(?:\s+on|\s+as of)?[^$\d]{0,40}\$?(-?[\d,]+\.\d{2})/i.exec(
      compact
    );
  return {
    beginningBalance: beginning ? parseAmount(beginning[1]) : null,
    endingBalance: ending ? parseAmount(ending[1]) : null,
  };
}

const DEPOSIT_LABEL =
  /depositos y adiciones|deposits and other additions|\bdeposits and additions\b/i;
const TXN_START =
  /fecha\s+descripcion|date\s+description|detalle de transacciones|transaction detail/i;
const DATE_ROW = /^\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/;

function isCheckingAccountLabel(label: string | null | undefined): boolean {
  return /checking|cheques/i.test(label ?? '');
}

function findDepositControlLine(
  lines: string[],
  total: number,
  used: Set<number>
): number {
  for (let i = 0; i < lines.length; i += 1) {
    if (used.has(i)) continue;
    const folded = foldBankText(lines[i] ?? '');
    const match =
      /(?:depositos y adiciones|deposits and other additions|deposits and additions)\s+\$?([\d,]+\.\d{2})/i.exec(
        folded
      );
    if (!match) continue;
    const amount = parseAmount(match[1]);
    if (amount == null || Math.abs(amount - total) >= 0.005) continue;
    used.add(i);
    return i;
  }
  return -1;
}

function collectAccountSummaryWindow(
  lines: string[],
  startIndex: number,
  accountLabel: string
): string {
  if (startIndex < 0) return '';
  const checking = isCheckingAccountLabel(accountLabel);
  let begin = startIndex;
  while (begin > 0 && startIndex - begin < 25) {
    const raw = lines[begin - 1] ?? '';
    const folded = foldBankText(raw);
    if (!folded) {
      begin -= 1;
      continue;
    }
    if (TXN_START.test(folded) || DATE_ROW.test(raw.trim())) break;
    if (DEPOSIT_LABEL.test(folded) && begin - 1 !== startIndex) break;
    if (checking && /resumen de cuenta de ahorros/.test(folded)) break;
    if (!checking && /resumen de cuenta de cheques/.test(folded)) break;
    begin -= 1;
  }

  let end = startIndex + 1;
  while (end < lines.length && end - startIndex < 40) {
    const raw = lines[end] ?? '';
    const folded = foldBankText(raw);
    if (TXN_START.test(folded) || DATE_ROW.test(raw.trim())) break;
    if (DEPOSIT_LABEL.test(folded)) break;
    if (checking && (/resumen de cuenta de ahorros/.test(folded) || /^\s*chase savings\s*$/.test(folded))) {
      break;
    }
    end += 1;
  }

  return lines.slice(begin, end).join('\n');
}

export function extractAccountDebitControls(text: string): StatementDebitControls {
  const compact = foldBankText(text.replace(/\s+/g, ' '));
  const read = (pattern: RegExp): number | null => {
    const match = pattern.exec(compact);
    if (!match?.[1]) return null;
    const amount = parseAmount(match[1]);
    return amount == null ? null : Math.abs(amount);
  };

  return {
    atmAndDebitCard: read(
      /(?:atm\s*(?:&|and)\s*debit card withdrawals|retiros de cajeros automaticos(?: y compras con tarjeta de debito)?)\s+-?\$?([\d,]+\.\d{2})/i
    ),
    electronic: read(
      /(?:electronic withdrawals|retiros electronicos)\s+-?\$?([\d,]+\.\d{2})/i
    ),
    other: read(/(?:other withdrawals|otros retiros)\s+-?\$?([\d,]+\.\d{2})/i),
    fees: read(/(?:(?:total )?service fees|\bcargos\b)\s+-?\$?([\d,]+\.\d{2})/i),
  };
}

function sumDebitControls(parts: StatementDebitControls): number | null {
  const values = [
    parts.atmAndDebitCard,
    parts.electronic,
    parts.other,
    parts.fees,
  ].filter((value): value is number => value != null);
  if (!values.length) return null;
  return roundMoney(values.reduce((sum, value) => sum + value, 0));
}

export function extractChaseAccountStatementControls(text: string): StatementControlTotals[] {
  const deposits = extractChaseAccountDepositControls(text);
  if (!deposits.length) return [];
  const lines = text.split(/\r?\n/);
  const used = new Set<number>();

  return deposits.map((deposit) => {
    const lineIndex = findDepositControlLine(lines, deposit.total, used);
    const window = collectAccountSummaryWindow(lines, lineIndex, deposit.accountLabel);
    const debitControls = extractAccountDebitControls(window);
    let debitTotal = sumDebitControls(debitControls);
    const balances = extractBalanceControls(window);
    const stacked = extractChaseStackedBlockForDeposit(window || text, deposit.total);
    if (debitTotal == null) debitTotal = stacked?.debitTotal ?? null;
    return {
      creditTotal: deposit.total,
      creditCount: null,
      debitTotal,
      debitControls,
      beginningBalance: balances.beginningBalance ?? stacked?.beginningBalance ?? null,
      endingBalance: balances.endingBalance ?? stacked?.endingBalance ?? null,
      accountLast4: deposit.accountLast4,
      accountLabel: deposit.accountLabel,
    };
  });
}

export function extractControlTotalsFromText(text: string): StatementControlTotals[] {
  const chase = extractChaseAccountStatementControls(text);
  if (chase.length) return chase;

  const balances = extractBalanceControls(text);
  const debitTotal = extractDebitControlTotal(text);
  const deposit = extractDepositControlTotal(text);
  if (!deposit && debitTotal == null && balances.beginningBalance == null && balances.endingBalance == null) {
    return [];
  }

  return [
    {
      creditTotal: deposit?.total ?? null,
      creditCount: deposit?.count ?? null,
      debitTotal,
      beginningBalance: balances.beginningBalance,
      endingBalance: balances.endingBalance,
      accountLast4: extractAccountLast4(text),
      accountLabel: null,
    },
  ];
}
