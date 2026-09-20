import { extractAccountLast4 } from './parse';
import type { DocumentType } from '../analysis/types';
import {
  detectDocumentType,
  detectInstitution,
  institutionHasKnownParser,
} from './detect';
import type {
  AccountSegment,
  DocumentPage,
  DocumentPreflight,
  InstitutionId,
  StatementSegment,
} from './documentModel';
import { pageLooksEmpty, textLooksEmpty } from './pdf';
import {
  extractControlTotalsFromText,
  parseAllStatementPeriods,
  parsePeriodFromPageHeader,
} from './periods';
import type { StatementPeriod } from './parse';
import {
  assessSourceCompleteness,
  parsePrintedPageLabel,
  pageDuplicateKey,
  type SourceCompletenessState,
} from './pageSequence';

const PAGE_ONE = /\bpage\s+1\s+of\s+\d+\b/i;

function usableChars(text: string): number {
  return text.replace(/\s+/g, '').length;
}

function discoverAccounts(text: string): string[] {
  const found = new Set<string>();
  const last4 = extractAccountLast4(text);
  if (last4) found.add(last4);
  const chase = text.match(/chase (?:total checking|savings)\s+(\d+)/gi) ?? [];
  for (const match of chase) {
    const digits = match.replace(/\D/g, '');
    if (digits.length >= 4) found.add(digits.slice(-4));
  }
  return [...found];
}

function samePeriod(a: StatementPeriod | null, b: StatementPeriod | null): boolean {
  if (!a || !b) return false;
  return a.startDate === b.startDate && a.endDate === b.endDate;
}

function looksLikeNewStatement(
  page: DocumentPage,
  currentPeriod: StatementPeriod | null,
  pagePeriod: StatementPeriod | null
): boolean {
  if (!pagePeriod) return false;
  if (!currentPeriod) return true;
  if (samePeriod(currentPeriod, pagePeriod)) return false;
  const head = page.text.slice(0, 800);
  return (
    PAGE_ONE.test(head) ||
    /jpmorgan chase|statement period|for the period|chase total checking|navy federal|bank of america|wells fargo|turbopass/i.test(
      head
    ) ||
    Boolean(pagePeriod)
  );
}

function buildAccounts(
  segmentId: string,
  text: string,
  pageStart: number,
  pageEnd: number
): AccountSegment[] {
  const controls = extractControlTotalsFromText(text);
  const accounts = controls
    .filter((control) => control.accountLast4 || control.accountLabel)
    .map((control, index) => ({
      id: `${segmentId}:acct:${control.accountLast4 ?? index}`,
      accountLast4: control.accountLast4,
      accountLabel: control.accountLabel,
      pageStart,
      pageEnd,
      controls: control,
    }));
  if (accounts.length) return accounts;
  const last4 = extractAccountLast4(text);
  if (!last4) return [];
  return [
    {
      id: `${segmentId}:acct:${last4}`,
      accountLast4: last4,
      accountLabel: null,
      pageStart,
      pageEnd,
      controls: {
        creditTotal: null,
        creditCount: null,
        debitTotal: null,
        beginningBalance: null,
        endingBalance: null,
        accountLast4: last4,
        accountLabel: null,
      },
    },
  ];
}

function annotatePage(page: DocumentPage): DocumentPage {
  const label = parsePrintedPageLabel(page.text);
  return {
    ...page,
    printedPage: label?.page ?? null,
    printedPageCount: label?.of ?? null,
    duplicateOfPage: page.duplicateOfPage ?? null,
  };
}

function duplicateKeyForPage(page: DocumentPage, institution: InstitutionId): string | null {
  const period = page.imageOnly ? null : parsePeriodFromPageHeader(page.text);
  return pageDuplicateKey({
    institution,
    accountLast4: extractAccountLast4(page.text),
    periodStart: period?.startDate ?? null,
    periodEnd: period?.endDate ?? null,
    printedPage: page.printedPage ?? parsePrintedPageLabel(page.text)?.page ?? null,
    text: page.text,
  });
}

function toSegment(params: {
  fileName: string;
  index: number;
  pages: DocumentPage[];
  institution: InstitutionId;
  documentType: DocumentType;
}): StatementSegment {
  const sourceCompleteness = assessSourceCompleteness(params.pages.map((page) => page.text));
  const extractionPages = params.pages.filter((page) => !page.duplicateOfPage);
  const pages = extractionPages.length ? extractionPages : params.pages;
  const pageNumbers = pages.map((page) => page.pageNumber);
  const text = pages.map((page) => page.text).join('\n');
  const period =
    parsePeriodFromPageHeader(pages[0]?.text ?? '') ??
    parseAllStatementPeriods(text)[0] ??
    null;
  const imageOnly = pages.every((page) => page.imageOnly);
  const institution = imageOnly
    ? detectInstitution(params.fileName, `${params.fileName}\n${text}`)
    : detectInstitution(params.fileName, text);
  const documentType = detectDocumentType(params.fileName, text || params.fileName);
  const id = `${params.fileName}:stmt:${params.index}:${pageNumbers[0] ?? 1}-${pageNumbers[pageNumbers.length - 1] ?? 1}`;
  return {
    id,
    fileName: params.fileName,
    index: params.index,
    pageStart: pageNumbers[0] ?? 1,
    pageEnd: pageNumbers[pageNumbers.length - 1] ?? 1,
    pageNumbers,
    pageTexts: pages.map((page) => ({ pageNumber: page.pageNumber, text: page.text })),
    text,
    period,
    institution,
    documentType,
    knownParser: institutionHasKnownParser(institution) && !imageOnly,
    imageOnly,
    accounts: buildAccounts(id, text, pageNumbers[0] ?? 1, pageNumbers[pageNumbers.length - 1] ?? 1),
    controls: extractControlTotalsFromText(text),
    sourceCompleteness,
  };
}

function rollupSourceCompleteness(segments: StatementSegment[]): SourceCompletenessState {
  if (segments.some((segment) => segment.sourceCompleteness.state === 'likely_incomplete')) {
    return 'likely_incomplete';
  }
  if (segments.some((segment) => segment.sourceCompleteness.state === 'complete')) {
    return 'complete';
  }
  return 'unknown';
}

export function segmentPages(params: {
  fileName: string;
  pages: DocumentPage[];
  institution: InstitutionId;
  documentType: DocumentType;
}): StatementSegment[] {
  if (!params.pages.length) {
    return [
      toSegment({
        fileName: params.fileName,
        index: 0,
        pages: [
          {
            pageNumber: 1,
            text: '',
            usableChars: 0,
            imageOnly: true,
          },
        ],
        institution: params.institution,
        documentType: params.documentType,
      }),
    ];
  }

  const seenKeys = new Set<string>();
  const groups: DocumentPage[][] = [];
  let current: DocumentPage[] = [];
  let currentPeriod: StatementPeriod | null = null;

  const appendToMatchingGroup = (page: DocumentPage, period: StatementPeriod | null) => {
    if (current.length && samePeriod(currentPeriod, period)) {
      current.push(page);
      return;
    }
    const match = groups.find((group) =>
      samePeriod(parsePeriodFromPageHeader(group[0]?.text ?? ''), period)
    );
    if (match) {
      match.push(page);
      return;
    }
    if (current.length) current.push(page);
  };

  for (const raw of params.pages) {
    const page = annotatePage(raw);
    const pagePeriod = page.imageOnly ? null : parsePeriodFromPageHeader(page.text);
    const key = duplicateKeyForPage(page, params.institution);
    const duplicate = Boolean(key && seenKeys.has(key));
    if (key) seenKeys.add(key);
    if (duplicate) {
      appendToMatchingGroup({ ...page, duplicateOfPage: page.printedPage ?? page.pageNumber }, pagePeriod);
      continue;
    }
    if (current.length && looksLikeNewStatement(page, currentPeriod, pagePeriod)) {
      groups.push(current);
      current = [page];
      currentPeriod = pagePeriod;
      continue;
    }
    current.push(page);
    if (pagePeriod) currentPeriod = pagePeriod;
  }
  if (current.length) groups.push(current);

  return groups.map((pages, index) =>
    toSegment({
      fileName: params.fileName,
      index,
      pages,
      institution: params.institution,
      documentType: params.documentType,
    })
  );
}

export function buildPreflight(params: {
  fileName: string;
  pages: string[];
  text?: string;
}): DocumentPreflight {
  const pages: DocumentPage[] = (params.pages.length ? params.pages : [params.text ?? '']).map(
    (text, index) => {
      const chars = usableChars(text);
      const label = parsePrintedPageLabel(text);
      return {
        pageNumber: index + 1,
        text,
        usableChars: chars,
        imageOnly: pageLooksEmpty(text),
        printedPage: label?.page ?? null,
        printedPageCount: label?.of ?? null,
      };
    }
  );
  const mergedText = params.text ?? pages.map((page) => page.text).join('\n');
  const imageOnly = pages.every((page) => page.imageOnly) || textLooksEmpty(mergedText);
  const institution = detectInstitution(params.fileName, imageOnly ? params.fileName : mergedText);
  const documentType = detectDocumentType(params.fileName, imageOnly ? params.fileName : mergedText);
  const segments = segmentPages({
    fileName: params.fileName,
    pages,
    institution,
    documentType,
  });

  return {
    fileName: params.fileName,
    pageCount: pages.length,
    pages,
    imageOnly,
    institution,
    documentType,
    knownParser: institutionHasKnownParser(institution) && !imageOnly,
    statementPeriods: parseAllStatementPeriods(mergedText),
    accountLast4s: discoverAccounts(mergedText),
    controls: extractControlTotalsFromText(mergedText),
    segments,
    usableTextChars: usableChars(mergedText),
    sourceCompletenessState: rollupSourceCompleteness(segments),
  };
}
