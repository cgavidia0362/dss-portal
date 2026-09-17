const MONTH_LABELS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export function parseIsoDate(date: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) {
    throw new Error(`Invalid transaction date: ${date}`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new Error(`Invalid transaction date: ${date}`);
  }

  return parsed;
}

export function monthKey(date: string): string {
  const parsed = parseIsoDate(date);
  const month = String(parsed.getUTCMonth() + 1).padStart(2, '0');
  return `${parsed.getUTCFullYear()}-${month}`;
}

export function monthLabel(key: string): string {
  const [year, month] = key.split('-');
  const monthIndex = Number(month) - 1;
  return `${MONTH_LABELS[monthIndex]} ${year}`;
}

export function daysBetween(a: string, b: string): number {
  const ms = Math.abs(parseIsoDate(a).getTime() - parseIsoDate(b).getTime());
  return Math.round(ms / 86_400_000);
}

export function toIsoDate(year: number, month: number, day: number): string {
  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  parseIsoDate(iso);
  return iso;
}

export function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function calendarMonthBounds(month: string): { start: string; end: string } {
  const [yearRaw, monthRaw] = month.split('-');
  const year = Number(yearRaw);
  const monthNumber = Number(monthRaw);
  return {
    start: toIsoDate(year, monthNumber, 1),
    end: toIsoDate(year, monthNumber, lastDayOfMonth(year, monthNumber)),
  };
}

export function monthsInInclusiveRange(startIso: string, endIso: string): string[] {
  const start = parseIsoDate(startIso);
  const end = parseIsoDate(endIso);
  if (start.getTime() > end.getTime()) return [];

  const keys: string[] = [];
  let year = start.getUTCFullYear();
  let month = start.getUTCMonth();
  const endYear = end.getUTCFullYear();
  const endMonth = end.getUTCMonth();

  while (year < endYear || (year === endYear && month <= endMonth)) {
    keys.push(`${year}-${String(month + 1).padStart(2, '0')}`);
    month += 1;
    if (month === 12) {
      month = 0;
      year += 1;
    }
  }

  return keys;
}

export function minIsoDate(dates: string[]): string | null {
  return dates.length ? [...dates].sort()[0] : null;
}

export function maxIsoDate(dates: string[]): string | null {
  return dates.length ? [...dates].sort()[dates.length - 1] : null;
}
