import { calculateIncome } from './calculate';
import type {
  AnalyzeOptions,
  DepositCategory,
  DepositClassification,
  IncomeAnalysis,
  Transaction,
} from './types';

function recalculate(
  analysis: IncomeAnalysis,
  transactions: Transaction[],
  options?: AnalyzeOptions
): IncomeAnalysis {
  return calculateIncome(transactions, {
    coverage: options?.coverage ?? analysis.coverage,
    documentPeriods: options?.documentPeriods,
    periodMonths: options?.periodMonths,
    warnings: options?.warnings ?? analysis.warnings,
    locationReview: options?.locationReview ?? analysis.locationReview,
    homeState: options?.homeState ?? analysis.locationReview.homeState,
    documentTexts: options?.documentTexts,
  });
}

export function applyInclusion(
  analysis: IncomeAnalysis,
  transactionId: string,
  included: boolean,
  reason?: string,
  options?: AnalyzeOptions
): IncomeAnalysis {
  if (!analysis.transactions.some((tx) => tx.id === transactionId)) {
    throw new Error(`Transaction not found: ${transactionId}`);
  }

  const transactions = analysis.transactions.map((tx) => {
    if (tx.id !== transactionId || tx.direction !== 'in' || tx.duplicateOf) return tx;
    return {
      ...tx,
      included,
      inclusionSource: 'underwriter' as const,
      exclusionReason: included ? null : reason || 'Excluded by underwriter.',
    };
  });

  return recalculate(analysis, transactions, options);
}

export function applyCategoryOverride(
  analysis: IncomeAnalysis,
  transactionId: string,
  category: DepositCategory,
  reason?: string,
  options?: AnalyzeOptions
): IncomeAnalysis {
  if (!analysis.transactions.some((tx) => tx.id === transactionId)) {
    throw new Error(`Transaction not found: ${transactionId}`);
  }

  const classification: DepositClassification = {
    category,
    subcategory: 'underwriter',
    source: 'underwriter',
    confidence: 1,
    reason: reason || 'Category changed by underwriter.',
  };

  const transactions = analysis.transactions.map((tx) => {
    if (tx.id !== transactionId) return tx;
    return {
      ...tx,
      underwriterClassification: classification,
    };
  });

  return recalculate(analysis, transactions, options);
}

export function applyCategoryInclusion(
  analysis: IncomeAnalysis,
  category: DepositCategory,
  included: boolean,
  options?: AnalyzeOptions
): IncomeAnalysis {
  const transactions = analysis.transactions.map((tx) => {
    if (tx.direction !== 'in') return tx;
    if (tx.duplicateOf && tx.inclusionSource === 'duplicate') return tx;
    if (tx.finalClassification.category !== category) return tx;
    return {
      ...tx,
      included,
      inclusionSource: 'underwriter' as const,
      exclusionReason: included ? null : `Excluded all ${category} deposits.`,
    };
  });

  return recalculate(analysis, transactions, options);
}

export function applySourceInclusion(
  analysis: IncomeAnalysis,
  source: string,
  included: boolean,
  options?: AnalyzeOptions
): IncomeAnalysis {
  const transactions = analysis.transactions.map((tx) => {
    if (tx.direction !== 'in') return tx;
    if (tx.duplicateOf && tx.inclusionSource === 'duplicate') return tx;
    if ((tx.normalizedSource || tx.detectedIncomeSource || 'Unknown source') !== source) return tx;
    return {
      ...tx,
      included,
      inclusionSource: 'underwriter' as const,
      exclusionReason: included ? null : `Excluded all deposits from ${source}.`,
    };
  });

  return recalculate(analysis, transactions, options);
}
