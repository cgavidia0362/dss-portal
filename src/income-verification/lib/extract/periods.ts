import {
  extractAccountLast4,
  extractChaseAccountDepositControls,
  extractDepositControlTotal,
  foldBankText,
  parseAmount,
  parseStatementPeriod,
  type StatementPeriod,
} from './parse';
import type { StatementControlTotals } from './documentModel';

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
    /beginning balance(?:\s+on|\s+as of)?[^$\d]{0,40}\$?(-?[\d,]+\.\d{2})/i.exec(compact);
  const ending =
    /ending balance(?:\s+on|\s+as of)?[^$\d]{0,40}\$?(-?[\d,]+\.\d{2})/i.exec(compact);
  return {
    beginningBalance: beginning ? parseAmount(beginning[1]) : null,
    endingBalance: ending ? parseAmount(ending[1]) : null,
  };
}

export function extractControlTotalsFromText(text: string): StatementControlTotals[] {
  const chase = extractChaseAccountDepositControls(text);
  const balances = extractBalanceControls(text);
  const debitTotal = extractDebitControlTotal(text);
  if (chase.length) {
    return chase.map((account) => ({
      creditTotal: account.total,
      creditCount: null,
      debitTotal,
      beginningBalance: balances.beginningBalance,
      endingBalance: balances.endingBalance,
      accountLast4: account.accountLast4,
      accountLabel: account.accountLabel,
    }));
  }

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
