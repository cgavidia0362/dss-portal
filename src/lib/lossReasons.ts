export type LossReasonKey = 'apr' | 'fees' | 'stips' | 'noReason';

export type LossReasonFlags = {
  apr: boolean;
  fees: boolean;
  stips: boolean;
  noReason: boolean;
};

export const LOSS_REASON_ORDER: LossReasonKey[] = [
  'apr',
  'fees',
  'stips',
  'noReason',
];

export const LOSS_REASON_LABELS: Record<LossReasonKey, string> = {
  apr: 'APR',
  fees: 'Fees',
  stips: 'Stips',
  noReason: 'No reason',
};

export const OTHER_BANK_LABEL = 'Other bank';

const APR_RE = /\bapr\b|\binterest(?:\s+rate)?\b|\bbuy[-\s]?rate\b|\b(?:lower|higher|better|high|low)\s+rate\b|\b\d+(?:\.\d+)?\s*%/;
const FEES_RE = /\bfees?\b/;
const STIPS_RE = /\bstips?\b|\bstipulation(?:s)?\b|\btoo many\s+(?:stips?|docs?|documents?)\b|\bextra\s+(?:conditions?|docs?|documents?|paperwork|stips?)\b|\badditional\s+(?:conditions?|docs?|documents?|paperwork|stips?)\b|\bco[-\s]?buyers?\b|\bco[-\s]?signers?\b|\bco[-\s]?sign(?:ing|ed)?\b|\bcobuy\b|\bfull(?:\s+the)?\s+(?:amount|call)\b|\bfull call\b|\bcalled the full(?:\s+(?:amount|call|deal))?\b|\bcalled full(?:\s+(?:amount|call))?\b|\bcounter(?:ed|s|ing)?\b|\bmore money\b|\bhigher advance\b|\bmore advance\b|\bbetter advance\b|\bgot the (?:full )?money\b|\bcalled more\b|\bcut(?:\s+\w+){0,3}\s+back\b/;
const NO_REASON_RE = /\bno\s+reason(?:\s+listed)?\b|\bsent(?:\s+it)?\s+(?:elsewhere|out)\b|\bwent\s+elsewhere\b|\banother\s+(?:bank|lender)\b|\bclosed(?:\s+it)?\s+out\b|\bnone(?:\s+listed)?\b/;
const UNNAMED_SEND_OUT_RE = /\bsent(?:\s+it)?\s+(?:elsewhere|out|to another)\b|\bwent\s+elsewhere\b|\banother\s+(?:bank|lender)\b|\bclosed(?:\s+it)?\s+out\b|\bno\s+reason(?:\s+listed)?\b/;
const NAMED_LENDER_RE = /\bwent with (?!another\b)[a-z0-9]/i;

function emptyFlags(): LossReasonFlags {
  return {
    apr: false,
    fees: false,
    stips: false,
    noReason: false,
  };
}

export function classifyLossReasons(noteText: string): LossReasonFlags {
  const text = (noteText || '').replace(/\s+/g, ' ').trim();
  if (!text) return emptyFlags();
  const lower = text.toLowerCase();

  const apr = APR_RE.test(lower);
  const fees = FEES_RE.test(lower);
  const stips = STIPS_RE.test(lower);
  const structured = apr || fees || stips;

  return {
    apr,
    fees,
    stips,
    noReason: !structured && NO_REASON_RE.test(lower),
  };
}

export function excelFlag(on: boolean): 1 | '' {
  return on ? 1 : '';
}

export function uniqueAppIds(ids: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    const trimmed = (id || '').trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

export type LossReasonBucket<T> = {
  key: LossReasonKey;
  label: string;
  count: number;
  appIds: string[];
  notes: T[];
};

export function groupNotesByLossReason<T extends { noteText?: string | null; appId?: string | null }>(
  notes: T[],
): LossReasonBucket<T>[] {
  return LOSS_REASON_ORDER.map((key) => {
    const matched = notes.filter((note) => classifyLossReasons(note.noteText || '')[key]);
    return {
      key,
      label: LOSS_REASON_LABELS[key],
      count: matched.length,
      appIds: uniqueAppIds(matched.map((note) => note.appId)),
      notes: matched,
    };
  });
}

export function isUnnamedSendOut(noteText: string): boolean {
  const text = (noteText || '').replace(/\s+/g, ' ').trim();
  if (!text) return false;
  if (!UNNAMED_SEND_OUT_RE.test(text.toLowerCase())) return false;
  return !NAMED_LENDER_RE.test(text);
}

export type LenderLossRow = {
  competitor: string;
  mentionCount: number;
  howTheyBeatUs: string;
};

export function ensureOtherBankRow<T extends LenderLossRow>(
  rows: T[],
  notes: Array<{ noteText?: string | null }>,
): T[] {
  const unnamedCount = notes.filter((note) => isUnnamedSendOut(note.noteText || '')).length;
  const next = [...rows];
  const idx = next.findIndex((row) => row.competitor.trim().toLowerCase() === OTHER_BANK_LABEL.toLowerCase());

  if (unnamedCount > 0) {
    if (idx >= 0) {
      next[idx] = {
        ...next[idx],
        mentionCount: Math.max(next[idx].mentionCount, unnamedCount),
      };
    } else {
      next.push({
        competitor: OTHER_BANK_LABEL,
        mentionCount: unnamedCount,
        howTheyBeatUs: 'Dealer sent it elsewhere or closed out and did not name the bank.',
      } as T);
    }
  }

  return next.sort((a, b) => {
    if (b.mentionCount !== a.mentionCount) return b.mentionCount - a.mentionCount;
    const aOther = a.competitor.trim().toLowerCase() === OTHER_BANK_LABEL.toLowerCase();
    const bOther = b.competitor.trim().toLowerCase() === OTHER_BANK_LABEL.toLowerCase();
    if (aOther !== bOther) return aOther ? 1 : -1;
    return a.competitor.localeCompare(b.competitor);
  });
}

export type AppIdTextPart = { type: 'text' | 'app'; value: string };

export function splitTextByAppIds(text: string, appIds: string[]): AppIdTextPart[] {
  const ids = uniqueAppIds(appIds).sort((a, b) => b.length - a.length);
  if (!text || ids.length === 0) return text ? [{ type: 'text', value: text }] : [];

  const escaped = ids.map((id) => id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp(`(${escaped.join('|')})`, 'gi');
  const parts: AppIdTextPart[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  const known = new Map(ids.map((id) => [id.toLowerCase(), id]));

  while ((match = re.exec(text)) !== null) {
    if (match.index > last) {
      parts.push({ type: 'text', value: text.slice(last, match.index) });
    }
    const raw = match[1];
    parts.push({ type: 'app', value: known.get(raw.toLowerCase()) || raw });
    last = match.index + raw.length;
  }
  if (last < text.length) {
    parts.push({ type: 'text', value: text.slice(last) });
  }
  return parts.length > 0 ? parts : [{ type: 'text', value: text }];
}
