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
            'Write a concise 3-5 sentence underwriting snapshot for a buyer reviewing bank-statement income. Use ONLY the provided calculated figures. Do not recalculate totals or averages. Do not invent full-month figures when none exist. Do not approve, decline, or judge creditworthiness. Do not mention review alerts or out-of-state activity — those are rendered separately. Prefer short sentences covering: (1) full-month included deposits by complete month only, (2) coverage average including partial months, (3) primary non-zero deposit categories.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            facts: {
              fullMonthDeposits: facts.fullMonthDeposits,
              averageMonthlyIncluded: facts.averageMonthlyIncluded,
              meaningfulCategories: facts.meaningfulCategories,
              monthsAnalyzed: facts.monthsAnalyzed,
              completeMonths: facts.completeMonths,
              partialMonths: facts.partialMonths,
            },
            template: fallback,
            instruction:
              'Rewrite the template in professional underwriting language. Keep every dollar amount exactly as provided. Do not add facts that are not in the JSON.',
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
