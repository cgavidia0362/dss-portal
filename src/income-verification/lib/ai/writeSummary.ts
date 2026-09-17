import { buildSummaryFacts } from '../analysis/summary';
import type { IncomeAnalysis } from '../analysis/types';
import { getOpenAIApiKey, getOpenAIModel } from './openai';

export async function polishUnderwriterSummary(
  analysis: IncomeAnalysis,
  fallback: string
): Promise<{ summary: string; source: 'model' | 'template' }> {
  const apiKey = getOpenAIApiKey();
  if (!apiKey) {
    return { summary: fallback, source: 'template' };
  }

  const facts = buildSummaryFacts(analysis);
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: getOpenAIModel(),
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content:
            'Write a concise 3-5 sentence POI/income-verification narrative for an underwriter. Use ONLY the provided calculated figures. Do not recalculate totals or averages. Do not approve, decline, or judge creditworthiness. Treat included deposits as the current underwriter-selected figure, not an automatic qualifying-income decision.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            facts,
            template: fallback,
            instruction:
              'Rewrite the template in professional underwriting language. Keep every dollar amount exactly as provided.',
          }),
        },
      ],
    }),
  });

  if (!response.ok) {
    return { summary: fallback, source: 'template' };
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) return { summary: fallback, source: 'template' };
  return { summary: content, source: 'model' };
}
