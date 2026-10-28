export type LossReasonKey = 'apr' | 'fees' | 'stips' | 'other' | 'noReason';

export type LossReasonFlags = {
  apr: boolean;
  fees: boolean;
  stips: boolean;
  other: boolean;
  noReason: boolean;
};

export const LOSS_REASON_ORDER: LossReasonKey[] = [
  'apr',
  'fees',
  'stips',
  'other',
  'noReason',
];

export const LOSS_REASON_LABELS: Record<LossReasonKey, string> = {
  apr: 'APR',
  fees: 'Fees',
  stips: 'Stips',
  other: 'Other',
  noReason: 'No reason',
};

const APR_RE = /\bapr\b|\binterest(?:\s+rate)?\b|\bbuy[-\s]?rate\b|\b(?:lower|higher|better|high|low)\s+rate\b|\b\d+(?:\.\d+)?\s*%/;
const FEES_RE = /\bfees?\b/;
const STIPS_RE = /\bstips?\b|\bstipulation(?:s)?\b|\bextra\s+(?:conditions?|docs?|documents?|paperwork)\b|\badditional\s+(?:conditions?|docs?|documents?|paperwork|stips?)\b/;
const NO_REASON_RE = /^(?:no\s+reason(?:\s+listed)?|none(?:\s+listed)?|n\/a|na|-+|—+|nothing(?:\s+listed)?|\.)+$/;

export function classifyLossReasons(noteText: string): LossReasonFlags {
  const text = (noteText || '').replace(/\s+/g, ' ').trim();
  const lower = text.toLowerCase();

  const apr = APR_RE.test(lower);
  const fees = FEES_RE.test(lower);
  const stips = STIPS_RE.test(lower);

  if (apr || fees || stips) {
    return { apr, fees, stips, other: false, noReason: false };
  }

  if (!text || NO_REASON_RE.test(lower)) {
    return { apr: false, fees: false, stips: false, other: false, noReason: true };
  }

  return { apr: false, fees: false, stips: false, other: true, noReason: false };
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
