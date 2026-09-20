import type { DocumentType } from '../analysis/types';
import { isChaseStatement } from './chase';
import { isLakeForestStyleStatement } from './lakeForest';
import { isNavyFederalStatement } from './navyFederal';
import type { InstitutionId } from './documentModel';
import { isWellsFargoStatement } from './wellsFargo';

export function detectDocumentType(
  fileName: string,
  text: string
): DocumentType {
  const name = fileName.toLowerCase();
  const haystack = `${name}\n${text.slice(0, 8000)}`;
  const upper = haystack.toUpperCase();

    if (
      /TURBO[\s._-]*PASS/.test(upper) ||
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

export function detectInstitution(fileName: string, text: string): InstitutionId {
  const documentType = detectDocumentType(fileName, text);
  if (documentType === 'turbopass') return 'turbopass';
  if (documentType === 'csv_export') return 'csv';

  const haystack = `${fileName}\n${text.slice(0, 8000)}`;
  if (isChaseStatement(text) || /jpmorgan|chase\.com/i.test(haystack)) return 'chase';
  if (isNavyFederalStatement(text) || /navy federal|\bnfcu\b/i.test(haystack)) return 'navy_federal';
  if (isWellsFargoStatement(text) || /wells fargo/i.test(haystack)) return 'wells_fargo';
  if (isLakeForestStyleStatement(text) || /lake forest bank/i.test(haystack)) return 'lake_forest';
  if (/bank of america|bankofamerica/i.test(haystack)) return 'bank_of_america';
  if (/\bpnc\b|pnc bank/i.test(haystack)) return 'pnc';
  if (documentType === 'bank_statement') return 'generic_bank';
  return 'unknown';
}

export function institutionHasKnownParser(institution: InstitutionId): boolean {
  return institution !== 'unknown';
}

export function parserLabel(institution: InstitutionId): string {
  switch (institution) {
    case 'turbopass':
      return 'TurboPass parser';
    case 'pnc':
      return 'PNC parser';
    case 'bank_of_america':
      return 'Bank of America parser';
    case 'navy_federal':
      return 'Navy Federal parser';
    case 'chase':
      return 'Chase parser';
    case 'wells_fargo':
      return 'Wells Fargo parser';
    case 'lake_forest':
      return 'Lake Forest parser';
    case 'csv':
      return 'CSV parser';
    case 'generic_bank':
      return 'Generic bank parser';
    default:
      return 'Deterministic parser';
  }
}

