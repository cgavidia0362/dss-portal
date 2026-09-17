import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { isBlobConfigured, deleteOrphanPoiBlobs } from '../lib/blob/store';
import { assertPoiPathname } from '../lib/blob/path';
import { MAX_FILE_BYTES } from '../lib/extract/limits';
import { AuthError, json, requireDssUser } from './auth';

export async function handleBlobUpload(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    await requireDssUser(request);

    if (!isBlobConfigured()) {
      return json({ error: 'Blob storage is not configured.' }, 503);
    }

    let body: HandleUploadBody;
    try {
      body = (await request.json()) as HandleUploadBody;
    } catch {
      return json({ error: 'Invalid upload request.' }, 400);
    }

    void deleteOrphanPoiBlobs().catch(() => undefined);

    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        assertPoiPathname(pathname);
        return {
          allowedContentTypes: [
            'application/pdf',
            'text/csv',
            'text/plain',
            'image/jpeg',
            'image/png',
            'application/octet-stream',
          ],
          addRandomSuffix: true,
          allowOverwrite: false,
          maximumSizeInBytes: MAX_FILE_BYTES,
          validUntil: Date.now() + 15 * 60 * 1000,
          cacheControlMaxAge: 60,
        };
      },
      onUploadCompleted: async () => {
        // Processing happens in /api/analyze-income.
      },
    });

    return json(jsonResponse);
  } catch (error) {
    if (error instanceof AuthError) {
      return json({ error: error.message }, 401);
    }
    const message = error instanceof Error ? error.message : 'Upload token failed.';
    return json({ error: 'Could not start document upload.', details: message }, 400);
  }
}
