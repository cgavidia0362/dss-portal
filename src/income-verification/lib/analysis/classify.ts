import { normalizeText } from './source';
import type { DepositCategory, DepositClassification, NormalizedTransaction } from './types';

const PAYROLL_MARKERS = [
  'PAYROLL',
  'DIRECT DEP',
  'DIRECT DEPOSIT',
  'ADP',
  'PAYCHEX',
  'GUSTO',
  'CERIDIAN',
  'KRONOS',
  'PAYLOCITY',
  'HEARTLAND',
  'BAMBOOHR',
  'RIPPLING',
  'TRINET',
  'JUSTWORKS',
  'DANDELION PAYMEN',
  'DAILYPAY',
  'PAYACTIV',
];

const P2P_MARKERS = [
  'ZELLE',
  'ZEL FROM',
  'CASH APP',
  'CASHAPP',
  'SQ CASH',
  'VENMO',
  'APPLE CASH',
  'APPLE PAY',
];

const TRANSFER_MARKERS = [
  'TRANSFER FROM SAVINGS',
  'TRANSFER TO SAVINGS',
  'INTERNAL TRANSFER',
  'TRANSFER FROM CHECKING',
  'TRANSFER TO CHECKING',
  'ONLINE TRANSFER FROM',
  'ONLINE TRANSFER TO',
  'FUNDS TRANSFER FRM',
  'FUNDS TRANSFER FROM',
  'FUNDS TRANSFER TO',
  'ACCTVERIFY',
  'EXTERNAL TRANSFER',
];

const CASH_MARKERS = ['ATM DEPOSIT', 'ATM CASH DEPOSIT', 'CASH DEPOSIT', 'BRANCH DEPOSIT'];

const CHECK_MARKERS = ['MOBILE DEPOSIT', 'CHECK DEPOSIT', 'REMOTE DEPOSIT'];

const REFUND_MARKERS = [
  'PURCHASE REFUND',
  'REFUND',
  'REVERSAL',
  'CHARGEBACK',
  'TEMPORARY CREDIT ADJUSTMENT',
  'CREDIT ADJUSTMENT',
  'RETURNED',
];
function makeClassification(
  category: DepositCategory,
  subcategory: string | null,
  reason: string,
  confidence: number
): DepositClassification {
  return {
    category,
    subcategory,
    source: 'rule',
    confidence,
    reason,
  };
}

function containsAny(text: string, markers: string[]): boolean {
  const padded = ` ${text} `;
  return markers.some((marker) => padded.includes(` ${marker} `) || text.includes(marker));
}

function p2pSubcategory(text: string): string {
  if (text.includes('ZELLE') || /\bZEL FROM\b/.test(text)) return 'zelle';
  if (text.includes('CASH APP') || text.includes('CASHAPP') || text.includes('SQ CASH')) {
    return 'cash_app';
  }
  if (text.includes('VENMO')) return 'venmo';
  if (text.includes('APPLE CASH') || text.includes('APPLE PAY')) return 'apple_cash';
  return 'p2p';
}

export function classifyTransaction(tx: NormalizedTransaction): DepositClassification {
  if (tx.direction === 'out') {
    return makeClassification(
      'miscellaneous',
      'outgoing',
      'Outgoing/debit transaction is not a deposit.',
      0.99
    );
  }

  const text = normalizeText(tx.rawDescription || tx.description);
  const category = tx.turbopassCategory;

  if (category === 'IncomePayroll') {
    return makeClassification(
      'payroll',
      'income_payroll',
      'TurboPass labeled this row as IncomePayroll.',
      0.9
    );
  }

  if (category === 'P2PCredits') {
    return makeClassification(
      'p2p_transfer',
      p2pSubcategory(text),
      'TurboPass labeled this row as a P2P credit.',
      0.9
    );
  }

  if (category === 'ATMDeposits') {
    return makeClassification(
      'cash_deposit',
      'atm_deposit',
      'TurboPass labeled this row as an ATM/cash deposit.',
      0.9
    );
  }

  if (category === 'Internal Transfers' || category === 'External Transfers') {
    return makeClassification(
      'account_transfer',
      category === 'External Transfers' ? 'external_transfer' : 'internal_transfer',
      `TurboPass labeled this row as ${category}.`,
      0.9
    );
  }

  if (category === 'Refunds') {
    return makeClassification(
      'miscellaneous',
      'refund',
      'TurboPass labeled this row as a refund.',
      0.88
    );
  }

  if (category === 'Loan Advances') {
    return makeClassification(
      'miscellaneous',
      'loan_proceeds',
      'TurboPass labeled this row as a loan advance.',
      0.88
    );
  }

  if (category === 'MiscCredits') {
    return makeClassification(
      'miscellaneous',
      'misc_credit',
      'TurboPass labeled this row as a miscellaneous credit.',
      0.8
    );
  }

  if (containsAny(text, P2P_MARKERS)) {
    return makeClassification(
      'p2p_transfer',
      p2pSubcategory(text),
      'Person-to-person payment service markers were found in the description.',
      0.9
    );
  }

  if (
    containsAny(text, CASH_MARKERS) ||
    (/\bATM\b/.test(text) && /\bDEPOSIT\b/.test(text))
  ) {
    return makeClassification(
      'cash_deposit',
      'atm_deposit',
      'ATM/branch cash deposit markers were found in the description.',
      0.9
    );
  }

  if (containsAny(text, CHECK_MARKERS)) {
    return makeClassification(
      'check',
      'mobile_deposit',
      'Check/mobile deposit markers were found in the description.',
      0.88
    );
  }

  if (containsAny(text, TRANSFER_MARKERS) || text.includes('TRANSFER FROM SAVINGS')) {
    const subcategory = text.includes('SAVINGS')
      ? 'savings_transfer'
      : text.includes('ACCTVERIFY')
        ? 'account_verify'
        : 'account_transfer';
    return makeClassification(
      'account_transfer',
      subcategory,
      'Description indicates a transfer between accounts.',
      0.9
    );
  }

  if (containsAny(text, PAYROLL_MARKERS) || /\bPPD\b/.test(text)) {
    return makeClassification(
      'payroll',
      'payroll',
      'Payroll/direct-deposit markers were found in the description.',
      0.92
    );
  }

  if (containsAny(text, REFUND_MARKERS)) {
    const subcategory = text.includes('REVERSAL') || text.includes('CHARGEBACK')
      ? 'reversal'
      : text.includes('RETURNED')
        ? 'returned_item'
        : 'refund';
    return makeClassification(
      'miscellaneous',
      subcategory,
      'Description indicates a refund, reversal, or returned item.',
      0.86
    );
  }

  if (category === 'General Deposit') {
    return makeClassification(
      'miscellaneous',
      'general_deposit',
      'TurboPass general deposit without a more specific category marker.',
      0.55
    );
  }

  return makeClassification(
    'miscellaneous',
    'uncategorized',
    'Incoming deposit did not match a more specific category.',
    0.4
  );
}
