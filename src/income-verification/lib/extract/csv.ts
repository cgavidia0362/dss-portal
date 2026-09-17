import { roundMoney } from '../analysis/money';
import type {
  AnalysisWarning,
  DocumentPeriod,
  MoneyDirection,
  NormalizedTransaction,
  TurboPassCategory,
} from '../analysis/types';
import { extractAccountLast4, parseAmount, parseFlexibleDate } from './parse';
import type { ExtractedDocument } from './types';

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current.trim());
  return fields;
}

function headerIndex(headers: string[], candidates: string[]): number {
  const normalized = headers.map(normalizeHeader);
  return normalized.findIndex((header) => candidates.includes(header));
}

function mapTurboCategory(value: string): TurboPassCategory | null {
  const text = value.toLowerCase().replace(/\s+/g, '');
  if (text.includes('incomepayroll')) return 'IncomePayroll';
  if (text.includes('p2p')) return 'P2PCredits';
  if (text.includes('generaldeposit')) return 'General Deposit';
  if (text.includes('atm')) return 'ATMDeposits';
  if (text.includes('externaltransfer')) return 'External Transfers';
  if (text.includes('internaltransfer')) return 'Internal Transfers';
  if (text.includes('misc') && text.includes('credit')) return 'MiscCredits';
  if (text.includes('refund')) return 'Refunds';
  if (text.includes('loan')) return 'Loan Advances';
  return null;
}

export function parseCsvText(text: string, fileName: string): ExtractedDocument {
  const warnings: AnalysisWarning[] = [];
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) {
    return {
      fileName,
      text,
      transactions: [],
      period: {
        documentName: fileName,
        startDate: null,
        endDate: null,
        source: 'unknown',
        accountLast4: extractAccountLast4(text),
      },
      warnings: [
        {
          code: 'no_transactions',
          message: `CSV ${fileName} did not contain a header and data rows.`,
          documentName: fileName,
        },
      ],
    };
  }

  const headers = parseCsvLine(lines[0]);
  const dateIdx = headerIndex(headers, [
    'date',
    'transactiondate',
    'posteddate',
    'postingdate',
    'transdate',
  ]);
  const descriptionIdx = headerIndex(headers, [
    'description',
    'memo',
    'narrative',
    'details',
    'payee',
    'name',
  ]);
  const amountIdx = headerIndex(headers, ['amount', 'value', 'transactionamount']);
  const debitIdx = headerIndex(headers, ['debit', 'withdrawal', 'outflow', 'out']);
  const creditIdx = headerIndex(headers, ['credit', 'deposit', 'inflow', 'in']);
  const typeIdx = headerIndex(headers, ['type', 'category', 'classification']);
  const accountIdx = headerIndex(headers, ['account', 'accountnumber', 'accountno']);

  if (dateIdx < 0 || (amountIdx < 0 && debitIdx < 0 && creditIdx < 0)) {
    warnings.push({
      code: 'unsupported_csv',
      message: `CSV ${fileName} is missing required date/amount columns.`,
      documentName: fileName,
    });
  }

  const accountLast4 = extractAccountLast4(text);
  const transactions: NormalizedTransaction[] = [];

  lines.slice(1).forEach((line, index) => {
    const fields = parseCsvLine(line);
    const date = dateIdx >= 0 ? parseFlexibleDate(fields[dateIdx] ?? '') : null;
    if (!date) {
      warnings.push({
        code: 'transaction_date_unparsed',
        message: `A row in ${fileName} had a date that could not be parsed and was skipped.`,
        documentName: fileName,
      });
      return;
    }

    const description =
      (descriptionIdx >= 0 ? fields[descriptionIdx] : '') || `CSV row ${index + 2}`;
    let signed = 0;
    if (debitIdx >= 0 || creditIdx >= 0) {
      const debit = Math.abs(parseAmount(fields[debitIdx] ?? '') ?? 0);
      const credit = Math.abs(parseAmount(fields[creditIdx] ?? '') ?? 0);
      signed = credit - debit;
    } else {
      signed = parseAmount(fields[amountIdx] ?? '') ?? 0;
    }

    if (!signed) return;

    const direction: MoneyDirection = signed < 0 ? 'out' : 'in';
    const amount = roundMoney(Math.abs(signed));
    const typeValue = typeIdx >= 0 ? fields[typeIdx] : '';
    const rowAccount =
      accountIdx >= 0 ? (fields[accountIdx].replace(/\D/g, '').slice(-4) || null) : accountLast4;

    transactions.push({
      id: `${fileName}:${date}:${amount}:${index}`,
      date,
      description,
      rawDescription: line,
      amount,
      direction,
      sourceDocument: fileName,
      sourceDocumentType: 'csv_export',
      sourceAccount: rowAccount,
      detectedIncomeSource: null,
      turbopassCategory: typeValue ? mapTurboCategory(typeValue) : null,
      runningBalance: null,
      page: null,
    });
  });

  const dates = transactions.map((tx) => tx.date).sort();
  const period: DocumentPeriod = {
    documentName: fileName,
    startDate: dates[0] ?? null,
    endDate: dates[dates.length - 1] ?? null,
    source: dates.length ? 'transaction_dates' : 'unknown',
    accountLast4,
  };

  return { fileName, text, transactions, period, warnings };
}
