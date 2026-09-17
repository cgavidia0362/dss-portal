import { analyzeExtractedTransactions } from '../lib/analysis/run';
import { buildUnderwriterSummary } from '../lib/analysis/summary';
import { polishUnderwriterSummary } from '../lib/ai/writeSummary';
import { extractDocuments } from '../lib/extract';
import { MAX_FILES, type UploadedFile } from '../lib/extract/files';
import {
  deleteOrphanPoiBlobs,
  deletePoiBlobs,
  downloadPoiBlob,
  isBlobConfigured,
} from '../lib/blob/store';
import { assertPoiPathname } from '../lib/blob/path';
import { AuthError, json, requireDssUser } from './auth';

function logSafe(details: Record<string, unknown>) {
  console.info('[analyze-income]', details);
}

async function filesFromFormData(request: Request): Promise<UploadedFile[]> {
  const form = await request.formData();
  const files = form.getAll('files');
  const uploaded: UploadedFile[] = [];
  for (const file of files) {
    if (!(file instanceof File)) continue;
    const buffer = Buffer.from(await file.arrayBuffer());
    uploaded.push({
      fileName: file.name.split(/[/\\]/).pop() || 'document',
      bytes: new Uint8Array(buffer),
      mimeType: file.type || 'application/octet-stream',
    });
  }
  return uploaded;
}

async function pathnamesFromJson(request: Request): Promise<string[]> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new Error('No documents were provided.');
  }
  if (!body || typeof body !== 'object' || !Array.isArray((body as { pathnames?: unknown }).pathnames)) {
    throw new Error('No documents were provided.');
  }
  const pathnames = (body as { pathnames: unknown[] }).pathnames;
  if (pathnames.length > MAX_FILES) {
    throw new Error(`Upload at most ${MAX_FILES} files per analysis.`);
  }
  return pathnames.map((pathname) => assertPoiPathname(String(pathname)));
}

async function runAnalysis(uploaded: UploadedFile[]) {
  logSafe({
    fileCount: uploaded.length,
    extensions: uploaded.map((file) => file.fileName.split('.').pop()),
  });

  const extracted = await extractDocuments(uploaded);
  const homeState =
    extracted.documentPeriods.map((period) => period.homeState).find(Boolean) ?? null;
  const analysis = await analyzeExtractedTransactions(extracted.transactions, {
    documentPeriods: extracted.documentPeriods,
    warnings: extracted.warnings,
    documentTexts: extracted.documentTexts.filter(Boolean),
    homeState,
  });
  const templateSummary = buildUnderwriterSummary(analysis);
  const polished = await polishUnderwriterSummary(analysis, templateSummary);

  logSafe({
    documents: extracted.documents.length,
    transactions: analysis.transactions.length,
    warnings: analysis.warnings.map((warning) => warning.code),
    monthsAnalyzed: analysis.totals.monthsAnalyzed,
  });

  return {
    success: true,
    analysis,
    documents: extracted.documents,
    summary: polished.summary,
    summarySource: polished.source,
  };
}

export async function handleAnalyzeIncome(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  let pathnames: string[] = [];

  try {
    await requireDssUser(request);

    const blobEnabled = isBlobConfigured();
    const isJson = (request.headers.get('content-type') || '').includes('application/json');

    void deleteOrphanPoiBlobs().catch(() => undefined);

    if (isJson) {
      if (!blobEnabled) {
        return json(
          { error: 'Blob storage is not configured. Upload files as multipart form data.' },
          400,
        );
      }
      pathnames = await pathnamesFromJson(request);
      const uploaded: UploadedFile[] = [];
      try {
        for (const pathname of pathnames) {
          uploaded.push(await downloadPoiBlob(pathname));
        }
        return json(await runAnalysis(uploaded));
      } finally {
        await deletePoiBlobs(pathnames).catch(() => undefined);
      }
    }

    if (blobEnabled) {
      return json(
        { error: 'Direct file upload is disabled. Documents must be sent as blob pathnames.' },
        400,
      );
    }

    const uploaded = await filesFromFormData(request);
    if (!uploaded.length) {
      return json({ error: 'No files were uploaded.' }, 400);
    }
    return json(await runAnalysis(uploaded));
  } catch (error) {
    if (pathnames.length) {
      await deletePoiBlobs(pathnames).catch(() => undefined);
    }
    if (error instanceof AuthError) {
      return json({ error: error.message }, 401);
    }
    const message = error instanceof Error ? error.message : 'Failed to analyze documents';
    console.error('[analyze-income] failed', message);
    const status = /invalid document reference|no documents were provided|upload at most|exceeds the|no files were uploaded|file is empty/i.test(
      message,
    )
      ? 400
      : 500;
    return json({ error: 'Failed to analyze documents', details: message }, status);
  }
}
