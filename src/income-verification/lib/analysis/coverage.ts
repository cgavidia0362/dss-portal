import {
  calendarMonthBounds,
  maxIsoDate,
  minIsoDate,
  monthLabel,
  monthsInInclusiveRange,
} from './dates';
import type {
  AnalysisCoverage,
  AnalysisWarning,
  CoverageMonth,
  DocumentPeriod,
  NormalizedTransaction,
  PeriodCompleteness,
} from './types';

function intersectRange(
  startA: string,
  endA: string,
  startB: string,
  endB: string
): { start: string; end: string } | null {
  const start = startA > startB ? startA : startB;
  const end = endA < endB ? endA : endB;
  return start <= end ? { start, end } : null;
}

function completenessForMonth(
  coveredStart: string,
  coveredEnd: string,
  calendarStart: string,
  calendarEnd: string,
  sources: Array<DocumentPeriod['source']>
): { completeness: PeriodCompleteness; partialReason: string | null } {
  const fullyCovered = coveredStart === calendarStart && coveredEnd === calendarEnd;
  const inferredOnly = sources.every(
    (source) => source === 'transaction_dates' || source === 'unknown'
  );

  if (inferredOnly) {
    return {
      completeness: 'unknown',
      partialReason: `Period ${coveredStart} to ${coveredEnd} was inferred from transaction dates, not a statement header.`,
    };
  }

  if (fullyCovered) {
    return { completeness: 'complete', partialReason: null };
  }

  return {
    completeness: 'partial',
    partialReason: `Covered ${coveredStart} to ${coveredEnd}; calendar month is ${calendarStart} to ${calendarEnd}.`,
  };
}

export function inferDocumentPeriod(
  documentName: string,
  transactions: Array<Pick<NormalizedTransaction, 'date' | 'sourceDocument' | 'sourceAccount'>>
): DocumentPeriod {
  const dates = transactions
    .filter((tx) => tx.sourceDocument === documentName)
    .map((tx) => tx.date);
  const account = transactions.find(
    (tx) => tx.sourceDocument === documentName && tx.sourceAccount
  )?.sourceAccount;

  return {
    documentName,
    startDate: minIsoDate(dates),
    endDate: maxIsoDate(dates),
    source: dates.length ? 'transaction_dates' : 'unknown',
    accountLast4: account ?? null,
  };
}

export function buildCoverage(
  transactions: Array<Pick<NormalizedTransaction, 'date' | 'sourceDocument' | 'sourceAccount'>>,
  documentPeriods: DocumentPeriod[] = [],
  periodMonths?: string[]
): AnalysisCoverage {
  const byDocument = new Map<string, DocumentPeriod>();

  for (const period of documentPeriods) {
    byDocument.set(period.documentName, period);
  }

  const documentNames = new Set([
    ...documentPeriods.map((period) => period.documentName),
    ...transactions.map((tx) => tx.sourceDocument),
  ]);

  for (const documentName of Array.from(documentNames)) {
    const existing = byDocument.get(documentName);
    if (!existing?.startDate || !existing.endDate) {
      const inferred = inferDocumentPeriod(documentName, transactions);
      byDocument.set(documentName, {
        documentName,
        startDate: existing?.startDate ?? inferred.startDate,
        endDate: existing?.endDate ?? inferred.endDate,
        source: existing?.startDate && existing.endDate ? existing.source : inferred.source,
        accountLast4: existing?.accountLast4 ?? inferred.accountLast4,
      });
    }
  }

  const usablePeriods = Array.from(byDocument.values()).filter(
    (period): period is DocumentPeriod & { startDate: string; endDate: string } =>
      Boolean(period.startDate && period.endDate)
  );

  const monthMap = new Map<
    string,
    { start: string; end: string; documents: string[]; sources: Array<DocumentPeriod['source']> }
  >();

  for (const period of usablePeriods) {
    for (const month of monthsInInclusiveRange(period.startDate, period.endDate)) {
      const calendar = calendarMonthBounds(month);
      const covered = intersectRange(
        period.startDate,
        period.endDate,
        calendar.start,
        calendar.end
      );
      if (!covered) continue;

      const existing = monthMap.get(month);
      if (!existing) {
        monthMap.set(month, {
          start: covered.start,
          end: covered.end,
          documents: [period.documentName],
          sources: [period.source],
        });
      } else {
        existing.start = existing.start < covered.start ? existing.start : covered.start;
        existing.end = existing.end > covered.end ? existing.end : covered.end;
        if (!existing.documents.includes(period.documentName)) {
          existing.documents.push(period.documentName);
        }
        existing.sources.push(period.source);
      }
    }
  }

  if (periodMonths?.length) {
    for (const month of periodMonths) {
      if (monthMap.has(month)) continue;
      const calendar = calendarMonthBounds(month);
      monthMap.set(month, {
        start: calendar.start,
        end: calendar.end,
        documents: [],
        sources: ['statement_header'],
      });
    }
  }

  const monthKeys = periodMonths?.length
    ? periodMonths
    : Array.from(monthMap.keys()).sort();

  const months: CoverageMonth[] = monthKeys.map((month) => {
    const calendar = calendarMonthBounds(month);
    const data = monthMap.get(month);
    const coveredStart = data?.start ?? calendar.start;
    const coveredEnd = data?.end ?? calendar.end;
    const { completeness, partialReason } = data
      ? completenessForMonth(
          coveredStart,
          coveredEnd,
          calendar.start,
          calendar.end,
          data.sources
        )
      : {
          completeness: 'unknown' as const,
          partialReason: 'Month is in the analysis period but no statement coverage was detected.',
        };

    return {
      month,
      label: monthLabel(month),
      startDate: coveredStart,
      endDate: coveredEnd,
      calendarStart: calendar.start,
      calendarEnd: calendar.end,
      completeness,
      partialReason,
      sourceDocuments: data?.documents ?? [],
    };
  });

  const startDate = minIsoDate(months.map((month) => month.startDate));
  const endDate = maxIsoDate(months.map((month) => month.endDate));

  return {
    startDate,
    endDate,
    months,
    completeMonthCount: months.filter((month) => month.completeness === 'complete').length,
    partialMonthCount: months.filter((month) => month.completeness === 'partial').length,
    unknownMonthCount: months.filter((month) => month.completeness === 'unknown').length,
  };
}

export function coverageWarnings(coverage: AnalysisCoverage): AnalysisWarning[] {
  return coverage.months
    .filter((month) => month.completeness !== 'complete')
    .map((month) => ({
      code: month.completeness === 'partial' ? 'partial_period' : 'unknown_period',
      message: `${month.label} is ${month.completeness === 'unknown' ? 'an' : 'a'} ${month.completeness} statement period. ${month.partialReason ?? ''}`.trim(),
      documentName: month.sourceDocuments[0],
    }));
}
