import { AlertTriangle, CheckCircle2, ShieldAlert, ShieldCheck } from 'lucide-react';
import type { VehicleRiskReportData } from '../types/vehicleRisk';

interface VehicleRiskReportProps {
  report: VehicleRiskReportData;
  vin: string;
  mileage: number;
}

type RiskTier = 'green' | 'yellow' | 'red';

function getRiskTier(score: number): RiskTier {
  if (score >= 4) return 'green';
  if (score === 3) return 'yellow';
  return 'red';
}

function tierTextClass(tier: RiskTier): string {
  if (tier === 'green') return 'text-green-400';
  if (tier === 'yellow') return 'text-amber-400';
  return 'text-red-400';
}

function tierBgClass(tier: RiskTier): string {
  if (tier === 'green') return 'bg-green-500';
  if (tier === 'yellow') return 'bg-amber-500';
  return 'bg-red-500';
}

function tierRingClass(tier: RiskTier): string {
  if (tier === 'green') return 'border-green-500 bg-green-900/25';
  if (tier === 'yellow') return 'border-amber-500 bg-amber-900/25';
  return 'border-red-500 bg-red-900/25';
}

function tierBadgeClass(tier: RiskTier): string {
  if (tier === 'green') return 'bg-green-900/50 text-green-300 border-green-700';
  if (tier === 'yellow') return 'bg-amber-900/50 text-amber-300 border-amber-700';
  return 'bg-red-900/50 text-red-300 border-red-700';
}

function formatMiles(value: number): string {
  return value.toLocaleString('en-US');
}

function ScoreMeter({ score }: { score: number }) {
  const tier = getRiskTier(score);

  return (
    <div className="w-full">
      <div className="flex justify-between text-xs text-gray-500 mb-2">
        <span>1 — Too risky</span>
        <span>5 — Best</span>
      </div>
      <div className="flex gap-1.5">
        {[1, 2, 3, 4, 5].map((segment) => (
          <div
            key={segment}
            className={`h-2.5 flex-1 rounded-sm transition-colors ${
              segment <= score ? tierBgClass(tier) : 'bg-gray-700'
            }`}
          />
        ))}
      </div>
    </div>
  );
}

export default function VehicleRiskReport({ report, vin, mileage }: VehicleRiskReportProps) {
  const { vehicleInfo, riskScore, scoreLabel, scoreSummary, strengths, weaknesses } = report;
  const tier = getRiskTier(riskScore);
  const SummaryIcon = tier === 'green' ? ShieldCheck : tier === 'yellow' ? ShieldAlert : AlertTriangle;

  const identity = [
    vehicleInfo.year,
    vehicleInfo.make,
    vehicleInfo.model,
    vehicleInfo.trim && vehicleInfo.trim !== 'N/A' ? vehicleInfo.trim : null,
  ].filter(Boolean).join(' ');

  return (
    <div className="space-y-5">
      {/* 1. SCORE */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <div
            className={`w-28 h-28 shrink-0 rounded-full border-4 flex flex-col items-center justify-center ${tierRingClass(tier)}`}
          >
            <span className={`text-4xl font-bold leading-none ${tierTextClass(tier)}`}>
              {riskScore}
            </span>
            <span className="text-xs text-gray-400 mt-1">out of 5</span>
          </div>

          <div className="flex-1 w-full min-w-0 space-y-3 text-center sm:text-left">
            <div>
              <span className={`inline-flex text-sm font-semibold px-3 py-1 rounded-full border ${tierBadgeClass(tier)}`}>
                {scoreLabel || '—'}
              </span>
            </div>
            <ScoreMeter score={riskScore} />
            <p className="text-sm text-gray-300">
              <span className="font-medium text-gray-100">{identity}</span>
              {vehicleInfo.engine && vehicleInfo.engine !== 'N/A' && (
                <span className="text-gray-500"> · {vehicleInfo.engine}</span>
              )}
            </p>
            <p className="text-xs text-gray-500">
              {formatMiles(mileage)} miles
              {vin ? ` · VIN ${vin}` : ''}
            </p>
          </div>
        </div>
      </div>

      {/* 2. WHY / HOW TO BUY */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
        <div className="flex items-start gap-3 mb-3">
          <SummaryIcon className={`w-5 h-5 mt-0.5 shrink-0 ${tierTextClass(tier)}`} />
          <h3 className="text-sm font-semibold text-gray-100">
            Why this score — and how to buy
          </h3>
        </div>
        <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-line">
          {scoreSummary}
        </p>
      </div>

      {/* 3. STRENGTHS VS RISK FACTORS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-gray-100 mb-4 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-400" />
            Strengths
          </h3>
          <ul className="space-y-3">
            {strengths.map((item, idx) => (
              <li key={idx} className="flex items-start gap-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 mt-2 shrink-0" />
                <span className="text-sm text-gray-300 leading-relaxed">{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-gray-100 mb-4 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400" />
            Risk factors
          </h3>
          <ul className="space-y-3">
            {weaknesses.map((item, idx) => (
              <li key={idx} className="flex items-start gap-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 mt-2 shrink-0" />
                <span className="text-sm text-gray-300 leading-relaxed">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
