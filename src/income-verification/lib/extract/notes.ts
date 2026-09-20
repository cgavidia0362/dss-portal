import type { ExtractionProvenance, ExtractionTrustState } from '../analysis/types';
import { formatMoney } from '../analysis/format';
import { detectInstitution, parserLabel } from './detect';
import type { FallbackReason, InstitutionId, StatementSegment } from './documentModel';
import { formatIncompleteSourceNote } from './pageSequence';
import type { ReconciliationResult } from './reconcile';

export function institutionFromText(fileName: string, text: string): InstitutionId {
  return detectInstitution(fileName, text);
}

export function formatDifference(amount: number | null): string {
  if (amount == null) return '';
  const abs = Math.abs(amount);
  return formatMoney(abs);
}

export function buildProcessingNote(params: {
  segment: StatementSegment;
  segmentCount: number;
  provenance: ExtractionProvenance;
  trustState: ExtractionTrustState;
  reconciliation: ReconciliationResult;
  fallbackReason?: FallbackReason;
}): string {
  const { segment, segmentCount, provenance, trustState, reconciliation, fallbackReason } = params;
  const parser = parserLabel(segment.institution);
  const ordinal =
    segmentCount > 1 ? `${segmentLabel(segment.institution)} ${segment.index + 1} of ${segmentCount}` : null;
  const difference = formatDifference(reconciliation.creditDifference);

  if (segment.imageOnly && provenance !== 'deterministic' && trustState === 'verified') {
    return `Image-only ${parser.replace(' parser', '')} — extracted using vision and verified against report total.`;
  }

  if (provenance === 'deterministic' && trustState === 'verified') {
    return `${parser} — verified against statement deposit total.`;
  }

  if (provenance === 'terra_vision' && trustState === 'verified') {
    const prefix = ordinal ? `${ordinal} — ` : '';
    return `${prefix}deterministic extraction failed; Terra vision fallback used; totals verified.`;
  }

  if (provenance === 'sol_escalation' && trustState === 'verified') {
    const prefix = ordinal ? `${ordinal} — ` : '';
    return `${prefix}Terra vision could not verify totals; Sol escalation used; totals verified.`;
  }

  if (trustState === 'incomplete_source') {
    return formatIncompleteSourceNote({
      institution: segment.institution,
      completeness: segment.sourceCompleteness,
    });
  }

  if (trustState === 'mismatch') {
    const prefix = ordinal ? `${ordinal} — ` : 'Extraction ';
    const amount = difference ? ` of ${difference}` : '';
    const afterFallback =
      provenance === 'deterministic' ? '' : ' remains after fallback';
    return `${prefix}extraction mismatch${amount}${afterFallback}. Buyer review required.`;
  }

  if (trustState === 'partial') {
    const prefix = ordinal ? `${ordinal} — ` : '';
    if (provenance === 'deterministic') {
      return `${prefix}${parser} extracted transactions. Statement control totals were unavailable.`;
    }
    return `${prefix}vision extraction completed. Statement control totals were unavailable.`;
  }

  if (fallbackReason === 'image_only') {
    return `Image-only document — routed to vision extraction.`;
  }

  return `${parser} completed.`;
}

function segmentLabel(institution: InstitutionId): string {
  if (institution === 'chase') return 'Chase statement';
  if (institution === 'turbopass') return 'TurboPass report';
  return 'Statement';
}

export function buyerReviewWarning(reconciliation: ReconciliationResult): string {
  const expected =
    reconciliation.expectedCreditTotal != null
      ? formatMoney(reconciliation.expectedCreditTotal)
      : 'unavailable';
  const extracted = formatMoney(reconciliation.extractedCreditTotal);
  const difference =
    reconciliation.creditDifference != null
      ? formatMoney(Math.abs(reconciliation.creditDifference))
      : 'unknown';
  return `Extraction could not be verified. Buyer review required. Expected deposits ${expected}; extracted ${extracted}; difference ${difference}.`;
}
