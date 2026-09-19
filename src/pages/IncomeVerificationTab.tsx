import { useEffect, useMemo, useState } from 'react';
import { Bookmark, Trash2, X } from 'lucide-react';
import { applyCategoryInclusion, applyCategoryOverride, applyInclusion, applySourceInclusion } from '@income-verification/lib/analysis/overrides';
import { buildCopyableSummary, buildUnderwriterSummary } from '@income-verification/lib/analysis/summary';
import type { DepositCategory, IncomeAnalysis } from '@income-verification/lib/analysis/types';
import { requestedPoiPathname } from '@income-verification/lib/blob/path';
import { MAX_FILE_BYTES, MAX_FILES } from '@income-verification/lib/extract/limits';
import { dssAuthHeaders } from '@income-verification/lib/clientAuth';
import { supabase } from '../lib/supabase';
import { canAccessTab } from '../lib/tabAccess';
import { AppShell } from '../income-verification/components/AppShell';
import { ProcessingPanel } from '../income-verification/components/ProcessingPanel';
import { ResultsDashboard } from '../income-verification/components/ResultsDashboard';
import { UploadPanel } from '../income-verification/components/UploadPanel';

type Stage = 'upload' | 'processing' | 'results';

type DocumentMeta = {
  fileName: string;
  documentType: string;
  transactionCount: number;
  warningCount: number;
};

interface SavedReport {
  id: string;
  applicantName: string;
  analysis: IncomeAnalysis;
  summary: string;
  documents: DocumentMeta[];
  averageMonthly: number | null;
  coverageStart: string | null;
  coverageEnd: string | null;
  createdByName: string;
  createdAt: string;
}

export default function IncomeVerificationTab({
  currentUser,
}: {
  currentUser: {
    id: string;
    name: string;
    role: 'admin' | 'manager' | 'rep' | 'buying_assistant';
    allowedTabs?: string[];
  };
}) {
  const [stage, setStage] = useState<Stage>('upload');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('Analyzing uploaded documents.');
  const [analysis, setAnalysis] = useState<IncomeAnalysis | null>(null);
  const [documents, setDocuments] = useState<DocumentMeta[]>([]);
  const [summary, setSummary] = useState('');
  const [copied, setCopied] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);

  const [savedReports, setSavedReports] = useState<SavedReport[]>([]);
  const [showSavedPanel, setShowSavedPanel] = useState(false);
  const [savedSearch, setSavedSearch] = useState('');
  const [viewingSavedId, setViewingSavedId] = useState<string | null>(null);
  const [viewingApplicantName, setViewingApplicantName] = useState<string | null>(null);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [applicantName, setApplicantName] = useState('');
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  const isAllowed = canAccessTab(currentUser.role, currentUser.allowedTabs, 'income-verification');

  useEffect(() => {
    if (!isAllowed) return;
    void fetchSavedReports();
  }, [isAllowed]);

  async function fetchSavedReports() {
    const { data, error: fetchError } = await supabase
      .from('income_verification_saves')
      .select(
        'id, applicant_name, analysis, summary, documents, average_monthly, coverage_start, coverage_end, created_by_name, created_at',
      )
      .order('created_at', { ascending: false });
    if (fetchError) {
      console.error('Failed to load saved IV reports:', fetchError);
      return;
    }
    setSavedReports(
      (data || []).map((row: any) => ({
        id: row.id,
        applicantName: row.applicant_name,
        analysis: row.analysis,
        summary: row.summary || '',
        documents: Array.isArray(row.documents) ? row.documents : [],
        averageMonthly: row.average_monthly != null ? Number(row.average_monthly) : null,
        coverageStart: row.coverage_start || null,
        coverageEnd: row.coverage_end || null,
        createdByName: row.created_by_name || 'Unknown',
        createdAt: row.created_at,
      })),
    );
  }

  const filteredSavedReports = useMemo(() => {
    const q = savedSearch.trim().toLowerCase();
    if (!q) return savedReports;
    return savedReports.filter((report) => report.applicantName.toLowerCase().includes(q));
  }, [savedReports, savedSearch]);

  if (!isAllowed) {
    return (
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-red-900 bg-opacity-30 border border-red-800 rounded-lg px-6 py-8 text-center">
          <p className="text-lg font-semibold text-red-700">Access restricted</p>
          <p className="text-sm text-red-200/80 mt-2">
            Income Verification is available to admin, manager, or users granted access.
          </p>
        </div>
      </main>
    );
  }

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
    setViewingSavedId(null);
    setViewingApplicantName(null);

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
    setViewingSavedId(null);
    setViewingApplicantName(null);
  }

  function openSaveModal() {
    if (!analysis) return;
    setApplicantName(viewingApplicantName || '');
    setShowSaveModal(true);
    setError(null);
  }

  async function handleSaveReport() {
    if (!analysis || !applicantName.trim()) {
      setError('Applicant name is required to save.');
      return;
    }
    setSaveLoading(true);
    setError(null);
    try {
      const { error: insertError } = await supabase.from('income_verification_saves').insert({
        applicant_name: applicantName.trim(),
        analysis,
        summary,
        documents,
        average_monthly: analysis.totals.averageMonthlyIncluded,
        coverage_start: analysis.coverage?.startDate || null,
        coverage_end: analysis.coverage?.endDate || null,
        created_by: currentUser.id,
        created_by_name: currentUser.name,
      });
      if (insertError) throw insertError;
      setShowSaveModal(false);
      setViewingApplicantName(applicantName.trim());
      setSaveMessage('Report saved.');
      setTimeout(() => setSaveMessage(''), 3000);
      await fetchSavedReports();
    } catch (err: any) {
      setError(err?.message || 'Failed to save report.');
      setShowSaveModal(false);
    } finally {
      setSaveLoading(false);
    }
  }

  function loadSavedReport(saved: SavedReport) {
    setAnalysis(saved.analysis);
    setDocuments(saved.documents);
    setSummary(saved.summary || buildUnderwriterSummary(saved.analysis));
    setStage('results');
    setCopied(false);
    setSourceFilter(null);
    setError(null);
    setViewingSavedId(saved.id);
    setViewingApplicantName(saved.applicantName);
    setShowSavedPanel(false);
    setSelectedFiles([]);
  }

  async function handleDeleteSaved(id: string) {
    if (!confirm('Delete this saved report?')) return;
    const { error: deleteError } = await supabase
      .from('income_verification_saves')
      .delete()
      .eq('id', id);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    if (viewingSavedId === id) {
      setViewingSavedId(null);
      setViewingApplicantName(null);
    }
    await fetchSavedReports();
  }

  function handlePrint() {
    window.print();
  }

  return (
    <AppShell
      stage={stage}
      headerActions={(
        <button
          type="button"
          onClick={() => setShowSavedPanel((v) => !v)}
          className="flex items-center gap-2 rounded border border-white/20 bg-dss-navy-soft px-3 py-1.5 text-xs text-white hover:bg-dss-navy"
        >
          <Bookmark className="h-3.5 w-3.5" />
          Saved ({savedReports.length})
        </button>
      )}
    >
      {saveMessage && (
        <div className="iv-no-print mb-4 rounded border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
          {saveMessage}
        </div>
      )}

      {showSavedPanel && (
        <div className="iv-no-print mb-5 rounded border border-slate-200 bg-white p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-800">Saved reports</h3>
            <button
              type="button"
              onClick={() => setShowSavedPanel(false)}
              className="text-slate-400 hover:text-slate-700"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <input
            type="search"
            value={savedSearch}
            onChange={(e) => setSavedSearch(e.target.value)}
            placeholder="Search by applicant name…"
            className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-500"
          />
          {filteredSavedReports.length === 0 ? (
            <p className="text-sm text-slate-500">
              {savedReports.length === 0
                ? 'No saved reports yet. Run an analysis, then click Save report.'
                : 'No reports match that applicant name.'}
            </p>
          ) : (
            <div className="max-h-72 space-y-2 overflow-y-auto">
              {filteredSavedReports.map((saved) => (
                <div
                  key={saved.id}
                  className={`flex items-start justify-between gap-3 rounded border px-3 py-2.5 ${
                    viewingSavedId === saved.id
                      ? 'border-dss-navy-soft bg-dss-accent-soft/40'
                      : 'border-slate-200 bg-white'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => loadSavedReport(saved)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="truncate text-sm font-medium text-slate-900">{saved.applicantName}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Saved {new Date(saved.createdAt).toLocaleString()}
                      {' · '}
                      by {saved.createdByName}
                      {saved.averageMonthly != null
                        ? ` · avg ${saved.averageMonthly.toLocaleString(undefined, {
                            style: 'currency',
                            currency: 'USD',
                          })}/mo`
                        : ''}
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteSaved(saved.id)}
                    className="rounded p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                    title="Delete saved report"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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
        <>
          {error && (
            <div className="iv-no-print mb-4 rounded border border-rose-300 bg-rose-50 px-4 py-2 text-sm text-rose-800">
              {error}
            </div>
          )}
          <ResultsDashboard
            analysis={analysis}
            documents={documents}
            summary={summary}
            copied={copied}
            sourceFilter={sourceFilter}
            savedApplicantName={viewingApplicantName}
            onSourceFilter={setSourceFilter}
            onInclude={handleInclude}
            onCategory={handleCategory}
            onIncludeCategory={handleIncludeCategory}
            onIncludeSource={handleIncludeSource}
            onCopy={copySummary}
            onReset={reset}
            onSave={openSaveModal}
            onPrint={handlePrint}
          />
        </>
      )}

      {showSaveModal && (
        <div className="iv-no-print fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
              <h3 className="text-base font-semibold text-slate-900">Save report</h3>
              <button
                type="button"
                onClick={() => setShowSaveModal(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3 px-5 py-4">
              <p className="text-sm text-slate-600">
                Enter the borrower / applicant name. You can search saved reports by this name later.
              </p>
              <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">
                Applicant name
              </label>
              <input
                type="text"
                autoFocus
                value={applicantName}
                onChange={(e) => setApplicantName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleSaveReport();
                }}
                placeholder="e.g. Jane Smith"
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-500"
              />
            </div>
            <div className="flex gap-2 px-5 pb-5">
              <button
                type="button"
                disabled={saveLoading || !applicantName.trim()}
                onClick={() => void handleSaveReport()}
                className="flex-1 rounded bg-dss-navy-soft px-3 py-2 text-sm font-medium text-white hover:bg-dss-navy disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saveLoading ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                onClick={() => setShowSaveModal(false)}
                className="flex-1 rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
