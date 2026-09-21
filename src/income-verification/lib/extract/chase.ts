import { amountsEqual, roundMoney } from '../analysis/money';
import type { MoneyDirection, NormalizedTransaction } from '../analysis/types';
import { reconstructBalanceDeltas, type LedgerDraft } from './balanceDelta';
import { extractEmbeddedIsoDates, extractReferenceId } from './candidates';
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
const DATE_ONLY = /^(\d{1,2}\/\d{1,2})$/;
const SOLO_AMOUNT = /^\$?([\d,]+\.\d{2})$/;
const SOLO_SIGNED_AMOUNT = /^\$?-?[\d,]+\.\d{2}$/;

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

function takeQueuedAmount(
  depositAmounts: number[],
  previousBalance: number | null,
  runningBalance: number | null
): number | null {
  if (!depositAmounts.length) return null;
  if (previousBalance != null && runningBalance != null) {
    const delta = roundMoney(runningBalance - previousBalance);
    if (delta > 0) {
      const index = depositAmounts.findIndex((amount) => amountsEqual(amount, delta));
      if (index >= 0) return depositAmounts.splice(index, 1)[0] ?? null;
    }
  }
  return depositAmounts.shift() ?? null;
}

const AMOUNT_ONLY_LINE = /^(?:\$?-?[\d,]+\.\d{2})(?:\s+\$?-?[\d,]+\.\d{2})?$/;

function isAmountOnlyLine(raw: string): boolean {
  return AMOUNT_ONLY_LINE.test(raw.trim());
}

function parseAmountOnlyLine(
  raw: string
): { amount: number; balance: number | null } | null {
  if (!isAmountOnlyLine(raw)) return null;
  const amounts = extractAmounts(raw);
  if (!amounts.length) return null;
  if (amounts.length >= 2) {
    return { amount: amounts[amounts.length - 2]!, balance: amounts[amounts.length - 1]! };
  }
  return { amount: amounts[0]!, balance: null };
}

function splitGluedChaseLines(lines: string[]): string[] {
  const split: string[] = [];
  for (const line of lines) {
    const pieces = line.replace(/(\d+\.\d{2})(\d{1,2}\/\d{1,2})/g, '$1\n$2').split('\n');
    split.push(...pieces);
  }
  return split;
}

function isDateAmountBalanceRow(raw: string): boolean {
  const folded = foldBankText(raw).replace(/,/g, '');
  return /^\d{1,2}\/\d{1,2}\s+\$?-?\d+\.\d{2}\s+\$?-?\d+\.\d{2}$/.test(folded);
}

function applyTrailingMoney(
  drafts: LedgerDraft[],
  pageStartCount: number,
  trailing: { amount: number; balance: number | null },
  lastSeenBalance: number | null
): number | null {
  const pageDrafts = drafts.slice(pageStartCount);
  const queuedMatch =
    trailing.balance != null
      ? pageDrafts.find(
          (draft) =>
            draft.signedAmount != null &&
            draft.runningBalance == null &&
            amountsEqual(Math.abs(draft.signedAmount), Math.abs(trailing.amount))
        )
      : undefined;
  const missingAmount = pageDrafts.find((draft) => draft.signedAmount == null);
  const missingBalance = pageDrafts.find((draft) => draft.runningBalance == null);
  const target = queuedMatch ?? missingAmount ?? missingBalance;
  if (!target) return lastSeenBalance;

  if (trailing.balance != null) {
    if (target.signedAmount == null) {
      const previous =
        lastSeenBalance ??
        [...pageDrafts].reverse().find((draft) => draft !== target && draft.runningBalance != null)
          ?.runningBalance ??
        null;
      const delta = previous != null ? roundMoney(trailing.balance - previous) : null;
      if (delta != null && !amountsEqual(Math.abs(delta), Math.abs(trailing.amount))) {
        target.signedAmount = delta;
        target.queuedCredit = false;
      } else if (target.signedAmount == null) {
        target.signedAmount = trailing.amount;
      }
    }
    target.runningBalance = trailing.balance;
    return trailing.balance;
  }

  if (target.signedAmount == null && target.runningBalance == null) {
    if (lastSeenBalance != null) {
      target.runningBalance = trailing.amount;
      return trailing.amount;
    }
    target.signedAmount = trailing.amount;
    return lastSeenBalance;
  }
  if (target.runningBalance == null) {
    target.runningBalance = trailing.amount;
    return trailing.amount;
  }
  if (target.signedAmount == null) {
    if (lastSeenBalance != null && target.runningBalance != null) {
      target.signedAmount = roundMoney(target.runningBalance - lastSeenBalance);
    } else {
      target.signedAmount = trailing.amount;
    }
  }
  return lastSeenBalance;
}

function openingBalanceFromText(text: string): number | null {
  const match =
    /(?:beginning balance|saldo inicial)\s*:?\s*(\(?\$?-?[\d,]+\.\d{2}\)?)/i.exec(text);
  if (!match?.[1]) return null;
  return parseAmount(match[1]);
}

export interface ChaseLedgerPage {
  pageNumber: number;
  text: string;
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
  fallbackAccountLast4: string | null,
  pages?: ChaseLedgerPage[]
): NormalizedTransaction[] {
  const year = contextYearFromPeriod(period);
  const accounts = discoverAccounts(text);
  const checking = accounts.find((a) => /checking/i.test(a.label)) ?? null;
  const savings = accounts.find((a) => /savings|ahorro/i.test(a.label)) ?? null;
  const chunks: Array<{ pageNumber: number | null; text: string; continuityBreak: boolean }> =
    pages?.length
      ? pages.map((page, index) => ({
          pageNumber: page.pageNumber,
          text: page.text,
          continuityBreak: index > 0,
        }))
      : [{ pageNumber: null, text, continuityBreak: false }];

  let currentLast4 =
    checking?.last4 ?? fallbackAccountLast4 ?? accounts[0]?.last4 ?? null;
  const drafts: LedgerDraft[] = [];
  let lastSeenBalance = openingBalanceFromText(text);
  const initialBalance = lastSeenBalance;

  for (const chunk of chunks) {
    const lines = splitGluedChaseLines(chunk.text.split(/\r?\n/));
    let depositAmounts: number[] = [];
    let collectingDepositAmounts = false;
    if (chunk.continuityBreak) lastSeenBalance = null;
    const pageStartCount = drafts.length;
    const pendingPairs: Array<{ amount: number; balance: number | null }> = [];

    let i = 0;
    while (i < lines.length) {
      const raw = lines[i]?.trim() ?? '';
      const folded = foldBankText(raw);

      if (LEDGER_STOP.test(folded)) break;

      const switched = matchKnownAccount(raw, accounts);
      if (switched) {
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
        if (
          PAGE_META.test(folded) ||
          /enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre|january|february|march|april|june|july|august|september|october|november|december/i.test(
            folded
          )
        ) {
          i += 1;
          continue;
        }
        if (
          /deposits and additions|depositos y adiciones|atm & debit|electronic withdrawals|retiros/i.test(
            folded
          )
        ) {
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
        if (DESC_START.test(raw) || DATE_ONLY.test(raw)) {
          collectingDepositAmounts = false;
        } else {
          i += 1;
          continue;
        }
      }

      const descStart = DESC_START.exec(raw);
      const dateOnly = descStart ? null : DATE_ONLY.exec(raw);
      if (!descStart && !dateOnly) {
        const trailing = parseAmountOnlyLine(raw);
        if (trailing?.balance != null) pendingPairs.push(trailing);
        i += 1;
        continue;
      }

      const dateRaw = descStart?.[1] ?? dateOnly?.[1] ?? '';
      let description = (descStart?.[2] ?? '').trim();
      const rawParts: string[] = [raw];
      const amountsOnRow = extractAmounts(description);
      let signedAmount: number | null = null;
      let balance: number | null = null;
      let explicitAmountBalancePair = false;
      if (amountsOnRow.length >= 2) {
        signedAmount = amountsOnRow[amountsOnRow.length - 2];
        balance = amountsOnRow[amountsOnRow.length - 1];
        explicitAmountBalancePair = true;
        description = stripTrailingAmounts(description);
      } else if (amountsOnRow.length === 1 && /-\s*\$?[\d,]+\.\d{2}\s*$/.test(description)) {
        signedAmount = amountsOnRow[0];
        description = stripTrailingAmounts(description);
      }
      const startIndex = drafts.length * 1000 + i;
      i += 1;

      while (i < lines.length) {
        const next = lines[i]?.trim() ?? '';
        if (!next) {
          i += 1;
          continue;
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

        const nextIsDateRow = DESC_START.test(next) || DATE_ONLY.test(next);
        const trailingPair = parseAmountOnlyLine(next);
        const earlierUnmatched = drafts
          .slice(pageStartCount)
          .some((draft) => draft.signedAmount == null || draft.runningBalance == null);
        if (trailingPair?.balance != null && !nextIsDateRow && earlierUnmatched) {
          pendingPairs.push(trailingPair);
          i += 1;
          continue;
        }
        const atmContinuation =
          nextIsDateRow &&
          signedAmount == null &&
          /atm withdrawal|retiro en cajero/i.test(foldBankText(description)) &&
          extractAmounts(next).length >= 1;
        const atmCashAmountContinuation =
          nextIsDateRow &&
          signedAmount == null &&
          /atm cash deposit|deposito en efectivo/i.test(foldBankText(description)) &&
          isDateAmountBalanceRow(next);
        if (nextIsDateRow && !atmContinuation && !atmCashAmountContinuation) break;

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
          const refAmountLine = /^\d{8,14}\s+\$?[\d,]+\.\d{2}$/.test(next);
          if (refAmountLine && signedAmount == null) {
            rawParts.push(next);
            i += 1;
            const peek = lines[i]?.trim() ?? '';
            if (SOLO_SIGNED_AMOUNT.test(peek)) {
              signedAmount = nextAmounts[0];
              balance = extractAmounts(peek)[0] ?? null;
              explicitAmountBalancePair = true;
              rawParts.push(peek);
              i += 1;
            } else if (depositAmounts.length === 0 && lastSeenBalance != null) {
              balance = nextAmounts[0];
            } else if (depositAmounts.length === 0) {
              signedAmount = nextAmounts[0];
            } else {
              balance = nextAmounts[0];
            }
            break;
          }
          const soloLine = SOLO_SIGNED_AMOUNT.test(next);
          if (soloLine && signedAmount == null) {
            rawParts.push(next);
            i += 1;
            const peek = lines[i]?.trim() ?? '';
            if (SOLO_SIGNED_AMOUNT.test(peek)) {
              signedAmount = nextAmounts[0];
              balance = extractAmounts(peek)[0] ?? null;
              explicitAmountBalancePair = true;
              rawParts.push(peek);
              i += 1;
            } else if (depositAmounts.length === 0 && lastSeenBalance != null) {
              balance = nextAmounts[0];
            } else if (depositAmounts.length === 0) {
              signedAmount = nextAmounts[0];
            } else {
              balance = nextAmounts[0];
            }
            break;
          }
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
      const explicitDebitPair =
        explicitAmountBalancePair && signedAmount != null && signedAmount < 0;

      if (!explicitDebitPair && incoming && depositAmounts.length > 0) {
        const queued = takeQueuedAmount(depositAmounts, lastSeenBalance, balance);
        if (queued != null) {
          signedAmount = queued;
        }
      }

      const date = parseFlexibleDate(dateRaw, year, period);
      if (!date) continue;

      if (balance != null) lastSeenBalance = balance;

      drafts.push({
        date,
        dateRaw,
        description,
        rawDescription: rawParts.join(' | '),
        signedAmount,
        runningBalance: balance,
        accountLast4: currentLast4,
        page: chunk.pageNumber,
        lineIndex: startIndex,
        continuityBreak: Boolean(chunk.continuityBreak && drafts.length === pageStartCount),
        referenceId: extractReferenceId(`${description} ${rawParts.join(' ')}`),
        forceOutgoing: explicitDebitPair,
      });
    }
    for (const pair of pendingPairs) {
      lastSeenBalance = applyTrailingMoney(drafts, pageStartCount, pair, lastSeenBalance);
    }
  }

  const reconstructed = reconstructBalanceDeltas(drafts, pages?.length ? null : initialBalance);
  const transactions: NormalizedTransaction[] = [];

  for (const row of reconstructed.rows) {
    if (row.signedAmount == null || row.signedAmount === 0) continue;
    let direction = directionForChase(row.description, row.signedAmount);
    if (row.forceOutgoing) {
      direction = 'out';
    } else if (row.signedAmount < 0 && !/\breversal\b/i.test(foldBankText(row.description))) {
      direction = 'out';
    }
    if (row.amountSource === 'balance_delta_reconstructed') {
      direction = row.signedAmount < 0 ? 'out' : 'in';
    }
    const amountAbs = roundMoney(Math.abs(row.signedAmount));
    const postedDate = row.date;
    const embedded = extractEmbeddedIsoDates(`${row.description} ${row.rawDescription}`, row.date);
    const transactionDate = embedded.find((date) => date !== postedDate) ?? postedDate;
    transactions.push({
      id: `${fileName}:${row.date}:${amountAbs}:${row.lineIndex}`,
      date: postedDate,
      postedDate,
      transactionDate,
      description: row.description,
      rawDescription: row.rawDescription,
      amount: amountAbs,
      direction,
      sourceDocument: fileName,
      sourceDocumentType: 'bank_statement',
      sourceAccount: row.accountLast4,
      detectedIncomeSource: null,
      turbopassCategory: null,
      runningBalance: row.runningBalance,
      page: row.page,
      amountSource: row.amountSource,
      extractionConflict: row.conflict || undefined,
      referenceId: row.referenceId,
    });
  }

  return transactions;
}
