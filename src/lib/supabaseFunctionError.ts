export function functionInvokeErrorMessage(
  error: { message?: string } | null | undefined,
  data: unknown,
  fallback = 'Request failed. Please try again.',
): string {
  if (data && typeof data === 'object' && 'error' in data) {
    const message = (data as { error?: unknown }).error;
    if (typeof message === 'string' && message.trim()) return message.trim();
  }
  const message = error?.message?.trim();
  if (message && message !== 'Edge Function returned a non-2xx status code') return message;
  return fallback;
}
