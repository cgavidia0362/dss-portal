import type { ExtractionProvenance, NormalizedTransaction } from '../analysis/types';
import { amountsEqual, roundMoney, toCents } from '../analysis/money';
import { foldBankText } from './parse';

export interface FusionStats {
  deterministicCandidates: number;
  terraCandidates: number;
  solCandidates: number;
  balanceDeltaRecovered: number;
  terraOnlyNew: number;
  solOnlyNew: number;
  duplicatesRemoved: number;
  conflicts: number;
}

export interface FusionResult {
  transactions: NormalizedTransaction[];
  stats: FusionStats;
}

const STOP_TOKENS = new Set([
  'the',
  'and',
  'for',
  'from',
  'with',
  'payment',
  'transaction',
  'card',
  'conf',
  'ppd',
  'id',
]);

function provenanceRank(value: ExtractionProvenance | undefined): number {
  if (value === 'sol_escalation') return 3;
  if (value === 'terra_vision') return 2;
  return 1;
}

function amountSourceRank(tx: NormalizedTransaction): number {
  if (tx.amountSource === 'explicit') return 4;
  if (tx.amountSource === 'balance_delta_reconstructed') return 3;
  if ((tx.extractionProvenanceSources?.length ?? 0) > 1) return 2;
  return 1;
}

export function extractReferenceId(text: string): string | null {
  const folded = foldBankText(text);
  const labeled =
    /(?:transaction#|transaction number|ref(?:erence)?(?:\s*(?:#|no\.?))?|claimid)\s*[:#]?\s*(\d{8,14})/i.exec(
      folded
    );
  if (labeled?.[1]) return labeled[1];
  const standalone = folded.match(/\b(\d{11,14})\b/g) ?? [];
  return standalone[standalone.length - 1] ?? null;
}

export function normalizeCandidateDescription(text: string): string {
  return foldBankText(text)
    .replace(/zelle payment from/g, 'zelle from')
    .replace(/\bzel from\b/g, 'zelle from')
    .replace(/remote online deposits?/g, 'mobile deposit')
    .replace(/mobile check deposits?/g, 'mobile deposit')
    .replace(/\bdirect dep(?:osit)?\b/g, 'payroll')
    .replace(/\bpayroll\b/g, 'payroll')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .slice(0, 80);
}

function significantTokens(text: string): Set<string> {
  return new Set(
    normalizeCandidateDescription(text)
      .split(' ')
      .filter((token) => token.length > 2 && !STOP_TOKENS.has(token) && !/^\d+$/.test(token))
  );
}

export function descriptionsLikelySameRow(left: string, right: string): boolean {
  const a = normalizeCandidateDescription(left);
  const b = normalizeCandidateDescription(right);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;
  const tokensA = significantTokens(left);
  const tokensB = significantTokens(right);
  if (!tokensA.size || !tokensB.size) return false;
  let overlap = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) overlap += 1;
  }
  const minSize = Math.min(tokensA.size, tokensB.size);
  const maxSize = Math.max(tokensA.size, tokensB.size);
  return overlap / minSize >= 0.6 && overlap / maxSize >= 0.4;
}

function identityParts(tx: NormalizedTransaction) {
  return {
    segment: tx.statementSegmentId ?? '',
    account: tx.sourceAccount ?? '',
    date: tx.date,
    description: normalizeCandidateDescription(tx.description),
    direction: tx.direction,
    amount: toCents(tx.amount),
    reference: tx.referenceId || extractReferenceId(`${tx.description} ${tx.rawDescription}`),
    page: tx.page ?? null,
    runningBalance: tx.runningBalance ?? null,
  };
}

export function candidatesMatch(
  left: NormalizedTransaction,
  right: NormalizedTransaction,
  includeAmount: boolean
): boolean {
  const a = identityParts(left);
  const b = identityParts(right);
  if (a.segment && b.segment && a.segment !== b.segment) return false;
  if (a.account && b.account && a.account !== b.account) return false;
  if (a.direction !== b.direction) return false;
  if (includeAmount && a.amount !== b.amount) return false;
  if (a.reference && b.reference) {
    if (a.reference !== b.reference) return false;
    if (a.date !== b.date) return false;
    if (includeAmount) return a.amount === b.amount;
    return descriptionsLikelySameRow(left.description, right.description);
  }
  if (a.date !== b.date) return false;

  if (
    a.runningBalance != null &&
    b.runningBalance != null &&
    !amountsEqual(a.runningBalance, b.runningBalance)
  ) {
    return false;
  }
  if (
    includeAmount &&
    a.runningBalance != null &&
    b.runningBalance != null &&
    amountsEqual(a.runningBalance, b.runningBalance)
  ) {
    return true;
  }

  if (a.description === b.description) return true;
  return includeAmount && descriptionsLikelySameRow(left.description, right.description);
}

function candidateIdentityKey(tx: NormalizedTransaction, includeAmount: boolean): string {
  const parts = identityParts(tx);
  if (parts.reference) {
    return includeAmount
      ? `ref:${parts.segment}:${parts.account}:${parts.date}:${parts.reference}:${parts.amount}:${parts.direction}`
      : `ref:${parts.segment}:${parts.account}:${parts.date}:${parts.reference}`;
  }
  if (parts.runningBalance != null && includeAmount) {
    return `bal:${parts.segment}:${parts.account}:${parts.date}:${parts.amount}:${toCents(parts.runningBalance)}:${parts.direction}`;
  }
  const base = `${parts.segment}|${parts.account}|${parts.date}|${parts.description}|${parts.direction}`;
  return includeAmount ? `${base}|${parts.amount}` : base;
}

function mergeProvenance(
  current: ExtractionProvenance[] | undefined,
  incoming: ExtractionProvenance | undefined
): ExtractionProvenance[] {
  const values = [...(current ?? [])];
  if (incoming && !values.includes(incoming)) values.push(incoming);
  return values;
}

function preferDescription(existing: string, incoming: string): string {
  if (incoming.length > existing.length + 6) return incoming;
  if (existing.length > incoming.length + 6) return existing;
  return significantTokens(incoming).size > significantTokens(existing).size ? incoming : existing;
}

function chooseCanonical(
  existing: NormalizedTransaction,
  incoming: NormalizedTransaction
): { chosen: NormalizedTransaction; conflict: boolean } {
  const sources = mergeProvenance(
    mergeProvenance(existing.extractionProvenanceSources, existing.extractionProvenance),
    incoming.extractionProvenance
  );
  const primary = [...sources].sort((a, b) => provenanceRank(b) - provenanceRank(a))[0];

  if (amountsEqual(existing.amount, incoming.amount) && existing.direction === incoming.direction) {
    const existingScore = amountSourceRank(existing);
    const incomingScore = amountSourceRank(incoming);
    const winner = incomingScore > existingScore ? incoming : existing;
    const loser = incomingScore > existingScore ? existing : incoming;
    return {
      chosen: {
        ...winner,
        description: preferDescription(existing.description, incoming.description),
        rawDescription:
          winner.rawDescription.length >= loser.rawDescription.length
            ? winner.rawDescription
            : loser.rawDescription,
        extractionProvenance: primary ?? winner.extractionProvenance,
        extractionProvenanceSources: sources,
        referenceId:
          existing.referenceId ||
          incoming.referenceId ||
          extractReferenceId(`${incoming.description} ${incoming.rawDescription}`),
        runningBalance: existing.runningBalance ?? incoming.runningBalance,
        page: existing.page ?? incoming.page,
        amountSource: winner.amountSource ?? loser.amountSource,
      },
      conflict: false,
    };
  }

  const existingScore = amountSourceRank(existing);
  const incomingScore = amountSourceRank(incoming);
  const winner = incomingScore > existingScore ? incoming : existing;
  const loser = incomingScore > existingScore ? existing : incoming;
  return {
    chosen: {
      ...winner,
      extractionProvenanceSources: mergeProvenance(
        mergeProvenance(winner.extractionProvenanceSources, winner.extractionProvenance),
        loser.extractionProvenance
      ),
      extractionConflict: true,
    },
    conflict: true,
  };
}

function prepare(tx: NormalizedTransaction): NormalizedTransaction {
  return {
    ...tx,
    amount: roundMoney(tx.amount),
    referenceId: tx.referenceId || extractReferenceId(`${tx.description} ${tx.rawDescription}`),
    extractionProvenanceSources: mergeProvenance(tx.extractionProvenanceSources, tx.extractionProvenance),
  };
}

export function fuseTransactionCandidates(params: {
  deterministic?: NormalizedTransaction[];
  terra?: NormalizedTransaction[];
  sol?: NormalizedTransaction[];
}): FusionResult {
  const deterministic = (params.deterministic ?? []).map(prepare);
  const terra = (params.terra ?? []).map(prepare);
  const sol = (params.sol ?? []).map(prepare);
  const exact = new Map<string, NormalizedTransaction>();
  let duplicatesRemoved = 0;
  let conflicts = 0;

  const add = (tx: NormalizedTransaction) => {
    const exactKey = candidateIdentityKey(tx, true);
    const existingExact = exact.get(exactKey);
    if (existingExact) {
      const merged = chooseCanonical(existingExact, tx);
      exact.set(exactKey, merged.chosen);
      duplicatesRemoved += 1;
      return;
    }

    let fuzzyMatch: string | null = null;
    for (const [key, existing] of exact) {
      if (candidatesMatch(existing, tx, true) || candidatesMatch(existing, tx, false)) {
        fuzzyMatch = key;
        break;
      }
    }
    if (fuzzyMatch) {
      const merged = chooseCanonical(exact.get(fuzzyMatch)!, tx);
      exact.delete(fuzzyMatch);
      exact.set(candidateIdentityKey(merged.chosen, true), merged.chosen);
      if (merged.conflict) conflicts += 1;
      else duplicatesRemoved += 1;
      return;
    }
    exact.set(exactKey, tx);
  };

  for (const tx of deterministic) add(tx);
  for (const tx of terra) add(tx);
  for (const tx of sol) add(tx);

  const transactions = [...exact.values()].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    if ((a.page ?? 0) !== (b.page ?? 0)) return (a.page ?? 0) - (b.page ?? 0);
    return a.description.localeCompare(b.description);
  });

  const terraNew = terra.filter(
    (item) => !deterministic.some((existing) => candidatesMatch(existing, item, true))
  ).length;
  const solNew = sol.filter(
    (item) =>
      ![...deterministic, ...terra].some((existing) => candidatesMatch(existing, item, true))
  ).length;

  return {
    transactions,
    stats: {
      deterministicCandidates: deterministic.length,
      terraCandidates: terra.length,
      solCandidates: sol.length,
      balanceDeltaRecovered: deterministic.filter(
        (tx) => tx.amountSource === 'balance_delta_reconstructed'
      ).length,
      terraOnlyNew: terraNew,
      solOnlyNew: solNew,
      duplicatesRemoved,
      conflicts,
    },
  };
}
