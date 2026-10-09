type InvokeError = {
  message?: string;
  context?: unknown;
} | null | undefined;

function readErrorField(value: unknown): string | null {
  if (!value || typeof value !== 'object' || !('error' in value)) return null;
  const message = (value as { error?: unknown }).error;
  if (typeof message === 'string' && message.trim()) return message.trim();
  return null;
}

async function readContextError(context: unknown): Promise<string | null> {
  if (!context) return null;
  if (typeof context === 'object' && typeof (context as { json?: unknown }).json === 'function') {
    try {
      const payload = await (context as Response).clone().json();
      return readErrorField(payload);
    } catch {
      try {
        const payload = await (context as Response).json();
        return readErrorField(payload);
      } catch {
        return readErrorField(context);
      }
    }
  }
  return readErrorField(context);
}

export async function functionInvokeErrorMessage(
  error: InvokeError,
  data: unknown,
  fallback = 'Request failed. Please try again.',
): Promise<string> {
  const fromData = readErrorField(data);
  if (fromData) return fromData;
  const fromContext = await readContextError(error?.context);
  if (fromContext) return fromContext;
  const message = error?.message?.trim();
  if (message && message !== 'Edge Function returned a non-2xx status code') return message;
  return fallback;
}
