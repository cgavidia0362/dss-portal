import { describe, expect, it } from 'vitest';
import { analyzeIncome } from '../../analysis';
import { parseBankStatementText } from '../bankStatement';
import { parseCsvText } from '../csv';
import { detectDocumentType } from '../detect';
import {
  extractChaseAccountDepositControls,
  extractDepositControlTotal,
  parseFlexibleDate,
  parseStatementPeriod,
  resolveMonthDayDate,
} from '../parse';
import { classifyTransaction } from '../../analysis/classify';
import { parseTurboPassText } from '../turbopass';

/** Fully synthetic PNC-style fixture — no real customer data. */
const PNC_STYLE_TEXT = `
PNC Simple Checking Statement
Primary account number: XX-XXXX-9999
For the period 07/21/2026 to 08/20/2026
Activity Detail
Deposits and Other Additions There were 5 Deposits and Other
Additions totaling $455.00.
Date Amount Description
07/21 75.00 Zelle From Avery Example
07/22 50.00 Zel From Blake Sample
07/22 105.00 Zel From Contoso Holdings
Deposits and Other Additions continued on next page
Page 2 of 2
Deposits and Other Additions
- continued
Date Amount Description
08/10 150.00 Instpmntin ExamplePay 08/09 10001
08/18 75.00 Reverse ACH Debit
EFFECTIVE 08-17-26
Banking/Debit Card Withdrawals and Purchases There were 2 Banking Machine
withdrawals totaling $40.00.
Date Amount Description
07/21 13.77 Debit Card Purchase Example Fuel Station
07/22 26.23 Debit Card Purchase Example Merchant
`;

const PNC_YEAR_SPAN_TEXT = `
PNC Simple Checking Statement
For the period 12/15/2025 to 01/14/2026
Deposits and Other Additions There were 3 Deposits and Other Additions totaling $300.00.
Date Amount Description
12/20 100.00 Zelle From Riley Demo
12/28 100.00 Zel From Quinn Fixture
01/05 100.00 Zelle From Morgan Testcase
Banking/Debit Card Withdrawals and Purchases
Date Amount Description
12/21 20.00 Debit Card Purchase Example Cafe
`;

/** Synthetic multi-row control-total fixture (structure only). */
const PNC_CONTROL_TOTAL_TEXT = `
PNC Simple Checking Statement
Primary account number: XX-XXXX-9999
For the period 07/21/2026 to 08/20/2026
Activity Detail
Deposits and Other Additions There were 8 Deposits and Other
Additions totaling $640.00.
Date Amount Description
07/21 75.00 Zelle From Avery Example
07/22 50.00 Zel From Blake Sample
07/22 105.00 Zel From Contoso Holdings
07/23 40.00 Zel From Dakota Placeholder
Deposits and Other Additions continued on next page
Page 2 of 2
Deposits and Other Additions
- continued
Date Amount Description
08/03 120.00 Zelle From Emery Synthetic
08/10 150.00 Instpmntin ExamplePay 08/09 10001
08/17 25.00 Zel From Finley Redacted
08/18 75.00 Reverse ACH Debit
EFFECTIVE 08-17-26
Banking/Debit Card Withdrawals and Purchases There were 2 Banking Machine
withdrawals totaling $40.00.
Date Amount Description
07/21 13.77 Debit Card Purchase Example Fuel Station
07/22 26.23 Debit Card Purchase Example Merchant
`;

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
    expect(detectDocumentType('turbo_pass_2_.pdf', '')).toBe('turbopass');
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

  it('reads PNC "For the period" headers', () => {
    expect(parseStatementPeriod('For the period 07/21/2026 to 08/20/2026')).toEqual({
      startDate: '2026-07-21',
      endDate: '2026-08-20',
    });
  });

  it('reads Spanish month named ranges including accented OCR variants', () => {
    expect(parseStatementPeriod('Julio 16, 2026 a Agosto 17, 2026')).toEqual({
      startDate: '2026-07-16',
      endDate: '2026-08-17',
    });
    expect(parseStatementPeriod('Enero 1, 2026 a Febrero 28, 2026')).toEqual({
      startDate: '2026-01-01',
      endDate: '2026-02-28',
    });
    expect(parseFlexibleDate('Septiembre 5, 2026')).toBe('2026-09-05');
  });
});

describe('PNC-style bank statement extraction', () => {
  it('extracts multi-page MM/DD deposits and stops at withdrawals', () => {
    const extracted = parseBankStatementText(PNC_STYLE_TEXT, 'pnc-synthetic.pdf');
    expect(extracted.period.startDate).toBe('2026-07-21');
    expect(extracted.period.endDate).toBe('2026-08-20');
    expect(extracted.period.accountLast4).toBe('9999');
    expect(extracted.transactions).toHaveLength(5);
    expect(extracted.transactions.every((tx) => tx.direction === 'in')).toBe(true);
    expect(extracted.transactions.some((tx) => /Debit Card Purchase/i.test(tx.description))).toBe(
      false
    );
    expect(extracted.transactions.map((tx) => tx.date)).toEqual([
      '2026-07-21',
      '2026-07-22',
      '2026-07-22',
      '2026-08-10',
      '2026-08-18',
    ]);
    expect(extracted.transactions[0]?.description).toBe('Zelle From Avery Example');
    expect(extracted.transactions[1]?.description).toBe('Zel From Blake Sample');
    expect(extracted.transactions.reduce((sum, tx) => sum + tx.amount, 0)).toBe(455);
    expect(extracted.warnings.some((warning) => warning.code === 'deposit_control_mismatch')).toBe(
      false
    );
  });

  it('infers years across a December→January statement period', () => {
    const extracted = parseBankStatementText(PNC_YEAR_SPAN_TEXT, 'pnc-year-span.pdf');
    expect(extracted.period.startDate).toBe('2025-12-15');
    expect(extracted.period.endDate).toBe('2026-01-14');
    expect(extracted.transactions.map((tx) => tx.date)).toEqual([
      '2025-12-20',
      '2025-12-28',
      '2026-01-05',
    ]);
    expect(resolveMonthDayDate(12, 20, extracted.period as { startDate: string; endDate: string })).toBe(
      '2025-12-20'
    );
    expect(parseFlexibleDate('01/05', undefined, extracted.period as { startDate: string; endDate: string })).toBe(
      '2026-01-05'
    );
  });

  it('warns when deposit control totals do not match extracted rows', () => {
    const mismatched = PNC_STYLE_TEXT.replace(
      'There were 5 Deposits and Other\nAdditions totaling $455.00.',
      'There were 48 Deposits and Other\nAdditions totaling $5,288.99.'
    );
    const extracted = parseBankStatementText(mismatched, 'pnc-mismatch.pdf');
    expect(extractDepositControlTotal(mismatched)).toEqual({ count: 48, total: 5288.99 });
    expect(extracted.transactions).toHaveLength(5);
    const warning = extracted.warnings.find((item) => item.code === 'deposit_control_mismatch');
    expect(warning?.message).toMatch(/48 deposits totaling \$5288\.99/i);
    expect(warning?.message).toMatch(/extracted 5 deposits totaling \$455\.00/i);
  });

  it('reconciles synthetic deposit rows to the statement control total', () => {
    const extracted = parseBankStatementText(PNC_CONTROL_TOTAL_TEXT, 'pnc-control.pdf');
    const deposits = extracted.transactions.filter((tx) => tx.direction === 'in');
    const total = Math.round(deposits.reduce((sum, tx) => sum + tx.amount, 0) * 100) / 100;

    expect(detectDocumentType('pnc-control.pdf', PNC_CONTROL_TOTAL_TEXT)).toBe('bank_statement');
    expect(extracted.period).toMatchObject({
      startDate: '2026-07-21',
      endDate: '2026-08-20',
      source: 'statement_header',
      accountLast4: '9999',
    });
    expect(extractDepositControlTotal(PNC_CONTROL_TOTAL_TEXT)).toEqual({ count: 8, total: 640 });
    expect(deposits).toHaveLength(8);
    expect(total).toBe(640);
    expect(
      extracted.transactions.some((tx) => /Debit Card Purchase|ATM Withdrawal/i.test(tx.description))
    ).toBe(false);
    expect(extracted.warnings.some((warning) => warning.code === 'deposit_control_mismatch')).toBe(
      false
    );
    expect(extracted.warnings.some((warning) => warning.code === 'no_transactions')).toBe(false);

    const analysis = analyzeIncome(extracted.transactions, {
      documentPeriods: [extracted.period],
    });
    expect(analysis.totals.totalDeposits).toBe(640);
    expect(analysis.categories.length).toBeGreaterThan(0);
    expect(analysis.sources.length).toBeGreaterThan(0);
    expect(analysis.transactions.some((tx) => tx.normalizedSource === 'Avery Example')).toBe(true);
    expect(analysis.transactions.some((tx) => tx.normalizedSource === 'Blake Sample')).toBe(true);
  });
});

/** Fully synthetic Navy Federal mixed-ledger fixture — no real customer PII. */
const NFCU_LEDGER_TEXT = `
Navy Federal Credit Union
Statement of Account
Statement Period
07/17/26 - 08/16/26
Access No. 10000001
Previous Deposits/ Withdrawals/ Ending YTD
Balance Credits Debits Balance Dividends
Totals $800.00 $8,122.16 $8,285.54 $650.00 $0.00
EveryDay Checking
Page 2 of 4
07-17 Beginning Balance
07-17 Zelle CR Avery Example
07-17 Zelle CR Avery Example
07-17 POS Debit- Debit Card 1111 07-16-26 Example Market Chicago IL
07-20 Zelle CR Blake Sample
07-20 ATM Fee - Withdrawal 07-17-26 P100 Chicago IL
07-20 ATM Withdrawal 07-17-26 Example FCU Chicago IL
07-21 POS Credit Adjustment 1111 Transaction 07-20-26 Example Credit New York
07-21 Zelle CR Casey Demo
07-22 POS Debit - Debit Card 1111 Transaction 07-21-26 Example Cafe Chicago IL
For JANE Q EXAMPLE
Date Transaction Detail Amount($) Balance($)
EveryDay Checking - 7218000001
Checking
Joint Owner(s): NONE
800.00
40.00 840.00
132.00 972.00
35.33 936.67-
35.00 971.67
1.00 970.67-
700.00 270.67-
9.50 280.17
20.00 300.17
41.59 258.58-
Page 3 of 4
07-23 Deposit 07-22-26 Example FCU Chicago IL
07-23 Deposit - ACH Paid From 100001 Example Payroll Co
07-23 Zelle CR Riley Outgoing
07-23 Zelle DB Morgan Debit
07-23 POS Debit- Debit Card 1111 07-22-26 Example Store CA
08-03 Zelle CR Contoso Cleaners LLC
08-03 POS Debit- Debit Card 1111 08-01-26 Example Merchant NY
For JANE Q EXAMPLE
Date Transaction Detail Amount($) Balance($)
EveryDay Checking - 7218000001 (Continued from previous page)
Joint Owner(s): NONE
120.00 378.58
175.44 554.02
290.00 844.02
2.00 842.02-
12.12 829.90-
650.00 1,479.90
57.11 1,422.79-
08-16 Ending Balance
1,422.79
Items Paid
Date Item Amount($) Date Item Amount($)
07-20 ATMO 700.00
07-20 ATMO 43.00
08-10 POS 44.57
08-10 POS 41.92
08-14 ACH 157.86
Disclosure Information
`;

const NFCU_MISMATCH_TEXT = NFCU_LEDGER_TEXT.replace(
  'Totals $800.00 $8,122.16 $8,285.54 $650.00 $0.00',
  'Totals $800.00 $9,999.00 $8,285.54 $650.00 $0.00'
);

describe('Navy Federal mixed-ledger extraction', () => {
  it('pairs split description/amount columns and keeps only credits', () => {
    const extracted = parseBankStatementText(NFCU_LEDGER_TEXT, 'nfcu-synthetic.pdf');
    const credits = extracted.transactions.filter((tx) => tx.direction === 'in');
    const debits = extracted.transactions.filter((tx) => tx.direction === 'out');
    const creditTotal =
      Math.round(credits.reduce((sum, tx) => sum + tx.amount, 0) * 100) / 100;

    expect(extracted.period.startDate).toBe('2026-07-17');
    expect(extracted.period.endDate).toBe('2026-08-16');
    expect(extractDepositControlTotal(NFCU_LEDGER_TEXT)).toEqual({
      count: null,
      total: 8122.16,
    });
    expect(credits.some((tx) => /Zelle CR Avery Example/i.test(tx.description))).toBe(true);
    expect(credits.some((tx) => /POS Credit Adjustment/i.test(tx.description))).toBe(true);
    expect(credits.some((tx) => /Deposit - ACH Paid From/i.test(tx.description))).toBe(true);
    expect(debits.some((tx) => /Zelle DB/i.test(tx.description))).toBe(true);
    expect(debits.some((tx) => /POS Debit/i.test(tx.description))).toBe(true);
    expect(debits.some((tx) => /ATM Withdrawal/i.test(tx.description))).toBe(true);
    expect(creditTotal).toBe(1471.94);
    expect(
      extracted.warnings.some((warning) => warning.code === 'deposit_control_mismatch')
    ).toBe(true);
  });

  it('never treats Items Paid POS/ATMO/ACH summaries as deposits', () => {
    const extracted = parseBankStatementText(NFCU_LEDGER_TEXT, 'nfcu-items-paid.pdf');
    const itemsPaidOnly = extracted.transactions.filter((tx) =>
      /^(POS|ACH|ATMO)(?:\s|$)/i.test(tx.description) &&
      !/pos\s+debit|pos\s+credit/i.test(tx.description)
    );
    expect(itemsPaidOnly).toHaveLength(0);
    expect(extracted.transactions.some((tx) => /\bATMO\b/i.test(tx.description))).toBe(false);
    expect(
      extracted.transactions.filter((tx) => tx.direction === 'in').every((tx) => tx.amount > 0)
    ).toBe(true);
  });

  it('distinguishes Zelle CR from Zelle DB using descriptors and trailing-minus amounts', () => {
    const extracted = parseBankStatementText(NFCU_LEDGER_TEXT, 'nfcu-zelle.pdf');
    const zelleCr = extracted.transactions.filter(
      (tx) => tx.direction === 'in' && /Zelle CR/i.test(tx.description)
    );
    const zelleDb = extracted.transactions.filter(
      (tx) => tx.direction === 'out' && /Zelle DB/i.test(tx.description)
    );
    expect(zelleCr.length).toBeGreaterThan(0);
    expect(zelleDb.length).toBeGreaterThan(0);
    expect(zelleCr.every((tx) => tx.direction === 'in')).toBe(true);
    expect(zelleDb.every((tx) => tx.direction === 'out')).toBe(true);
  });

  it('warns when Navy Federal Deposits/Credits control totals do not match', () => {
    const extracted = parseBankStatementText(NFCU_MISMATCH_TEXT, 'nfcu-mismatch.pdf');
    expect(extractDepositControlTotal(NFCU_MISMATCH_TEXT)).toEqual({
      count: null,
      total: 9999,
    });
    const warning = extracted.warnings.find((item) => item.code === 'deposit_control_mismatch');
    expect(warning?.message).toMatch(/deposits totaling \$9999\.00/i);
  });

  it('merges wrap-line merchant fragments before pairing with amount columns', () => {
    const wrapped = NFCU_LEDGER_TEXT.replace(
      '07-17 POS Debit- Debit Card 1111 07-16-26 Example Market Chicago IL',
      '07-17 POS Debit- Debit Card 1111 07-16-26 Example Market Chicago\nIL'
    );
    const extracted = parseBankStatementText(wrapped, 'nfcu-wrap.pdf');
    const debit = extracted.transactions.find((tx) =>
      /Example Market Chicago IL/i.test(tx.description)
    );
    expect(debit?.direction).toBe('out');
    expect(debit?.amount).toBe(35.33);
  });

  it('reconciles when statement Deposits/Credits control matches extracted credits', () => {
    // Control total set to the synthetic fixture's known credit sum ($1,471.94).
    const reconciled = NFCU_LEDGER_TEXT.replace(
      'Totals $800.00 $8,122.16 $8,285.54 $650.00 $0.00',
      'Totals $800.00 $1,471.94 $8,285.54 $650.00 $0.00'
    );
    const extracted = parseBankStatementText(reconciled, 'nfcu-reconciled.pdf');
    const creditTotal =
      Math.round(
        extracted.transactions
          .filter((tx) => tx.direction === 'in')
          .reduce((sum, tx) => sum + tx.amount, 0) * 100
      ) / 100;
    expect(creditTotal).toBe(1471.94);
    expect(
      extracted.warnings.some((warning) => warning.code === 'deposit_control_mismatch')
    ).toBe(false);
  });
});

/** Fully synthetic Bank of America fixture — no real customer PII. */
const BOA_SECTION_TEXT = `
Customer service information
bankofamerica.com
Bank of America, N.A.
JANE Q EXAMPLE
1000 Example Ave
Example City, AZ 85000
Your Adv SafeBalance Banking
for July 22, 2026 to August 19, 2026 Account number: 4570 0000 1234
Account summary
Beginning balance on July 22, 2026 $246.49
Deposits and other additions 3,026.00
ATM and debit card subtractions -2,624.24
Other subtractions -390.00
Service fees -4.95
Ending balance on August 19, 2026 $253.30
Page 3 of 6
Deposits and other additions
Date Description Amount
07/23/26 DAYFORCE DES:TRANSFER ID:EXAMPLE EMPLOYER INDN:Jane Example CO
ID:7000000001 WEB
750.00
07/24/26 Zelle payment from AVERY EXAMPLE Conf# aaa111 54.00
07/27/26 Zelle payment from AVERY EXAMPLE Conf# bbb222 66.00
07/29/26 Zelle payment from AVERY EXAMPLE Conf# ccc333 66.00
07/31/26 Zelle payment from BLAKE SAMPLE Conf# ddd444 100.00
08/03/26 Zelle payment from CONTOSO CLEANERS LLC Conf# eee555 120.00
08/05/26 Zelle payment from BLAKE SAMPLE Conf# fff666 100.00
08/05/26 Zelle payment from CASEY DEMO Conf# ggg777 50.00
08/06/26 DAYFORCE DES:TRANSFER ID:EXAMPLE EMPLOYER INDN:Jane Example CO
ID:7000000001 WEB
700.00
08/17/26 Zelle payment from CONTOSO CLEANERS LLC Conf# hhh888 220.00
08/19/26 Zelle payment from CONTOSO CLEANERS LLC Conf# iii999 800.00
Total deposits and other additions $3,026.00
Withdrawals and other subtractions
ATM and debit card subtractions
Date Description Amount
07/22/26 PURCHASE 0721 APPLE.COM/BILL 866-000-0000 CA -27.28
07/23/26 THE HOME DEPOT 07/23 #000000451 MOBILE PURCHASE 1000 W EXAMPLE AVE -331.87
07/24/26 PURCHASE 0723 TEMU.COM 888-000-0000 MA -18.62
08/03/26 BKOFAMERICA ATM 08/01 #000005424 WITHDRWL EXAMPLE CROSSING -100.00
08/19/26 Circlek #27055 08/19 #000272367 MOBILE PURCHASE EXAMPLE AZ -49.12
Total ATM and debit card subtractions -$2,624.24
Other subtractions
Date Description Amount
08/05/26 Zelle payment to RILEY OUTGOING Conf# out111 -50.00
08/06/26 Zelle payment to RILEY OUTGOING Conf# out222 -250.00
08/12/26 Zelle payment to MORGAN OUTGOING Conf# out333 -90.00
Total other subtractions -$390.00
Service fees
Date Transaction description Amount
07/22/26 Monthly Maintenance Fee -4.95
Total service fees -$4.95
`;

const BOA_CONTROL_MISMATCH_TEXT = BOA_SECTION_TEXT.replace(
  'Total deposits and other additions $3,026.00',
  'Total deposits and other additions $9,999.00'
);

describe('Bank of America section extraction', () => {
  it('extracts only the Deposits and other additions section with multiline rows', () => {
    const extracted = parseBankStatementText(BOA_SECTION_TEXT, 'boa-synthetic.pdf');
    const deposits = extracted.transactions.filter((tx) => tx.direction === 'in');
    const total = Math.round(deposits.reduce((sum, tx) => sum + tx.amount, 0) * 100) / 100;

    expect(extracted.period.startDate).toBe('2026-07-22');
    expect(extracted.period.endDate).toBe('2026-08-19');
    expect(deposits).toHaveLength(11);
    expect(total).toBe(3026);
    expect(extractDepositControlTotal(BOA_SECTION_TEXT)).toEqual({ count: null, total: 3026 });
    expect(extracted.warnings.some((warning) => warning.code === 'deposit_control_mismatch')).toBe(
      false
    );
  });

  it('stops at Total deposits / Withdrawals and ignores purchases, ATM, fees, and Zelle TO', () => {
    const extracted = parseBankStatementText(BOA_SECTION_TEXT, 'boa-boundary.pdf');
    const joined = extracted.transactions.map((tx) => tx.description).join('\n');

    expect(joined).not.toMatch(/HOME DEPOT|APPLE\.COM|TEMU|WITHDRWL|Maintenance Fee|payment to/i);
    expect(extracted.transactions.every((tx) => tx.direction === 'in')).toBe(true);
    expect(extracted.transactions.some((tx) => /Zelle payment from/i.test(tx.description))).toBe(
      true
    );
    expect(extracted.transactions.some((tx) => /DAYFORCE/i.test(tx.description))).toBe(true);
  });

  it('keeps Zelle FROM as deposits and excludes Zelle TO', () => {
    const extracted = parseBankStatementText(BOA_SECTION_TEXT, 'boa-zelle.pdf');
    const zelleFrom = extracted.transactions.filter((tx) =>
      /Zelle payment from/i.test(tx.description)
    );
    const zelleTo = extracted.transactions.filter((tx) => /Zelle payment to/i.test(tx.description));
    const zelleTotal = Math.round(zelleFrom.reduce((sum, tx) => sum + tx.amount, 0) * 100) / 100;

    expect(zelleFrom).toHaveLength(9);
    expect(zelleTotal).toBe(1576);
    expect(zelleTo).toHaveLength(0);
  });

  it('reconciles Dayforce payroll deposits separately from P2P', () => {
    const extracted = parseBankStatementText(BOA_SECTION_TEXT, 'boa-dayforce.pdf');
    const dayforce = extracted.transactions.filter((tx) => /DAYFORCE/i.test(tx.description));
    const dayforceTotal = Math.round(dayforce.reduce((sum, tx) => sum + tx.amount, 0) * 100) / 100;

    expect(dayforce).toHaveLength(2);
    expect(dayforceTotal).toBe(1450);

    const analysis = analyzeIncome(extracted.transactions, {
      documentPeriods: [extracted.period],
    });
    expect(analysis.totals.totalDeposits).toBe(3026);
    expect(analysis.totals.includedDeposits).toBe(3026);
  });

  it('does not open the deposit section from the account-summary total line', () => {
    const summaryOnly = `
Bank of America statement
for January 1, 2026 to January 31, 2026 Account number: 1111 2222 3333
Account summary
Beginning balance on January 1, 2026 $100.00
Deposits and other additions 500.00
ATM and debit card subtractions -50.00
Ending balance on January 31, 2026 $550.00
Withdrawals and other subtractions
ATM and debit card subtractions
01/05/26 PURCHASE 0104 EXAMPLE STORE -25.00
`;
    const extracted = parseBankStatementText(summaryOnly, 'boa-summary-only.pdf');
    // No detail deposit section header => legacy or empty section path must not
    // promote the summary amount / purchases into deposits.
    expect(extracted.transactions.some((tx) => /PURCHASE/i.test(tx.description) && tx.direction === 'in')).toBe(
      false
    );
  });

  it('warns when BoA deposit control totals do not match extracted rows', () => {
    const extracted = parseBankStatementText(BOA_CONTROL_MISMATCH_TEXT, 'boa-mismatch.pdf');
    expect(extractDepositControlTotal(BOA_CONTROL_MISMATCH_TEXT)).toEqual({
      count: null,
      total: 9999,
    });
    expect(extracted.transactions).toHaveLength(11);
    const warning = extracted.warnings.find((item) => item.code === 'deposit_control_mismatch');
    expect(warning?.message).toMatch(/deposits totaling \$9999\.00/i);
    expect(warning?.message).toMatch(/extracted 11 deposits totaling \$3026\.00/i);
  });
});

/** Fully synthetic Chase Spanish mixed-ledger fixture — no real customer PII. */
const CHASE_ES_TEXT = `
JPMorgan Chase Bank, N.A.
Julio 16, 2026 a Agosto 17, 2026
Chase.com
Cuentas de cheques y de ahorro
Chase Total Checking 000000711309999 -$4.21 $100.00
Chase Savings 000005070665888 30.00 80.00
Depósitos y Adiciones 8,776.00
Retiros de cajeros automáticos y
compras con tarjeta de débito -100.00
Retiros Electrónicos -50.00
Otros retiros -25.00
Cargos -15.00
CHASE TOTAL CHECKING
RESUMEN DE CUENTA DE CHEQUES
000000711309999
2 de 4 Página
FECHA DESCRIPCIÓN CANTIDAD SALDO
Julio 16, 2026 a Agosto 17, 2026
Cuenta Principal:
Saldo inicial -$4.21
10.00
1,350.00
500.00
75.00
07/16 DepÓsito preautorizado. Online transfer from sav ...5888 Transaction#:
30027542922 5.79
07/16 Compra con tarjeta con pin. Card purchase with pin 07/16 example store
IL card 1870 -4.33 1.46
07/20 DepÓsito quickpay por internet. Zelle payment from example roofing corp.
30075819083 1,351.46
07/20 Retiro quickpay por internet. Zelle payment to example payee 30077664751 -143.00 1,208.46
07/20 Retiro en cajero automÁtico que no sea de chase. ATM withdrawal
07/19 1000 example st chicago IL card 1870 -60.00 1,148.46
07/27 DepÓsito en efectivo en cajero automÁtico. ATM cash deposit 07/27
1000 example st chicago IL card 1870 1,648.46
07/27 DepÓsito quickpay por internet. Zelle payment from blake sample
30162192404 1,723.46
07/28 Transferencia a cuenta de ahorro. Online transfer to sav ...5888
Transaction#: 30173722729 -25.00 1,698.46
08/17 Pago enviado. Payment sent 08/17 rmtly* example remitly.Com
WA card 1870 -24.04 1,674.42
08/17 Cargo mensual por servicio. Monthly service fee -15.00 1,659.42
DETALLE DE TRANSACCIONES (continuación)
000005070665888
000000711309999
FECHA DESCRIPCIÓN CANTIDAD SALDO
Julio 16, 2026 a Agosto 17, 2026
Saldo inicial $30.00
25.00
25.00
Saldo final $80.00
Depósitos y Adiciones 175.00
Retiros Electrónicos -75.00
07/16 07/16 pago preautorizado. Online transfer to chk ...9999 Transaction#:
30027542922 -10.00 20.00
07/20 DepÓsito preautorizado. Online transfer from chk ...9999 Transaction#:
30075885158 45.00
07/21 Transferencia desde cuenta de cheques. Online transfer from chk ...9999
Transaction#: 30089569349 70.00
CHASE SAVINGS
RESUMEN DE CUENTA DE AHORROS
`;

const CHASE_ES_MISMATCH_TEXT = CHASE_ES_TEXT.replace(
  'Depósitos y Adiciones 8,776.00',
  'Depósitos y Adiciones 9,999.00'
);

describe('Chase Spanish statement extraction', () => {
  it('parses Spanish headings, split amount columns, and per-account controls', () => {
    const extracted = parseBankStatementText(CHASE_ES_TEXT, 'chase-es-synthetic.pdf');
    const credits = extracted.transactions.filter((tx) => tx.direction === 'in');
    const outs = extracted.transactions.filter((tx) => tx.direction === 'out');
    const checking = credits.filter((tx) => tx.sourceAccount === '9999');
    const savings = credits.filter((tx) => tx.sourceAccount === '5888');
    const checkingTotal =
      Math.round(checking.reduce((sum, tx) => sum + tx.amount, 0) * 100) / 100;
    const savingsTotal =
      Math.round(savings.reduce((sum, tx) => sum + tx.amount, 0) * 100) / 100;

    expect(extracted.period.startDate).toBe('2026-07-16');
    expect(extracted.period.endDate).toBe('2026-08-17');
    expect(extractChaseAccountDepositControls(CHASE_ES_TEXT)).toEqual([
      { accountLast4: '9999', accountLabel: 'Chase Total Checking', total: 8776 },
      { accountLast4: '5888', accountLabel: 'Chase Savings', total: 175 },
    ]);
    expect(checkingTotal).toBe(1935);
    expect(savingsTotal).toBe(50);
    expect(credits.some((tx) => /Zelle payment from/i.test(tx.description))).toBe(true);
    expect(credits.some((tx) => /ATM cash deposit/i.test(tx.description))).toBe(true);
    expect(outs.some((tx) => /Zelle payment to/i.test(tx.description))).toBe(true);
    expect(outs.some((tx) => /Card purchase|Compra con tarjeta/i.test(tx.description))).toBe(true);
    expect(outs.some((tx) => /ATM withdrawal/i.test(tx.description))).toBe(true);
    expect(outs.some((tx) => /Payment sent|Pago enviado/i.test(tx.description))).toBe(true);
    expect(credits.some((tx) => /Zelle payment to/i.test(tx.description))).toBe(false);
    expect(
      extracted.warnings.some((warning) => warning.code === 'deposit_control_mismatch')
    ).toBe(true);
  });

  it('recognizes accent-folded Spanish deposit section labels', () => {
    const extracted = parseBankStatementText(
      CHASE_ES_TEXT.replace(/Depósitos y Adiciones/g, 'DEPOSITOS Y ADICIONES'),
      'chase-es-ocr.pdf'
    );
    expect(extracted.transactions.some((tx) => tx.direction === 'in')).toBe(true);
  });

  it('categorizes savings transfers from checking as account transfers', () => {
    const extracted = parseBankStatementText(CHASE_ES_TEXT, 'chase-es-xfer.pdf');
    const savingsCredits = extracted.transactions.filter(
      (tx) => tx.direction === 'in' && tx.sourceAccount === '5888'
    );
    expect(savingsCredits.length).toBeGreaterThan(0);
    expect(
      savingsCredits.every(
        (tx) => classifyTransaction(tx).category === 'account_transfer'
      )
    ).toBe(true);
  });

  it('warns when Chase per-account Depósitos y Adiciones totals do not match', () => {
    const extracted = parseBankStatementText(CHASE_ES_MISMATCH_TEXT, 'chase-es-mismatch.pdf');
    const warning = extracted.warnings.find((item) => item.code === 'deposit_control_mismatch');
    expect(warning?.message).toMatch(/Chase Total Checking/i);
    expect(warning?.message).toMatch(/\$9999\.00/i);
  });
});

/**
 * Synthetic Chase English fixture: first-page deposit-amount column emitted
 * before Date/Description rows, with reversal / fee-reversal / earned-wage /
 * ATM / Zelle FROM credits and Deposits and Additions control total.
 * No real customer PII.
 */
const CHASE_EN_FIRST_PAGE_TEXT = `
JPMorgan Chase Bank, N.A.
July 16, 2026 through August 17, 2026
Chase.com
Chase Total Checking 000002907827999
CUSTOMER SERVICE INFORMATION
DATE DESCRIPTION AMOUNT BALANCE
00029166 DRE 111 082 23026 NNNNNNNNNNN 1 000000000 11 0099 AT 00
JPMorgan Chase Bank, N.A.
P O Box 44959
Indianapolis, IN 46244 - 4959
Beginning Balance -$144.37
Ending Balance $144.70
200.00
132.00
34.00
34.00
55.60
30.00
30.00
25.00
50.00
Web site:
Service Center:
HOLD - RETURN MAIL
EXAMPLE RESIDENT
1000 EXAMPLE ST APT 1
EXAMPLE CITY IL 60477
Chase Total Checking
Deposits and Additions 590.60
ATM & Debit Card Withdrawals -100.00
Electronic Withdrawals -50.00
07/17 Reversal: Tmobile*Postpaid Tel 800-937-8997 WA 06/13 Claimid:
3951956
16450001 0
6/15/2026
-200.00 -344.37
07/17 Reversal: Tmobile*Postpaid Tel 800-937-8997 WA 06/13 Claimid:
3951956
16450001 0
6/15/2026
-132.00 -476.37
07/20 Reversal: Tmobile*Postpaid Tel 800-937-8997 WA 06/13 Claimid:
7252115
46770001 0
6/15/2026
-276.37
07/20 Reversal: Tmobile*Postpaid Tel 800-937-8997 WA 06/13 Claimid:
7252115
46770001 0
6/15/2026
-144.37
07/20 06/30/2026 Reversal: Overdraft Fee For A $100.00 Payment -110.37
07/20 07/01/2026 Reversal: Overdraft Fee For A $18.31 Card Purc -76.37
07/24 Dailypay Hotel Equi PPD ID: 1475035714 -20.77
07/27 ATM Cash Deposit 07/26 1000 Example St Example City IL Card 6915 9.23
07/27 ATM Cash Deposit 07/26 1000 Example St Example City IL Card 6915 39.23
07/27 Zelle Payment From Example Sender One 30161522395 64.23
07/27 Card Purchase 07/26 Example Grocery Example City IL Card 6915 - 5.10 59.13
07/27 Zelle Payment To Example Payee 30159713973 -25.00 34.13
07/28 Card Purchase 07/27 Example Grocery Example City IL Card 6915 -29.82 4.31
07/29 Zelle Payment From Example Sender One 30193036182 54.31
CHECKING SUMMARY
TRANSACTION DETAIL
`;

const CHASE_EN_CONTROL_MISMATCH_TEXT = CHASE_EN_FIRST_PAGE_TEXT.replace(
  'Deposits and Additions 590.60',
  'Deposits and Additions 999.99'
);

describe('Chase English first-page split-column extraction', () => {
  it('pairs first-page deposit amounts with later credit descriptions and reconciles', () => {
    const extracted = parseBankStatementText(
      CHASE_EN_FIRST_PAGE_TEXT,
      'chase-en-first-page.pdf'
    );
    const credits = extracted.transactions.filter((tx) => tx.direction === 'in');
    const outs = extracted.transactions.filter((tx) => tx.direction === 'out');
    const total =
      Math.round(credits.reduce((sum, tx) => sum + tx.amount, 0) * 100) / 100;

    expect(extractDepositControlTotal(CHASE_EN_FIRST_PAGE_TEXT)).toEqual({
      count: null,
      total: 590.6,
    });
    expect(extractChaseAccountDepositControls(CHASE_EN_FIRST_PAGE_TEXT)).toEqual([
      { accountLast4: '7999', accountLabel: 'Chase Total Checking', total: 590.6 },
    ]);
    expect(credits).toHaveLength(9);
    expect(total).toBe(590.6);
    expect(credits.some((tx) => /Reversal: Tmobile/i.test(tx.description) && tx.amount === 200)).toBe(
      true
    );
    expect(credits.some((tx) => /Reversal: Tmobile/i.test(tx.description) && tx.amount === 132)).toBe(
      true
    );
    expect(
      credits.filter((tx) => /Overdraft Fee/i.test(tx.description) && tx.amount === 34)
    ).toHaveLength(2);
    expect(credits.some((tx) => /Dailypay/i.test(tx.description) && tx.amount === 55.6)).toBe(true);
    expect(
      credits.filter((tx) => /ATM Cash Deposit/i.test(tx.description) && tx.amount === 30)
    ).toHaveLength(2);
    expect(
      credits.filter((tx) => /Zelle Payment From/i.test(tx.description)).map((tx) => tx.amount).sort()
    ).toEqual([25, 50]);
    expect(outs.some((tx) => /Zelle Payment To/i.test(tx.description))).toBe(true);
    expect(outs.some((tx) => /Card Purchase/i.test(tx.description))).toBe(true);
    expect(
      outs.filter((tx) => /Reversal: Tmobile/i.test(tx.description) && tx.amount === 200)
    ).toHaveLength(1);
    expect(
      extracted.warnings.some((warning) => warning.code === 'deposit_control_mismatch')
    ).toBe(false);

    expect(classifyTransaction(credits.find((tx) => /Dailypay/i.test(tx.description))!).category).toBe(
      'payroll'
    );
    expect(
      classifyTransaction(credits.find((tx) => /ATM Cash Deposit/i.test(tx.description))!).category
    ).toBe('cash_deposit');
    expect(
      classifyTransaction(credits.find((tx) => /Zelle Payment From/i.test(tx.description))!).category
    ).toBe('p2p_transfer');
    expect(
      classifyTransaction(credits.find((tx) => /Overdraft Fee/i.test(tx.description))!).category
    ).toBe('miscellaneous');
  });

  it('emits deposit_control_mismatch when Deposits and Additions disagrees', () => {
    const extracted = parseBankStatementText(
      CHASE_EN_CONTROL_MISMATCH_TEXT,
      'chase-en-mismatch.pdf'
    );
    const warning = extracted.warnings.find((item) => item.code === 'deposit_control_mismatch');
    expect(warning?.message).toMatch(/Deposits totaling \$999\.99/i);
    expect(warning?.message).toMatch(/\$590\.60/);
  });

  it('reads Chase checking-summary control totals from a stacked amount column', () => {
    const stacked = `
JPMorgan Chase Bank, N.A.
July 23, 2026 through August 24, 2026
Chase Total Checking 000002907827999
$28.17
4,135.22
-3,299.92
-846.25
$17.22
07/24 Zelle Payment From Example Sender 30.00 58.17
`;
    expect(extractChaseAccountDepositControls(stacked)).toEqual([
      {
        accountLast4: '7999',
        accountLabel: 'Chase Total Checking',
        total: 4135.22,
      },
    ]);
    const extracted = parseBankStatementText(stacked, 'chase-stacked.pdf');
    expect(
      extracted.warnings.some((warning) => warning.code === 'deposit_control_mismatch')
    ).toBe(true);
  });

  it('pairs Spanish date-only rows with following amount and balance lines', () => {
    const splitRows = `
JPMorgan Chase Bank, N.A.
July 23, 2026 through August 24, 2026
Chase Total Checking 000002907827999
$28.17
4,135.22
-3,299.92
-846.25
$17.22
DETALLE
TRANSACCIONES
FECHA
CANTIDAD
SALDO
07/24
Zelle Payment From Example Sender One

30.00
58.17
07/27
Example Staffing Payroll
4105.22
4163.39
07/27
Card Purchase Example Grocery
-10.00
4153.39
`;
    const extracted = parseBankStatementText(splitRows, 'chase-split-rows.pdf');
    const credits = extracted.transactions.filter((tx) => tx.direction === 'in');
    const total = Math.round(credits.reduce((sum, tx) => sum + tx.amount, 0) * 100) / 100;
    expect(credits).toHaveLength(2);
    expect(total).toBe(4135.22);
    expect(
      extracted.warnings.some((warning) => warning.code === 'deposit_control_mismatch')
    ).toBe(false);
  });
});

/** Fully synthetic Wells Fargo fixture — no real customer PII. */
const WELLS_FARGO_TEXT = `
Wells Fargo Clear Access Banking SM
June 30, 2026 Page 1 of 3
wellsfargo.com
Statement period activity summary
Beginning balance on 5/30 $100.00
Deposits/Additions 1,500.00
Withdrawals/Subtractions - 200.00
Ending balance on 6/30 $1,400.00
Account number: 1234567890 (primary account)
Transaction history
Date Check Number Description Deposits/ Additions Withdrawals/ Subtractions Ending daily balance
6/1 Mobile Deposit : Ref Number :111111111111 500.00
6/1 ATM Cash Deposit on 05/30 100 Example Rd Example AZ
0001111 ATM ID 1111E Card 1111
400.00
6/1 Zelle From Avery Example on 05/31 Ref # Abc123
100.00
6/1 Purchase authorized on 05/29 Example Store
Example AZ S111 Card 1111
50.00
6/1 ATM Withdrawal authorized on 05/30 100 Example St
Example AZ 0002222 ATM ID 2222H Card 1111
100.00
6/1 Zelle to Blake Sample on 05/30 Ref # Wfct999 50.00
6/5 Example Corp Payroll 260605 999 Example Person
500.00 1,300.00
6/10 United Security Prem & Pmt 260610 123 Example Person
25.00
Totals $1,500.00 $200.00
Fee period: 05/01/2026 - 05/29/2026 Standard monthly service fee $5.00
`;

const WELLS_FARGO_MISMATCH_TEXT = WELLS_FARGO_TEXT.replace(
  'Deposits/Additions 1,500.00',
  'Deposits/Additions 9,999.00'
).replace('Totals $1,500.00 $200.00', 'Totals $9,999.00 $200.00');

describe('Wells Fargo statement extraction', () => {
  it('pairs split description/amount columns and keeps deposit direction', () => {
    const extracted = parseBankStatementText(WELLS_FARGO_TEXT, 'wf-synthetic.pdf');
    const credits = extracted.transactions.filter((tx) => tx.direction === 'in');
    const outs = extracted.transactions.filter((tx) => tx.direction === 'out');
    const creditTotal =
      Math.round(credits.reduce((sum, tx) => sum + tx.amount, 0) * 100) / 100;

    expect(extracted.period.startDate).toBe('2026-05-30');
    expect(extracted.period.endDate).toBe('2026-06-30');
    expect(extractDepositControlTotal(WELLS_FARGO_TEXT)).toEqual({
      count: null,
      total: 1500,
    });
    expect(creditTotal).toBe(1500);
    expect(credits).toHaveLength(4);
    expect(credits.some((tx) => /Mobile Deposit/i.test(tx.description))).toBe(true);
    expect(credits.some((tx) => /ATM Cash Deposit/i.test(tx.description))).toBe(true);
    expect(credits.some((tx) => /Zelle From/i.test(tx.description))).toBe(true);
    expect(credits.some((tx) => /Payroll/i.test(tx.description))).toBe(true);
    expect(outs.some((tx) => /Zelle to/i.test(tx.description))).toBe(true);
    expect(outs.some((tx) => /Purchase authorized/i.test(tx.description))).toBe(true);
    expect(outs.some((tx) => /ATM Withdrawal/i.test(tx.description))).toBe(true);
    expect(outs.some((tx) => /Prem & Pmt/i.test(tx.description))).toBe(true);
    expect(credits.some((tx) => /Zelle to|Purchase authorized|ATM Withdrawal/i.test(tx.description))).toBe(
      false
    );
    expect(
      extracted.warnings.some((warning) => warning.code === 'deposit_control_mismatch')
    ).toBe(false);
  });

  it('categorizes payroll, Zelle From, ATM cash, and mobile deposits', () => {
    const extracted = parseBankStatementText(WELLS_FARGO_TEXT, 'wf-cats.pdf');
    const credits = extracted.transactions.filter((tx) => tx.direction === 'in');
    const byCat = Object.fromEntries(
      credits.map((tx) => [tx.description.slice(0, 20), classifyTransaction(tx).category])
    );
    expect(
      classifyTransaction(credits.find((tx) => /Payroll/i.test(tx.description))!).category
    ).toBe('payroll');
    expect(
      classifyTransaction(credits.find((tx) => /Zelle From/i.test(tx.description))!).category
    ).toBe('p2p_transfer');
    expect(
      classifyTransaction(credits.find((tx) => /ATM Cash Deposit/i.test(tx.description))!)
        .category
    ).toBe('cash_deposit');
    expect(
      classifyTransaction(credits.find((tx) => /Mobile Deposit/i.test(tx.description))!).category
    ).toBe('check');
    void byCat;
  });

  it('warns when Wells Fargo Deposits/Additions control totals do not match', () => {
    const extracted = parseBankStatementText(WELLS_FARGO_MISMATCH_TEXT, 'wf-mismatch.pdf');
    const warning = extracted.warnings.find((item) => item.code === 'deposit_control_mismatch');
    expect(warning?.message).toMatch(/\$9999\.00/i);
  });
});

/** Fully synthetic Lake Forest / community-bank fixture — no real customer PII. */
const LAKE_FOREST_TEXT = `
Last Statement: May 8, 2026
Statement Ending: June 10, 2026
D:\\LakeForestBankTrust_REG\\Work\\Outputs
TOTAL ACCESS CHECKING Account Number: XXXXXX9999
Balance Summary
Beginning Balance as of 05/09/26 $100.00
+ Deposits and Credits (4) $1,200.00
- Withdrawals and Debits (3) $150.00
Ending Balance as of 06/10/26 $1,150.00
Date Description Deposits Withdrawals
May 09 Beginning Balance $100.00
May 11 POS PURCHASE
POS PURCHASE TERMINAL 111 EXAMPLE STORE IL 05-09-26
XXXXXXXXXXXX1111
-$50.00
May 13 PREAUTHORIZED CREDIT
EXAMPLE EMPLOYER US PAYROLL 260515
$200.00
May 18 INTERNET/PHONE TRSFR
REF 111 FUNDS TRANSFER FRM DEP
XXXXXXX2222 FROM XFR#AAA
$300.00
May 18 INTERNET/PHONE TRSFR
REF 222 FUNDS TRANSFER TO DEP
XXXXXXX2222 FROM XFR#BBB
-$100.00
Jun 01 INTERNET/PHONE TRSFR
REF 333 FUNDS TRANSFER FRM DEP
XXXXXXX2222 FROM XFR#CCC
$500.00
Jun 03 PREAUTHORIZED CREDIT
EXAMPLE WING PAYROLL 260605
$200.00
Jun 10 Ending Balance $1,150.00
`;

const LAKE_FOREST_MISMATCH_TEXT = LAKE_FOREST_TEXT.replace(
  '+ Deposits and Credits (4) $1,200.00',
  '+ Deposits and Credits (4) $9,999.00'
);

describe('Lake Forest style statement extraction', () => {
  it('parses signed multi-line rows and statement coverage dates', () => {
    const extracted = parseBankStatementText(LAKE_FOREST_TEXT, 'lf-synthetic.pdf');
    const credits = extracted.transactions.filter((tx) => tx.direction === 'in');
    const outs = extracted.transactions.filter((tx) => tx.direction === 'out');
    const creditTotal =
      Math.round(credits.reduce((sum, tx) => sum + tx.amount, 0) * 100) / 100;

    expect(extracted.period.startDate).toBe('2026-05-09');
    expect(extracted.period.endDate).toBe('2026-06-10');
    expect(extractDepositControlTotal(LAKE_FOREST_TEXT)).toEqual({
      count: 4,
      total: 1200,
    });
    expect(credits).toHaveLength(4);
    expect(creditTotal).toBe(1200);
    expect(outs).toHaveLength(2);
    expect(credits.map((tx) => tx.amount).sort((a, b) => a - b)).toEqual([
      200, 200, 300, 500,
    ]);
    expect(outs.some((tx) => /FUNDS TRANSFER TO DEP/i.test(tx.description))).toBe(true);
    expect(outs.some((tx) => /POS PURCHASE/i.test(tx.description))).toBe(true);
    expect(credits.some((tx) => /FUNDS TRANSFER TO DEP|POS PURCHASE/i.test(tx.description))).toBe(
      false
    );
  });

  it('categorizes payroll credits and funds-transfer-from as account transfers', () => {
    const extracted = parseBankStatementText(LAKE_FOREST_TEXT, 'lf-cats.pdf');
    const payroll = extracted.transactions.filter(
      (tx) => tx.direction === 'in' && /PAYROLL/i.test(tx.description)
    );
    const transfers = extracted.transactions.filter(
      (tx) => tx.direction === 'in' && /FUNDS TRANSFER FRM DEP/i.test(tx.description)
    );
    expect(payroll.every((tx) => classifyTransaction(tx).category === 'payroll')).toBe(true);
    expect(
      transfers.every((tx) => classifyTransaction(tx).category === 'account_transfer')
    ).toBe(true);
  });

  it('warns when Deposits and Credits control totals do not match', () => {
    const extracted = parseBankStatementText(LAKE_FOREST_MISMATCH_TEXT, 'lf-mismatch.pdf');
    const warning = extracted.warnings.find((item) => item.code === 'deposit_control_mismatch');
    expect(warning?.message).toMatch(/4 deposits totaling \$9999\.00/i);
  });
});
