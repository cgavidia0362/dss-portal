import { describe, expect, it } from 'vitest';
import { analyzeIncome } from '../../analysis';
import { parseBankStatementText } from '../bankStatement';
import { parseCsvText } from '../csv';
import { detectDocumentType } from '../detect';
import { parseStatementPeriod } from '../parse';
import { parseTurboPassText } from '../turbopass';

const BANK_TEXT = `
Bank of America Checking Account
Account Number: XXXX5475
Statement Period: 01/01/2026 - 01/31/2026

01/07/2026  ADP PAYROLL TINEDALE FARMS     2,000.00    4,200.00
01/10/2026  TRANSFER FROM SAVINGS XXXX1234 3,000.00    7,200.00
01/16/2026  CHECKCARD GROCERY STORE          45.23    7,154.77
01/18/2026  CAPITAL ONE PURCHASE REFUND     500.00    7,654.77
01/21/2026  ADP PAYROLL TINEDALE FARMS     2,000.00    9,654.77
01/22/2026  Zelle payment from JOHN SMITH  1,200.00   10,854.77
`;

const TURBOPASS_TEXT = `
TurboPass BRAVO Report
Account Number: ****5475
Statement Period: 01/01/2026 - 03/31/2026

Deposits
01/09/2026 UNITED MAINTENAN DES:PAYROLL PPD 843.19 General Deposit
01/05/2026 Zelle payment from KAROLL SANMIGUEL 7.00 P2PCredits
01/31/2026 BKOFAMERICA ATM DEPOSIT 50.00 ATMDeposits
03/15/2026 UNITED MAINTENAN DES:PAYROLL PPD 843.19 General Deposit

Internal Transfers
01/10/2026 Transfer from Savings 2000.00 Internal Transfers

Refunds
01/18/2026 Capital One Refund 450.00 Refunds

Loan Advances
02/02/2026 Cash Advance 800.00 Loan Advances

Transaction History
01/09/2026 UNITED MAINTENAN DES:PAYROLL PPD 843.19
01/12/2026 CHECKCARD GROCERY 45.00
`;

describe('document detection', () => {
  it('detects TurboPass from P2PCredits/BRAVO markers', () => {
    expect(detectDocumentType('report.pdf', TURBOPASS_TEXT)).toBe('turbopass');
    expect(detectDocumentType('jan.pdf', BANK_TEXT)).toBe('bank_statement');
    expect(detectDocumentType('export.csv', 'date,amount')).toBe('csv_export');
  });
});

describe('bank statement extraction', () => {
  it('extracts period, account, incoming deposits, and outgoing purchases', () => {
    const extracted = parseBankStatementText(BANK_TEXT, 'jan.pdf');
    expect(extracted.period.source).toBe('statement_header');
    expect(extracted.period.startDate).toBe('2026-01-01');
    expect(extracted.period.endDate).toBe('2026-01-31');
    expect(extracted.period.accountLast4).toBe('5475');

    const payroll = extracted.transactions.filter((tx) => tx.description.includes('PAYROLL'));
    expect(payroll).toHaveLength(2);
    expect(payroll.every((tx) => tx.direction === 'in')).toBe(true);

    const grocery = extracted.transactions.find((tx) => tx.description.includes('GROCERY'));
    expect(grocery?.direction).toBe('out');

    const analysis = analyzeIncome(extracted.transactions, {
      documentPeriods: [extracted.period],
    });
    expect(analysis.totals.includedDeposits).toBe(8700);
    expect(analysis.totals.excludedDeposits).toBe(0);
    expect(analysis.totals.totalDeposits).toBe(8700);
  });
});

const BRAVO_WRAPPED_TEXT = `
TurboPass BRAVO Banking Report
Prepared for JANE DOE
for 05/15/2026 - 09/12/2026
*****1892

Learn about Income categories 1-14 DAYS AGO 1-30 DAYS AGO BASELINE *
Primary Deposits 4,943.90 9,180.16 4,696.67
Internal Transfers 0.00 0.00 0.00
Loan Advances 0.00 0.00 0.00
Total Deposits 4,943.90 9,180.16 4,711.41

DATE DESCRIPTION ACCOUNT NAME CATEGORY AMOUNT
09/11/2026 R E D LOGISTICS DES:ACH ID: INDN:Jane Doe CO ID:XXXXX63899
PPD
Adv SafeBalance Banking
*****1892 (checking) IncomePayroll 1,325.10
09/11/2026 SUMMIT STAFFING DES:PAYROLL ID:XXXXX8503 INDN:DOE, JANE
PPD
Adv SafeBalance Banking
*****1892 (checking) IncomePayroll 253.65
09/08/2026 BKOFAMERICA ATM 09/07 #XXXXX4805 DEPOSIT BOLINGBROOK LILY C
BOLINGBROOK IL
Adv SafeBalance Banking
*****1892 (checking) ATMDeposits 850.00
09/01/2026 Zelle payment from MARILI MATEO for "p"; Conf# 99cv3y7fe Adv SafeBalance Banking
*****1892 (checking) P2PCredits 50.00
08/11/2026 GUSTO DES:ACCTVERIFY ID:6seml6f53sb INDN:Jane Doe
Adv SafeBalance Banking
*****1892 (checking) ExternalTransfers 0.01
Deposits
07/17/2026 R E D LOGISTICS DES:ACH ID: INDN:Jane Doe CO ID:XXXXX63899
PPD
Adv SafeBalance Banking
*****1892 (checking) IncomePayroll 749.40
06/18/2026 CHECKCARD 0617 APPLE.COM/BILL XXXXX27753 CA RECURRING
Adv SafeBalance Banking
*****1892 (checking) MiscCredits 19.95

Transaction History
DATE DESCRIPTION DEBIT CREDIT
09/11/2026 R E D LOGISTICS DES:ACH ID: INDN:Jane Doe CO ID:XXXXX63899 PPD 1,325.10
09/12/2026 MOBILE PURCHASE FAST & FRESH LAUN WOODRIDGE IL ON 09/12 (-40.00)
`;

describe('TurboPass extraction', () => {
  it('uses the Deposits section and labeled non-income rows without duplicating history', () => {
    const extracted = parseTurboPassText(TURBOPASS_TEXT, 'turbopass.pdf');
    expect(extracted.period.startDate).toBe('2026-01-01');
    expect(extracted.period.endDate).toBe('2026-03-31');
    expect(extracted.transactions.some((tx) => tx.description.includes('GROCERY'))).toBe(false);
    expect(
      extracted.transactions.filter((tx) => tx.description.includes('UNITED MAINTENAN'))
    ).toHaveLength(2);

    const analysis = analyzeIncome(extracted.transactions, {
      documentPeriods: [extracted.period],
    });

    expect(analysis.totals.totalDeposits).toBe(4993.38);
    expect(analysis.totals.includedDeposits).toBe(4993.38);
    expect(analysis.totals.excludedDeposits).toBe(0);
    expect(analysis.totals.monthsAnalyzed).toBe(3);
    expect(analysis.months.find((month) => month.month === '2026-02')?.includedTotal).toBe(800);
    expect(analysis.totals.averageMonthlyIncluded).toBe(1664.46);
    expect(
      extracted.transactions.find((tx) => tx.turbopassCategory === 'P2PCredits')
        ?.id
    ).toBeTruthy();
    expect(analysis.transactions.find((tx) => tx.turbopassCategory === 'P2PCredits')?.included).toBe(true);
    expect(analysis.transactions.find((tx) => tx.turbopassCategory === 'Loan Advances')?.finalClassification.category).toBe(
      'miscellaneous'
    );
  });

  it('reassembles wrapped BRAVO Deposits table rows and ignores Transaction History', () => {
    const extracted = parseTurboPassText(BRAVO_WRAPPED_TEXT, 'POI.pdf');
    expect(extracted.period.startDate).toBe('2026-05-15');
    expect(extracted.period.endDate).toBe('2026-09-12');
    expect(extracted.period.accountLast4).toBe('1892');
    expect(extracted.transactions).toHaveLength(7);
    expect(extracted.transactions.some((tx) => tx.description.includes('FAST & FRESH'))).toBe(
      false
    );
    expect(
      extracted.transactions.filter((tx) => tx.rawDescription.includes('1,325.10'))
    ).toHaveLength(1);

    const payroll = extracted.transactions.filter((tx) => tx.turbopassCategory === 'IncomePayroll');
    expect(payroll.map((tx) => tx.amount).sort((a, b) => a - b)).toEqual([
      253.65, 749.4, 1325.1,
    ]);
    expect(extracted.transactions.find((tx) => tx.turbopassCategory === 'P2PCredits')?.amount).toBe(
      50
    );
    expect(extracted.transactions.find((tx) => tx.turbopassCategory === 'ATMDeposits')?.amount).toBe(
      850
    );
    expect(
      extracted.transactions.find((tx) => tx.turbopassCategory === 'External Transfers')?.amount
    ).toBe(0.01);
    expect(extracted.warnings.some((warning) => warning.code === 'no_transactions')).toBe(false);
    expect(
      extracted.warnings.some((warning) => warning.code === 'turbopass_deposits_section')
    ).toBe(true);
  });

  it('does not claim the Deposits section was used when no rows parsed', () => {
    const extracted = parseTurboPassText(
      `TurboPass BRAVO Banking Report
for 05/15/2026 - 09/12/2026
DATE DESCRIPTION ACCOUNT NAME CATEGORY AMOUNT
Deposits
Transaction History
DATE DESCRIPTION DEBIT CREDIT
`,
      'empty.pdf'
    );
    expect(extracted.transactions).toHaveLength(0);
    expect(extracted.warnings.some((warning) => warning.code === 'no_transactions')).toBe(true);
    expect(
      extracted.warnings.some((warning) => warning.code === 'turbopass_deposits_section')
    ).toBe(false);
    expect(extracted.warnings.some((warning) => /successfully used|ignored Transaction History/i.test(warning.message))).toBe(
      false
    );
  });
});

describe('CSV extraction', () => {
  it('parses debit/credit columns into signed direction', () => {
    const csv = `Date,Description,Debit,Credit
01/07/2026,ADP PAYROLL ACME,,2000.00
01/10/2026,TRANSFER FROM SAVINGS, ,3000
01/16/2026,CHECKCARD GROCERY,45.23,
01/21/2026,ADP PAYROLL ACME,,2000`;
    const extracted = parseCsvText(csv, 'export.csv');
    expect(extracted.transactions).toHaveLength(4);
    expect(extracted.transactions.filter((tx) => tx.direction === 'in')).toHaveLength(3);
    expect(extracted.transactions.find((tx) => tx.description.includes('GROCERY'))?.direction).toBe('out');
  });
});

describe('statement period parsing', () => {
  it('reads MM/DD/YYYY ranges', () => {
    expect(parseStatementPeriod('Statement Period: 01/01/2026 - 01/31/2026')).toEqual({
      startDate: '2026-01-01',
      endDate: '2026-01-31',
    });
  });
});
