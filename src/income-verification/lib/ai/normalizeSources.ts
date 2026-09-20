import type { AnalysisWarning, Transaction } from '../analysis/types';
import { getOpenAIApiKey, getOpenAIModel, isOpenAIConfigured } from './models';

const BATCH_SIZE = 25;

interface ModelRow {
  id: string;
  normalizedSource: string;
}

function parseModelJson(text: string): ModelRow[] {
  const trimmed = text.trim().replace(/^```json\s*/i, '').replace(/```$/, '');
  const parsed = JSON.parse(trimmed) as { sources?: ModelRow[] } | ModelRow[];
  return Array.isArray(parsed) ? parsed : parsed.sources ?? [];
}

function looksUsable(value: string): boolean {
  const source = value.trim();
  if (source.length < 2 || source.length > 80) return false;
  if (/\bconf(?:irmation)?\b/i.test(source)) return false;
  if (/xxxxx?\d+|\d{5,}/i.test(source)) return false;
  return true;
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
      model: getOpenAIModel('classification'),
      temperature: 0,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'normalized_sources',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              sources: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    id: { type: 'string' },
                    normalizedSource: { type: 'string' },
                  },
                  required: ['id', 'normalizedSource'],
                },
              },
            },
            required: ['sources'],
          },
        },
      },
      messages: [
        {
          role: 'system',
          content:
            'Extract the underlying person, business, or account source for grouping bank deposits. Return a short display name only. Strip ATM numbers, confirmation numbers, transaction IDs, dates, ACH IDs, account masks, and location noise. Do not merge different people or businesses. Do not decide include/exclude.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            instruction:
              'If a person or business name is identifiable, return that name. If only a generic ATM/cash deposit remains, return "ATM Deposit".',
            transactions: batch.map((tx) => ({
              id: tx.id,
              description: tx.description,
              rawDescription: tx.rawDescription,
              ruleSource: tx.normalizedSource,
            })),
          }),
        },
      ],
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`OpenAI source normalization failed (${response.status}): ${details.slice(0, 300)}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('OpenAI source normalization returned an empty response.');
  }
  return parseModelJson(content);
}

export async function normalizeAmbiguousSources(
  transactions: Transaction[]
): Promise<{ byId: Map<string, string>; warnings: AnalysisWarning[] }> {
  const byId = new Map<string, string>();
  const warnings: AnalysisWarning[] = [];
  const ambiguous = transactions.filter(
    (tx) => tx.direction === 'in' && !tx.duplicateOf && tx.sourceConfidence < 0.7
  );

  if (!ambiguous.length) {
    return { byId, warnings };
  }

  if (!isOpenAIConfigured()) {
    return { byId, warnings };
  }

  for (let i = 0; i < ambiguous.length; i += BATCH_SIZE) {
    const batch = ambiguous.slice(i, i + BATCH_SIZE);
    try {
      const rows = await requestBatch(batch);
      for (const row of rows) {
        if (!looksUsable(row.normalizedSource)) continue;
        byId.set(row.id, row.normalizedSource.trim());
      }
    } catch {
      warnings.push({
        code: 'ai_source_normalization_failed',
        message: 'AI source grouping assist failed. Deterministic source names were kept.',
      });
      break;
    }
  }

  return { byId, warnings };
}
