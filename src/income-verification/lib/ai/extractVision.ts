import type { AnalysisWarning, NormalizedTransaction } from '../analysis/types';
import { parseFlexibleDate, parseAmount } from '../extract/parse';
import { getOpenAIApiKey, getOpenAIModel } from './openai';

interface VisionRow {
  date: string;
  description: string;
  amount: number;
  direction: 'in' | 'out';
}

export async function extractTransactionsFromImage(params: {
  fileName: string;
  bytes: Uint8Array;
  mimeType: string;
}): Promise<{ transactions: NormalizedTransaction[]; warnings: AnalysisWarning[] }> {
  const warnings: AnalysisWarning[] = [];
  const apiKey = getOpenAIApiKey();
  if (!apiKey) {
    return {
      transactions: [],
      warnings: [
        {
          code: 'vision_skipped',
          message: `Could not extract text from ${params.fileName} and OpenAI is not configured for image extraction.`,
          documentName: params.fileName,
        },
      ],
    };
  }

  const imageData = Buffer.from(params.bytes).toString('base64');
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: getOpenAIModel(),
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'Extract bank-statement transactions only. Return JSON {"transactions":[{"date":"YYYY-MM-DD","description":"string","amount":0,"direction":"in"|"out"}]}. Do not calculate totals. Do not invent missing amounts or dates. Omit rows you cannot read.',
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Extract identifiable money-in and money-out rows from this document (${params.fileName}).`,
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:${params.mimeType};base64,${imageData}`,
              },
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    warnings.push({
      code: 'vision_extraction_failed',
      message: `Image/scanned extraction failed for ${params.fileName}.`,
      documentName: params.fileName,
    });
    return { transactions: [], warnings };
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    return {
      transactions: [],
      warnings: [
        {
          code: 'vision_extraction_failed',
          message: `No transactions could be read from ${params.fileName}.`,
          documentName: params.fileName,
        },
      ],
    };
  }

  let rows: VisionRow[] = [];
  try {
    const parsed = JSON.parse(content) as { transactions?: VisionRow[] };
    rows = parsed.transactions ?? [];
  } catch {
    warnings.push({
      code: 'vision_extraction_failed',
      message: `Could not parse extracted transactions from ${params.fileName}.`,
      documentName: params.fileName,
    });
    return { transactions: [], warnings };
  }

  const transactions: NormalizedTransaction[] = [];
  rows.forEach((row, index) => {
    const date = parseFlexibleDate(String(row.date ?? ''));
    const amount = Math.abs(parseAmount(String(row.amount ?? '')) ?? Number(row.amount) ?? 0);
    if (!date || !amount) {
      warnings.push({
        code: 'transaction_amount_unparsed',
        message: `A row in ${params.fileName} could not be reliably extracted and was skipped.`,
        documentName: params.fileName,
      });
      return;
    }
    transactions.push({
      id: `${params.fileName}:vision:${date}:${amount}:${index}`,
      date,
      description: String(row.description || 'Extracted transaction'),
      rawDescription: String(row.description || ''),
      amount,
      direction: row.direction === 'out' ? 'out' : 'in',
      sourceDocument: params.fileName,
      sourceDocumentType: 'image',
      sourceAccount: null,
      detectedIncomeSource: null,
      turbopassCategory: null,
    });
  });

  return { transactions, warnings };
}
