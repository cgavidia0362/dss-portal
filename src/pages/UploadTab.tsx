import { useState } from 'react';
import { Upload, CheckCircle, AlertCircle, FileSpreadsheet } from 'lucide-react';

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
}

export default function UploadTab() {
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{
    success: boolean;
    message: string;
    callsCount?: number;
    newDealersCount?: number;
    dealers?: Dealer[];
  } | null>(null);

  // Master dealer list (in production, this would be in Supabase)
  const [masterDealerList, setMasterDealerList] = useState<Dealer[]>([]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
  
    setUploading(true);
    setUploadResult(null);
  
    try {
      // Dynamic import with default handling
      const XLSXModule = await import('xlsx');
      const XLSX = XLSXModule.default || XLSXModule;
      
      if (!XLSX || !XLSX.read || !XLSX.utils) {
        throw new Error('XLSX library failed to load properly');
      }
      
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      
      // Parse to JSON
      const jsonData = XLSX.utils.sheet_to_json(worksheet);
  
      if (jsonData.length === 0) {
        setUploadResult({
          success: false,
          message: 'The uploaded file is empty or has no valid data.',
        });
        setUploading(false);
        return;
      }
  
      // Process data
      const newCalls: Call[] = [];
      const discoveredDealers = new Map<string, Dealer>();
  
      jsonData.forEach((row: any) => {
        // Extract dealer info
        const cifNumber = String(row['Dealer Cifnumber'] || '').trim();
        const dealerName = String(row['Dealer Name'] || '').trim();
        const dealerState = String(row['Dealer State'] || '').trim();
  
        // Skip if missing critical data
        if (!cifNumber || !dealerName || !row['Application Id']) {
          return;
        }
  
        // Add to discovered dealers (if not already in master list)
        if (!masterDealerList.some((d) => d.cifNumber === cifNumber)) {
          if (!discoveredDealers.has(cifNumber)) {
            discoveredDealers.set(cifNumber, {
              cifNumber,
              name: dealerName,
              state: dealerState,
              createdAt: new Date(),
            });
          }
        }
  
        // Parse timestamp
        let timestampSubmit = new Date();
        const timestampStr = String(row['Timestamp Submit'] || '');
        if (timestampStr) {
          const parsed = new Date(timestampStr);
          if (!isNaN(parsed.getTime())) {
            timestampSubmit = parsed;
          }
        }
  
        // Create call
        const call: Call = {
          id: `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          applicationId: String(row['Application Id'] || ''),
          dealerCifNumber: cifNumber,
          dealerName: dealerName,
          state: dealerState,
          buyerFinal: String(row['Buyer Final'] || ''),
          statusLast: String(row['Status Last'] || ''),
          timestampSubmit,
          submittedDate: timestampSubmit.toISOString().split('T')[0],
          assignedTo: undefined,
          assignedToName: undefined,
          fuStatus: 'Pending',
          fiType: undefined,
          updatedAt: new Date(),
        };
  
        newCalls.push(call);
      });
  
      // Update master dealer list
      const newDealers = Array.from(discoveredDealers.values());
      if (newDealers.length > 0) {
        setMasterDealerList((prev) => [...prev, ...newDealers]);
      }
  
      setUploadResult({
        success: true,
        message: `Successfully processed ${newCalls.length} calls`,
        callsCount: newCalls.length,
        newDealersCount: newDealers.length,
        dealers: newDealers,
      });
  
      console.log('New Calls:', newCalls);
      console.log('New Dealers:', newDealers);
      console.log('Master Dealer List:', [...masterDealerList, ...newDealers]);
  
    } catch (error) {
      console.error('Upload error:', error);
      setUploadResult({
        success: false,
        message: `Error processing file: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-100">Upload Calls</h2>
        <p className="text-gray-400 mt-1">
          Upload CSV file with call data to distribute to your team
        </p>
      </div>

      {/* Upload Section */}
      <div className="bg-gray-800 p-8 rounded-lg shadow border border-gray-700">
        <div className="flex flex-col items-center justify-center">
          <Upload className="w-16 h-16 text-gray-400 mb-4" />
          <h3 className="text-lg font-semibold text-gray-100 mb-2">
            Upload CSV File
          </h3>
          <p className="text-sm text-gray-400 mb-6 text-center max-w-md">
            Select a CSV file containing call data. New dealers will be automatically
            added to the master dealer list.
          </p>

          <label className="cursor-pointer">
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={handleFileUpload}
              disabled={uploading}
              className="hidden"
            />
            <div
              className={`px-6 py-3 rounded-lg font-medium transition ${
                uploading
                  ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {uploading ? 'Processing...' : 'Select CSV File'}
            </div>
          </label>

          <p className="text-xs text-gray-500 mt-4">
            Supported formats: CSV, XLSX, XLS
          </p>
        </div>
      </div>

      {/* Upload Result */}
      {uploadResult && (
        <div
          className={`p-6 rounded-lg shadow border ${
            uploadResult.success
              ? 'bg-green-900 border-green-700'
              : 'bg-red-900 border-red-700'
          }`}
        >
          <div className="flex items-start gap-4">
            {uploadResult.success ? (
              <CheckCircle className="w-6 h-6 text-green-400 flex-shrink-0 mt-1" />
            ) : (
              <AlertCircle className="w-6 h-6 text-red-400 flex-shrink-0 mt-1" />
            )}
            <div className="flex-1">
              <h4
                className={`font-semibold mb-2 ${
                  uploadResult.success ? 'text-green-100' : 'text-red-100'
                }`}
              >
                {uploadResult.success ? 'Upload Successful!' : 'Upload Failed'}
              </h4>
              <p
                className={`text-sm ${
                  uploadResult.success ? 'text-green-200' : 'text-red-200'
                }`}
              >
                {uploadResult.message}
              </p>

              {uploadResult.success && uploadResult.callsCount && (
                <div className="mt-4 space-y-2">
                  <div className="flex items-center gap-2 text-sm text-green-200">
                    <FileSpreadsheet className="w-4 h-4" />
                    <span>
                      {uploadResult.callsCount} calls imported (all unassigned)
                    </span>
                  </div>
                  {uploadResult.newDealersCount! > 0 && (
                    <div className="flex items-center gap-2 text-sm text-green-200">
                      <CheckCircle className="w-4 h-4" />
                      <span>
                        {uploadResult.newDealersCount} new dealers added to master list
                      </span>
                    </div>
                  )}
                </div>
              )}

              {uploadResult.success && uploadResult.dealers && uploadResult.dealers.length > 0 && (
                <div className="mt-4">
                  <p className="text-sm font-medium text-green-200 mb-2">
                    New Dealers Discovered:
                  </p>
                  <div className="bg-green-950 p-3 rounded border border-green-800 max-h-40 overflow-y-auto">
                    {uploadResult.dealers.map((dealer) => (
                      <div
                        key={dealer.cifNumber}
                        className="text-sm text-green-100 py-1"
                      >
                        <span className="font-mono text-green-300">
                          {dealer.cifNumber}
                        </span>{' '}
                        - {dealer.name} ({dealer.state})
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Master Dealer List Summary */}
      {masterDealerList.length > 0 && (
        <div className="bg-gray-800 p-6 rounded-lg shadow border border-gray-700">
          <h3 className="text-lg font-semibold text-gray-100 mb-4">
            Master Dealer List ({masterDealerList.length} dealers)
          </h3>
          <div className="bg-gray-750 p-4 rounded border border-gray-600 max-h-60 overflow-y-auto">
            <div className="space-y-2">
              {masterDealerList.map((dealer) => (
                <div
                  key={dealer.cifNumber}
                  className="flex items-center justify-between text-sm py-2 border-b border-gray-700 last:border-0"
                >
                  <div>
                    <span className="font-mono text-blue-400 font-medium">
                      {dealer.cifNumber}
                    </span>
                    <span className="text-gray-300 ml-3">{dealer.name}</span>
                  </div>
                  <span className="text-gray-400">{dealer.state}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Instructions */}
      <div className="bg-blue-900 bg-opacity-20 border border-blue-700 p-6 rounded-lg">
        <h4 className="text-blue-300 font-semibold mb-2 flex items-center gap-2">
          <FileSpreadsheet className="w-5 h-5" />
          Upload Instructions
        </h4>
        <ul className="text-sm text-blue-200 space-y-2 ml-7">
          <li>• Upload your CSV file with call data</li>
          <li>• New dealers will be automatically added to the master list</li>
          <li>• All calls will be imported as unassigned</li>
          <li>• Go to the "Assign" tab to distribute calls to your team</li>
          <li>
            • Expected columns: Application Id, Dealer Name, Dealer State, Dealer
            Cifnumber, Status Last, Timestamp Submit
          </li>
        </ul>
      </div>
    </div>
  );
}