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
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .slice(0, 64);
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
  if (a.reference && b.reference) {
    return a.reference === b.reference && a.direction === b.direction && (!includeAmount || a.amount === b.amount);
  }
  return (
    a.date === b.date &&
    a.description === b.description &&
    a.direction === b.direction &&
    (!includeAmount || a.amount === b.amount)
  );
}

function candidateIdentityKey(tx: NormalizedTransaction, includeAmount: boolean): string {
  const parts = identityParts(tx);
  if (parts.reference) {
    return includeAmount
      ? `ref:${parts.segment}:${parts.account}:${parts.reference}:${parts.amount}:${parts.direction}`
      : `ref:${parts.segment}:${parts.account}:${parts.reference}`;
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

function chooseCanonical(
  existing: NormalizedTransaction,
  incoming: NormalizedTransaction
): { chosen: NormalizedTransaction; conflict: boolean } {
  if (amountsEqual(existing.amount, incoming.amount) && existing.direction === incoming.direction) {
    const sources = mergeProvenance(
      mergeProvenance(existing.extractionProvenanceSources, existing.extractionProvenance),
      incoming.extractionProvenance
    );
    const primary = [...sources].sort((a, b) => provenanceRank(b) - provenanceRank(a))[0];
    return {
      chosen: {
        ...existing,
        extractionProvenance: primary,
        extractionProvenanceSources: sources,
        referenceId:
          existing.referenceId || incoming.referenceId || extractReferenceId(incoming.rawDescription),
        runningBalance: existing.runningBalance ?? incoming.runningBalance,
        page: existing.page ?? incoming.page,
        amountSource: existing.amountSource ?? incoming.amountSource,
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
      if (candidatesMatch(existing, tx, false)) {
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
    return a.description.localeCompare(b.description);
  });

  const terraNew = terra.filter(
    (item) => !deterministic.some((existing) => candidatesMatch(existing, item, false))
  ).length;
  const solNew = sol.filter(
    (item) =>
      ![...deterministic, ...terra].some((existing) => candidatesMatch(existing, item, false))
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
