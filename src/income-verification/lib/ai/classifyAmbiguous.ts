import type { AnalysisWarning, DepositClassification, Transaction } from '../analysis/types';
import {
  ambiguousPayload,
  classificationFromModel,
  isValidDepositCategory,
} from './schema';
import { getOpenAIApiKey, getOpenAIModel, isOpenAIConfigured } from './openai';

const BATCH_SIZE = 25;

interface ModelRow {
  id: string;
  category: string;
  subcategory?: string;
  reason: string;
  confidence: number;
}

function parseModelJson(text: string): ModelRow[] {
  const trimmed = text.trim().replace(/^```json\s*/i, '').replace(/```$/, '');
  const parsed = JSON.parse(trimmed) as { classifications?: ModelRow[] } | ModelRow[];
  return Array.isArray(parsed) ? parsed : parsed.classifications ?? [];
}

async function requestBatch(batch: Transaction[]): Promise<ModelRow[]> {
  const apiKey = getOpenAIApiKey();
  if (!apiKey) {
    throw new Error('OpenAI is not configured');
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: getOpenAIModel(),
      temperature: 0,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'deposit_categories',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              classifications: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    id: { type: 'string' },
                    category: { type: 'string' },
                    subcategory: { type: 'string' },
                    reason: { type: 'string' },
                    confidence: { type: 'number' },
                  },
                  required: ['id', 'category', 'subcategory', 'reason', 'confidence'],
                },
              },
            },
            required: ['classifications'],
          },
        },
      },
      messages: [
        {
          role: 'system',
          content:
            'You categorize incoming bank deposits for underwriting. Return structured categories only. Do not calculate totals and do not decide whether money should be included or excluded. Categories must be one of: payroll, p2p_transfer, cash_deposit, account_transfer, check, miscellaneous.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            instruction:
              'Categorize each incoming transaction. Identify likely employer/payroll source, Zelle/Cash App/Venmo sender, recurring sender, possible customer payment, likely account transfer, or refund/credit. Never mark a deposit as excluded.',
            transactions: ambiguousPayload(batch),
          }),
        },
      ],
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`OpenAI classification failed (${response.status}): ${details.slice(0, 300)}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('OpenAI classification returned an empty response.');
  }
  return parseModelJson(content);
}

export async function classifyAmbiguousTransactions(
  transactions: Transaction[]
): Promise<{ byId: Map<string, DepositClassification>; warnings: AnalysisWarning[] }> {
  const byId = new Map<string, DepositClassification>();
  const warnings: AnalysisWarning[] = [];
  const ambiguous = transactions.filter(
    (tx) =>
      tx.direction === 'in' &&
      !tx.duplicateOf &&
      (tx.ruleClassification.confidence < 0.7 || tx.ruleClassification.category === 'miscellaneous')
  );

  if (!ambiguous.length) {
    return { byId, warnings };
  }

  if (!isOpenAIConfigured()) {
    warnings.push({
      code: 'ai_skipped',
      message:
        'OpenAI is not configured on this server. Deposits were categorized by rules only and remain included until the underwriter decides.',
    });
    return { byId, warnings };
  }

  for (let i = 0; i < ambiguous.length; i += BATCH_SIZE) {
    const batch = ambiguous.slice(i, i + BATCH_SIZE);
    try {
      const rows = await requestBatch(batch);
      for (const row of rows) {
        if (!isValidDepositCategory(row.category)) continue;
        const confidence = Math.min(1, Math.max(0, Number(row.confidence) || 0));
        byId.set(
          row.id,
          classificationFromModel(
            row.category,
            row.reason || 'Model category.',
            confidence,
            row.subcategory
          )
        );
      }
    } catch {
      warnings.push({
        code: 'ai_classification_failed',
        message:
          'AI categorization failed. Rule categories were kept and deposits remain included.',
      });
      break;
    }
  }

  return { byId, warnings };
}
