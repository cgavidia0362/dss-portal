import { useState } from 'react';
import { Car, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import VehicleRiskReport from '../components/VehicleRiskReport';
import {
  NHTSA_EXTRACT_FIELDS,
  type VehicleRiskReportData,
} from '../types/vehicleRisk';

const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/;

function normalizeVin(value: string): string {
  return value.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, '').slice(0, 17);
}

function extractNhtsaFields(result: Record<string, string>): Record<string, string> {
  const data: Record<string, string> = {};
  for (const field of NHTSA_EXTRACT_FIELDS) {
    const value = result[field]?.trim();
    if (value && value !== 'Not Applicable') {
      data[field] = value;
    }
  }
  return data;
}

async function decodeVin(vin: string): Promise<Record<string, string>> {
  const response = await fetch(
    `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended/${encodeURIComponent(vin)}?format=json`,
  );

  if (!response.ok) {
    throw new Error('Failed to reach the NHTSA VIN decoder. Please try again.');
  }

  const payload = await response.json();
  const result = payload.Results?.[0];

  if (!result) {
    throw new Error('No decode results returned for this VIN.');
  }

  if (result.ErrorCode && result.ErrorCode !== '0') {
    throw new Error(result.ErrorText || 'Unable to decode this VIN.');
  }

  const nhtsaData = extractNhtsaFields(result);
  if (!nhtsaData.ModelYear && !nhtsaData.Make && !nhtsaData.Model) {
    throw new Error('VIN decoded but no vehicle details were found. Check the VIN and try again.');
  }

  return nhtsaData;
}

export default function VehicleRiskPublic() {
  const [vin, setVin] = useState('');
  const [mileage, setMileage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [report, setReport] = useState<VehicleRiskReportData | null>(null);
  const [analyzedVin, setAnalyzedVin] = useState('');
  const [analyzedMileage, setAnalyzedMileage] = useState(0);

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setReport(null);

    const normalizedVin = normalizeVin(vin);
    const mileageValue = parseInt(mileage.replace(/,/g, ''), 10);

    if (!VIN_PATTERN.test(normalizedVin)) {
      setError('Enter a valid 17-character VIN.');
      return;
    }

    if (!Number.isFinite(mileageValue) || mileageValue < 0) {
      setError('Enter a valid mileage (0 or greater).');
      return;
    }

    setLoading(true);

    try {
      const nhtsaData = await decodeVin(normalizedVin);

      const { data, error: fnError } = await supabase.functions.invoke('vehicle-risk-report', {
        body: { vin: normalizedVin, mileage: mileageValue, nhtsaData },
      });

      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);

      setReport(data as VehicleRiskReportData);
      setAnalyzedVin(normalizedVin);
      setAnalyzedMileage(mileageValue);
    } catch (err: unknown) {
      console.error('Vehicle analysis error:', err);
      const message = err instanceof Error ? err.message : 'Failed to analyze vehicle. Please try again.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900">
      <header className="bg-gray-800 border-b border-gray-700">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
          <h1 className="text-2xl font-bold text-gray-100 flex items-center gap-2">
            <Car className="w-6 h-6 text-blue-400" />
            Vehicle Risk Analyzer
          </h1>
          <p className="text-sm text-gray-400 mt-1">Powered by Pronto Finance</p>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-5">
        <form
          onSubmit={handleAnalyze}
          className="bg-gray-800 border border-gray-700 rounded-lg p-5 space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="public-vin" className="block text-sm font-medium text-gray-300 mb-1.5">
                VIN
              </label>
              <input
                id="public-vin"
                type="text"
                value={vin}
                onChange={(e) => setVin(normalizeVin(e.target.value))}
                placeholder="17-character VIN"
                maxLength={17}
                disabled={loading}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
              />
              <p className="text-xs text-gray-500 mt-1">{vin.length}/17 characters</p>
            </div>

            <div>
              <label htmlFor="public-mileage" className="block text-sm font-medium text-gray-300 mb-1.5">
                Mileage
              </label>
              <input
                id="public-mileage"
                type="number"
                min={0}
                step={1}
                value={mileage}
                onChange={(e) => setMileage(e.target.value)}
                placeholder="e.g. 85432"
                disabled={loading}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Analyzing…
              </>
            ) : (
              'Analyze Vehicle'
            )}
          </button>
        </form>

        {loading && (
          <div className="bg-gray-800 border border-gray-700 rounded-lg px-6 py-10 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
            <p className="text-sm text-gray-300">Decoding VIN and generating underwriting report…</p>
            <p className="text-xs text-gray-500">This may take 15–30 seconds</p>
          </div>
        )}

        {error && (
          <div className="bg-red-900 bg-opacity-30 border border-red-800 rounded-lg px-4 py-3">
            <p className="text-sm text-red-300">{error}</p>
          </div>
        )}

        {report && !loading && (
          <VehicleRiskReport
            report={report}
            vin={analyzedVin}
            mileage={analyzedMileage}
          />
        )}
      </main>
    </div>
  );
}
