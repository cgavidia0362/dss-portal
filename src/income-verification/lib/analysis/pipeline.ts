import { calculateIncome, resolveTransaction } from './calculate';
import { classifyTransaction } from './classify';
import { detectDuplicates } from './duplicates';
import { parseIncomeSource } from './source';
import { detectTransfers } from './transfers';
import type {
  AnalyzeOptions,
  IncomeAnalysis,
  NormalizedTransaction,
  Transaction,
} from './types';

function toDraft(tx: NormalizedTransaction): Transaction {
  const ruleClassification = classifyTransaction(tx);
  const parsed = parseIncomeSource(tx.description, tx.rawDescription);
  return {
    ...tx,
    detectedIncomeSource: parsed.source,
    normalizedSource: parsed.source,
    sourceConfidence: parsed.confidence,
    turbopassCategory: tx.turbopassCategory ?? null,
    ruleClassification,
    aiClassification: null,
    underwriterClassification: null,
    finalClassification: ruleClassification,
    included: tx.direction === 'in',
    inclusionSource: 'default',
    includedAmount: tx.direction === 'in' ? tx.amount : 0,
    exclusionReason: null,
    duplicateOf: null,
    transferMatch: null,
  };
}

export function analyzeIncome(
  input: NormalizedTransaction[],
  options: AnalyzeOptions = {}
): IncomeAnalysis {
  const drafted = input.map(toDraft);
  const withDuplicates = detectDuplicates(drafted);
  const withTransfers = detectTransfers(withDuplicates).map(resolveTransaction);
  return calculateIncome(withTransfers, options);
}
