import { useState, useEffect } from 'react';
import { Upload, CheckCircle, AlertCircle, FileSpreadsheet, DollarSign } from 'lucide-react';
import { supabase } from '../lib/supabase';

declare const XLSX: any;

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
  fuStatus?: 'Deal' | 'Confirmed Deal' | 'No Deal' | 'Pending' | 'No Answer' | 'Closed' | 'Duplicates';
  fiType?: 'Independent' | 'Franchise';
  updatedAt: Date;
  dealDate?: Date;
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
}

interface MatchedDeal {
  appId: string;
  repName: string;
  dealDate: Date;
}

export default function UploadTab({ setCalls, dealers, setDealers, fundingData, setFundingData }: UploadTabProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadingFunding, setUploadingFunding] = useState(false);
  const [xlsxLoaded, setXlsxLoaded] = useState(false);
  const [matchedDeals, setMatchedDeals] = useState<MatchedDeal[]>([]);

  const [uploadResult, setUploadResult] = useState<{
    success: boolean;
    message: string;
    callsCount?: number;
    newDealersCount?: number;
    newDealersList?: Dealer[];
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
      setUploadResult({ success: false, message: 'Failed to load file processing library. Please refresh the page.' });
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

  // Match parsed calls against Daily Deals in Supabase
  const applyDailyDealsMatches = async (parsedCalls: Call[]): Promise<{ calls: Call[]; matches: MatchedDeal[] }> => {
    const appIds = parsedCalls.map(c => c.applicationId).filter(Boolean);
    if (!appIds.length) return { calls: parsedCalls, matches: [] };

    try {
      const { data } = await supabase
        .from('daily_deals')
        .select('*')
        .in('app_id', appIds)
        .in('fu_status', ['Deal', 'Confirmed Deal']);

      if (!data || data.length === 0) return { calls: parsedCalls, matches: [] };

      const dealMap: { [appId: string]: any } = {};
      data.forEach((d: any) => { dealMap[d.app_id] = d; });

      const processedCalls = parsedCalls.map(call => {
        const match = dealMap[call.applicationId];
        if (match) {
          return {
            ...call,
            assignedTo: match.added_by,
            assignedToName: match.added_by_name,
            fuStatus: 'Deal' as const,
            dealDate: new Date(match.created_at),
          };
        }
        return call;
      });

      const matches: MatchedDeal[] = data.map((d: any) => ({
        appId: d.app_id,
        repName: d.added_by_name,
        dealDate: new Date(d.created_at),
      }));

      return { calls: processedCalls, matches };
    } catch (err) {
      console.error('Error matching daily deals:', err);
      return { calls: parsedCalls, matches: [] };
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
            discoveredDealers.set(cifNumber, { cifNumber, name: dealerName, state: dealerState, createdAt: new Date() });
          }
        }

        const parsedDate = parseXlsxDate(row['Timestamp Submit']);
        const timestampSubmit = parsedDate ?? new Date();

        const statusLast = String(row['Status Last'] || '').trim();
        let initialFuStatus: Call['fuStatus'] = 'Pending';
        let initialDealDate: Date | undefined = undefined;

        if (statusLast === 'Accepted') {
          initialFuStatus = 'Deal';
          initialDealDate = timestampSubmit;
        }

        newCalls.push({
          id: `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          applicationId: String(row['Application Id'] || ''),
          dealerCifNumber: cifNumber,
          dealerName,
          state: dealerState,
          buyerFinal: String(row['App Last AF'] || '0'),
          statusLast,
          timestampSubmit,
          submittedDate: timestampSubmit.toISOString().split('T')[0],
          assignedTo: undefined,
          assignedToName: undefined,
          fuStatus: initialFuStatus,
          fiType: undefined,
          updatedAt: new Date(),
          dealDate: initialDealDate,
        });
      });

      // Apply Daily Deals matching
      const { calls: processedCalls, matches } = await applyDailyDealsMatches(newCalls);

      const newDealersList = Array.from(discoveredDealers.values());
      if (newDealersList.length > 0) setDealers(prev => [...prev, ...newDealersList]);
      setCalls(prev => [...prev, ...processedCalls]);

      if (matches.length > 0) setMatchedDeals(matches);

      setUploadResult({
        success: true,
        message: `Successfully processed ${processedCalls.length} calls`,
        callsCount: processedCalls.length,
        newDealersCount: newDealersList.length,
        newDealersList,
      });
    } catch (error) {
      setUploadResult({ success: false, message: `Error processing file: ${error instanceof Error ? error.message : 'Unknown error'}` });
    } finally {
      setUploading(false);
      event.target.value = '';
    }
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
      setFundingUploadResult({ success: false, message: `Error processing file: ${error instanceof Error ? error.message : 'Unknown error'}` });
    } finally {
      setUploadingFunding(false);
      event.target.value = '';
    }
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-gray-100">Upload</h2>
        <p className="text-gray-400 mt-1">Upload call data and funding reports</p>
      </div>

      {/* ── SECTION 1: CALLS UPLOAD ── */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <FileSpreadsheet className="w-6 h-6 text-blue-400" />
          <h3 className="text-xl font-semibold text-gray-100">Upload Calls</h3>
        </div>

        <div className="bg-gray-800 p-8 rounded-lg shadow border border-gray-700">
          <div className="flex flex-col items-center justify-center">
            <Upload className="w-14 h-14 text-gray-400 mb-4" />
            <h4 className="text-lg font-semibold text-gray-100 mb-2">Upload Calls CSV</h4>
            <p className="text-sm text-gray-400 mb-6 text-center max-w-md">
              Upload your call data CSV. New dealers will be automatically added to the master dealer list.
            </p>
            <label className="cursor-pointer">
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileUpload}
                disabled={uploading || !xlsxLoaded}
                className="hidden"
              />
              <div className={`px-6 py-3 rounded-lg font-medium transition ${
                uploading || !xlsxLoaded
                  ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}>
                {uploading ? 'Processing...' : !xlsxLoaded ? 'Loading...' : 'Select Calls CSV'}
              </div>
            </label>
            <p className="text-xs text-gray-500 mt-4">Supported: CSV, XLSX, XLS</p>
          </div>
        </div>

        {/* Upload result */}
        {uploadResult && (
          <div className={`p-6 rounded-lg shadow border ${
            uploadResult.success ? 'bg-green-900 border-green-700' : 'bg-red-900 border-red-700'
          }`}>
            <div className="flex items-start gap-4">
              {uploadResult.success
                ? <CheckCircle className="w-6 h-6 text-green-400 flex-shrink-0 mt-1" />
                : <AlertCircle className="w-6 h-6 text-red-400 flex-shrink-0 mt-1" />}
              <div className="flex-1">
                <h4 className={`font-semibold mb-2 ${uploadResult.success ? 'text-green-100' : 'text-red-100'}`}>
                  {uploadResult.success ? 'Upload Successful!' : 'Upload Failed'}
                </h4>
                <p className={`text-sm ${uploadResult.success ? 'text-green-200' : 'text-red-200'}`}>
                  {uploadResult.message}
                </p>
                {uploadResult.success && uploadResult.callsCount && (
                  <div className="mt-3 space-y-1">
                    <p className="text-sm text-green-200 flex items-center gap-2">
                      <FileSpreadsheet className="w-4 h-4" /> {uploadResult.callsCount} calls imported
                    </p>
                    {uploadResult.newDealersCount! > 0 && (
                      <p className="text-sm text-green-200 flex items-center gap-2">
                        <CheckCircle className="w-4 h-4" /> {uploadResult.newDealersCount} new dealers added
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Daily Deals match notification */}
        {matchedDeals.length > 0 && (
          <div className="bg-green-900 border border-green-700 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">🎯</span>
              <p className="text-sm font-semibold text-green-300">
                {matchedDeals.length} app{matchedDeals.length !== 1 ? 's' : ''} auto-matched from Daily Deals
              </p>
            </div>
            <div className="space-y-1.5">
              {matchedDeals.map((m, i) => (
                <div key={i} className="flex items-center gap-3 text-xs">
                  <span className="font-semibold text-green-300">{m.appId}</span>
                  <span className="text-green-500">→</span>
                  <span className="text-green-200">{m.repName}</span>
                  <span className="text-green-600">·</span>
                  <span className="text-green-500">
                    Deal logged {m.dealDate.toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric', year: 'numeric',
                    })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-blue-900 bg-opacity-20 border border-blue-700 p-4 rounded-lg">
          <h4 className="text-blue-300 font-semibold mb-2 flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4" /> Expected Columns
          </h4>
          <p className="text-sm text-blue-200">
            Application Id, Dealer Name, Dealer State, Dealer Cifnumber, Status Last, Timestamp Submit, App Request AF
          </p>
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-gray-700" />

      {/* ── SECTION 2: FUNDING UPLOAD ── */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <DollarSign className="w-6 h-6 text-green-400" />
          <h3 className="text-xl font-semibold text-gray-100">Upload Funding Report</h3>
        </div>
        <p className="text-gray-400 text-sm">
          Upload your monthly funding CSV to update the State Performance goals in the Reporting tab.
        </p>

        <div className="bg-gray-800 p-8 rounded-lg shadow border border-gray-700">
          <div className="flex flex-col items-center justify-center">
            <DollarSign className="w-14 h-14 text-green-400 mb-4" />
            <h4 className="text-lg font-semibold text-gray-100 mb-2">Upload Funding CSV</h4>
            <p className="text-sm text-gray-400 mb-6 text-center max-w-md">
              Upload your funding report. The system will count funded deals and total amounts per state
              and update the Reporting tab automatically.
            </p>
            <label className="cursor-pointer">
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFundingFileUpload}
                disabled={uploadingFunding || !xlsxLoaded}
                className="hidden"
              />
              <div className={`px-6 py-3 rounded-lg font-medium transition ${
                uploadingFunding || !xlsxLoaded
                  ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                  : 'bg-green-600 text-white hover:bg-green-700'
              }`}>
                {uploadingFunding ? 'Processing...' : !xlsxLoaded ? 'Loading...' : 'Select Funding CSV'}
              </div>
            </label>
            <p className="text-xs text-gray-500 mt-4">Supported: CSV, XLSX, XLS</p>
          </div>
        </div>

        {fundingUploadResult && (
          <div className={`p-6 rounded-lg shadow border ${
            fundingUploadResult.success ? 'bg-green-900 border-green-700' : 'bg-red-900 border-red-700'
          }`}>
            <div className="flex items-start gap-4">
              {fundingUploadResult.success
                ? <CheckCircle className="w-6 h-6 text-green-400 flex-shrink-0 mt-1" />
                : <AlertCircle className="w-6 h-6 text-red-400 flex-shrink-0 mt-1" />}
              <div className="flex-1">
                <h4 className={`font-semibold mb-2 ${fundingUploadResult.success ? 'text-green-100' : 'text-red-100'}`}>
                  {fundingUploadResult.success ? 'Funding Upload Successful!' : 'Upload Failed'}
                </h4>
                <p className={`text-sm ${fundingUploadResult.success ? 'text-green-200' : 'text-red-200'}`}>
                  {fundingUploadResult.message}
                </p>
                {fundingUploadResult.success && fundingUploadResult.byState && (
                  <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-3">
                    {fundingUploadResult.byState.map(item => (
                      <div key={item.state} className="bg-green-950 rounded-lg p-3 border border-green-800">
                        <p className="text-green-300 font-bold text-lg">{item.state}</p>
                        <p className="text-green-100 font-semibold">{item.count} funded</p>
                        <p className="text-green-400 text-sm">{formatCurrency(item.totalAmount)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {Object.keys(fundingData).length > 0 && !fundingUploadResult && (
          <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
            <p className="text-sm font-semibold text-gray-300 mb-3">Currently Loaded Funding Data:</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Object.entries(fundingData).map(([state, data]) => (
                <div key={state} className="bg-gray-700 rounded-lg p-3">
                  <p className="text-gray-200 font-bold">{state}</p>
                  <p className="text-green-400 font-semibold">{data.count} funded</p>
                  <p className="text-gray-400 text-xs">{formatCurrency(data.totalAmount)}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-green-900 bg-opacity-20 border border-green-700 p-4 rounded-lg">
          <h4 className="text-green-300 font-semibold mb-2 flex items-center gap-2">
            <DollarSign className="w-4 h-4" /> Expected Columns
          </h4>
          <p className="text-sm text-green-200">
            Input Date, Account, Dealer, Deal Type, Fund Type, <strong>Dealer State</strong>, APR,
            Discount Percent, <strong>Loan Amount</strong>
          </p>
        </div>
      </div>

      {/* Dealer list */}
      {dealers.length > 0 && (
        <div className="bg-gray-800 p-6 rounded-lg shadow border border-gray-700">
          <h3 className="text-lg font-semibold text-gray-100 mb-4">
            Master Dealer List ({dealers.length} dealers)
          </h3>
          <div className="bg-gray-750 p-4 rounded border border-gray-600 max-h-60 overflow-y-auto">
            <div className="space-y-2">
              {dealers.map(dealer => (
                <div key={dealer.cifNumber}
                  className="flex items-center justify-between text-sm py-2 border-b border-gray-700 last:border-0">
                  <div>
                    <span className="font-mono text-blue-400 font-medium">{dealer.cifNumber}</span>
                    <span className="text-gray-300 ml-3">{dealer.name}</span>
                  </div>
                  <span className="text-gray-400">{dealer.state}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}