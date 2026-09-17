import { useState } from 'react';
import { applyCategoryInclusion, applyCategoryOverride, applyInclusion, applySourceInclusion } from '@income-verification/lib/analysis/overrides';
import { buildCopyableSummary, buildUnderwriterSummary } from '@income-verification/lib/analysis/summary';
import type { DepositCategory, IncomeAnalysis } from '@income-verification/lib/analysis/types';
import { requestedPoiPathname } from '@income-verification/lib/blob/path';
import { MAX_FILE_BYTES, MAX_FILES } from '@income-verification/lib/extract/limits';
import { dssAuthHeaders } from '@income-verification/lib/clientAuth';
import { AppShell } from '../income-verification/components/AppShell';
import { ProcessingPanel } from '../income-verification/components/ProcessingPanel';
import { ResultsDashboard } from '../income-verification/components/ResultsDashboard';
import { UploadPanel } from '../income-verification/components/UploadPanel';

type Stage = 'upload' | 'processing' | 'results';

export default function IncomeVerificationTab() {
  const [stage, setStage] = useState<Stage>('upload');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('Analyzing uploaded documents.');
  const [analysis, setAnalysis] = useState<IncomeAnalysis | null>(null);
  const [documents, setDocuments] = useState<
    Array<{ fileName: string; documentType: string; transactionCount: number; warningCount: number }>
  >([]);
  const [summary, setSummary] = useState('');
  const [copied, setCopied] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);

  function handleFiles(list: FileList | null) {
    if (!list?.length) return;
    const incoming = Array.from(list);
    const tooLarge = incoming.find((file) => file.size > MAX_FILE_BYTES);
    if (tooLarge) {
      setError(`${tooLarge.name}: File exceeds the 15MB size limit.`);
      return;
    }
    setSelectedFiles((current) => {
      const names = current.map((file) => file.name);
      const next = incoming.filter((file) => !names.includes(file.name));
      const combined = [...current, ...next];
      if (combined.length > MAX_FILES) {
        setError(`Upload at most ${MAX_FILES} files per analysis.`);
        return combined.slice(0, MAX_FILES);
      }
      setError(null);
      return combined;
    });
  }

  async function discardUploads(pathnames: string[]) {
    if (!pathnames.length) return;
    try {
      await fetch('/api/blob/discard', {
        method: 'POST',
        headers: await dssAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ pathnames }),
      });
    } catch {
      // Orphan cleanup removes leftovers on a later request.
    }
  }

  async function analyze() {
    if (!selectedFiles.length) return;
    if (selectedFiles.length > MAX_FILES) {
      setError(`Upload at most ${MAX_FILES} files per analysis.`);
      return;
    }
    const tooLarge = selectedFiles.find((file) => file.size > MAX_FILE_BYTES);
    if (tooLarge) {
      setError(`${tooLarge.name}: File exceeds the 15MB size limit.`);
      return;
    }

    setStage('processing');
    setStatus('Uploading documents and running extraction, classification, and calculations.');
    setError(null);
    setCopied(false);
    setSourceFilter(null);

    const pathnames: string[] = [];
    try {
      const modeResponse = await fetch('/api/blob/status', {
        headers: await dssAuthHeaders(),
      });
      const modePayload = (await modeResponse.json().catch(() => ({}))) as {
        enabled?: boolean;
        error?: string;
      };
      if (!modeResponse.ok) {
        throw new Error(modePayload.error || `HTTP ${modeResponse.status}`);
      }
      const mode = modePayload;
      let response: Response;

      if (mode.enabled) {
        setStatus('Uploading documents to private temporary storage.');
        const { upload } = await import('@vercel/blob/client');
        const authHeaders = await dssAuthHeaders();
        for (const file of selectedFiles) {
          const stored = await upload(requestedPoiPathname(file.name), file, {
            access: 'private',
            handleUploadUrl: '/api/blob/upload',
            headers: authHeaders,
          });
          pathnames.push(stored.pathname);
        }
        setStatus('Extracting transactions and calculating included deposits.');
        response = await fetch('/api/analyze-income', {
          method: 'POST',
          headers: await dssAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ pathnames }),
        });
      } else {
        const form = new FormData();
        selectedFiles.forEach((file) => form.append('files', file));
        response = await fetch('/api/analyze-income', {
          method: 'POST',
          headers: await dssAuthHeaders(),
          body: form,
        });
      }

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.details || payload.error || `HTTP ${response.status}`);
      }
      setAnalysis(payload.analysis);
      setDocuments(payload.documents || []);
      setSummary(payload.summary || buildUnderwriterSummary(payload.analysis));
      setStage('results');
    } catch (err) {
      setError((err as Error).message || 'Analysis failed.');
      setStage('upload');
    } finally {
      await discardUploads(pathnames);
    }
  }

  function updateAnalysis(next: IncomeAnalysis) {
    setAnalysis(next);
    setSummary(buildUnderwriterSummary(next));
    setCopied(false);
  }

  function handleInclude(id: string, included: boolean) {
    if (!analysis) return;
    updateAnalysis(applyInclusion(analysis, id, included));
  }

  function handleCategory(id: string, category: DepositCategory) {
    if (!analysis) return;
    updateAnalysis(applyCategoryOverride(analysis, id, category));
  }

  function handleIncludeCategory(category: DepositCategory, included: boolean) {
    if (!analysis) return;
    updateAnalysis(applyCategoryInclusion(analysis, category, included));
  }

  function handleIncludeSource(source: string, included: boolean) {
    if (!analysis) return;
    updateAnalysis(applySourceInclusion(analysis, source, included));
  }

  async function copySummary() {
    if (!analysis) return;
    const text = buildCopyableSummary(analysis, summary);
    try {
      await Promise.race([
        navigator.clipboard.writeText(text),
        new Promise((_, reject) => setTimeout(() => reject(new Error('clipboard timeout')), 400)),
      ]);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }
    setCopied(true);
  }

  function reset() {
    setStage('upload');
    setSelectedFiles([]);
    setAnalysis(null);
    setDocuments([]);
    setSummary('');
    setError(null);
    setCopied(false);
    setSourceFilter(null);
  }

  return (
    <AppShell stage={stage}>
      {stage === 'upload' && (
        <UploadPanel
          files={selectedFiles}
          error={error}
          onFiles={handleFiles}
          onSampleFile={(file) => {
            if (file.size > MAX_FILE_BYTES) {
              setError(`${file.name}: File exceeds the 15MB size limit.`);
              return;
            }
            setSelectedFiles((current) => {
              if (current.length >= MAX_FILES) {
                setError(`Upload at most ${MAX_FILES} files per analysis.`);
                return current;
              }
              setError(null);
              return current.some((existing) => existing.name === file.name)
                ? current
                : [...current, file];
            });
          }}
          onRemove={(index) => setSelectedFiles((current) => current.filter((_, i) => i !== index))}
          onAnalyze={analyze}
        />
      )}
      {stage === 'processing' && <ProcessingPanel status={status} />}
      {stage === 'results' && analysis && (
        <ResultsDashboard
          analysis={analysis}
          documents={documents}
          summary={summary}
          copied={copied}
          sourceFilter={sourceFilter}
          onSourceFilter={setSourceFilter}
          onInclude={handleInclude}
          onCategory={handleCategory}
          onIncludeCategory={handleIncludeCategory}
          onIncludeSource={handleIncludeSource}
          onCopy={copySummary}
          onReset={reset}
        />
      )}
    </AppShell>
  );
}
