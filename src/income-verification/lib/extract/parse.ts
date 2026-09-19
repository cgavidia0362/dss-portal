import {
  lastDayOfMonth,
  parseIsoDate,
  toIsoDate,
} from '../analysis/dates';
import { roundMoney } from '../analysis/money';

const MONTH_NAMES: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12,
  // Spanish (accented forms normalize via foldBankText)
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
};

const ENGLISH_MONTH_ALT =
  'January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec';

const SPANISH_MONTH_ALT =
  'Enero|Febrero|Marzo|Abril|Mayo|Junio|Julio|Agosto|Septiembre|Setiembre|Octubre|Noviembre|Diciembre';

const NAMED_MONTH_ALT = `${ENGLISH_MONTH_ALT}|${SPANISH_MONTH_ALT}`;

/** Fold accents/case for bank OCR text (DepÓsito → deposito). */
export function foldBankText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
}

export function parseAmount(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const negative = /^\(.*\)$/.test(trimmed) || trimmed.startsWith('-');
  const cleaned = trimmed.replace(/[^0-9.]/g, '');
  if (!cleaned || !/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;
  return roundMoney(negative ? -value : value);
}

function amountTokenPattern(): RegExp {
  return /-?\$?\(?\d{1,3}(?:,\d{3})+\.\d{2}\)?|-?\$?\(?\d+\.\d{2}\)?/g;
}

export function extractAmounts(line: string): number[] {
  // OCR sometimes inserts a space after a leading minus: "- 1,000.00"
  const normalized = line.replace(/-\s+(\$?\d)/g, '-$1');
  const matches = normalized.match(amountTokenPattern()) ?? [];
  return matches
    .map((match) => parseAmount(match))
    .filter((amount): amount is number => amount !== null && amount !== 0);
}

export function stripAmountTokens(line: string): string {
  return line.replace(amountTokenPattern(), ' ');
}

function expandYear(year: number): number {
  if (year >= 100) return year;
  return year >= 70 ? 1900 + year : 2000 + year;
}

export type StatementPeriod = { startDate: string; endDate: string };

/** Resolve MM/DD into an ISO date using the statement coverage window when present. */
export function resolveMonthDayDate(
  month: number,
  day: number,
  period?: StatementPeriod | null,
  contextYear?: number
): string | null {
  const candidates: number[] = [];
  if (period) {
    const startYear = parseIsoDate(period.startDate).getUTCFullYear();
    const endYear = parseIsoDate(period.endDate).getUTCFullYear();
    candidates.push(startYear);
    if (endYear !== startYear) candidates.push(endYear);
  } else if (contextYear != null) {
    candidates.push(contextYear);
  } else {
    candidates.push(new Date().getUTCFullYear());
  }

  const parsed: string[] = [];
  for (const year of candidates) {
    try {
      parsed.push(toIsoDate(year, month, day));
    } catch {
      // invalid calendar date for that year
    }
  }
  if (!parsed.length) return null;

  if (period) {
    const inRange = parsed.filter(
      (iso) => iso >= period.startDate && iso <= period.endDate
    );
    if (inRange.length === 1) return inRange[0];
    if (inRange.length > 1) return inRange[0];
  }

  return parsed[0];
}

export function parseFlexibleDate(
  raw: string,
  contextYear?: number,
  period?: StatementPeriod | null
): string | null {
  const value = raw.trim();

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (iso) {
    try {
      return toIsoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    } catch {
      return null;
    }
  }

  const numeric = /^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/.exec(value);
  if (numeric) {
    const month = Number(numeric[1]);
    const day = Number(numeric[2]);
    if (numeric[3]) {
      try {
        return toIsoDate(expandYear(Number(numeric[3])), month, day);
      } catch {
        return null;
      }
    }
    return resolveMonthDayDate(month, day, period, contextYear);
  }

  const named = new RegExp(
    `^(${NAMED_MONTH_ALT})\\s+(\\d{1,2}),?\\s+(\\d{4})$`,
    'i'
  ).exec(value);
  if (named) {
    const month = MONTH_NAMES[foldBankText(named[1])];
    if (!month) return null;
    try {
      return toIsoDate(Number(named[3]), month, Number(named[2]));
    } catch {
      return null;
    }
  }

  // "May 09" / "Jun 01" without year (community-bank ledgers).
  const namedDay = new RegExp(`^(${NAMED_MONTH_ALT})\\s+(\\d{1,2})$`, 'i').exec(
    value
  );
  if (namedDay) {
    const month = MONTH_NAMES[foldBankText(namedDay[1])];
    if (!month) return null;
    return resolveMonthDayDate(month, Number(namedDay[2]), period, contextYear);
  }

  return null;
}

export function extractDates(
  line: string,
  contextYear?: number,
  period?: StatementPeriod | null
): string[] {
  const dates: string[] = [];
  const patterns = [
    /\b\d{4}-\d{2}-\d{2}\b/g,
    /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g,
    new RegExp(`\\b(?:${NAMED_MONTH_ALT})\\s+\\d{1,2},?\\s+\\d{4}\\b`, 'gi'),
    // MM/DD without year (must not consume the MM/DD prefix of MM/DD/YYYY)
    /\b\d{1,2}\/\d{1,2}(?!\/\d)/g,
    /\b\d{1,2}-\d{1,2}(?!-\d)/g,
  ];

  for (const pattern of patterns) {
    for (const match of line.match(pattern) ?? []) {
      const parsed = parseFlexibleDate(match, contextYear, period);
      if (parsed && !dates.includes(parsed)) dates.push(parsed);
    }
  }

  return dates;
}

export function parseStatementPeriod(text: string): StatementPeriod | null {
  const normalized = text.replace(/\u2013|\u2014/g, '-');

  // Wells Fargo activity window: Beginning balance on M/D ... Ending balance on M/D
  // Prefer this over incidental "Fee period" date ranges later in the statement.
  const wfBalances =
    /beginning balance on\s+(\d{1,2}\/\d{1,2})\b[\s\S]{0,400}?ending balance on\s+(\d{1,2}\/\d{1,2})\b/i.exec(
      normalized
    );
  if (wfBalances) {
    const yearMatch =
      /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+(\d{4})\b/i.exec(
        text.slice(0, 2500)
      ) || /\b(20\d{2})\b/.exec(text.slice(0, 2500));
    const year = yearMatch ? Number(yearMatch[1]) : undefined;
    const start = parseFlexibleDate(wfBalances[1], year);
    const end = parseFlexibleDate(wfBalances[2], year);
    if (start && end && start <= end) return { startDate: start, endDate: end };
  }

  // Beginning / Ending Balance as of MM/DD/YY (community banks)
  const asOf =
    /beginning balance as of\s+(\d{1,2}\/\d{1,2}\/\d{2,4})[\s\S]{0,300}?ending balance as of\s+(\d{1,2}\/\d{1,2}\/\d{2,4})/i.exec(
      normalized
    );
  if (asOf) {
    const start = parseFlexibleDate(asOf[1]);
    const end = parseFlexibleDate(asOf[2]);
    if (start && end && start <= end) return { startDate: start, endDate: end };
  }

  // Lake Forest / community bank: Last Statement + Statement Ending
  const lastEnding =
    /last statement:\s*((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}|\d{1,2}\/\d{1,2}\/\d{2,4})\s*statement ending:\s*((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}|\d{1,2}\/\d{1,2}\/\d{2,4})/i.exec(
      normalized
    );
  if (lastEnding) {
    const start = parseFlexibleDate(lastEnding[1]);
    const end = parseFlexibleDate(lastEnding[2]);
    if (start && end && start <= end) return { startDate: start, endDate: end };
  }

  const namedRange = new RegExp(
    `(${NAMED_MONTH_ALT})\\s+(\\d{1,2}),?\\s+(\\d{4})\\s*(?:-|–|—|a|al|to|through)\\s*(${NAMED_MONTH_ALT})\\s+(\\d{1,2}),?\\s+(\\d{4})`,
    'i'
  );
  const namedMatch = namedRange.exec(normalized);
  if (namedMatch) {
    const start = parseFlexibleDate(
      `${namedMatch[1]} ${namedMatch[2]}, ${namedMatch[3]}`
    );
    const end = parseFlexibleDate(
      `${namedMatch[4]} ${namedMatch[5]}, ${namedMatch[6]}`
    );
    if (start && end && start <= end) return { startDate: start, endDate: end };
  }

  const patterns = [
    /statement\s+period[:\s]+(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\s*(?:-|to|through)\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i,
    /for\s+the\s+period\s+(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\s*(?:-|to|through)\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i,
    /period[:\s]+(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\s*(?:-|to|through)\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i,
    /(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\s*(?:-|to|through)\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(normalized);
    if (!match) continue;
    // Ignore fee-period ranges that are not the statement coverage window.
    const around = normalized.slice(
      Math.max(0, (match.index ?? 0) - 20),
      (match.index ?? 0) + match[0].length + 5
    );
    if (/fee\s+period/i.test(around)) continue;

    const start = parseFlexibleDate(match[1]);
    const end = parseFlexibleDate(match[2]);
    if (start && end && start <= end) return { startDate: start, endDate: end };
  }

  return null;
}

export function extractAccountLast4(text: string): string | null {
  const match =
    /account(?:\s+number|\s+no\.?)?[:\s#]*[xX*\-]*(\d{4})\b/i.exec(text) ||
    /account number:\s*\d+(\d{4})\b/i.exec(text) ||
    /\*{4,}(\d{4})\b/.exec(text) ||
    /\b(?:xxxx|XXXX|ending in)\s*(\d{4})\b/i.exec(text);
  return match?.[1] ?? null;
}

export function contextYearFromPeriod(period: StatementPeriod | null): number | undefined {
  if (!period) return undefined;
  return parseIsoDate(period.endDate).getUTCFullYear();
}

export function extractDepositControlTotal(
  text: string
): { count: number | null; total: number } | null {
  const compact = text.replace(/\s+/g, ' ');

  // PNC-style: "There were 5 Deposits and Other Additions totaling $455.00"
  const pnc =
    /there were\s+(\d+)\s+deposits(?:\s+and\s+other\s+additions)?\s+totaling\s+\$?([\d,]+\.\d{2})/i.exec(
      compact
    );
  if (pnc) {
    const count = Number(pnc[1]);
    const total = parseAmount(pnc[2]);
    if (Number.isFinite(count) && total != null) return { count, total };
  }

  // Bank of America detail footer: "Total deposits and other additions $3,026.00"
  const boaFooter =
    /total deposits and other additions\s+\$?([\d,]+\.\d{2})/i.exec(compact);
  if (boaFooter) {
    const total = parseAmount(boaFooter[1]);
    if (total != null) return { count: null, total };
  }

  // Navy Federal account summary:
  // Previous Balance | Deposits/Credits | Withdrawals/Debits | Ending Balance
  // Totals $818.21 $8,122.16 $8,285.54 $654.83 ...
  const nfcuTotals =
    /totals\s+\$?([\d,]+\.\d{2})\s+\$?([\d,]+\.\d{2})\s+\$?([\d,]+\.\d{2})\s+\$?([\d,]+\.\d{2})/i.exec(
      compact
    );
  if (nfcuTotals && /deposits\s*\/\s*credits|navy federal|nfcu|everyday checking/i.test(text)) {
    const total = parseAmount(nfcuTotals[2]);
    if (total != null) return { count: null, total };
  }

  // Navy Federal per-account row near summary: account $prev $credits $debits $ending
  const nfcuRow =
    /\b\d{6,}\s+\$?([\d,]+\.\d{2})\s+\$?([\d,]+\.\d{2})\s+\$?([\d,]+\.\d{2})\s+\$?([\d,]+\.\d{2})/i.exec(
      compact
    );
  if (
    nfcuRow &&
    /navy federal|nfcu|everyday checking|deposits\s*\/\s*credits/i.test(text.slice(0, 6000))
  ) {
    const total = parseAmount(nfcuRow[2]);
    if (total != null) return { count: null, total };
  }

  // Bank of America account summary (only when detail footer is absent).
  const boaSummary =
    /(?:^|[.!\n])\s*deposits and other additions\s+\$?([\d,]+\.\d{2})\b/i.exec(
      text.replace(/\r/g, '')
    ) ||
    /\bdeposits and other additions\s+\$?([\d,]+\.\d{2})\b/i.exec(compact);
  if (boaSummary) {
    const total = parseAmount(boaSummary[1]);
    if (total != null) return { count: null, total };
  }

  // Wells Fargo summary: Deposits/Additions 15,934.78
  const wf =
    /deposits\s*\/\s*additions\s+\$?([\d,]+\.\d{2})/i.exec(compact) ||
    /totals\s+\$?([\d,]+\.\d{2})\s+\$?([\d,]+\.\d{2})/i.exec(compact);
  if (wf && /wells fargo|deposits\s*\/\s*additions/i.test(text.slice(0, 8000))) {
    const total = parseAmount(wf[1]);
    if (total != null) return { count: null, total };
  }

  // Lake Forest / community: + Deposits and Credits (6) $2,078.51
  const lf =
    /\+?\s*deposits and credits\s*\((\d+)\)\s+\$?([\d,]+\.\d{2})/i.exec(compact);
  if (lf) {
    const count = Number(lf[1]);
    const total = parseAmount(lf[2]);
    if (Number.isFinite(count) && total != null) return { count, total };
  }

  // Chase Spanish / bilingual summary (single-account fallback).
  const chaseEs =
    /depositos y adiciones\s+\$?([\d,]+\.\d{2})/i.exec(foldBankText(compact));
  if (chaseEs) {
    const total = parseAmount(chaseEs[1]);
    if (total != null) return { count: null, total };
  }

  return null;
}

export type ChaseAccountDepositControl = {
  accountLast4: string | null;
  accountLabel: string;
  total: number;
};

/**
 * Per-account Chase "Depósitos y Adiciones" / "Deposits and other additions"
 * control totals. Checking and savings are kept separate.
 */
export function extractChaseAccountDepositControls(
  text: string
): ChaseAccountDepositControl[] {
  const lines = text.split(/\r?\n/);
  const controls: ChaseAccountDepositControl[] = [];

  const checkingMatch = /chase total checking\s+(\d+)/i.exec(text);
  const savingsMatch = /chase savings\s+(\d+)/i.exec(text);
  const checkingLast4 = checkingMatch?.[1].slice(-4) ?? null;
  const savingsLast4 = savingsMatch?.[1].slice(-4) ?? null;

  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i]?.trim() ?? '';
    const folded = foldBankText(trimmed);
    const depositTotal =
      /depositos y adiciones\s+\$?([\d,]+\.\d{2})/i.exec(folded) ||
      /deposits and other additions\s+\$?([\d,]+\.\d{2})/i.exec(trimmed);
    if (!depositTotal) continue;
    const total = parseAmount(depositTotal[1]);
    if (total == null) continue;

    const window = lines
      .slice(i, i + 40)
      .map((line) => foldBankText(line))
      .join('\n');

    let accountLabel = 'Chase Total Checking';
    let accountLast4 = checkingLast4;
    if (
      /resumen de cuenta de ahorros/.test(window) ||
      (/chase savings/.test(window) && !/resumen de cuenta de cheques/.test(window))
    ) {
      accountLabel = 'Chase Savings';
      accountLast4 = savingsLast4;
    } else if (/resumen de cuenta de cheques|chase total checking/.test(window)) {
      accountLabel = 'Chase Total Checking';
      accountLast4 = checkingLast4;
    } else if (controls.some((c) => c.accountLabel === 'Chase Total Checking')) {
      accountLabel = 'Chase Savings';
      accountLast4 = savingsLast4;
    }

    // Avoid double-counting identical account controls.
    if (
      controls.some(
        (c) => c.accountLabel === accountLabel && amountsEqualish(c.total, total)
      )
    ) {
      continue;
    }

    controls.push({ accountLast4, accountLabel, total });
  }

  return controls;
}

function amountsEqualish(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.005;
}

export function isFullCalendarMonth(startDate: string, endDate: string): boolean {
  const start = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);
  return (
    start.getUTCDate() === 1 &&
    start.getUTCFullYear() === end.getUTCFullYear() &&
    start.getUTCMonth() === end.getUTCMonth() &&
    end.getUTCDate() === lastDayOfMonth(end.getUTCFullYear(), end.getUTCMonth() + 1)
  );
}
