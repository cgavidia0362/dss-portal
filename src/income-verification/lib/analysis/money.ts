export function toCents(amount: number): number {
  return Math.round(amount * 100);
}

export function fromCents(cents: number): number {
  return cents / 100;
}

export function addMoney(...amounts: number[]): number {
  return fromCents(amounts.reduce((sum, amount) => sum + toCents(amount), 0));
}

export function roundMoney(amount: number): number {
  return fromCents(toCents(amount));
}

export function amountsEqual(a: number, b: number): boolean {
  return toCents(a) === toCents(b);
}
