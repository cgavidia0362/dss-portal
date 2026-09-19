import { useState, useEffect } from 'react';
import { Upload, CheckCircle, AlertCircle, FileSpreadsheet, DollarSign, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  applyMatchActionToCall,
  findUploadDealMatches,
  mapDailyDealRow,
  type ManualDealForMatch,
  type UploadMatchCandidate,
  type UploadMatchAction,
} from '../lib/uploadDealMatch';

declare const XLSX: any;

const toTitleCase = (str: string): string => {
  if (!str) return '';
  return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
};

interface Dealer {
  cifNumber: string;
  name: string;
  state: string;
  createdAt: Date;
}

interface Call {
  id: string;
  applicationId: string;
  dealerCifNumber: string;
  dealerName: string;
  state: string;
  buyerFinal: string;
  statusLast: string;
  timestampSubmit: Date;
  submittedDate: string;
  assignedTo?: string;
  assignedToName?: string;
  fuStatus?: 'Deal' | 'Confirmed Deal' | 'No Deal' | 'Pending' | 'No Answer' | 'Closed' | 'Duplicates' | 'Follow Up';
  fiType?: 'Independent' | 'Franchise';
  updatedAt: Date;
  dealDate?: Date;
  dealBy?: string;
  dealByName?: string;
  isDuplicate?: boolean;
  customerName?: string;
}

interface FundingData {
  [state: string]: {
    count: number;
    totalAmount: number;
  };
}

interface UploadTabProps {
  calls: Call[];
  setCalls: React.Dispatch<React.SetStateAction<Call[]>>;
  dealers: Dealer[];
  setDealers: React.Dispatch<React.SetStateAction<Dealer[]>>;
  fundingData: FundingData;
  setFundingData: React.Dispatch<React.SetStateAction<FundingData>>;
  onUploadSuccess?: () => Promise<void>;
}

interface AppliedMatchSummary {
  appId: string;
  repName: string;
  action: UploadMatchAction;
  matchType: 'exact' | 'soft';
}

interface PendingUpload {
  calls: Call[];
  duplicates: string[];
  discoveredDealers: Dealer[];
  matches: UploadMatchCandidate[];
}

export default function UploadTab({ dealers, setDealers, fundingData, setFundingData, onUploadSuccess }: UploadTabProps) {

  const [uploading, setUploading] = useState(false);
  const [uploadingFunding, setUploadingFunding] = useState(false);
  const [xlsxLoaded, setXlsxLoaded] = useState(false);
  const [matchedDeals, setMatchedDeals] = useState<AppliedMatchSummary[]>([]);
  const [duplicateApps, setDuplicateApps] = useState<string[]>([]);
  const [pendingUpload, setPendingUpload] = useState<PendingUpload | null>(null);

  const [uploadResult, setUploadResult] = useState<{
    success: boolean;
    message: string;
    callsCount?: number;
    newDealersCount?: number;
  } | null>(null);

  const [fundingUploadResult, setFundingUploadResult] = useState<{
    success: boolean;
    message: string;
    totalDeals?: number;
    byState?: { state: string; count: number; totalAmount: number }[];
  } | null>(null);

  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://cdn.sheetjs.com/xlsx-0.20.0/package/dist/xlsx.full.min.js';
    script.onload = () => setXlsxLoaded(true);
    script.onerror = () => {
      setUploadResult({ success: false, message: 'Failed to load file processing library. Please refresh.' });
    };
    document.body.appendChild(script);
    return () => { document.body.removeChild(script); };
  }, []);

  const parseXlsxDate = (rawValue: any): Date | null => {
    if (!rawValue && rawValue !== 0) return null;
    if (rawValue instanceof Date) return isNaN(rawValue.getTime()) ? null : rawValue;
    if (typeof rawValue === 'number') {
      const excelEpoch = new Date(Date.UTC(1899, 11, 30));
      const result = new Date(excelEpoch.getTime() + rawValue * 86400000);
      return isNaN(result.getTime()) ? null : result;
    }
    const parsed = new Date(String(rawValue));
    return isNaN(parsed.getTime()) ? null : parsed;
  };

  const fetchManualDealsForMatch = async (): Promise<ManualDealForMatch[]> => {
    try {
      const { data } = await supabase
        .from('daily_deals')
        .select('id, app_id, dealer_name, customer_name, amount, fu_status, added_by, added_by_name, deal_date')
        .in('fu_status', ['Deal', 'Confirmed Deal']);
      return (data || []).map(mapDailyDealRow);
    } catch (err) {
      console.error('Error loading daily deals for match:', err);
      return [];
    }
  };

  // Check for duplicates against existing calls in Supabase
  const checkDuplicates = async (parsedCalls: Call[]): Promise<{ calls: Call[]; duplicates: string[] }> => {
    const appIds = parsedCalls.map(c => c.applicationId).filter(Boolean);
    if (!appIds.length) return { calls: parsedCalls, duplicates: [] };

    try {
      const { data } = await supabase
        .from('calls')
        .select('application_id')
        .in('application_id', appIds);

      if (!data || data.length === 0) return { calls: parsedCalls, duplicates: [] };

      const existingIds = new Set(data.map((d: any) => d.application_id));
      const duplicates: string[] = [];

      const processedCalls = parsedCalls.map(call => {
        if (existingIds.has(call.applicationId)) {
          duplicates.push(call.applicationId);
          return { ...call, isDuplicate: true };
        }
        return call;
      });

      return { calls: processedCalls, duplicates };
    } catch (err) {
      console.error('Error checking duplicates:', err);
      return { calls: parsedCalls, duplicates: [] };
    }
  };

  // ── CALLS UPLOAD ──────────────────────────────────────────────
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!xlsxLoaded || typeof XLSX === 'undefined') {
      setUploadResult({ success: false, message: 'File processing library is still loading. Please try again.' });
      return;
    }

    setUploading(true);
    setUploadResult(null);
    setMatchedDeals([]);
    setDuplicateApps([]);
    setPendingUpload(null);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array', cellDates: true });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      if (jsonData.length === 0) {
        setUploadResult({ success: false, message: 'The uploaded file is empty or has no valid data.' });
        setUploading(false);
        return;
      }

      const newCalls: Call[] = [];
      const discoveredDealers = new Map<string, Dealer>();

      jsonData.forEach((row: any) => {
        const cifNumber = String(row['Dealer Cifnumber'] || '').trim();
        const dealerName = String(row['Dealer Name'] || '').trim();
        const dealerState = String(row['Dealer State'] || '').trim();

        if (!cifNumber || !dealerName || !row['Application Id']) return;

        if (!dealers.some(d => d.cifNumber === cifNumber)) {
          if (!discoveredDealers.has(cifNumber)) {
            discoveredDealers.set(cifNumber, {
              cifNumber, name: dealerName, state: dealerState, createdAt: new Date(),
            });
          }
        }

        const parsedDate = parseXlsxDate(row['Timestamp Submit']);
        const timestampSubmit = parsedDate ?? new Date();
        const statusLast = String(row['Status Last'] || '').trim();

        // Accepted stays Status Last only — do NOT auto-set FU to Deal
        newCalls.push({
          id: `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          applicationId: String(row['Application Id'] || ''),
          dealerCifNumber: cifNumber,
          dealerName,
          state: dealerState,
          buyerFinal: String(row['App Last AF'] || row['App Request AF'] || '0'),
          statusLast,
          timestampSubmit,
          submittedDate: timestampSubmit.toISOString().split('T')[0],
          assignedTo: undefined,
          assignedToName: undefined,
          fuStatus: undefined,
          fiType: undefined,
          updatedAt: new Date(),
          dealDate: undefined,
          isDuplicate: false,
          customerName: toTitleCase(String(row['customerFullName'] || '')),
        });
      });

      const { calls: deduplicatedCalls, duplicates } = await checkDuplicates(newCalls);
      const manuals = await fetchManualDealsForMatch();
      const matches = findUploadDealMatches(deduplicatedCalls, manuals);
      const discoveredList = Array.from(discoveredDealers.values());

      if (matches.length > 0) {
        // Pause for review before writing to the database
        setPendingUpload({
          calls: deduplicatedCalls,
          duplicates,
          discoveredDealers: discoveredList,
          matches,
        });
        setUploading(false);
        event.target.value = '';
        return;
      }

      await commitCallsUpload(deduplicatedCalls, duplicates, discoveredList, []);
    } catch (error) {
      setUploadResult({
        success: false,
        message: `Error processing file: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const commitCallsUpload = async (
    sourceCalls: Call[],
    duplicates: string[],
    discoveredDealersList: Dealer[],
    matches: UploadMatchCandidate[],
  ) => {
    setUploading(true);
    setUploadResult(null);

    try {
      const matchByApp = new Map(matches.map(m => [m.applicationId, m]));
      const processedCalls = sourceCalls.map(c => {
        const match = matchByApp.get(c.applicationId);
        return match ? applyMatchActionToCall(c, match) : c;
      });

      if (processedCalls.length > 0) {
        const batchAppIds = processedCalls.map(c => c.applicationId).filter(Boolean);
        const existingAppIds = new Set<string>();
        try {
          const CHUNK = 200;
          for (let i = 0; i < batchAppIds.length; i += CHUNK) {
            const chunk = batchAppIds.slice(i, i + CHUNK);
            const { data } = await supabase
              .from('calls')
              .select('application_id')
              .in('application_id', chunk);
            if (data) data.forEach((d: any) => existingAppIds.add(d.application_id));
          }
        } catch { /* non-critical */ }

        const toInsert: Record<string, unknown>[] = [];
        const toUpdate: { applicationId: string; row: Record<string, unknown> }[] = [];

        processedCalls.forEach(c => {
          const match = matchByApp.get(c.applicationId);
          const base: Record<string, unknown> = {
            application_id: c.applicationId,
            dealer_cif_number: c.dealerCifNumber,
            dealer_name: c.dealerName,
            state: c.state,
            buyer_final: c.buyerFinal,
            status_last: c.statusLast,
            timestamp_submit: c.timestampSubmit.toISOString(),
            submitted_date: c.submittedDate,
            is_duplicate: c.isDuplicate || false,
            customer_full_name: c.customerName || null,
          };

          if (existingAppIds.has(c.applicationId)) {
            // Linked / Duplicate actions may update FU + credit on existing rows
            if (match && match.action === 'link') {
              base.fu_status = c.fuStatus || null;
              base.deal_date = c.dealDate ? c.dealDate.toISOString() : null;
              base.deal_by = c.dealBy || null;
              base.deal_by_name = c.dealByName || null;
              base.assigned_to = c.assignedTo || null;
              base.assigned_to_name = c.assignedToName || null;
              base.updated_at = new Date().toISOString();
            } else if (match && match.action === 'duplicate') {
              base.fu_status = 'Duplicates';
              base.is_duplicate = true;
              base.updated_at = new Date().toISOString();
            }
            toUpdate.push({ applicationId: c.applicationId, row: base });
          } else {
            toInsert.push({
              ...base,
              fu_status: c.fuStatus || null,
              updated_at: new Date().toISOString(),
              deal_date: c.dealDate ? c.dealDate.toISOString() : null,
              assigned_to: c.assignedTo || null,
              assigned_to_name: c.assignedToName || null,
              deal_by: c.dealBy || null,
              deal_by_name: c.dealByName || null,
            });
          }
        });

        if (toInsert.length > 0) {
          const { error: insertError } = await supabase.from('calls').insert(toInsert);
          if (insertError) {
            setUploadResult({
              success: false,
              message: `Calls processed but failed to save new apps: ${insertError.message}`,
            });
            return;
          }
        }

        if (toUpdate.length > 0) {
          const UPDATE_CHUNK = 50;
          for (let i = 0; i < toUpdate.length; i += UPDATE_CHUNK) {
            const chunk = toUpdate.slice(i, i + UPDATE_CHUNK);
            const results = await Promise.all(
              chunk.map(({ applicationId, row }) =>
                supabase.from('calls').update(row).eq('application_id', applicationId)
              )
            );
            const failed = results.find(r => r.error);
            if (failed?.error) {
              setUploadResult({
                success: false,
                message: `Updating existing apps failed: ${failed.error.message}`,
              });
              return;
            }
          }
        }

        if (onUploadSuccess) await onUploadSuccess();
      }

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      await supabase.from('calls').delete()
        .lt('timestamp_submit', thirtyDaysAgo.toISOString());

      if (discoveredDealersList.length > 0) {
        setDealers(prev => [...prev, ...discoveredDealersList]);
      }

      const applied = matches.filter(m => m.action !== 'leave');
      setMatchedDeals(applied.map(m => ({
        appId: m.applicationId,
        repName: m.manual.addedByName,
        action: m.action,
        matchType: m.matchType,
      })));
      if (duplicates.length > 0) setDuplicateApps(duplicates);

      const linked = matches.filter(m => m.action === 'link').length;
      const duped = matches.filter(m => m.action === 'duplicate').length;
      const left = matches.filter(m => m.action === 'leave').length;
      const reviewNote = matches.length > 0
        ? ` · ${linked} linked, ${duped} marked duplicate, ${left} left as-is`
        : '';

      setUploadResult({
        success: true,
        message: `Successfully processed ${processedCalls.length} calls${reviewNote}`,
        callsCount: processedCalls.length,
        newDealersCount: discoveredDealersList.length,
      });
      setPendingUpload(null);
    } catch (error) {
      setUploadResult({
        success: false,
        message: `Error saving upload: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    } finally {
      setUploading(false);
    }
  };

  const setMatchAction = (matchId: string, action: UploadMatchAction) => {
    setPendingUpload(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        matches: prev.matches.map(m => m.id === matchId ? { ...m, action } : m),
      };
    });
  };

  const cancelPendingUpload = () => {
    setPendingUpload(null);
    setUploadResult({
      success: false,
      message: 'Upload cancelled — no calls were imported.',
    });
  };

  const confirmPendingUpload = async () => {
    if (!pendingUpload) return;
    await commitCallsUpload(
      pendingUpload.calls,
      pendingUpload.duplicates,
      pendingUpload.discoveredDealers,
      pendingUpload.matches,
    );
  };

  // ── FUNDING UPLOAD ────────────────────────────────────────────
  const handleFundingFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!xlsxLoaded || typeof XLSX === 'undefined') {
      setFundingUploadResult({ success: false, message: 'File processing library is still loading. Please try again.' });
      return;
    }

    setUploadingFunding(true);
    setFundingUploadResult(null);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      if (jsonData.length === 0) {
        setFundingUploadResult({ success: false, message: 'The uploaded file is empty or has no valid data.' });
        setUploadingFunding(false);
        return;
      }

      const stateMap: FundingData = {};

      jsonData.forEach((row: any) => {
        const state = String(row['Dealer State'] || '').trim();
        if (!state) return;
        const loanAmountStr = String(row['Loan Amount'] || '0').replace(/[$,\s]/g, '');
        const loanAmount = parseFloat(loanAmountStr) || 0;
        if (!stateMap[state]) stateMap[state] = { count: 0, totalAmount: 0 };
        stateMap[state].count += 1;
        stateMap[state].totalAmount += loanAmount;
      });

      // Save to Supabase — wipe old data and insert fresh
      await supabase.from('funding_data').delete().neq('state', '');
      const fundingRows = Object.entries(stateMap).map(([state, d]) => ({
        state,
        count: d.count,
        total_amount: d.totalAmount,
        updated_at: new Date().toISOString(),
      }));
      const { error: insertError } = await supabase.from('funding_data').insert(fundingRows);
      if (insertError) console.error('Error saving funding data:', insertError);

      // Update local state
      setFundingData(stateMap);

      const byState = Object.entries(stateMap)
        .map(([state, d]) => ({ state, count: d.count, totalAmount: d.totalAmount }))
        .sort((a, b) => b.count - a.count);

      setFundingUploadResult({
        success: true,
        message: `Successfully processed ${jsonData.length} funded deals across ${byState.length} states`,
        totalDeals: jsonData.length,
        byState,
      });
    } catch (error) {
      setFundingUploadResult({
        success: false,
        message: `Error processing file: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    } finally {
      setUploadingFunding(false);
      event.target.value = '';
    }
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency', currency: 'USD',
      minimumFractionDigits: 0, maximumFractionDigits: 0,
    }).format(amount);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-dss-ink">Upload</h2>
        <p className="text-dss-muted mt-1">Upload call data and funding reports</p>
      </div>

      {/* ── CALLS UPLOAD ── */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <FileSpreadsheet className="w-6 h-6 text-dss-accent" />
          <h3 className="text-xl font-semibold text-dss-ink">Upload Calls</h3>
        </div>

        <div className="bg-dss-surface p-8 rounded-dss-sm border border-dss-border">
          <div className="flex flex-col items-center justify-center">
            <Upload className="w-14 h-14 text-dss-muted mb-4" />
            <h4 className="text-lg font-semibold text-dss-ink mb-2">Upload Calls CSV</h4>
            <p className="text-sm text-dss-muted mb-6 text-center max-w-md">
              Upload your call data. Calls save to Supabase and auto-delete after 30 days.
              If rows match Daily Deals, you&apos;ll review links before import. Accepted is not auto-marked as Deal.
            </p>
            <label className="cursor-pointer">
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileUpload}
                disabled={uploading || !xlsxLoaded}
                className="hidden"
              />
              <div className={`px-6 py-3 rounded-dss-sm font-medium transition ${
                uploading || !xlsxLoaded
                  ? 'bg-dss-canvas text-dss-muted cursor-not-allowed'
                  : 'bg-dss-navy-soft text-white hover:bg-dss-navy'
              }`}>
                {uploading ? 'Processing...' : !xlsxLoaded ? 'Loading...' : 'Select Calls CSV'}
              </div>
            </label>
            <p className="text-xs text-dss-muted mt-4">Supported: CSV, XLSX, XLS</p>
          </div>
        </div>

        {/* Upload result */}
        {uploadResult && (
          <div className={`p-5 rounded-dss-sm border ${
            uploadResult.success ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'
          }`}>
            <div className="flex items-start gap-3">
              {uploadResult.success
                ? <CheckCircle className="w-5 h-5 text-dss-success flex-shrink-0 mt-0.5" />
                : <AlertCircle className="w-5 h-5 text-dss-danger flex-shrink-0 mt-0.5" />}
              <div className="flex-1">
                <p className={`font-semibold mb-1 ${uploadResult.success ? 'text-green-100' : 'text-red-100'}`}>
                  {uploadResult.success ? 'Upload Successful!' : 'Upload Failed'}
                </p>
                <p className={`text-sm ${uploadResult.success ? 'text-dss-success' : 'text-dss-danger'}`}>
                  {uploadResult.message}
                </p>
                {uploadResult.success && (
                  <div className="mt-2 space-y-0.5">
                    <p className="text-sm text-dss-success flex items-center gap-2">
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      {uploadResult.callsCount} calls imported &amp; saved to Supabase
                    </p>
                    {(uploadResult.newDealersCount ?? 0) > 0 && (
                      <p className="text-sm text-dss-success flex items-center gap-2">
                        <CheckCircle className="w-3.5 h-3.5" />
                        {uploadResult.newDealersCount} new dealers added
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Daily Deals match results (after confirmed review) */}
        {matchedDeals.length > 0 && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-dss-sm p-4">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle className="w-4 h-4 text-dss-success" />
              <p className="text-sm font-semibold text-dss-success">
                {matchedDeals.length} Daily Deals match{matchedDeals.length !== 1 ? 'es' : ''} applied
              </p>
            </div>
            <p className="text-xs text-dss-success mb-3">
              Linked deals keep credit with the Daily Deals / Public Deals rep.
            </p>
            <div className="space-y-1.5">
              {matchedDeals.map((m, i) => (
                <div key={i} className="flex items-center gap-3 text-xs flex-wrap">
                  <span className="font-semibold text-dss-success">{m.appId}</span>
                  <span className="text-green-500">→</span>
                  <span className="text-dss-success">{m.repName}</span>
                  <span className="px-1.5 py-0.5 rounded border border-emerald-200 text-dss-success">
                    {m.action === 'link' ? 'Linked' : m.action === 'duplicate' ? 'Duplicate' : 'Left as-is'}
                  </span>
                  <span className="text-green-600">{m.matchType === 'exact' ? 'App ID' : 'Dealer+Customer'}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Match review modal */}
        {pendingUpload && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-dss border border-dss-border bg-dss-canvas shadow-sm flex flex-col">
              <div className="flex items-start justify-between gap-4 border-b border-dss-border px-5 py-4">
                <div>
                  <h3 className="text-lg font-semibold text-dss-ink">Review Daily Deals matches</h3>
                  <p className="mt-1 text-sm text-dss-muted">
                    {pendingUpload.matches.length} spreadsheet row{pendingUpload.matches.length !== 1 ? 's' : ''} match
                    existing Deal / Confirmed entries. Credit always stays with the Daily Deals / Public Deals rep.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={cancelPendingUpload}
                  className="rounded-dss-sm p-1.5 text-dss-muted hover:bg-dss-surface hover:text-dss-ink"
                  aria-label="Cancel upload"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                {pendingUpload.matches.map((m, idx) => (
                  <div key={m.id} className="rounded-dss-sm border border-dss-border bg-dss-surface/80 p-4">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-dss-muted">
                        Match {idx + 1} of {pendingUpload.matches.length}
                      </span>
                      <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
                        m.matchType === 'exact'
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                          : 'border-amber-200 bg-amber-50 text-amber-800'
                      }`}>
                        {m.matchType === 'exact' ? 'Exact (App ID)' : 'Possible (Dealer + Customer)'}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm mb-4">
                      <div className="rounded-dss-sm border border-dss-border bg-dss-canvas/50 p-3 space-y-1">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-dss-accent mb-2">From spreadsheet</p>
                        <p className="text-dss-ink"><span className="text-dss-muted">App ID</span> {m.applicationId}</p>
                        <p className="text-dss-ink"><span className="text-dss-muted">Dealer</span> {m.callDealerName || '—'}</p>
                        <p className="text-dss-ink"><span className="text-dss-muted">Customer</span> {m.callCustomerName || '—'}</p>
                        <p className="text-dss-ink"><span className="text-dss-muted">Amount</span> {m.callAmount || '—'}</p>
                        <p className="text-dss-ink"><span className="text-dss-muted">Status Last</span> {m.callStatusLast || '—'}</p>
                      </div>
                      <div className="rounded-dss-sm border border-dss-border bg-dss-canvas/50 p-3 space-y-1">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-dss-success mb-2">Existing manual deal</p>
                        <p className="text-dss-ink"><span className="text-dss-muted">App ID</span> {m.manual.appId || '—'}</p>
                        <p className="text-dss-ink"><span className="text-dss-muted">Dealer</span> {m.manual.dealerName || '—'}</p>
                        <p className="text-dss-ink"><span className="text-dss-muted">Customer</span> {m.manual.customerName || '—'}</p>
                        <p className="text-dss-ink"><span className="text-dss-muted">Amount</span> {m.manual.amount || '—'}</p>
                        <p className="text-dss-ink"><span className="text-dss-muted">FU Status</span> {m.manual.fuStatus}</p>
                        <p className="text-emerald-800 font-medium">
                          Credited to {m.manual.addedByName}
                          {m.manual.dealDate ? ` · ${m.manual.dealDate}` : ''}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {([
                        { key: 'link' as const, label: 'Link as same deal', hint: `Call → ${m.manual.fuStatus} for ${m.manual.addedByName}` },
                        { key: 'duplicate' as const, label: 'Mark call Duplicate', hint: 'Manual deal kept; call FU = Duplicates' },
                        { key: 'leave' as const, label: 'Leave as-is', hint: 'Import call with no auto Deal/credit' },
                      ]).map(opt => (
                        <button
                          key={opt.key}
                          type="button"
                          onClick={() => setMatchAction(m.id, opt.key)}
                          className={`rounded-dss-sm border px-3 py-2 text-left text-xs transition ${
                            m.action === opt.key
                              ? 'border-dss-accent bg-dss-accent-soft/40 text-white'
                              : 'border-dss-border bg-dss-canvas text-dss-ink/80 hover:border-dss-border'
                          }`}
                        >
                          <span className="font-semibold block">{opt.label}</span>
                          <span className="text-dss-muted">{opt.hint}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                <p className="text-xs text-dss-muted">
                  Non-matched rows ({pendingUpload.calls.length - pendingUpload.matches.length}) will import as usual — no review needed.
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-dss-border px-5 py-4">
                <button
                  type="button"
                  onClick={cancelPendingUpload}
                  disabled={uploading}
                  className="rounded-dss-sm border border-dss-border px-4 py-2 text-sm text-dss-ink/80 hover:bg-dss-surface"
                >
                  Cancel upload
                </button>
                <button
                  type="button"
                  onClick={confirmPendingUpload}
                  disabled={uploading}
                  className="rounded-dss-sm bg-dss-navy-soft px-4 py-2 text-sm font-medium text-white hover:bg-dss-navy disabled:opacity-60"
                >
                  {uploading ? 'Importing...' : `Confirm import (${pendingUpload.matches.length} reviewed)`}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Duplicate notification */}
        {duplicateApps.length > 0 && (
          <div className="bg-yellow-900 border border-yellow-700 rounded-dss-sm p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">🔁</span>
              <p className="text-sm font-semibold text-amber-800">
                {duplicateApps.length} duplicate app{duplicateApps.length !== 1 ? 's' : ''} detected
              </p>
            </div>
            <p className="text-xs text-amber-700 mb-2">
              These apps already exist in the system. They've been flagged but their existing status was not changed.
            </p>
            <div className="flex flex-wrap gap-2">
              {duplicateApps.map((appId, i) => (
                <span key={i} className="px-2 py-0.5 bg-yellow-800 text-yellow-200 text-xs rounded border border-yellow-700 font-medium">
                  {appId}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="bg-dss-accent-soft bg-opacity-20 border border-dss-accent/30 p-4 rounded-dss-sm">
          <h4 className="text-dss-accent font-semibold mb-1 flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4" /> Expected Columns
          </h4>
          <p className="text-sm text-dss-accent">
          Application Id, Dealer Name, Dealer State, Dealer Cifnumber, customerFullName, Status Last, Timestamp Submit, App Last AF
          </p>
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-dss-border" />

      {/* ── FUNDING UPLOAD ── */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <DollarSign className="w-6 h-6 text-dss-success" />
          <h3 className="text-xl font-semibold text-dss-ink">Upload Funding Report</h3>
        </div>
        <p className="text-dss-muted text-sm">
          Upload your monthly funding CSV. Saves to Supabase and persists across sessions.
          Each new upload replaces the previous funding data.
        </p>

        <div className="bg-dss-surface p-8 rounded-dss-sm border border-dss-border">
          <div className="flex flex-col items-center justify-center">
            <DollarSign className="w-14 h-14 text-dss-success mb-4" />
            <h4 className="text-lg font-semibold text-dss-ink mb-2">Upload Funding CSV</h4>
            <p className="text-sm text-dss-muted mb-6 text-center max-w-md">
              Upload your funding report to update State Performance in the Reporting tab.
            </p>
            <label className="cursor-pointer">
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFundingFileUpload}
                disabled={uploadingFunding || !xlsxLoaded}
                className="hidden"
              />
              <div className={`px-6 py-3 rounded-dss-sm font-medium transition ${
                uploadingFunding || !xlsxLoaded
                  ? 'bg-dss-canvas text-dss-muted cursor-not-allowed'
                  : 'bg-dss-success text-white hover:bg-green-700'
              }`}>
                {uploadingFunding ? 'Processing...' : !xlsxLoaded ? 'Loading...' : 'Select Funding CSV'}
              </div>
            </label>
            <p className="text-xs text-dss-muted mt-4">Supported: CSV, XLSX, XLS</p>
          </div>
        </div>

        {fundingUploadResult && (
          <div className={`p-5 rounded-dss-sm border ${
            fundingUploadResult.success ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'
          }`}>
            <div className="flex items-start gap-3">
              {fundingUploadResult.success
                ? <CheckCircle className="w-5 h-5 text-dss-success flex-shrink-0 mt-0.5" />
                : <AlertCircle className="w-5 h-5 text-dss-danger flex-shrink-0 mt-0.5" />}
              <div className="flex-1">
                <p className={`font-semibold mb-1 ${fundingUploadResult.success ? 'text-green-100' : 'text-red-100'}`}>
                  {fundingUploadResult.success ? 'Funding Upload Successful!' : 'Upload Failed'}
                </p>
                <p className={`text-sm ${fundingUploadResult.success ? 'text-dss-success' : 'text-dss-danger'}`}>
                  {fundingUploadResult.message}
                </p>
                {fundingUploadResult.success && fundingUploadResult.byState && (
                  <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-3">
                    {fundingUploadResult.byState.map(item => (
                      <div key={item.state} className="rounded-dss-sm border border-emerald-200 bg-white p-3 shadow-sm">
                        <p className="text-emerald-900 font-bold text-lg">{item.state}</p>
                        <p className="text-emerald-800 font-semibold">{item.count} funded</p>
                        <p className="text-emerald-700 text-sm">{formatCurrency(item.totalAmount)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {Object.keys(fundingData).length > 0 && !fundingUploadResult && (
          <div className="bg-dss-surface p-4 rounded-dss-sm border border-dss-border">
            <p className="text-sm font-semibold text-dss-ink/80 mb-3">Currently Loaded Funding Data:</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Object.entries(fundingData).map(([state, data]) => (
                <div key={state} className="bg-dss-canvas rounded-dss-sm p-3">
                  <p className="text-dss-ink font-bold">{state}</p>
                  <p className="text-dss-success font-semibold">{data.count} funded</p>
                  <p className="text-dss-muted text-xs">{formatCurrency(data.totalAmount)}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-emerald-50 bg-opacity-20 border border-emerald-200 p-4 rounded-dss-sm">
          <h4 className="text-dss-success font-semibold mb-1 flex items-center gap-2">
            <DollarSign className="w-4 h-4" /> Expected Columns
          </h4>
          <p className="text-sm text-dss-success">
            Input Date, Account, Dealer, Deal Type, Fund Type,{' '}
            <strong>Dealer State</strong>, APR, Discount Percent, <strong>Loan Amount</strong>
          </p>
        </div>
      </div>

      {/* Dealer list */}
      {dealers.length > 0 && (
        <div className="bg-dss-surface p-6 rounded-dss-sm border border-dss-border">
          <h3 className="text-lg font-semibold text-dss-ink mb-4">
            Master Dealer List ({dealers.length} dealers)
          </h3>
          <div className="bg-dss-canvas p-4 rounded border border-dss-border max-h-60 overflow-y-auto">
            <div className="space-y-2">
              {dealers.map(dealer => (
                <div key={dealer.cifNumber}
                  className="flex items-center justify-between text-sm py-2 border-b border-dss-border last:border-0">
                  <div>
                    <span className="font-mono text-dss-accent font-medium">{dealer.cifNumber}</span>
                    <span className="text-dss-ink/80 ml-3">{dealer.name}</span>
                  </div>
                  <span className="text-dss-muted">{dealer.state}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}