import type { AnalysisWarning, DocumentType, ExtractionProvenance, NormalizedTransaction } from '../analysis/types';
import { roundMoney } from '../analysis/money';
import { mapTurboCategory, parseVisionExtraction, visionSystemPrompt, VISION_JSON_SCHEMA, type VisionExtraction } from './visionSchema';
import { getOpenAIApiKey, getOpenAIModel, getReasoningEffort, isOpenAIConfigured, type OpenAIModelRole } from './models';
import type { RenderedPageImage } from '../extract/renderPages';

export interface VisionPdfInput {
  fileName: string;
  bytes: Uint8Array;
  pageNumbers: number[];
}

export interface VisionRequest {
  fileName: string;
  images: Array<{ pageNumber?: number; mimeType: string; bytes: Uint8Array }>;
  pdf?: VisionPdfInput;
  kindHint?: string;
  role: Extract<OpenAIModelRole, 'vision' | 'escalation'>;
  statementHint?: string;
  pageLevel?: boolean;
}

export type VisionClient = (request: VisionRequest) => Promise<VisionExtraction>;

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

function userPrompt(request: VisionRequest, pageNumbers: number[]): string {
  return [
    `Extract structured transactions from ${request.fileName}.`,
    request.statementHint ?? '',
    pageNumbers.length
      ? `This file contains only these original page numbers, in order: ${pageNumbers.join(', ')}. Map sourcePage to those original numbers.`
      : '',
    request.pageLevel
      ? 'Targeted page-level fallback: extract every incoming credit on these page(s) with date, description, amount, running balance if visible, and transaction/reference ID. Report extractedCreditCount and extractedCreditSum for this page range. Those figures are informational only.'
      : 'Extract this statement period only. Do not merge other months.',
    'Do not invent a transaction to satisfy a statement control total.',
    'Return JSON matching the schema. Do not calculate monthly totals.',
  ]
    .filter(Boolean)
    .join(' ');
}

function parseJsonContent(content: string | null | undefined): VisionExtraction {
  if (!content) return parseVisionExtraction(null);
  try {
    return parseVisionExtraction(JSON.parse(content));
  } catch {
    return parseVisionExtraction(null);
  }
}

function readResponsesOutputText(data: {
  output_text?: string;
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
}): string | null {
  if (typeof data.output_text === 'string' && data.output_text.trim()) {
    return data.output_text;
  }
  const chunks: string[] = [];
  for (const item of data.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === 'output_text' && content.text) chunks.push(content.text);
    }
  }
  const joined = chunks.join('').trim();
  return joined || null;
}

async function requestPdfVisionExtraction(request: VisionRequest): Promise<VisionExtraction> {
  const apiKey = getOpenAIApiKey();
  const pdf = request.pdf;
  if (!apiKey || !pdf?.bytes.byteLength) {
    return parseVisionExtraction(null);
  }

  const model = getOpenAIModel(request.role);
  const reasoning = getReasoningEffort(request.role);
  const body: Record<string, unknown> = {
    model,
    instructions: visionSystemPrompt(request.kindHint),
    input: [
      {
        role: 'user',
        content: [
          {
            type: 'input_file',
            filename: pdf.fileName.replace(/[^\w.-]+/g, '_') || 'statement-segment.pdf',
            file_data: `data:application/pdf;base64,${toBase64(pdf.bytes)}`,
            detail: 'high',
          },
          {
            type: 'input_text',
            text: userPrompt(request, pdf.pageNumbers),
          },
        ],
      },
    ],
    text: {
      format: {
        type: 'json_schema',
        name: VISION_JSON_SCHEMA.name,
        strict: VISION_JSON_SCHEMA.strict,
        schema: VISION_JSON_SCHEMA.schema,
      },
    },
  };
  if (reasoning) {
    body.reasoning = { effort: reasoning };
  }

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    return parseVisionExtraction(null);
  }

  const data = (await response.json()) as {
    output_text?: string;
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  };
  return parseJsonContent(readResponsesOutputText(data));
}

async function requestImageVisionExtraction(request: VisionRequest): Promise<VisionExtraction> {
  const apiKey = getOpenAIApiKey();
  if (!apiKey) {
    return parseVisionExtraction(null);
  }

  const model = getOpenAIModel(request.role);
  const reasoning = getReasoningEffort(request.role);
  const imageContent = request.images.map((image) => ({
    type: 'image_url' as const,
    image_url: {
      url: `data:${image.mimeType};base64,${toBase64(image.bytes)}`,
      detail: 'high' as const,
    },
  }));

  const body: Record<string, unknown> = {
    model,
    response_format: {
      type: 'json_schema',
      json_schema: VISION_JSON_SCHEMA,
    },
    messages: [
      { role: 'system', content: visionSystemPrompt(request.kindHint) },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: userPrompt(
              request,
              request.images.map((image) => image.pageNumber ?? 1)
            ),
          },
          ...imageContent,
        ],
      },
    ],
  };
  if (reasoning) {
    body.reasoning_effort = reasoning;
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    return parseVisionExtraction(null);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return parseJsonContent(data.choices?.[0]?.message?.content);
}

export async function requestVisionExtraction(request: VisionRequest): Promise<VisionExtraction> {
  if (request.pdf?.bytes.byteLength) {
    return requestPdfVisionExtraction(request);
  }
  if (request.images.some((image) => image.bytes.byteLength > 0)) {
    return requestImageVisionExtraction(request);
  }
  return parseVisionExtraction(null);
}

export function visionRowsToTransactions(params: {
  fileName: string;
  documentType: DocumentType;
  extraction: VisionExtraction;
  provenance: ExtractionProvenance;
  fallbackAccount?: string | null;
  statementSegmentId?: string;
}): NormalizedTransaction[] {
  const rows = params.extraction.usedDepositsTable
    ? params.extraction.transactions.filter((row) => row.direction === 'credit')
    : params.extraction.transactions;

  return rows.map((row, index) => {
    const account =
      last4(row.accountIdentifier) ?? last4(params.fallbackAccount) ?? null;
    const date = row.transactionDate as string;
    return {
      id: `${params.fileName}:${params.provenance}:${date}:${row.amount}:${row.sourcePage ?? 0}:${index}`,
      date,
      description: row.description,
      rawDescription: row.description,
      amount: roundMoney(row.amount),
      direction: row.direction === 'debit' ? 'out' : 'in',
      sourceDocument: params.fileName,
      sourceDocumentType: params.documentType,
      sourceAccount: account,
      detectedIncomeSource: null,
      turbopassCategory: mapTurboCategory(row.bankCategory),
      runningBalance: row.runningBalance,
      page: row.sourcePage,
      statementSegmentId: params.statementSegmentId ?? row.statementSegmentId,
      extractionProvenance: params.provenance,
      extractionProvenanceSources: [params.provenance],
      extractionConfidence: row.extractionConfidence,
      amountSource: 'model',
      referenceId: row.referenceId,
    };
  });
}

function last4(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, '');
  return digits.length >= 4 ? digits.slice(-4) : null;
}

export async function extractTransactionsFromImage(params: {
  fileName: string;
  bytes: Uint8Array;
  mimeType: string;
  client?: VisionClient;
}): Promise<{ transactions: NormalizedTransaction[]; warnings: AnalysisWarning[]; extraction: VisionExtraction }> {
  const warnings: AnalysisWarning[] = [];
  if (!isOpenAIConfigured() && !params.client) {
    return {
      transactions: [],
      extraction: parseVisionExtraction(null),
      warnings: [
        {
          code: 'vision_skipped',
          message: `Could not extract text from ${params.fileName} and OpenAI is not configured for image extraction.`,
          documentName: params.fileName,
        },
      ],
    };
  }

  const client = params.client ?? requestVisionExtraction;
  const extraction = await client({
    fileName: params.fileName,
    images: [{ mimeType: params.mimeType, bytes: params.bytes, pageNumber: 1 }],
    role: 'vision',
    kindHint: 'image upload',
  });

  if (!extraction.valid) {
    warnings.push({
      code: 'vision_extraction_failed',
      message: `Image/scanned extraction failed for ${params.fileName}.`,
      documentName: params.fileName,
    });
    return { transactions: [], warnings, extraction };
  }

  return {
    transactions: visionRowsToTransactions({
      fileName: params.fileName,
      documentType: 'image',
      extraction,
      provenance: 'terra_vision',
    }),
    warnings,
    extraction,
  };
}

export function imagesFromRendered(pages: RenderedPageImage[]) {
  return pages.map((page) => ({
    pageNumber: page.pageNumber,
    mimeType: page.mimeType,
    bytes: page.bytes,
  }));
}
