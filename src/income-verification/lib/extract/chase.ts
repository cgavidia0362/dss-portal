import { roundMoney } from '../analysis/money';
import type { MoneyDirection, NormalizedTransaction } from '../analysis/types';
import {
  contextYearFromPeriod,
  extractAmounts,
  foldBankText,
  parseAmount,
  parseFlexibleDate,
  type StatementPeriod,
} from './parse';

const CHASE_MARKERS =
  /jpmorgan chase|chase total checking|chase savings|\bchase\.com\b/i;

const DESC_START = /^(\d{1,2}\/\d{1,2})\s+(.+)$/;
const SOLO_AMOUNT = /^\$?([\d,]+\.\d{2})$/;

const TXN_HEADER =
  /fecha\s+descripcion\s+cantidad\s+saldo|date\s+description\s+amount\s+balance/i;

const LEDGER_STOP =
  /en caso de errores|esta pagina se ha dejado|this page (?:has been )?intentionally|member fdic|overdraft fee summary|in case of errors or questions/i;

const PAGE_META =
  /saldo inicial|saldo final|cuenta principal|numero de cuenta|jpmorgan|pagina|page \d|beginning balance|ending balance|account number|web site|service center|para espanol|international calls|we accept|hold - return|checking summary|customer service/i;

const INCOMING_HINT =
  /\bdeposito\b|\bdeposit\b|zelle payment from|atm cash deposit|online transfer from|transferencia desde|transferencia externa para deposito|\breversal\b|\bdailypay\b|\bpayactiv\b|payment received|pay in 4 deposit|mobile deposit/i;

const OUTGOING_HINT =
  /\bretiro\b|\bwithdrawal\b|compra con tarjeta|card purchase|pago enviado|payment sent|zelle payment to|transferencia a cuenta|online transfer to|cargo mensual|service fee|pago preautorizado|atm & debit|electronic withdrawal|\bbillpay\b|\bpayment billpay\b/i;

export function isChaseStatement(text: string): boolean {
  const head = text.slice(0, 8000);
  return (
    CHASE_MARKERS.test(head) ||
    (/depositos y adiciones|deposits and additions/i.test(foldBankText(head)) &&
      /chase/i.test(head))
  );
}

function directionForChase(
  description: string,
  signedAmount: number | null
): MoneyDirection {
  const folded = foldBankText(description);
  if (/zelle payment to/.test(folded)) return 'out';
  if (/payment sent/.test(folded)) return 'out';
  if (/online transfer to\b/.test(folded) && !/online transfer from/.test(folded)) {
    return 'out';
  }
  // Reversals / refunds are credits even when PDF trails look negative.
  if (/\breversal\b/.test(folded)) return 'in';
  if (INCOMING_HINT.test(folded)) return 'in';
  if (OUTGOING_HINT.test(folded)) return 'out';
  if (/\bfee\b/.test(folded) && !/\breversal\b/.test(folded)) return 'out';
  if (signedAmount != null && signedAmount < 0) return 'out';
  return 'in';
}

function isIncomingDesc(description: string): boolean {
  return directionForChase(description, 1) === 'in';
}

type AccountInfo = { last4: string; label: string; full: string };

function discoverAccounts(text: string): AccountInfo[] {
  const found: AccountInfo[] = [];
  const checking = /chase total checking\s+(\d+)/i.exec(text);
  if (checking) {
    found.push({
      full: checking[1],
      last4: checking[1].slice(-4),
      label: 'Chase Total Checking',
    });
  }
  const savings = /chase savings\s+(\d+)/i.exec(text);
  if (savings) {
    found.push({
      full: savings[1],
      last4: savings[1].slice(-4),
      label: 'Chase Savings',
    });
  }
  return found;
}

function matchKnownAccount(
  line: string,
  accounts: AccountInfo[]
): AccountInfo | null {
  const onlyDigits = line.replace(/\D/g, '');
  if (onlyDigits.length < 10) return null;
  for (const account of accounts) {
    if (onlyDigits === account.full || onlyDigits.endsWith(account.full)) {
      return account;
    }
  }
  return null;
}

function stripTrailingAmounts(text: string): string {
  return text
    .replace(/(?:-?\s*\$?[\d,]+\.\d{2}\s*)+$/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Chase PDFs often emit a column of deposit amounts before Date/Description rows
 * on each page. Pair those amounts with subsequent credit descriptions that lack
 * a reliable inline credit amount, while keeping debit rows that already include
 * Amount+Balance.
 */
export function parseChaseLedger(
  text: string,
  fileName: string,
  period: StatementPeriod | null,
  fallbackAccountLast4: string | null
): NormalizedTransaction[] {
  const year = contextYearFromPeriod(period);
  const lines = text.split(/\r?\n/);
  const accounts = discoverAccounts(text);
  const checking = accounts.find((a) => /checking/i.test(a.label)) ?? null;
  const savings = accounts.find((a) => /savings|ahorro/i.test(a.label)) ?? null;

  let currentLast4 =
    checking?.last4 ?? fallbackAccountLast4 ?? accounts[0]?.last4 ?? null;
  let depositAmounts: number[] = [];
  let collectingDepositAmounts = false;
  const transactions: NormalizedTransaction[] = [];

  let i = 0;
  while (i < lines.length) {
    const raw = lines[i]?.trim() ?? '';
    const folded = foldBankText(raw);

    if (LEDGER_STOP.test(folded)) break;

    const switched = matchKnownAccount(raw, accounts);
    if (switched) {
      // Savings pages still print the primary checking account number; once on
      // savings, do not bounce back from that bare checking number.
      if (
        savings &&
        checking &&
        currentLast4 === savings.last4 &&
        switched.last4 === checking.last4
      ) {
        i += 1;
        continue;
      }
      currentLast4 = switched.last4;
      i += 1;
      continue;
    }
    if (/resumen de cuenta de ahorros|^\s*chase savings\s*$/i.test(folded) && savings) {
      currentLast4 = savings.last4;
    }
    if (
      /resumen de cuenta de cheques|^\s*chase total checking\s*$/i.test(folded) &&
      checking
    ) {
      currentLast4 = checking.last4;
    }

    if (TXN_HEADER.test(folded)) {
      collectingDepositAmounts = true;
      depositAmounts = [];
      i += 1;
      continue;
    }

    if (collectingDepositAmounts) {
      if (!raw) {
        i += 1;
        continue;
      }
      if (PAGE_META.test(folded) || /enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre|january|february|march|april|june|july|august|september|october|november|december/i.test(folded)) {
        i += 1;
        continue;
      }
      // Summary totals on the same page as the amount column — keep collecting.
      if (/deposits and additions|depositos y adiciones|atm & debit|electronic withdrawals|retiros/i.test(folded)) {
        i += 1;
        continue;
      }
      const solo = SOLO_AMOUNT.exec(raw);
      if (solo) {
        const amount = parseAmount(solo[1]);
        if (amount != null && amount > 0) depositAmounts.push(amount);
        i += 1;
        continue;
      }
      if (DESC_START.test(raw)) {
        collectingDepositAmounts = false;
        // Fall through and parse this description row.
      } else {
        // Noise / address / mail-hold lines between the header and amount column
        // must NOT abort collection — that was dropping the first-page credits.
        i += 1;
        continue;
      }
    }

    const start = DESC_START.exec(raw);
    if (!start) {
      i += 1;
      continue;
    }

    const dateRaw = start[1];
    let description = start[2].trim();
    const rawParts: string[] = [raw];
    let amountsOnRow = extractAmounts(description);
    let signedAmount: number | null = null;
    let balance: number | null = null;
    /** True when Chase printed Amount + Balance (debit rows / re-posts). */
    let explicitAmountBalancePair = false;
    if (amountsOnRow.length >= 2) {
      signedAmount = amountsOnRow[amountsOnRow.length - 2];
      balance = amountsOnRow[amountsOnRow.length - 1];
      explicitAmountBalancePair = true;
      description = stripTrailingAmounts(description);
    } else if (amountsOnRow.length === 1 && /-\s*\$?[\d,]+\.\d{2}\s*$/.test(description)) {
      // Single trailing signed token may still be only the running balance.
      signedAmount = amountsOnRow[0];
      description = stripTrailingAmounts(description);
    }
    const startIndex = i;
    i += 1;

    while (i < lines.length) {
      const next = lines[i]?.trim() ?? '';
      if (!next) {
        i += 1;
        break;
      }
      if (TXN_HEADER.test(foldBankText(next))) break;
      if (LEDGER_STOP.test(foldBankText(next))) break;
      if (matchKnownAccount(next, accounts)) break;
      if (
        /detalle de transacciones|transaction detail|depositos y adiciones|deposits and additions|retiros electronicos|resumen de cuenta|checking summary/i.test(
          foldBankText(next)
        )
      ) {
        break;
      }

      // ATM withdrawal rows often continue as "MM/DD address ... -amount balance".
      const nextIsDateRow = DESC_START.test(next);
      const atmContinuation =
        nextIsDateRow &&
        signedAmount == null &&
        /atm withdrawal|retiro en cajero/i.test(foldBankText(description)) &&
        extractAmounts(next).length >= 1;
      if (nextIsDateRow && !atmContinuation) break;

      const nextAmounts = extractAmounts(next);
      if (nextAmounts.length >= 2) {
        signedAmount = nextAmounts[nextAmounts.length - 2];
        balance = nextAmounts[nextAmounts.length - 1];
        explicitAmountBalancePair = true;
        const leftover = stripTrailingAmounts(
          nextIsDateRow ? next.replace(/^\d{1,2}\/\d{1,2}\s+/, '') : next
        );
        if (leftover) description = `${description} ${leftover}`;
        rawParts.push(next);
        i += 1;
        break;
      }
      if (nextAmounts.length === 1) {
        // Single trailing money token is usually the running balance for credits
        // whose amount came from the split deposit column.
        balance = nextAmounts[0];
        if (signedAmount == null && /-\s*\$?[\d,]+\.\d{2}\s*$/.test(next)) {
          signedAmount = nextAmounts[0];
        }
        const leftover = stripTrailingAmounts(
          nextIsDateRow ? next.replace(/^\d{1,2}\/\d{1,2}\s+/, '') : next
        );
        if (leftover) description = `${description} ${leftover}`;
        rawParts.push(next);
        i += 1;
        break;
      }

      description = `${description} ${next}`;
      rawParts.push(next);
      i += 1;
    }

    description = description.replace(/\s+/g, ' ').trim();
    if (!description) continue;

    const incoming = isIncomingDesc(description);
    let direction = directionForChase(description, signedAmount);
    let amountAbs =
      signedAmount != null ? roundMoney(Math.abs(signedAmount)) : null;

    // Explicit negative Amount+Balance is a debit/re-post even when the memo
    // says "Reversal". Do not consume the deposit-amount queue for those rows.
    const explicitDebitPair =
      explicitAmountBalancePair && signedAmount != null && signedAmount < 0;

    if (explicitDebitPair) {
      direction = 'out';
    } else if (incoming && depositAmounts.length > 0) {
      // Prefer the split deposit-amount column for credits. Balance-only trails
      // and description-embedded dollars (e.g. "Fee For A $100.00") must not
      // block pairing with the queued credit amounts.
      const queued = depositAmounts.shift()!;
      amountAbs = queued;
      direction = 'in';
      signedAmount = queued;
    }

    if (amountAbs == null || amountAbs === 0) continue;
    if (!incoming && signedAmount != null && signedAmount < 0) direction = 'out';

    const date = parseFlexibleDate(dateRaw, year, period);
    if (!date) continue;

    transactions.push({
      id: `${fileName}:${date}:${amountAbs}:${startIndex}`,
      date,
      description,
      rawDescription: rawParts.join(' | '),
      amount: amountAbs,
      direction,
      sourceDocument: fileName,
      sourceDocumentType: 'bank_statement',
      sourceAccount: currentLast4,
      detectedIncomeSource: null,
      turbopassCategory: null,
      runningBalance: balance,
      page: null,
    });
  }

  return transactions;
}
