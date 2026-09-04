import { useEffect, useRef, useState } from 'react';
import { Car, ImageUp, Loader2, Link, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';
import VehicleRiskReport from '../components/VehicleRiskReport';
import {
  NHTSA_EXTRACT_FIELDS,
  type VehicleRiskReportData,
} from '../types/vehicleRisk';

interface User {
  id: string;
  name: string;
  role: 'admin' | 'manager' | 'rep' | 'buying_assistant';
}

interface VehicleRiskAnalyzerProps {
  currentUser: User;
}

const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

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

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      if (!base64) {
        reject(new Error('Failed to read image file.'));
        return;
      }
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });
}

export default function VehicleRiskAnalyzer({ currentUser }: VehicleRiskAnalyzerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [vin, setVin] = useState('');
  const [mileage, setMileage] = useState('');
  const [trim, setTrim] = useState('');
  const [lastAutoTrim, setLastAutoTrim] = useState('');
  const [vinDecodedNoTrim, setVinDecodedNoTrim] = useState(false);
  const [decodingTrim, setDecodingTrim] = useState(false);
  const [loading, setLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState('');
  const [report, setReport] = useState<VehicleRiskReportData | null>(null);
  const [analyzedVin, setAnalyzedVin] = useState('');
  const [analyzedMileage, setAnalyzedMileage] = useState(0);
  const [screenshotName, setScreenshotName] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);

  const trimRef = useRef(trim);
  const lastAutoTrimRef = useRef(lastAutoTrim);
  trimRef.current = trim;
  lastAutoTrimRef.current = lastAutoTrim;

  const publicLink = `${window.location.origin}/vehicle-risk-public`;

  useEffect(() => {
    if (!VIN_PATTERN.test(vin)) {
      setVinDecodedNoTrim(false);
      setDecodingTrim(false);
      return;
    }

    let cancelled = false;
    (async () => {
      setDecodingTrim(true);
      try {
        const data = await decodeVin(vin);
        if (cancelled) return;
        const nhtsaTrim = (data.Trim || '').trim();
        if (nhtsaTrim) {
          setVinDecodedNoTrim(false);
          const current = trimRef.current;
          const lastAuto = lastAutoTrimRef.current;
          if (!current || current === lastAuto) {
            setTrim(nhtsaTrim);
            setLastAutoTrim(nhtsaTrim);
          }
        } else {
          setVinDecodedNoTrim(true);
          if (trimRef.current && trimRef.current === lastAutoTrimRef.current) {
            setTrim('');
            setLastAutoTrim('');
          }
        }
      } catch {
        if (!cancelled) setVinDecodedNoTrim(false);
      } finally {
        if (!cancelled) setDecodingTrim(false);
      }
    })();

    return () => { cancelled = true; };
  }, [vin]);

  const handleCopyPublicLink = async () => {
    try {
      await navigator.clipboard.writeText(publicLink);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      setError('Failed to copy link. Please copy it manually.');
    }
  };

  const isAllowed = currentUser.role === 'admin' || currentUser.role === 'manager';

  if (!isAllowed) {
    return (
      <div className="bg-red-900 bg-opacity-30 border border-red-800 rounded-lg px-6 py-8 text-center">
        <p className="text-lg font-semibold text-red-300">Access restricted</p>
        <p className="text-sm text-red-200/80 mt-2">
          Vehicle Risk Analyzer is available to admin and manager roles only.
        </p>
      </div>
    );
  }

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

    const finalTrim = trim.trim();
    if (!finalTrim) {
      setError('Trim is required. Enter the trim if the VIN did not fill it automatically.');
      return;
    }

    setLoading(true);

    try {
      const decoded = await decodeVin(normalizedVin);
      const nhtsaData = { ...decoded, Trim: finalTrim };

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

  const handleScreenshotSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setError('');
    setReport(null);

    if (!ALLOWED_IMAGE_TYPES.includes(file.type as AllowedImageType)) {
      setError('Screenshot must be a PNG, JPG, or WEBP image.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError('Screenshot must be under 10 MB.');
      return;
    }

    setExtracting(true);
    setScreenshotName(file.name);

    try {
      const imageBase64 = await fileToBase64(file);

      const { data, error: fnError } = await supabase.functions.invoke('vehicle-risk-report', {
        body: {
          action: 'extract-from-image',
          imageBase64,
          mediaType: file.type as AllowedImageType,
        },
      });

      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);

      const extractedVin = typeof data?.vin === 'string' ? normalizeVin(data.vin) : '';
      const extractedMileage = typeof data?.mileage === 'number' ? data.mileage : 0;

      if (!extractedVin && !extractedMileage) {
        throw new Error('Could not find a VIN or mileage in this screenshot. Try a clearer image.');
      }

      if (extractedVin) setVin(extractedVin);
      if (extractedMileage > 0) setMileage(String(extractedMileage));

      if (extractedVin && !VIN_PATTERN.test(extractedVin)) {
        setError('A value was found but it does not look like a valid 17-character VIN. Please verify and correct it.');
      }
    } catch (err: unknown) {
      console.error('Screenshot extraction error:', err);
      const message = err instanceof Error ? err.message : 'Failed to extract data from screenshot.';
      setError(message);
      setScreenshotName('');
    } finally {
      setExtracting(false);
    }
  };

  const isBusy = loading || extracting;
  const canAnalyze = !isBusy && !!trim.trim();

  return (
    <div className="space-y-5">
      {/* HEADER */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-gray-100 flex items-center gap-2">
            <Car className="w-6 h-6 text-blue-400" />
            Vehicle Risk Analyzer
          </h2>
          <p className="text-sm text-gray-400 mt-0.5">
            Decode a VIN, assess collateral risk, and generate an underwriting report
          </p>
        </div>
        <button
          type="button"
          onClick={handleCopyPublicLink}
          className={`flex items-center gap-2 px-4 py-2 border rounded-lg text-sm transition shrink-0 ${
            linkCopied
              ? 'bg-green-900/40 border-green-700 text-green-300'
              : 'bg-gray-800 hover:bg-gray-700 border-gray-700 text-gray-300'
          }`}
        >
          {linkCopied ? <Check className="w-4 h-4" /> : <Link className="w-4 h-4" />}
          {linkCopied ? 'Copied!' : 'Copy Public Link'}
        </button>
      </div>

      {/* INPUT FORM */}
      <form
        onSubmit={handleAnalyze}
        className="bg-gray-800 border border-gray-700 rounded-lg p-5 space-y-4"
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label htmlFor="vin" className="block text-sm font-medium text-gray-300 mb-1.5">
              VIN
            </label>
            <input
              id="vin"
              type="text"
              value={vin}
              onChange={(e) => setVin(normalizeVin(e.target.value))}
              placeholder="17-character VIN"
              maxLength={17}
              disabled={isBusy}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
            />
            <p className="text-xs text-gray-500 mt-1">{vin.length}/17 characters</p>
          </div>

          <div>
            <label htmlFor="mileage" className="block text-sm font-medium text-gray-300 mb-1.5">
              Mileage
            </label>
            <input
              id="mileage"
              type="number"
              min={0}
              step={1}
              value={mileage}
              onChange={(e) => setMileage(e.target.value)}
              placeholder="e.g. 85432"
              disabled={isBusy}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
            />
          </div>

          <div>
            <label htmlFor="trim" className="block text-sm font-medium text-gray-300 mb-1.5">
              Trim
            </label>
            <input
              id="trim"
              type="text"
              value={trim}
              onChange={(e) => setTrim(e.target.value)}
              placeholder="e.g. XLT, Lariat, Sport"
              disabled={isBusy}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
            />
            <p className="text-xs text-gray-500 mt-1">
              {decodingTrim
                ? 'Looking up trim from VIN…'
                : vinDecodedNoTrim && !trim.trim()
                  ? 'Required — VIN did not return a trim'
                  : 'Auto-filled from VIN when available; editable'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="submit"
            disabled={!canAnalyze}
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

          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={handleScreenshotSelect}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isBusy}
            className="flex items-center gap-2 px-4 py-2.5 bg-gray-700 hover:bg-gray-600 border border-gray-600 text-gray-200 rounded-lg text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {extracting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Extracting…
              </>
            ) : (
              <>
                <ImageUp className="w-4 h-4" />
                Upload Screenshot
              </>
            )}
          </button>

          {screenshotName && !extracting && (
            <span className="text-xs text-gray-500 truncate max-w-[200px]">
              {screenshotName}
            </span>
          )}
        </div>

        <p className="text-xs text-gray-500">
          Optional: upload a listing screenshot (PNG, JPG, or WEBP) to auto-fill VIN and mileage.
        </p>
      </form>

      {/* LOADING */}
      {loading && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg px-6 py-10 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
          <p className="text-sm text-gray-300">Decoding VIN and generating underwriting report…</p>
          <p className="text-xs text-gray-500">This may take 15–30 seconds</p>
        </div>
      )}

      {/* ERROR */}
      {error && (
        <div className="bg-red-900 bg-opacity-30 border border-red-800 rounded-lg px-4 py-3">
          <p className="text-sm text-red-300">{error}</p>
        </div>
      )}

      {/* REPORT */}
      {report && !loading && (
        <VehicleRiskReport
          report={report}
          vin={analyzedVin}
          mileage={analyzedMileage}
        />
      )}
    </div>
  );
}
