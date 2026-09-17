import type { DepositCategory, DepositClassification, Transaction } from '../analysis/types';

const VALID_CATEGORIES = new Set<DepositCategory>([
  'payroll',
  'p2p_transfer',
  'cash_deposit',
  'account_transfer',
  'check',
  'miscellaneous',
]);

export function isValidDepositCategory(value: string): value is DepositCategory {
  return VALID_CATEGORIES.has(value as DepositCategory);
}

export function classificationFromModel(
  category: DepositCategory,
  reason: string,
  confidence: number,
  subcategory?: string | null
): DepositClassification {
  return {
    category,
    subcategory: subcategory ?? 'ai',
    source: 'ai',
    confidence,
    reason,
  };
}

export function ambiguousPayload(transactions: Transaction[]) {
  return transactions.map((tx) => ({
    id: tx.id,
    date: tx.date,
    description: tx.description,
    amount: tx.amount,
    direction: tx.direction,
    documentType: tx.sourceDocumentType,
    turbopassCategory: tx.turbopassCategory,
    ruleCategory: tx.ruleClassification.category,
    ruleSubcategory: tx.ruleClassification.subcategory,
    ruleReason: tx.ruleClassification.reason,
  }));
}
