import { analyzeIncome } from './pipeline';
import { calculateIncome } from './calculate';
import { classifyAmbiguousTransactions } from '../ai/classifyAmbiguous';
import { normalizeAmbiguousSources } from '../ai/normalizeSources';
import type { AnalyzeOptions, IncomeAnalysis, NormalizedTransaction, Transaction } from './types';

export async function analyzeExtractedTransactions(
  transactions: NormalizedTransaction[],
  options: AnalyzeOptions = {}
): Promise<IncomeAnalysis> {
  const initial = analyzeIncome(transactions, options);
  const [{ byId, warnings }, sourceResult] = await Promise.all([
    classifyAmbiguousTransactions(initial.transactions),
    normalizeAmbiguousSources(initial.transactions),
  ]);

  const mergedWarnings = [...initial.warnings, ...warnings, ...sourceResult.warnings];
  if (!byId.size && !sourceResult.byId.size) {
    return {
      ...initial,
      warnings: mergedWarnings,
    };
  }

  const merged: Transaction[] = initial.transactions.map((tx) => {
    const aiSource = tx.sourceConfidence < 0.7 ? sourceResult.byId.get(tx.id) : undefined;
    const normalizedSource = aiSource ?? tx.normalizedSource;
    return {
      ...tx,
      aiClassification: byId.get(tx.id) ?? tx.aiClassification,
      normalizedSource,
      detectedIncomeSource: normalizedSource,
      sourceConfidence: aiSource ? Math.max(tx.sourceConfidence, 0.75) : tx.sourceConfidence,
    };
  });

  return calculateIncome(merged, {
    coverage: initial.coverage,
    warnings: mergedWarnings,
    documentPeriods: options.documentPeriods,
    documentTexts: options.documentTexts,
    homeState: options.homeState ?? initial.locationReview.homeState,
    locationReview: initial.locationReview,
    printedDepositControlTotal: options.printedDepositControlTotal,
  });
}
