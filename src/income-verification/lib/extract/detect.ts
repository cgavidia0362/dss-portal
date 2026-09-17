import type { DocumentType } from '../analysis/types';

export function detectDocumentType(
  fileName: string,
  text: string
): DocumentType {
  const name = fileName.toLowerCase();
  const haystack = `${name}\n${text.slice(0, 8000)}`;
  const upper = haystack.toUpperCase();

  if (
    /TURBOPASS/.test(upper) ||
    /P2PCREDITS/.test(upper) ||
    /ATMDEPOSITS/.test(upper) ||
    (/BRAVO/.test(upper) && /DEPOSITS/.test(upper)) ||
    (/PLAID/.test(upper) && /GENERAL DEPOSIT/.test(upper))
  ) {
    return 'turbopass';
  }

  if (name.endsWith('.csv') || name.endsWith('.tsv')) {
    return 'csv_export';
  }

  if (/\.(jpg|jpeg|png|webp)$/.test(name)) {
    return 'image';
  }

  if (
    /BANK STATEMENT/.test(upper) ||
    /STATEMENT PERIOD/.test(upper) ||
    /BEGINNING BALANCE/.test(upper) ||
    /ENDING BALANCE/.test(upper) ||
    /CHECKING ACCOUNT/.test(upper)
  ) {
    return 'bank_statement';
  }

  if (name.endsWith('.pdf') || name.endsWith('.txt')) {
    return 'bank_statement';
  }

  return 'other';
}
