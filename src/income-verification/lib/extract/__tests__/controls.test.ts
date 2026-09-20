import { describe, expect, it } from 'vitest';
import { extractChaseAccountStatementControls } from '../periods';

const CHASE_MULTI_ACCOUNT = `
JPMorgan Chase Bank, N.A.
Julio 16, 2026 a Agosto 17, 2026
Chase Total Checking 000000711309999 -$4.21 $100.00
Chase Savings 000005070665888 30.00 80.00
Depósitos y Adiciones 8,776.00
Retiros de cajeros automáticos y
compras con tarjeta de débito -3,924.85
Retiros Electrónicos -1,000.00
Otros retiros -25.00
Cargos -15.00
CHASE TOTAL CHECKING
RESUMEN DE CUENTA DE CHEQUES
000000711309999
FECHA DESCRIPCIÓN CANTIDAD SALDO
07/21 Zelle Payment From Avery Example 50.00 150.00
Saldo inicial $30.00
Saldo final $80.00
Depósitos y Adiciones 175.00
Retiros Electrónicos -75.00
07/16 Online transfer from chk ...9999 45.00 75.00
CHASE SAVINGS
RESUMEN DE CUENTA DE AHORROS
`;

describe('account-scoped Chase control totals', () => {
  it('attributes checking and savings credit/debit controls independently', () => {
    const controls = extractChaseAccountStatementControls(CHASE_MULTI_ACCOUNT);
    const checking = controls.find((control) => control.accountLabel === 'Chase Total Checking');
    const savings = controls.find((control) => control.accountLabel === 'Chase Savings');

    expect(checking?.accountLast4).toBe('9999');
    expect(checking?.creditTotal).toBe(8776);
    expect(checking?.debitControls?.atmAndDebitCard).toBe(3924.85);
    expect(checking?.debitControls?.electronic).toBe(1000);
    expect(checking?.debitControls?.other).toBe(25);
    expect(checking?.debitControls?.fees).toBe(15);
    expect(checking?.debitTotal).toBe(4964.85);

    expect(savings?.accountLast4).toBe('5888');
    expect(savings?.creditTotal).toBe(175);
    expect(savings?.debitControls?.electronic).toBe(75);
    expect(savings?.debitControls?.atmAndDebitCard).toBeNull();
    expect(savings?.debitTotal).toBe(75);
  });

  it('does not copy a checking debit figure into savings', () => {
    const controls = extractChaseAccountStatementControls(CHASE_MULTI_ACCOUNT);
    const savings = controls.find((control) => control.accountLabel === 'Chase Savings');
    expect(savings?.debitTotal).not.toBe(3924.85);
    expect(savings?.debitTotal).not.toBe(4964.85);
    expect(savings?.debitTotal).toBe(75);
  });
});
