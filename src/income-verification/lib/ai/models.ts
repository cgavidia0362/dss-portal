export type OpenAIModelRole = 'classification' | 'vision' | 'escalation';

export type ReasoningEffort = 'medium' | 'high';

const DEFAULT_MODELS: Record<OpenAIModelRole, string> = {
  classification: 'gpt-5.4-mini',
  vision: 'gpt-5.6-terra',
  escalation: 'gpt-5.6-sol',
};

function readEnv(name: string): string {
  const value = process.env[name];
  return typeof value === 'string' ? value.trim() : '';
}

export function getOpenAIApiKey(): string | null {
  return readEnv('OPENAI_API_KEY') || null;
}

export function isOpenAIConfigured(): boolean {
  return Boolean(getOpenAIApiKey());
}

/**
 * Role-based model routing.
 * Classification keeps compatibility with OPENAI_MODEL.
 * Vision and escalation use explicit role variables and do not silently
 * reuse the classification model — that would send every upload to Sol.
 */
export function getOpenAIModel(role: OpenAIModelRole = 'classification'): string {
  if (role === 'classification') {
    return (
      readEnv('OPENAI_CLASSIFICATION_MODEL') ||
      readEnv('OPENAI_MODEL') ||
      DEFAULT_MODELS.classification
    );
  }
  if (role === 'vision') {
    return readEnv('OPENAI_VISION_MODEL') || DEFAULT_MODELS.vision;
  }
  return readEnv('OPENAI_ESCALATION_MODEL') || DEFAULT_MODELS.escalation;
}

export function getReasoningEffort(role: OpenAIModelRole): ReasoningEffort | undefined {
  if (role === 'vision') return 'medium';
  if (role === 'escalation') return 'high';
  return undefined;
}

export function modelRoleLabel(role: OpenAIModelRole): string {
  if (role === 'vision') return 'Terra vision';
  if (role === 'escalation') return 'Sol escalation';
  return 'classification';
}
