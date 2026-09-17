import type { DepositCategory } from './types';

const LEGAL_SUFFIXES = [
  'PAYROLL',
  'DIRECT DEP',
  'DIRECT DEPOSIT',
  'PPD',
  'CCD',
  'INC',
  'LLC',
  'LTD',
  'CORP',
  'CO',
  'NA',
];

const PAYROLL_PROCESSORS = [
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
];

const BANK_ATM_MARKERS = [
  'BANK OF AMERICA',
  'BKOFAMERICA',
  'BOFA',
  'CHASE',
  'WELLS FARGO',
  'WELLSFARGO',
  'US BANK',
  'USBANK',
  'CITIBANK',
  'CITI',
  'PNC',
  'TRUIST',
  'NAVY FEDERAL',
  'CAPITAL ONE',
];

const US_STATES = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DC', 'DE', 'FL', 'GA', 'HI', 'IA',
  'ID', 'IL', 'IN', 'KS', 'KY', 'LA', 'MA', 'MD', 'ME', 'MI', 'MN', 'MO', 'MS',
  'MT', 'NC', 'ND', 'NE', 'NH', 'NJ', 'NM', 'NV', 'NY', 'OH', 'OK', 'OR', 'PA',
  'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VA', 'VT', 'WA', 'WI', 'WV', 'WY',
]);

export interface ParsedIncomeSource {
  source: string;
  confidence: number;
}

export function normalizeText(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function collapse(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function titleCaseSource(value: string): string {
  return collapse(value)
    .split(' ')
    .filter(Boolean)
    .map((word) => {
      if (word.length <= 2 && /^[A-Za-z]+$/.test(word)) return word.toUpperCase();
      if (PAYROLL_PROCESSORS.includes(word.toUpperCase())) return word.toUpperCase();
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

function stripSuffixes(value: string): string {
  let source = collapse(value);
  for (const suffix of LEGAL_SUFFIXES) {
    const pattern = new RegExp(`\\s+${suffix}$`, 'i');
    while (pattern.test(source)) {
      source = source.replace(pattern, '').trim();
    }
  }
  return source;
}

export function stripSourceNoise(value: string): string {
  let text = value;
  text = text.replace(/\b\d{4}-\d{2}-\d{2}\b/g, ' ');
  text = text.replace(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g, ' ');
  text = text.replace(/-?\$?\(?\d{1,3}(?:,\d{3})+\.\d{2}\)?|-?\$?\(?\d+\.\d{2}\)?/g, ' ');
  text = text.replace(/\b(?:xxxx+|\*{4,}x*)\d{2,}\b/gi, ' ');
  text = text.replace(/#(?:xxxx+)?\d{3,}\b/gi, ' ');
  text = text.replace(/\bxxxxx?\d+\b/gi, ' ');
  text = text.replace(/\bconf(?:irmation)?(?:\s*(?:#|no\.?|num(?:ber)?)?)?\s*[a-z0-9]+\b/gi, ' ');
  text = text.replace(/\bconf#\s*\S+/gi, ' ');
  text = text.replace(/\b(?:txn|trans(?:action)?)\s*(?:id|#|:)\s*[a-z0-9-]+\b/gi, ' ');
  text = text.replace(/\bco\s*id:\s*\S+/gi, ' ');
  text = text.replace(/\bid:\s*\S+/gi, ' ');
  text = text.replace(/\bindn:\s*[^\s]+(?:\s+[^\s]+)?/gi, ' ');
  text = text.replace(/\bdes:\s*\S+/gi, ' ');
  text = text.replace(/\b(?:ppd|ccd|web|tel)\b/gi, ' ');
  text = text.replace(/[*,;:"']+/g, ' ');
  return collapse(text);
}

function nameFromCapture(raw: string): string | null {
  const cut = raw.split(/\b(?:for|conf(?:irmation)?|note|memo|ref(?:erence)?)\b/i)[0] ?? raw;
  const cleaned = stripSuffixes(stripSourceNoise(cut));
  return cleaned || null;
}

function parseP2P(text: string): ParsedIncomeSource | null {
  const zelle = /\bzel(?:le)?(?:\s+payment)?\s+from\s+(.+)/i.exec(text);
  if (zelle) {
    const name = nameFromCapture(zelle[1]);
    if (name) return { source: titleCaseSource(name), confidence: 0.95 };
    return { source: 'Zelle', confidence: 0.55 };
  }

  const venmo = /\bvenmo(?:\s+payment)?\s+from\s+(.+)/i.exec(text);
  if (venmo) {
    const name = nameFromCapture(venmo[1]);
    if (name) return { source: titleCaseSource(name), confidence: 0.95 };
  }
  if (/\bvenmo\b/i.test(text)) return { source: 'Venmo', confidence: 0.55 };

  const cashApp = /\bcash\s*app\*?\s*(?:payment\s+)?(?:from\s+)?(.+)/i.exec(text)
    || /\bsq\s+cash\s+(.+)/i.exec(text);
  if (cashApp) {
    const name = nameFromCapture(cashApp[1]);
    if (name && !/^payment$/i.test(name)) return { source: titleCaseSource(name), confidence: 0.92 };
    return { source: 'Cash App', confidence: 0.55 };
  }

  const apple = /\bapple\s+(?:cash|pay)\s+from\s+(.+)/i.exec(text);
  if (apple) {
    const name = nameFromCapture(apple[1]);
    if (name) return { source: titleCaseSource(name), confidence: 0.92 };
    return { source: 'Apple Cash', confidence: 0.55 };
  }

  return null;
}

function parseAtmDepositor(text: string): ParsedIncomeSource | null {
  const upper = text.toUpperCase();
  if (!/\bATM\b/.test(upper) && !/\bCASH DEPOSIT\b/.test(upper) && !/\bBRANCH DEPOSIT\b/.test(upper)) {
    return null;
  }

  let value = stripSourceNoise(text);
  for (const marker of BANK_ATM_MARKERS) {
    value = value.replace(new RegExp(`\\b${marker}\\b`, 'gi'), ' ');
  }
  value = value.replace(/\b(?:ATM|CASH|BRANCH|DEPOSIT|DEPOSITS)\b/gi, ' ');
  const tokens = collapse(value).split(' ').filter(Boolean);
  if (tokens.length && US_STATES.has(tokens[tokens.length - 1].toUpperCase())) {
    tokens.pop();
  }

  const upperTokens = tokens.map((token) => token.toUpperCase());
  for (let index = 0; index < upperTokens.length; index += 1) {
    const later = upperTokens.lastIndexOf(upperTokens[index]);
    if (later > index) {
      const middle = tokens.slice(index + 1, later);
      if (middle.length >= 1 && middle.length <= 4) {
        return { source: titleCaseSource(middle.join(' ')), confidence: 0.92 };
      }
    }
  }

  const remaining = tokens.filter((token) => !US_STATES.has(token.toUpperCase()));
  if (
    remaining.length >= 1 &&
    remaining.length <= 3 &&
    remaining.every((token) => /^[A-Za-z]+$/.test(token))
  ) {
    return { source: titleCaseSource(remaining.join(' ')), confidence: 0.75 };
  }

  return { source: 'ATM Deposit', confidence: 0.55 };
}

function parseAchCompany(text: string): ParsedIncomeSource | null {
  const match = /^(.*?)\s+DES\s*:/i.exec(collapse(text));
  if (!match?.[1]) return null;
  const company = stripSuffixes(stripSourceNoise(match[1]));
  if (company.length < 2) return null;
  return { source: titleCaseSource(company), confidence: 0.9 };
}

function parseProcessorPayroll(text: string): ParsedIncomeSource | null {
  const pattern = new RegExp(
    `\\b(${PAYROLL_PROCESSORS.join('|')})\\s+(?:PAYROLL\\s+)?(.+)$`,
    'i'
  );
  const match = pattern.exec(collapse(text));
  if (!match) return null;
  const rest = stripSuffixes(stripSourceNoise(match[2] ?? ''));
  if (rest) return { source: titleCaseSource(rest), confidence: 0.9 };
  return { source: match[1].toUpperCase(), confidence: 0.7 };
}

function parseTransfer(text: string): ParsedIncomeSource | null {
  const from = /(?:online\s+)?transfer\s+from\s+(.+)/i.exec(text);
  if (from) {
    const origin = stripSuffixes(stripSourceNoise(from[1]));
    if (origin) return { source: `Transfer from ${titleCaseSource(origin)}`, confidence: 0.9 };
    return { source: 'Account Transfer', confidence: 0.6 };
  }
  const internal = /\binternal transfers?\b/i.test(text);
  if (internal) return { source: 'Internal Transfer', confidence: 0.7 };
  const external = /\bexternal transfers?\b/i.test(text);
  if (external) return { source: 'External Transfer', confidence: 0.7 };
  return null;
}

function parseRefund(text: string): ParsedIncomeSource | null {
  if (!/\brefunds?\b|\breversal\b|\bchargeback\b/i.test(text)) return null;
  let value = stripSourceNoise(text);
  value = value.replace(/\b(?:purchase\s+)?refunds?\b/gi, ' ');
  value = value.replace(/\b(?:reversal|chargeback|temporary\s+credit(?:\s+adjustment)?)\b/gi, ' ');
  value = stripSuffixes(collapse(value));
  if (value) return { source: titleCaseSource(value), confidence: 0.85 };
  return { source: 'Refund', confidence: 0.55 };
}

function parseGeneric(text: string): ParsedIncomeSource {
  let value = stripSuffixes(stripSourceNoise(text));
  value = value.replace(
    /\b(?:payroll|direct\s+dep(?:osit)?|deposit|payment|transfer|credit|ach|atm|mobile)\b/gi,
    ' '
  );
  value = collapse(value);
  if (!value) return { source: 'Unknown source', confidence: 0.2 };
  const tokens = value.split(' ');
  return {
    source: titleCaseSource(tokens.slice(0, 6).join(' ')),
    confidence: tokens.length <= 4 ? 0.72 : 0.45,
  };
}

function parseFromText(text: string): ParsedIncomeSource {
  const collapsed = collapse(text);
  if (!collapsed) return { source: 'Unknown source', confidence: 0.2 };

  return (
    parseP2P(collapsed) ||
    parseAtmDepositor(collapsed) ||
    parseAchCompany(collapsed) ||
    parseProcessorPayroll(collapsed) ||
    parseTransfer(collapsed) ||
    parseRefund(collapsed) ||
    parseGeneric(collapsed)
  );
}

export function parseIncomeSource(
  description: string,
  rawDescription?: string | null
): ParsedIncomeSource {
  const primary = parseFromText(description || '');
  if (primary.confidence >= 0.7 || !rawDescription || rawDescription === description) {
    return primary;
  }
  const fromRaw = parseFromText(rawDescription);
  return fromRaw.confidence > primary.confidence ? fromRaw : primary;
}

export function normalizeIncomeSource(
  detected: string | null | undefined,
  description: string,
  rawDescription?: string | null
): string {
  if (detected && detected !== 'Unknown source' && !/[0-9*]/.test(detected) && detected.split(' ').length <= 6) {
    return titleCaseSource(detected);
  }
  return parseIncomeSource(description, rawDescription).source;
}

export function sourceKey(source: string): string {
  return normalizeText(source);
}

export function primaryCategoryFromTotals(
  totals: Partial<Record<DepositCategory, number>>
): DepositCategory {
  return (
    (Object.entries(totals) as Array<[DepositCategory, number]>).sort(
      (a, b) => b[1] - a[1]
    )[0]?.[0] ?? 'miscellaneous'
  );
}
