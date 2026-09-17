import { deletePoiBlobs, isBlobConfigured } from '../lib/blob/store';
import { AuthError, ForbiddenError, json, requireDssAdminOrManager } from './auth';

export async function handleBlobDiscard(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    await requireDssAdminOrManager(request);

    if (!isBlobConfigured()) {
      return json({ ok: true });
    }

    let pathnames: unknown;
    try {
      const body = (await request.json()) as { pathnames?: unknown };
      pathnames = body.pathnames;
    } catch {
      return json({ error: 'Invalid request.' }, 400);
    }

    if (!Array.isArray(pathnames)) {
      return json({ error: 'Invalid request.' }, 400);
    }

    await deletePoiBlobs(pathnames.filter((value): value is string => typeof value === 'string'));
    return json({ ok: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return json({ error: error.message }, 401);
    }
    if (error instanceof ForbiddenError) {
      return json({ error: error.message }, 403);
    }
    const message = error instanceof Error ? error.message : 'Discard failed.';
    return json({ error: message }, 500);
  }
}
