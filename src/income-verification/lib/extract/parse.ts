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
};

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
  const matches = line.match(amountTokenPattern()) ?? [];
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

  const named =
    /^(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+(\d{1,2}),?\s+(\d{4})$/i.exec(
      value
    );
  if (named) {
    const month = MONTH_NAMES[named[1].toLowerCase()];
    try {
      return toIsoDate(Number(named[3]), month, Number(named[2]));
    } catch {
      return null;
    }
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
    /\b(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+\d{1,2},?\s+\d{4}\b/gi,
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
  const patterns = [
    /statement\s+period[:\s]+(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\s*(?:-|to|through)\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i,
    /for\s+the\s+period\s+(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\s*(?:-|to|through)\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i,
    /period[:\s]+(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\s*(?:-|to|through)\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i,
    /(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\s*(?:-|to|through)\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/,
    /(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\s*(?:-|to|through)\s*(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}/i,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(normalized);
    if (!match) continue;

    if (match[1] && match[2] && MONTH_NAMES[match[1].toLowerCase()]) {
      const start = parseFlexibleDate(match[0].split(/-|to|through/i)[0].trim());
      const end = parseFlexibleDate(match[0].split(/-|to|through/i).pop()!.trim());
      if (start && end && start <= end) return { startDate: start, endDate: end };
      continue;
    }

    const start = parseFlexibleDate(match[1]);
    const end = parseFlexibleDate(match[2]);
    if (start && end && start <= end) return { startDate: start, endDate: end };
  }

  return null;
}

export function extractAccountLast4(text: string): string | null {
  const match =
    /account(?:\s+number|\s+no\.?)?[:\s#]*[xX*\-]*(\d{4})\b/i.exec(text) ||
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

  return null;
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
