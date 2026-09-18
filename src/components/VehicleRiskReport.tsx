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
  if (tier === 'green') return 'text-dss-success';
  if (tier === 'yellow') return 'text-amber-400';
  return 'text-dss-danger';
}

function tierBgClass(tier: RiskTier): string {
  if (tier === 'green') return 'bg-green-500';
  if (tier === 'yellow') return 'bg-amber-500';
  return 'bg-red-500';
}

function tierRingClass(tier: RiskTier): string {
  if (tier === 'green') return 'border-green-500 bg-emerald-50/25';
  if (tier === 'yellow') return 'border-amber-500 bg-amber-900/25';
  return 'border-red-500 bg-rose-50/25';
}

function tierBadgeClass(tier: RiskTier): string {
  if (tier === 'green') return 'bg-emerald-50/50 text-dss-success border-emerald-200';
  if (tier === 'yellow') return 'bg-amber-900/50 text-amber-800 border-amber-700';
  return 'bg-rose-50/50 text-dss-danger border-rose-200';
}

function formatMiles(value: number): string {
  return value.toLocaleString('en-US');
}

function ScoreMeter({ score }: { score: number }) {
  const tier = getRiskTier(score);

  return (
    <div className="w-full">
      <div className="flex justify-between text-xs text-dss-muted mb-2">
        <span>1 — Too risky</span>
        <span>5 — Best</span>
      </div>
      <div className="flex gap-1.5">
        {[1, 2, 3, 4, 5].map((segment) => (
          <div
            key={segment}
            className={`h-2.5 flex-1 rounded-sm transition-colors ${
              segment <= score ? tierBgClass(tier) : 'bg-dss-canvas'
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
      <div className="bg-dss-surface border border-dss-border rounded-dss p-6">
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <div
            className={`w-28 h-28 shrink-0 rounded-full border-4 flex flex-col items-center justify-center ${tierRingClass(tier)}`}
          >
            <span className={`text-4xl font-bold leading-none ${tierTextClass(tier)}`}>
              {riskScore}
            </span>
            <span className="text-xs text-dss-muted mt-1">out of 5</span>
          </div>

          <div className="flex-1 w-full min-w-0 space-y-3 text-center sm:text-left">
            <div>
              <span className={`inline-flex text-sm font-semibold px-3 py-1 rounded-full border ${tierBadgeClass(tier)}`}>
                {scoreLabel || '—'}
              </span>
            </div>
            <ScoreMeter score={riskScore} />
            <p className="text-sm text-dss-ink/80">
              <span className="font-medium text-dss-ink">{identity}</span>
              {vehicleInfo.engine && vehicleInfo.engine !== 'N/A' && (
                <span className="text-dss-muted"> · {vehicleInfo.engine}</span>
              )}
            </p>
            <p className="text-xs text-dss-muted">
              {formatMiles(mileage)} miles
              {vin ? ` · VIN ${vin}` : ''}
            </p>
          </div>
        </div>
      </div>

      {/* 2. WHY / HOW TO BUY */}
      <div className="bg-dss-surface border border-dss-border rounded-dss p-6">
        <div className="flex items-start gap-3 mb-3">
          <SummaryIcon className={`w-5 h-5 mt-0.5 shrink-0 ${tierTextClass(tier)}`} />
          <h3 className="text-sm font-semibold text-dss-ink">
            Why this score — and how to buy
          </h3>
        </div>
        <p className="text-sm text-dss-ink/80 leading-relaxed whitespace-pre-line">
          {scoreSummary}
        </p>
      </div>

      {/* 3. STRENGTHS VS RISK FACTORS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-dss-surface border border-dss-border rounded-dss p-6">
          <h3 className="text-sm font-semibold text-dss-ink mb-4 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-dss-success" />
            Strengths
          </h3>
          <ul className="space-y-3">
            {strengths.map((item, idx) => (
              <li key={idx} className="flex items-start gap-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 mt-2 shrink-0" />
                <span className="text-sm text-dss-ink/80 leading-relaxed">{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-dss-surface border border-dss-border rounded-dss p-6">
          <h3 className="text-sm font-semibold text-dss-ink mb-4 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-dss-danger" />
            Risk factors
          </h3>
          <ul className="space-y-3">
            {weaknesses.map((item, idx) => (
              <li key={idx} className="flex items-start gap-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 mt-2 shrink-0" />
                <span className="text-sm text-dss-ink/80 leading-relaxed">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
