/** Read OpenAI env from process.env (Vercel / Vite server middleware). */
function readEnv(name: 'OPENAI_API_KEY' | 'OPENAI_MODEL'): string {
  const value = process.env[name];
  return typeof value === 'string' ? value.trim() : '';
}

export function isOpenAIConfigured(): boolean {
  return Boolean(readEnv('OPENAI_API_KEY'));
}

export function getOpenAIApiKey(): string | null {
  return readEnv('OPENAI_API_KEY') || null;
}

export function getOpenAIModel(): string {
  return readEnv('OPENAI_MODEL') || 'gpt-5.4-mini';
}
