import type { InstitutionId } from './documentModel';
import { foldBankText } from './parse';

export type SourceCompletenessState = 'complete' | 'likely_incomplete' | 'unknown';

export interface PrintedPageLabel {
  page: number;
  of: number;
}

export interface SourceCompleteness {
  state: SourceCompletenessState;
  expectedPrintedPageCount: number | null;
  observedPrintedPages: number[];
  missingPrintedPages: number[];
  duplicatePrintedPages: number[];
  sequenceIntact: boolean;
}

export function emptySourceCompleteness(
  state: SourceCompletenessState = 'unknown'
): SourceCompleteness {
  return {
    state,
    expectedPrintedPageCount: null,
    observedPrintedPages: [],
    missingPrintedPages: [],
    duplicatePrintedPages: [],
    sequenceIntact: state !== 'likely_incomplete',
  };
}

export function parsePrintedPageLabel(text: string): PrintedPageLabel | null {
  const folded = foldBankText(text);
  const match =
    /\bpage\s+(\d+)\s+of\s+(\d+)\b/.exec(folded) ||
    /\bpagina\s+(\d+)\s+de\s+(\d+)\b/.exec(folded);
  if (!match) return null;
  const page = Number(match[1]);
  const of = Number(match[2]);
  if (!Number.isInteger(page) || !Number.isInteger(of) || page < 1 || of < 1) return null;
  return { page, of };
}

export function pageContentFingerprint(text: string): string {
  return foldBankText(text).replace(/\s+/g, ' ').trim().slice(0, 600);
}

export function pageDuplicateKey(params: {
  institution: InstitutionId;
  accountLast4: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  printedPage: number | null;
  text: string;
}): string | null {
  if (params.printedPage == null) return null;
  return [
    params.institution,
    params.accountLast4 ?? '',
    params.periodStart ?? '',
    params.periodEnd ?? '',
    String(params.printedPage),
    pageContentFingerprint(params.text),
  ].join('|');
}

export function assessSourceCompleteness(pages: string[]): SourceCompleteness {
  const labels = pages
    .map((text) => parsePrintedPageLabel(text))
    .filter((label): label is PrintedPageLabel => label != null);
  if (!labels.length) return emptySourceCompleteness('unknown');

  const expectedPrintedPageCount = mostCommonCount(labels.map((label) => label.of));
  const observedPrintedPages = labels.map((label) => label.page);
  const uniqueObserved = [...new Set(observedPrintedPages)].sort((a, b) => a - b);
  const counts = new Map<number, number>();
  for (const page of observedPrintedPages) {
    counts.set(page, (counts.get(page) ?? 0) + 1);
  }
  const duplicatePrintedPages = [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([page]) => page)
    .sort((a, b) => a - b);
  const missingPrintedPages =
    expectedPrintedPageCount == null
      ? []
      : Array.from({ length: expectedPrintedPageCount }, (_, index) => index + 1).filter(
          (page) => !uniqueObserved.includes(page)
        );
  const sequenceIntact =
    expectedPrintedPageCount != null &&
    missingPrintedPages.length === 0 &&
    duplicatePrintedPages.length === 0 &&
    uniqueObserved.length === expectedPrintedPageCount;
  const state: SourceCompletenessState =
    missingPrintedPages.length || duplicatePrintedPages.length ? 'likely_incomplete' : 'complete';

  return {
    state,
    expectedPrintedPageCount,
    observedPrintedPages,
    missingPrintedPages,
    duplicatePrintedPages,
    sequenceIntact,
  };
}

export function hasMissingPrintedPages(completeness: SourceCompleteness | undefined): boolean {
  return Boolean(completeness?.missingPrintedPages.length);
}

export function formatMissingPageList(pages: number[]): string {
  if (pages.length === 1) return String(pages[0]);
  if (pages.length === 2) return `${pages[0]} and ${pages[1]}`;
  return `${pages.slice(0, -1).join(', ')}, and ${pages[pages.length - 1]}`;
}

export function formatIncompleteSourceNote(params: {
  institution: InstitutionId;
  completeness: SourceCompleteness;
}): string {
  const missing = params.completeness.missingPrintedPages;
  const expected = params.completeness.expectedPrintedPageCount;
  if (missing.length === 1 && expected != null) {
    const prefix = params.institution === 'chase' ? 'Chase p' : 'P';
    return `Source statement appears incomplete. ${prefix}age ${missing[0]} of ${expected} is missing. Upload the complete statement to verify deposits.`;
  }
  if (missing.length && expected != null) {
    return `Source statement appears incomplete. Missing statement pages: ${formatMissingPageList(missing)} of ${expected}.`;
  }
  if (params.completeness.duplicatePrintedPages.length) {
    return `Source statement appears incomplete. Duplicate statement pages were detected. Upload the complete statement to verify deposits.`;
  }
  return 'Source statement appears incomplete. Upload the complete statement to verify deposits.';
}

function mostCommonCount(values: number[]): number | null {
  if (!values.length) return null;
  const counts = new Map<number, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0] ?? null;
}
