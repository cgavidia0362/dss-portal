import type { NormalizedTransaction } from '../analysis/types';
import { normalizeCandidateDescription } from './candidates';
import type { StatementSegment } from './documentModel';
import { contextYearFromPeriod, foldBankText, parseFlexibleDate, stripAmountTokens } from './parse';

const CREDIT_HINT =
  /zelle payment from|zelle from|zel from|deposito|deposit|payroll|online transfer from|reversal|atm cash deposit|mobile deposit|payment received|dailypay/i;
const DATE_START = /^(\d{1,2}\/\d{1,2})(?:\s+(.+))?$/;

export function contiguousPageRanges(pages: number[]): number[][] {
  const sorted = [...new Set(pages)].sort((a, b) => a - b);
  if (!sorted.length) return [];
  const ranges: number[][] = [];
  let current = [sorted[0]!];
  for (let index = 1; index < sorted.length; index += 1) {
    const page = sorted[index]!;
    if (page === current[current.length - 1]! + 1) {
      current.push(page);
    } else {
      ranges.push(current);
      current = [page];
    }
  }
  ranges.push(current);
  return ranges;
}

export function detectUnresolvedPages(
  segment: StatementSegment,
  transactions: NormalizedTransaction[]
): number[] {
  const incomplete = new Set(
    transactions
      .filter((tx) => tx.extractionConflict || tx.amountSource === 'balance_delta_reconstructed' && tx.extractionConflict)
      .map((tx) => tx.page)
      .filter((page): page is number => page != null)
  );

  const extracted = new Set(
    transactions
      .filter((tx) => tx.direction === 'in')
      .map((tx) => `${tx.date}|${normalizeCandidateDescription(tx.description)}`)
  );
  const year = contextYearFromPeriod(segment.period);
  const unmatched = new Set<number>();

  for (const page of segment.pageTexts ?? []) {
    for (const raw of page.text.split(/\r?\n/)) {
      const line = raw.trim();
      const match = DATE_START.exec(line);
      if (!match) continue;
      const description = stripAmountTokens(match[2] ?? '');
      if (!CREDIT_HINT.test(foldBankText(`${description} ${line}`))) continue;
      const date = parseFlexibleDate(match[1], year, segment.period);
      if (!date) continue;
      const key = `${date}|${normalizeCandidateDescription(description || line)}`;
      if (!extracted.has(key)) unmatched.add(page.pageNumber);
    }
  }

  const localized = [...new Set([...incomplete, ...unmatched])].sort((a, b) => a - b);
  if (localized.length) {
    return localized.filter((page) => segment.pageNumbers.includes(page));
  }
  return [...segment.pageNumbers];
}
