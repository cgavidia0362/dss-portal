import { coverageWarnings, buildCoverage } from './coverage';
import { monthKey, monthLabel } from './dates';
import { buildLocationReview, emptyLocationReview, normalizeStateCode } from './location';
import { addMoney, fromCents, toCents } from './money';
import { parseIncomeSource, primaryCategoryFromTotals } from './source';
import type {
  AnalyzeOptions,
  CategoryBreakdown,
  DepositCategory,
  DepositClassification,
  ExtractionTrustState,
  IncomeAnalysis,
  IncomeSourceBreakdown,
  MonthlyIncome,
  Transaction,
} from './types';

const CATEGORY_ORDER: DepositCategory[] = [
  'payroll',
  'p2p_transfer',
  'cash_deposit',
  'account_transfer',
  'check',
  'miscellaneous',
];

export function resolveFinalClassification(tx: Transaction): DepositClassification {
  if (tx.underwriterClassification) {
    return tx.underwriterClassification;
  }
  if (tx.aiClassification) {
    return tx.aiClassification;
  }
  return tx.ruleClassification;
}

export function resolveTransaction(tx: Transaction): Transaction {
  const finalClassification = resolveFinalClassification(tx);
  const isDeposit = tx.direction === 'in';
  const included =
    isDeposit &&
    !tx.duplicateOf &&
    (tx.inclusionSource === 'underwriter' ? tx.included : true);
  const parsed = tx.normalizedSource
    ? { source: tx.normalizedSource, confidence: tx.sourceConfidence ?? 0.5 }
    : parseIncomeSource(tx.description, tx.rawDescription);
  const normalizedSource = parsed.source || 'Unknown source';

  return {
    ...tx,
    detectedIncomeSource: normalizedSource,
    normalizedSource,
    sourceConfidence: parsed.confidence ?? tx.sourceConfidence ?? 0,
    finalClassification,
    included,
    inclusionSource: tx.duplicateOf ? 'duplicate' : tx.inclusionSource,
    includedAmount: included ? tx.amount : 0,
    exclusionReason: !included
      ? tx.duplicateOf
        ? tx.exclusionReason || 'Duplicate representation of the same deposit.'
        : tx.exclusionReason || (isDeposit ? 'Excluded by underwriter.' : 'Outgoing/debit is not a deposit.')
      : null,
  };
}

function emptyMonth(month: string): MonthlyIncome {
  return {
    month,
    label: monthLabel(month),
    includedTotal: 0,
    excludedTotal: 0,
    includedCount: 0,
    excludedCount: 0,
    completeness: 'unknown',
    partialReason: null,
    periodStartDate: null,
    periodEndDate: null,
    sourceDocuments: [],
    extractionTrust: undefined,
    reviewRequired: false,
  };
}

function emptyCategory(category: DepositCategory): CategoryBreakdown {
  return {
    category,
    monthly: {},
    total: 0,
    includedTotal: 0,
    excludedTotal: 0,
    count: 0,
    includedCount: 0,
    monthlyAverage: 0,
    percentOfTotal: 0,
    transactionIds: [],
  };
}

export function calculateIncome(
  transactions: Transaction[],
  options: AnalyzeOptions = {}
): IncomeAnalysis {
  const resolved = transactions.map(resolveTransaction);
  const coverage =
    options.coverage ??
    buildCoverage(resolved, options.documentPeriods, options.periodMonths);

  const monthMap = new Map<string, MonthlyIncome>();
  for (const covered of coverage.months) {
    monthMap.set(covered.month, {
      ...emptyMonth(covered.month),
      completeness: covered.completeness,
      partialReason: covered.partialReason,
      periodStartDate: covered.startDate,
      periodEndDate: covered.endDate,
      sourceDocuments: covered.sourceDocuments,
    });
  }

  for (const tx of resolved) {
    const key = monthKey(tx.date);
    if (!monthMap.has(key)) {
      monthMap.set(key, emptyMonth(key));
    }
  }

  let duplicateCount = 0;
  let duplicateAmount = 0;

  for (const tx of resolved) {
    if (tx.direction !== 'in') continue;
    if (tx.duplicateOf) {
      duplicateCount += 1;
      duplicateAmount = addMoney(duplicateAmount, tx.amount);
      continue;
    }

    const month = monthMap.get(monthKey(tx.date));
    if (!month) continue;

    if (tx.included) {
      month.includedTotal = addMoney(month.includedTotal, tx.amount);
      month.includedCount += 1;
    } else {
      month.excludedTotal = addMoney(month.excludedTotal, tx.amount);
      month.excludedCount += 1;
    }
  }

  const months = Array.from(monthMap.values()).sort((a, b) =>
    a.month.localeCompare(b.month)
  );

  applyMonthTrust(resolved, months);

  const sourceMap = new Map<string, IncomeSourceBreakdown>();
  const sourceCategoryTotals = new Map<string, Partial<Record<DepositCategory, number>>>();
  const categoryMap = new Map<DepositCategory, CategoryBreakdown>(
    CATEGORY_ORDER.map((category) => [category, emptyCategory(category)])
  );

  for (const tx of resolved) {
    if (tx.direction !== 'in') continue;
    if (tx.duplicateOf) continue;

    const key = monthKey(tx.date);
    const sourceName = tx.normalizedSource || tx.detectedIncomeSource || 'Unknown source';
    const existing = sourceMap.get(sourceName) ?? {
      source: sourceName,
      category: tx.finalClassification.category,
      monthly: {},
      count: 0,
      totalDeposits: 0,
      total: 0,
      monthlyAverage: 0,
      percentOfIncluded: 0,
      transactionIds: [],
    };
    existing.transactionIds.push(tx.id);
    existing.count += 1;
    existing.totalDeposits = addMoney(existing.totalDeposits, tx.amount);
    if (tx.included) {
      existing.monthly[key] = addMoney(existing.monthly[key] || 0, tx.amount);
      existing.total = addMoney(existing.total, tx.amount);
    }
    sourceMap.set(sourceName, existing);

    const categoryTotals = sourceCategoryTotals.get(sourceName) ?? {};
    categoryTotals[tx.finalClassification.category] = addMoney(
      categoryTotals[tx.finalClassification.category] || 0,
      tx.amount
    );
    sourceCategoryTotals.set(sourceName, categoryTotals);

    const category = categoryMap.get(tx.finalClassification.category) ?? emptyCategory(tx.finalClassification.category);
    category.transactionIds.push(tx.id);
    category.count += 1;
    category.total = addMoney(category.total, tx.amount);
    if (tx.included) {
      category.includedTotal = addMoney(category.includedTotal, tx.amount);
      category.includedCount += 1;
      category.monthly[key] = addMoney(category.monthly[key] || 0, tx.amount);
    } else {
      category.excludedTotal = addMoney(category.excludedTotal, tx.amount);
    }
    categoryMap.set(tx.finalClassification.category, category);
  }

  const includedDeposits = months.reduce(
    (sum, month) => addMoney(sum, month.includedTotal),
    0
  );
  const excludedDeposits = months.reduce(
    (sum, month) => addMoney(sum, month.excludedTotal),
    0
  );
  const totalDeposits = addMoney(includedDeposits, excludedDeposits);
  const coverageMonthCount = coverage.months.length || months.length;
  const untrustedMonths = months.filter((month) => isUntrustedTrust(month.extractionTrust));
  const verifiedMonths = months.filter((month) => !isUntrustedTrust(month.extractionTrust));
  const unverifiedIncludedTotal = untrustedMonths.reduce(
    (sum, month) => addMoney(sum, month.includedTotal),
    0
  );
  const verifiedIncludedTotal = verifiedMonths.reduce(
    (sum, month) => addMoney(sum, month.includedTotal),
    0
  );
  const verifiedMonthCount =
    untrustedMonths.length && verifiedMonths.length
      ? verifiedMonths.length
      : coverageMonthCount;
  const averageMonthlyIncluded =
    verifiedMonthCount === 0
      ? 0
      : fromCents(
          Math.round(
            toCents(
              untrustedMonths.length && verifiedMonths.length
                ? verifiedIncludedTotal
                : includedDeposits
            ) / verifiedMonthCount
          )
        );
  const extractionTrust = worstTrust(resolved.map((tx) => tx.extractionTrustState));

  const sources = Array.from(sourceMap.values())
    .map((source) => ({
      ...source,
      category: primaryCategoryFromTotals(sourceCategoryTotals.get(source.source) ?? {
        [source.category]: source.totalDeposits,
      }),
      monthlyAverage:
        coverageMonthCount === 0
          ? 0
          : fromCents(Math.round(toCents(source.total) / coverageMonthCount)),
      percentOfIncluded:
        includedDeposits === 0
          ? 0
          : Math.round((toCents(source.total) / toCents(includedDeposits)) * 1000) / 10,
    }))
    .sort((a, b) => toCents(b.total) - toCents(a.total));

  const categories = CATEGORY_ORDER.map((category) => {
    const item = categoryMap.get(category) ?? emptyCategory(category);
    return {
      ...item,
      monthlyAverage:
        coverageMonthCount === 0
          ? 0
          : fromCents(Math.round(toCents(item.includedTotal) / coverageMonthCount)),
      percentOfTotal:
        totalDeposits === 0
          ? 0
          : Math.round((toCents(item.total) / toCents(totalDeposits)) * 1000) / 10,
    };
  });

  const warnings = [
    ...(options.warnings ?? []),
    ...coverageWarnings(coverage).filter(
      (warning) =>
        !(options.warnings ?? []).some(
          (existing) =>
            existing.code === warning.code && existing.message === warning.message
        )
    ),
  ];

  if (
    untrustedMonths.length &&
    verifiedMonths.length &&
    !warnings.some((warning) => warning.code === 'segment_partial_failure')
  ) {
    warnings.push({
      code: 'segment_partial_failure',
      message:
        'Some statement periods could not be verified. Verified months are used for the average; unverified months are shown separately and require buyer review.',
    });
  }

  const homeState =
    normalizeStateCode(options.homeState ?? '') ??
    (options.documentPeriods ?? [])
      .map((period) => normalizeStateCode(period.homeState ?? ''))
      .find((state): state is string => Boolean(state)) ??
    null;

  const locationReview =
    options.locationReview ??
    (options.documentTexts?.length || homeState
      ? buildLocationReview({
          homeState,
          documentTexts: options.documentTexts,
          transactions: resolved,
        })
      : emptyLocationReview(homeState));

  return {
    transactions: resolved,
    months,
    sources,
    categories,
    totals: {
      totalDeposits,
      includedDeposits,
      excludedDeposits,
      averageMonthlyIncluded,
      monthsAnalyzed: coverageMonthCount,
      completeMonthsAnalyzed: coverage.completeMonthCount,
      partialMonthsAnalyzed: coverage.partialMonthCount,
      includedCount: months.reduce((sum, month) => sum + month.includedCount, 0),
      excludedCount: months.reduce((sum, month) => sum + month.excludedCount, 0),
      duplicateCount,
      duplicateAmount,
      verifiedMonthsAnalyzed: verifiedMonths.length,
      unverifiedIncludedTotal,
    },
    coverage,
    warnings,
    locationReview,
    extractionTrust,
  };
}

function isUntrustedTrust(trust: ExtractionTrustState | undefined): boolean {
  return trust === 'mismatch' || trust === 'incomplete_source';
}

function worstTrust(
  states: Array<ExtractionTrustState | undefined>
): ExtractionTrustState | undefined {
  if (states.includes('mismatch')) return 'mismatch';
  if (states.includes('incomplete_source')) return 'incomplete_source';
  if (states.includes('partial')) return 'partial';
  if (states.includes('verified')) return 'verified';
  return undefined;
}

function applyMonthTrust(transactions: Transaction[], months: MonthlyIncome[]) {
  for (const month of months) {
    const monthTxs = transactions.filter(
      (tx) => tx.direction === 'in' && !tx.duplicateOf && monthKey(tx.date) === month.month
    );
    const trust = worstTrust(monthTxs.map((tx) => tx.extractionTrustState));
    month.extractionTrust = trust;
    month.reviewRequired = isUntrustedTrust(trust);
  }
}
