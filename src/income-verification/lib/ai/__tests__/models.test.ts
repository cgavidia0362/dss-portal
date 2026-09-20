import { afterEach, describe, expect, it } from 'vitest';
import { getOpenAIModel, getReasoningEffort } from '../models';

const KEYS = [
  'OPENAI_MODEL',
  'OPENAI_CLASSIFICATION_MODEL',
  'OPENAI_VISION_MODEL',
  'OPENAI_ESCALATION_MODEL',
];

const original = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of KEYS) {
    if (original[key] == null) delete process.env[key];
    else process.env[key] = original[key];
  }
});

describe('model routing', () => {
  it('uses explicit role models and keeps OPENAI_MODEL as classification fallback', () => {
    delete process.env.OPENAI_CLASSIFICATION_MODEL;
    delete process.env.OPENAI_VISION_MODEL;
    delete process.env.OPENAI_ESCALATION_MODEL;
    process.env.OPENAI_MODEL = 'gpt-5.4-mini';

    expect(getOpenAIModel('classification')).toBe('gpt-5.4-mini');
    expect(getOpenAIModel('vision')).toBe('gpt-5.6-terra');
    expect(getOpenAIModel('escalation')).toBe('gpt-5.6-sol');
    expect(getReasoningEffort('vision')).toBe('medium');
    expect(getReasoningEffort('escalation')).toBe('high');
    expect(getReasoningEffort('classification')).toBeUndefined();
  });

  it('does not reuse Sol as the default vision or classification model', () => {
    process.env.OPENAI_CLASSIFICATION_MODEL = 'gpt-5.4-mini';
    process.env.OPENAI_VISION_MODEL = 'gpt-5.6-terra';
    process.env.OPENAI_ESCALATION_MODEL = 'gpt-5.6-sol';
    expect(getOpenAIModel('classification')).not.toBe('gpt-5.6-sol');
    expect(getOpenAIModel('vision')).not.toBe('gpt-5.6-sol');
    expect(getOpenAIModel('escalation')).toBe('gpt-5.6-sol');
  });
});
