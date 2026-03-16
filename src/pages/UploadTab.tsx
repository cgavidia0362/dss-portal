import { useState } from 'react';
import * as XLSX from 'xlsx';
import { Upload, CheckCircle, XCircle, FileSpreadsheet } from 'lucide-react';

interface UploadHistory {
  id: string;
  uploadedBy: string;
  uploadedAt: Date;
  filename: string;
  rowCount: number;
  insertedCount: number;
  updatedCount: number;
  errorCount: number;
  status: 'success' | 'error';
}

interface ParsedCall {
  applicationId: string;
  dealerName: string;
  buyerFinal: number;
  statusLast: string;
  timestampSubmit: Date;
  state: string;
}

export default function UploadTab() {
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{
    success: boolean;
    message: string;
    inserted: number;
    updated: number;
    errors: number;
  } | null>(null);

  // Fake upload history data
  const [uploadHistory] = useState<UploadHistory[]>([
    {
      id: '1',
      uploadedBy: 'Admin User',
      uploadedAt: new Date('2026-01-12T09:23:00'),
      filename: 'calls_jan_2026.xlsx',
      rowCount: 168,
      insertedCount: 145,
      updatedCount: 23,
      errorCount: 0,
      status: 'success',
    },
    {
      id: '2',
      uploadedBy: 'Admin User',
      uploadedAt: new Date('2026-01-11T14:15:00'),
      filename: 'calls_jan_week1.xlsx',
      rowCount: 101,
      insertedCount: 89,
      updatedCount: 12,
      errorCount: 0,
      status: 'success',
    },
    {
      id: '3',
      uploadedBy: 'Admin User',
      uploadedAt: new Date('2026-01-10T11:30:00'),
      filename: 'calls_dec_2025.xlsx',
      rowCount: 95,
      insertedCount: 87,
      updatedCount: 8,
      errorCount: 0,
      status: 'success',
    },
  ]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadResult(null);

    try {
      // Read the Excel file
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];

      // Validate required columns
      if (jsonData.length === 0) {
        throw new Error('The Excel file is empty!');
      }

      const firstRow = jsonData[0];
      const requiredColumns = [
        'Application Id',
        'Dealer Name',
        'Buyer Final',
        'Status Last',
        'Timestamp Submit',
        'State',
      ];

      const missingColumns = requiredColumns.filter(
        (col) => !(col in firstRow)
      );

      if (missingColumns.length > 0) {
        throw new Error(
          `Missing required columns: ${missingColumns.join(', ')}`
        );
      }

      // Parse the data
      const parsedCalls: ParsedCall[] = jsonData.map((row) => ({
        applicationId: String(row['Application Id']),
        dealerName: String(row['Dealer Name']),
        buyerFinal: Number(row['Buyer Final']),
        statusLast: String(row['Status Last']),
        timestampSubmit: new Date(row['Timestamp Submit']),
        state: String(row['State']),
      }));

      // Simulate upload (in real app, this would call Supabase)
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Fake result
      const inserted = Math.floor(parsedCalls.length * 0.85);
      const updated = parsedCalls.length - inserted;

      setUploadResult({
        success: true,
        message: `Successfully processed ${parsedCalls.length} rows!`,
        inserted,
        updated,
        errors: 0,
      });
    } catch (error: any) {
      setUploadResult({
        success: false,
        message: error.message || 'Failed to upload file',
        inserted: 0,
        updated: 0,
        errors: 1,
      });
    } finally {
      setUploading(false);
      // Reset file input
      e.target.value = '';
    }
  };

  const formatDateTime = (date: Date) => {
    return date.toLocaleString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  };

  return (
    <div>
      {/* Page Header */}
      <div className="mb-6">
        <h2 className="text-xl font-semibold mb-2">Upload Call Data</h2>
        <p className="text-gray-400 text-sm">
          Upload an Excel file (.xlsx or .xls) with call information
        </p>
      </div>

      {/* Upload Card */}
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700 mb-6">
        <label className="block">
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileUpload}
            disabled={uploading}
            className="hidden"
          />
          <div className="border-2 border-dashed border-gray-600 rounded-lg p-12 text-center hover:border-blue-500 transition cursor-pointer">
            {uploading ? (
              <>
                <div className="animate-spin h-12 w-12 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
                <p className="text-sm text-gray-300">Processing file...</p>
              </>
            ) : (
              <>
                <Upload className="mx-auto h-12 w-12 text-gray-500 mb-4" />
                <p className="text-sm text-gray-300 mb-2">
                  Click to upload or drag and drop
                </p>
                <p className="text-xs text-gray-500">
                  Excel files (.xlsx, .xls) only
                </p>
              </>
            )}
          </div>
        </label>
      </div>

      {/* Upload Result */}
      {uploadResult && (
        <div
          className={`rounded-xl p-6 mb-6 border ${
            uploadResult.success
              ? 'bg-green-900/20 border-green-700'
              : 'bg-red-900/20 border-red-700'
          }`}
        >
          <div className="flex items-start gap-3">
            {uploadResult.success ? (
              <CheckCircle className="w-6 h-6 text-green-500 flex-shrink-0" />
            ) : (
              <XCircle className="w-6 h-6 text-red-500 flex-shrink-0" />
            )}
            <div className="flex-1">
              <h3
                className={`font-semibold mb-2 ${
                  uploadResult.success ? 'text-green-500' : 'text-red-500'
                }`}
              >
                {uploadResult.success ? 'Upload Successful!' : 'Upload Failed'}
              </h3>
              <p className="text-sm text-gray-300 mb-3">
                {uploadResult.message}
              </p>
              {uploadResult.success && (
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-gray-400">Inserted:</span>
                    <span className="ml-2 font-semibold text-green-400">
                      {uploadResult.inserted}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-400">Updated:</span>
                    <span className="ml-2 font-semibold text-blue-400">
                      {uploadResult.updated}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-400">Errors:</span>
                    <span className="ml-2 font-semibold text-gray-400">
                      {uploadResult.errors}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Upload History Table */}
      <div className="bg-gray-800 rounded-xl border border-gray-700">
        <div className="px-6 py-4 border-b border-gray-700">
          <h3 className="font-semibold flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5" />
            Upload History
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-750">
              <tr className="text-left text-xs text-gray-400 uppercase tracking-wider">
                <th className="px-6 py-3">Date & Time</th>
                <th className="px-6 py-3">Uploaded By</th>
                <th className="px-6 py-3">Filename</th>
                <th className="px-6 py-3">Total Rows</th>
                <th className="px-6 py-3">Inserted</th>
                <th className="px-6 py-3">Updated</th>
                <th className="px-6 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {uploadHistory.map((upload) => (
                <tr key={upload.id} className="hover:bg-gray-750">
                  <td className="px-6 py-4 text-sm">
                    {formatDateTime(upload.uploadedAt)}
                  </td>
                  <td className="px-6 py-4 text-sm">{upload.uploadedBy}</td>
                  <td className="px-6 py-4 text-sm font-mono">
                    {upload.filename}
                  </td>
                  <td className="px-6 py-4 text-sm">{upload.rowCount}</td>
                  <td className="px-6 py-4 text-sm text-green-400">
                    {upload.insertedCount}
                  </td>
                  <td className="px-6 py-4 text-sm text-blue-400">
                    {upload.updatedCount}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`px-2 py-1 text-xs rounded-full ${
                        upload.status === 'success'
                          ? 'bg-green-600 text-white'
                          : 'bg-red-600 text-white'
                      }`}
                    >
                      {upload.status === 'success' ? 'Success' : 'Failed'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
