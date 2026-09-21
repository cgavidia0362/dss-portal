import type {
  AnalysisWarning,
  DocumentPeriod,
  ExtractionProvenance,
  ExtractionTrustState,
  NormalizedTransaction,
} from '../analysis/types';
import { extractHomeState } from '../analysis/location';
import { addMoney } from '../analysis/money';
import { isOpenAIConfigured } from '../ai/models';
import {
  imagesFromRendered,
  requestVisionExtraction,
  visionRowsToTransactions,
  type VisionClient,
  type VisionRequest,
} from '../ai/extractVision';
import { parseVisionExtraction, type VisionExtraction } from '../ai/visionSchema';
import { parseBankStatementText } from './bankStatement';
import { fuseTransactionCandidates, type FusionStats } from './candidates';
import { parseCsvText } from './csv';
import { detectDocumentType, parserLabel } from './detect';
import type {
  ExtractionTelemetry,
  FallbackReason,
  SegmentExtraction,
  StatementSegment,
} from './documentModel';
import { bytesToText, detectMime, validateUpload, type UploadedFile } from './files';
import { buyerReviewWarning, buildProcessingNote, debitReconciliationWarning } from './notes';
import { hasMissingPrintedPages } from './pageSequence';
import { extractPdfPages, textLooksEmpty } from './pdf';
import { buildPreflight } from './preflight';
import { extractControlTotalsFromText } from './periods';
import {
  isImplausiblyFew,
  reconcileAgainstControls,
  sumDirection,
  type ReconciliationResult,
} from './reconcile';
import { renderPdfPages, visionPageBatches, type PageRenderer, type RenderedPageImage } from './renderPages';
import { extractSegmentPdf, withTemporarySegmentPdf, type SegmentPdfSlicer } from './segmentPdf';
import { parseTurboPassText } from './turbopass';
import type { ExtractedDocument, ExtractionResult } from './types';
import { contiguousPageRanges, detectUnresolvedPages } from './unresolvedPages';

export interface ExtractionDeps {
  vision?: VisionClient;
  renderPages?: PageRenderer;
  slicePdf?: SegmentPdfSlicer;
  visionCache?: Map<string, Promise<{ extraction: VisionExtraction; usedPdfInput: boolean }>>;
}

function emptyTelemetry(): ExtractionTelemetry {
  return {
    deterministicPagesProcessed: 0,
    terraPagesProcessed: 0,
    solPagesProcessed: 0,
    pdfInputPagesProcessed: 0,
    rasterizedPagesProcessed: 0,
    fallbackReasons: [],
    modelsUsed: [],
  };
}

function trustFromReconciliation(result: ReconciliationResult): ExtractionTrustState {
  if (result.creditStatus === 'verified') return 'verified';
  if (result.creditStatus === 'mismatch') return 'mismatch';
  return 'partial';
}

function mergeDebitWarning(
  warnings: AnalysisWarning[],
  reconciliation: ReconciliationResult,
  fileName: string
): AnalysisWarning[] {
  const warning = debitReconciliationWarning(reconciliation, fileName);
  if (!warning) return warnings;
  if (warnings.some((item) => item.code === warning.code)) return warnings;
  return [...warnings, warning];
}

function finishSegment(
  result: SegmentExtraction,
  fileName: string
): SegmentExtraction {
  return {
    ...result,
    creditReconciliation: result.reconciliation.creditReconciliation,
    debitReconciliation: result.reconciliation.debitReconciliation,
    warnings: mergeDebitWarning(result.warnings, result.reconciliation, fileName),
  };
}

function applySourceTrust(
  trust: ExtractionTrustState,
  segment: StatementSegment
): ExtractionTrustState {
  if (trust === 'mismatch' && hasMissingPrintedPages(segment.sourceCompleteness)) {
    return 'incomplete_source';
  }
  return trust;
}

function annotateTransactions(
  transactions: NormalizedTransaction[],
  extras: Partial<NormalizedTransaction>
): NormalizedTransaction[] {
  return transactions.map((tx) => ({ ...tx, ...extras }));
}

function runDeterministic(segment: StatementSegment, fileName: string): ExtractedDocument {
  const documentType = detectDocumentType(fileName, segment.text);
  if (documentType === 'turbopass') {
    return parseTurboPassText(segment.text, fileName);
  }
  if (documentType === 'csv_export') {
    return parseCsvText(segment.text, fileName);
  }
  return parseBankStatementText(segment.text, fileName, { pages: segment.pageTexts });
}

function controlsForVision(
  segment: StatementSegment,
  extraction: VisionExtraction
) {
  if (segment.controls.some((control) => control.creditTotal != null || control.debitTotal != null)) {
    return segment.controls;
  }
  const fromVision = extraction.statements
    .map((statement) => ({
      creditTotal: statement.depositCreditTotal,
      creditCount: null,
      debitTotal: statement.withdrawalDebitTotal,
      beginningBalance: statement.beginningBalance,
      endingBalance: statement.endingBalance,
      accountLast4: statement.accountIdentifier,
      accountLabel: statement.bank,
    }))
    .filter(
      (control) =>
        control.creditTotal != null ||
        control.debitTotal != null ||
        control.beginningBalance != null ||
        control.endingBalance != null
    );
  if (fromVision.length) return fromVision;
  return extractControlTotalsFromText(segment.text);
}

function fusionProvenance(params: {
  usedTerra: boolean;
  usedSol: boolean;
  stats: FusionStats;
  deterministicCount: number;
}): ExtractionProvenance {
  if (params.usedSol && params.stats.solOnlyNew > 0) return 'sol_escalation';
  if (params.usedTerra && (params.stats.terraOnlyNew > 0 || params.deterministicCount === 0)) {
    return 'terra_vision';
  }
  if (params.usedSol && params.stats.solCandidates > 0) return 'sol_escalation';
  if (params.usedTerra && params.stats.terraCandidates > 0) return 'terra_vision';
  return 'deterministic';
}

async function callVision(params: {
  fileName: string;
  pdfBytes?: Uint8Array;
  pageNumbers: number[];
  images?: RenderedPageImage[];
  role: VisionRequest['role'];
  kindHint?: string;
  statementHint?: string;
  pageLevel?: boolean;
  deps: ExtractionDeps;
  telemetry: ExtractionTelemetry;
}): Promise<{ extraction: VisionExtraction; usedPdfInput: boolean }> {
  const cache = params.deps.visionCache;
  const cacheKey = `${params.fileName}:${params.role}:${params.pageNumbers.join(',')}`;
  const cached = cache?.get(cacheKey);
  if (cached) return cached;

  const client = params.deps.vision ?? requestVisionExtraction;
  const modelName = params.role === 'vision' ? 'gpt-5.6-terra' : 'gpt-5.6-sol';
  if (!params.telemetry.modelsUsed.includes(modelName)) {
    params.telemetry.modelsUsed.push(modelName);
  }

  const markPages = (count: number, pdfInput: boolean) => {
    if (params.role === 'vision') params.telemetry.terraPagesProcessed += count;
    else params.telemetry.solPagesProcessed += count;
    if (pdfInput) params.telemetry.pdfInputPagesProcessed += count;
    else params.telemetry.rasterizedPagesProcessed += count;
  };

  const pending = (async (): Promise<{ extraction: VisionExtraction; usedPdfInput: boolean }> => {
    if (params.pdfBytes && params.pageNumbers.length && !params.images) {
      const slicer = params.deps.slicePdf ?? extractSegmentPdf;
      try {
        const segmentBytes = await slicer(params.pdfBytes, params.pageNumbers);
        if (segmentBytes.byteLength) {
          markPages(params.pageNumbers.length, true);
          try {
            const extraction = await withTemporarySegmentPdf(
              segmentBytes,
              `segment-${params.pageNumbers[0]}-${params.pageNumbers[params.pageNumbers.length - 1]}.pdf`,
              async (_path, bytes) =>
                client({
                  fileName: params.fileName,
                  images: [],
                  pdf: {
                    fileName: params.fileName,
                    bytes,
                    pageNumbers: params.pageNumbers,
                  },
                  role: params.role,
                  kindHint: params.kindHint,
                  statementHint: params.statementHint,
                  pageLevel: params.pageLevel,
                })
            );
            return { extraction, usedPdfInput: true };
          } finally {
            segmentBytes.fill(0);
          }
        }
      } catch {
        // Direct PDF input unavailable — fall through to rasterization.
      }
    }

    let images = params.images;
    if (!images) {
      if (params.pdfBytes && params.pageNumbers.length) {
        const renderer = params.deps.renderPages ?? renderPdfPages;
        images = [];
        try {
          for (const batch of visionPageBatches(params.pageNumbers)) {
            const rendered = await renderer(params.pdfBytes, batch);
            images.push(...rendered);
          }
        } catch {
          return { extraction: parseVisionExtraction(null), usedPdfInput: false };
        }
      } else {
        images = params.pageNumbers.map((pageNumber) => ({
          pageNumber,
          mimeType: 'image/png' as const,
          bytes: new Uint8Array(),
        }));
      }
    }
    markPages(images.length || params.pageNumbers.length, false);
    try {
      const extraction = await client({
        fileName: params.fileName,
        images: imagesFromRendered(images),
        role: params.role,
        kindHint: params.kindHint,
        statementHint: params.statementHint,
        pageLevel: params.pageLevel,
      });
      return { extraction, usedPdfInput: false };
    } catch {
      return { extraction: parseVisionExtraction(null), usedPdfInput: false };
    } finally {
      for (const image of images) {
        image.bytes.fill(0);
      }
    }
  })();

  cache?.set(cacheKey, pending);
  return pending;
}

function visionConfigured(deps: ExtractionDeps): boolean {
  return Boolean(deps.vision) || isOpenAIConfigured();
}

function shouldEscalateToVision(params: {
  segment: StatementSegment;
  transactions: NormalizedTransaction[];
  reconciliation: ReconciliationResult;
}): FallbackReason | null {
  if (params.segment.imageOnly) return 'image_only';
  if (!params.segment.text.trim()) return 'insufficient_text';
  if (!params.transactions.length) return 'zero_transactions';
  if (params.reconciliation.creditStatus === 'mismatch') {
    if (
      isImplausiblyFew(
        params.reconciliation.extractedTransactionCount,
        params.reconciliation.extractedCreditTotal,
        params.reconciliation.expectedTransactionCount,
        params.reconciliation.expectedCreditTotal
      )
    ) {
      return 'implausibly_few';
    }
    return 'control_mismatch';
  }
  return null;
}

async function extractSegment(params: {
  segment: StatementSegment;
  segmentCount: number;
  fileName: string;
  pdfBytes?: Uint8Array;
  deps: ExtractionDeps;
  telemetry: ExtractionTelemetry;
}): Promise<SegmentExtraction> {
  const { segment, fileName, deps, telemetry } = params;
  const accountHint = segment.accounts[0]?.accountLast4
    ? `Account ending ${segment.accounts[0].accountLast4}.`
    : '';
  const statementHint = [
    segment.period
      ? `Statement period ${segment.period.startDate} to ${segment.period.endDate}.`
      : '',
    accountHint,
    `Segment ${segment.index + 1} of ${params.segmentCount}.`,
  ]
    .filter(Boolean)
    .join(' ');

  let deterministicTxs: NormalizedTransaction[] = [];
  let deterministicWarnings: AnalysisWarning[] = [];
  let fallbackReason: FallbackReason | undefined;

  if (!segment.imageOnly) {
    telemetry.deterministicPagesProcessed += segment.pageNumbers.length;
    const parsed = runDeterministic(segment, fileName);
    deterministicWarnings = parsed.warnings.filter(
      (warning) => warning.code !== 'deposit_control_mismatch'
    );
    deterministicTxs = parsed.transactions.map((tx) => ({
      ...tx,
      statementSegmentId: segment.id,
      extractionProvenance: 'deterministic' as const,
      extractionProvenanceSources: ['deterministic' as const],
      extractionConfidence: 1,
      amountSource: tx.amountSource ?? 'explicit',
    }));
    const reconciliation = reconcileAgainstControls(deterministicTxs, segment.controls);
    fallbackReason = shouldEscalateToVision({
      segment,
      transactions: deterministicTxs,
      reconciliation,
    }) ?? undefined;
    const trustState = applySourceTrust(trustFromReconciliation(reconciliation), segment);
    const annotated = annotateTransactions(deterministicTxs, { extractionTrustState: trustState });
    if (!fallbackReason) {
      const fused = fuseTransactionCandidates({ deterministic: annotated });
      return finishSegment(
        {
          segment,
          transactions: annotated,
          warnings: deterministicWarnings,
          provenance: 'deterministic',
          trustState,
          reconciliation,
          processingNote: buildProcessingNote({
            segment,
            segmentCount: params.segmentCount,
            provenance: 'deterministic',
            trustState,
            reconciliation,
          }),
          deterministicExtractedCreditTotal: sumDirection(annotated, 'in'),
          fusionStats: fused.stats,
          aiFallbackPages: { terra: [], sol: [] },
        },
        fileName
      );
    }
    telemetry.fallbackReasons.push(fallbackReason);
    if (!visionConfigured(deps) || (!params.pdfBytes && !deps.vision && !deps.renderPages)) {
      const offlineTrust = applySourceTrust(trustFromReconciliation(reconciliation), segment);
      const offlineReason: FallbackReason | undefined =
        offlineTrust === 'incomplete_source' ? 'incomplete_source' : fallbackReason;
      return finishSegment(
        {
          segment,
          transactions: annotateTransactions(deterministicTxs, {
            extractionTrustState: offlineTrust,
          }),
          warnings: parsed.warnings,
          provenance: 'deterministic',
          trustState: offlineTrust,
          reconciliation,
          fallbackReason: offlineReason,
          processingNote: buildProcessingNote({
            segment,
            segmentCount: params.segmentCount,
            provenance: 'deterministic',
            trustState: offlineTrust,
            reconciliation,
            fallbackReason: offlineReason,
          }),
          deterministicExtractedCreditTotal: sumDirection(deterministicTxs, 'in'),
          fusionStats: fuseTransactionCandidates({ deterministic: deterministicTxs }).stats,
          aiFallbackPages: { terra: [], sol: [] },
        },
        fileName
      );
    }
  } else {
    fallbackReason = 'image_only';
    telemetry.fallbackReasons.push('image_only');
    if (!visionConfigured(deps) || (!params.pdfBytes && !deps.vision && !deps.renderPages)) {
      return finishSegment(
        {
          segment,
          transactions: [],
          warnings: [
            {
              code: 'scanned_pdf',
              message: `Unable to identify transactions on ${fileName}. The PDF appears to have little or no extractable text.`,
              documentName: fileName,
            },
          ],
          provenance: 'deterministic',
          trustState: 'mismatch',
          reconciliation: reconcileAgainstControls([], segment.controls),
          fallbackReason: 'image_only',
          processingNote: 'Image-only document — vision extraction is not configured.',
          aiFallbackPages: { terra: [], sol: [] },
        },
        fileName
      );
    }
  }

  const kindHint =
    segment.institution === 'turbopass' || segment.imageOnly
      ? 'Possible TurboPass or scanned bank statement. Prefer the Deposits table if visible.'
      : `${parserLabel(segment.institution)}. Extract every incoming credit on the provided page(s).`;

  const collectVision = async (
    role: VisionRequest['role'],
    pages: number[],
    pageLevel: boolean
  ) => {
    const transactions: NormalizedTransaction[] = [];
    let usedPdfInput = false;
    let lastExtraction = parseVisionExtraction(null);
    for (const range of contiguousPageRanges(pages)) {
      const call = await callVision({
        fileName,
        pdfBytes: params.pdfBytes,
        pageNumbers: range,
        role,
        kindHint,
        statementHint,
        pageLevel,
        deps,
        telemetry,
      });
      usedPdfInput = usedPdfInput || call.usedPdfInput;
      lastExtraction = call.extraction;
      transactions.push(
        ...visionRowsToTransactions({
          fileName,
          documentType:
            call.extraction.documentKind === 'turbopass' ? 'turbopass' : segment.documentType,
          extraction: call.extraction,
          provenance: role === 'vision' ? 'terra_vision' : 'sol_escalation',
          fallbackAccount: segment.accounts[0]?.accountLast4 ?? null,
          statementSegmentId: segment.id,
        })
      );
    }
    return { transactions, usedPdfInput, extraction: lastExtraction };
  };

  const terraPages = detectUnresolvedPages(segment, deterministicTxs);
  const terraPageLevel = !segment.imageOnly && terraPages.length < segment.pageNumbers.length;
  const terraCall = await collectVision('vision', terraPages, terraPageLevel);
  let usedPdfInput = terraCall.usedPdfInput;

  let fused = fuseTransactionCandidates({
    deterministic: deterministicTxs,
    terra: terraCall.transactions,
  });
  let controls = controlsForVision(segment, terraCall.extraction);
  let reconciliation = reconcileAgainstControls(fused.transactions, controls);
  let trustState = trustFromReconciliation(reconciliation);
  let solPages: number[] = [];
  let solTxs: NormalizedTransaction[] = [];
  const terraDone =
    trustState === 'verified' || (trustState === 'partial' && fused.transactions.length > 0);

  if (!terraDone) {
    if (hasMissingPrintedPages(segment.sourceCompleteness) && trustState === 'mismatch') {
      fallbackReason = 'incomplete_source';
      telemetry.fallbackReasons.push('incomplete_source');
    } else {
      const unresolved = detectUnresolvedPages(segment, fused.transactions);
      solPages = unresolved.length ? unresolved : terraPages;
      const solPageLevel = !segment.imageOnly && solPages.length < segment.pageNumbers.length;
      const solCall = await collectVision('escalation', solPages, solPageLevel);
      usedPdfInput = usedPdfInput || solCall.usedPdfInput;
      solTxs = solCall.transactions;
      fused = fuseTransactionCandidates({
        deterministic: deterministicTxs,
        terra: terraCall.transactions,
        sol: solTxs,
      });
      controls = controlsForVision(segment, solCall.extraction.valid ? solCall.extraction : terraCall.extraction);
      reconciliation = reconcileAgainstControls(fused.transactions, controls);
      trustState = trustFromReconciliation(reconciliation);
    }
  }

  trustState = applySourceTrust(trustState, segment);
  if (trustState === 'incomplete_source') fallbackReason = 'incomplete_source';

  const provenance = fusionProvenance({
    usedTerra: terraCall.transactions.length > 0,
    usedSol: solTxs.length > 0,
    stats: fused.stats,
    deterministicCount: deterministicTxs.length,
  });
  const processingNote = buildProcessingNote({
    segment,
    segmentCount: params.segmentCount,
    provenance,
    trustState,
    reconciliation,
    fallbackReason:
      fallbackReason ??
      (trustState === 'incomplete_source'
        ? 'incomplete_source'
        : trustState === 'mismatch'
          ? 'control_mismatch'
          : undefined),
  });
  const annotated = annotateTransactions(fused.transactions, { extractionTrustState: trustState });

  return finishSegment(
    {
      segment,
      transactions: annotated,
      warnings:
        trustState === 'incomplete_source'
          ? [
              ...deterministicWarnings,
              {
                code: 'incomplete_source',
                message: processingNote,
                documentName: fileName,
              },
            ]
          : trustState === 'mismatch'
          ? [
              ...deterministicWarnings,
              {
                code: 'extraction_unverified',
                message: buyerReviewWarning(reconciliation),
                documentName: fileName,
              },
            ]
          : deterministicWarnings,
      provenance,
      trustState,
      reconciliation,
      fallbackReason:
        fallbackReason ??
        (trustState === 'incomplete_source'
          ? 'incomplete_source'
          : trustState === 'mismatch'
            ? 'control_mismatch'
            : undefined),
      processingNote,
      deterministicExtractedCreditTotal: sumDirection(deterministicTxs, 'in'),
      terraExtractedCreditTotal: sumDirection(terraCall.transactions, 'in'),
      solExtractedCreditTotal: solTxs.length ? sumDirection(solTxs, 'in') : null,
      usedPdfInput,
      fusionStats: fused.stats,
      aiFallbackPages: { terra: terraPages, sol: solPages },
    },
    fileName
  );
}

function periodFromSegment(fileName: string, extraction: SegmentExtraction): DocumentPeriod {
  const dates = extraction.transactions.map((tx) => tx.date).sort();
  return {
    documentName: fileName,
    startDate: extraction.segment.period?.startDate ?? dates[0] ?? null,
    endDate: extraction.segment.period?.endDate ?? dates[dates.length - 1] ?? null,
    source: extraction.segment.period ? 'statement_header' : dates.length ? 'transaction_dates' : 'unknown',
    accountLast4: extraction.segment.accounts[0]?.accountLast4 ?? null,
    homeState: extractHomeState(extraction.segment.text),
  };
}

function noteWarning(extraction: SegmentExtraction, fileName: string): AnalysisWarning {
  const code =
    extraction.trustState === 'incomplete_source'
      ? 'incomplete_source'
      : extraction.trustState === 'mismatch'
        ? 'extraction_unverified'
        : extraction.trustState === 'verified'
          ? 'extraction_verified'
          : 'extraction_partial';
  return {
    code,
    message: extraction.processingNote,
    documentName: fileName,
  };
}

async function extractPdfFile(
  file: UploadedFile,
  deps: ExtractionDeps,
  telemetry: ExtractionTelemetry
): Promise<ExtractedDocument> {
  const pdf = await extractPdfPages(file.bytes);
  const preflight = buildPreflight({
    fileName: file.fileName,
    pages: pdf.pages,
    text: pdf.text,
  });
  const segmentCount = preflight.segments.length;
  const extractedSegments: SegmentExtraction[] = [];

  for (const segment of preflight.segments) {
    extractedSegments.push(
      await extractSegment({
        segment,
        segmentCount,
        fileName: file.fileName,
        pdfBytes: file.bytes,
        deps,
        telemetry,
      })
    );
  }

  const transactions = extractedSegments.flatMap((item) => item.transactions);
  const warnings: AnalysisWarning[] = [];
  for (const item of extractedSegments) {
    warnings.push(noteWarning(item, file.fileName));
    warnings.push(...item.warnings.filter((warning) => warning.code !== noteWarning(item, file.fileName).code));
  }

  const verified = extractedSegments.filter((item) => item.trustState === 'verified');
  const unverified = extractedSegments.filter(
    (item) => item.trustState === 'mismatch' || item.trustState === 'incomplete_source'
  );
  if (verified.length && unverified.length) {
    warnings.push({
      code: 'segment_partial_failure',
      message: `${verified.length} of ${segmentCount} statement segments verified. Unverified segments are flagged for buyer review and are not blended into verified averages.`,
      documentName: file.fileName,
    });
  }

  const firstPeriod = extractedSegments[0] ? periodFromSegment(file.fileName, extractedSegments[0]) : {
    documentName: file.fileName,
    startDate: null,
    endDate: null,
    source: 'unknown' as const,
    accountLast4: null,
  };

  return {
    fileName: file.fileName,
    text: pdf.text,
    transactions,
    period: firstPeriod,
    warnings,
    pageCount: pdf.pageCount,
    segments: extractedSegments,
    preflight,
    telemetry,
  };
}

async function extractOne(
  file: UploadedFile,
  deps: ExtractionDeps,
  telemetry: ExtractionTelemetry
): Promise<ExtractedDocument> {
  const mime = detectMime(file.fileName, file.bytes, file.mimeType);

  if (mime === 'text/csv') {
    const text = bytesToText(file.bytes);
    const parsed = parseCsvText(text, file.fileName);
    telemetry.deterministicPagesProcessed += 1;
    parsed.transactions = annotateTransactions(parsed.transactions, {
      extractionProvenance: 'deterministic',
      extractionConfidence: 1,
      extractionTrustState: 'partial',
    });
    return parsed;
  }

  if (mime.startsWith('image/')) {
    const vision = await (async () => {
      if (!visionConfigured(deps)) {
        return {
          transactions: [] as NormalizedTransaction[],
          warnings: [
            {
              code: 'vision_skipped',
              message: `Could not extract text from ${file.fileName} and OpenAI is not configured for image extraction.`,
              documentName: file.fileName,
            },
          ] as AnalysisWarning[],
        };
      }
      const client = deps.vision ?? requestVisionExtraction;
      const extraction = await client({
        fileName: file.fileName,
        images: [{ mimeType: mime, bytes: file.bytes, pageNumber: 1 }],
        role: 'vision',
        kindHint: 'image upload',
      });
      telemetry.terraPagesProcessed += 1;
      return {
        transactions: visionRowsToTransactions({
          fileName: file.fileName,
          documentType: 'image',
          extraction,
          provenance: 'terra_vision',
        }),
        warnings: extraction.valid
          ? []
          : [
              {
                code: 'vision_extraction_failed',
                message: `Image/scanned extraction failed for ${file.fileName}.`,
                documentName: file.fileName,
              },
            ],
      };
    })();
    const dates = vision.transactions.map((tx) => tx.date).sort();
    return {
      fileName: file.fileName,
      text: '',
      transactions: vision.transactions,
      period: {
        documentName: file.fileName,
        startDate: dates[0] ?? null,
        endDate: dates[dates.length - 1] ?? null,
        source: dates.length ? 'transaction_dates' : 'unknown',
        accountLast4: null,
      },
      warnings: vision.warnings,
    };
  }

  if (mime === 'application/pdf') {
    return extractPdfFile(file, deps, telemetry);
  }

  const text = bytesToText(file.bytes);
  if (textLooksEmpty(text)) {
    return {
      fileName: file.fileName,
      text,
      transactions: [],
      period: {
        documentName: file.fileName,
        startDate: null,
        endDate: null,
        source: 'unknown',
        accountLast4: null,
      },
      warnings: [
        {
          code: 'scanned_pdf',
          message: `Unable to identify transactions on ${file.fileName}.`,
          documentName: file.fileName,
        },
      ],
    };
  }
  return parseBankStatementText(text, file.fileName);
}

export async function extractDocuments(
  files: UploadedFile[],
  deps: ExtractionDeps = {}
): Promise<ExtractionResult> {
  validateUpload(files);

  const documents: ExtractedDocument[] = [];
  const warnings: AnalysisWarning[] = [];
  const telemetry = emptyTelemetry();
  const resolvedDeps: ExtractionDeps = {
    ...deps,
    visionCache: deps.visionCache ?? new Map(),
  };

  for (const file of files) {
    try {
      const extracted = await extractOne(file, resolvedDeps, telemetry);
      documents.push(extracted);
      warnings.push(...extracted.warnings);
    } catch (error) {
      warnings.push({
        code: 'document_failed',
        message:
          error instanceof Error ? error.message : `Failed to process ${file.fileName}.`,
        documentName: file.fileName,
      });
    }
  }

  const documentPeriods = documents.flatMap((document) => {
    if (document.segments?.length) {
      return document.segments.map((segment) => periodFromSegment(document.fileName, segment));
    }
    return [document.period];
  });

  return {
    transactions: documents.flatMap((document) => document.transactions),
    documentPeriods,
    warnings,
    documentTexts: documents.map((document) => document.text),
    documents: documents.map((document) => ({
      fileName: document.fileName,
      documentType: document.transactions[0]?.sourceDocumentType ?? 'other',
      transactionCount: document.transactions.length,
      warningCount: document.warnings.length,
    })),
    telemetry,
    segments: documents.flatMap((document) => document.segments ?? []),
  };
}

export { buildPreflight, trustFromReconciliation };

export function printedDepositControlTotalFromSegments(
  segments?: SegmentExtraction[]
): number {
  return (segments ?? []).reduce((sum, segment) => {
    const total = segment.reconciliation.expectedCreditTotal;
    return total != null && Number.isFinite(total) && total > 0 ? addMoney(sum, total) : sum;
  }, 0);
}

/** Test/helper entry point: run the hybrid pipeline on already-extracted page text. */
export async function extractFromTextPages(params: {
  fileName: string;
  pages: string[];
  pdfBytes?: Uint8Array;
  deps?: ExtractionDeps;
}): Promise<ExtractionResult> {
  const telemetry = emptyTelemetry();
  const deps: ExtractionDeps = {
    ...params.deps,
    visionCache: params.deps?.visionCache ?? new Map(),
  };
  const text = params.pages.join('\n');
  const preflight = buildPreflight({
    fileName: params.fileName,
    pages: params.pages,
    text,
  });
  const extractedSegments: SegmentExtraction[] = [];
  for (const segment of preflight.segments) {
    extractedSegments.push(
      await extractSegment({
        segment,
        segmentCount: preflight.segments.length,
        fileName: params.fileName,
        pdfBytes: params.pdfBytes,
        deps,
        telemetry,
      })
    );
  }
  const document: ExtractedDocument = {
    fileName: params.fileName,
    text,
    transactions: extractedSegments.flatMap((item) => item.transactions),
    period: extractedSegments[0]
      ? periodFromSegment(params.fileName, extractedSegments[0])
      : {
          documentName: params.fileName,
          startDate: null,
          endDate: null,
          source: 'unknown',
          accountLast4: null,
        },
    warnings: extractedSegments.flatMap((item) => [
      noteWarning(item, params.fileName),
      ...item.warnings,
    ]),
    pageCount: params.pages.length,
    segments: extractedSegments,
    preflight,
    telemetry,
  };
  return {
    transactions: document.transactions,
    documentPeriods: extractedSegments.map((item) => periodFromSegment(params.fileName, item)),
    warnings: document.warnings,
    documentTexts: [document.text],
    documents: [
      {
        fileName: params.fileName,
        documentType: document.transactions[0]?.sourceDocumentType ?? 'other',
        transactionCount: document.transactions.length,
        warningCount: document.warnings.length,
      },
    ],
    telemetry,
    segments: extractedSegments,
  };
}
