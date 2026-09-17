import { isBlobConfigured } from '../lib/blob/store';
import { AuthError, ForbiddenError, json, requireDssAdminOrManager } from './auth';

export async function handleBlobStatus(request: Request): Promise<Response> {
  if (request.method !== 'GET') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    await requireDssAdminOrManager(request);
    return json({ enabled: isBlobConfigured() });
  } catch (error) {
    if (error instanceof AuthError) {
      return json({ error: error.message }, 401);
    }
    if (error instanceof ForbiddenError) {
      return json({ error: error.message }, 403);
    }
    const message = error instanceof Error ? error.message : 'Status check failed.';
    return json({ error: message }, 500);
  }
}
