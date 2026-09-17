import type { DepositCategory } from './types';

export const DEPOSIT_CATEGORY_LABELS: Record<DepositCategory, string> = {
  payroll: 'Payroll',
  p2p_transfer: 'P2P / Transfers',
  cash_deposit: 'Cash Deposits',
  account_transfer: 'Account Transfers',
  check: 'Checks',
  miscellaneous: 'Miscellaneous',
};

export const DEPOSIT_CATEGORIES: DepositCategory[] = [
  'payroll',
  'p2p_transfer',
  'cash_deposit',
  'account_transfer',
  'check',
  'miscellaneous',
];
