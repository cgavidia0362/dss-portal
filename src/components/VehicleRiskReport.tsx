import type { ReactNode } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Cog,
  Gauge,
  Layers,
  ShieldAlert,
  ShieldCheck,
  Wrench,
  Zap,
} from 'lucide-react';
import type { LendingDecision, VehicleRiskReportData } from '../types/vehicleRisk';

interface VehicleRiskReportProps {
  report: VehicleRiskReportData;
  vin: string;
  mileage: number;
}

type RiskTier = 'green' | 'yellow' | 'red';

const LIFESPAN_MILES = 200_000;

function extractCostEstimates(text: string): string[] {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => /\$[\d,]+/.test(s));

  if (sentences.length > 0) return sentences;

  const amounts = text.match(/\$[\d,]+(?:\s*[-–]\s*\$?[\d,]+)?/g);
  return amounts ? [...new Set(amounts)] : [];
}

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

function tierBadgeClass(tier: RiskTier): string {
  if (tier === 'green') return 'bg-green-900 text-green-300 border-green-700';
  if (tier === 'yellow') return 'bg-amber-900 text-amber-300 border-amber-700';
  return 'bg-red-900 text-red-300 border-red-700';
}

function tierCalloutClass(tier: RiskTier): string {
  if (tier === 'green') return 'bg-green-900/30 border-green-700';
  if (tier === 'yellow') return 'bg-amber-900/30 border-amber-700';
  return 'bg-red-900/30 border-red-700';
}

function lendingDecisionStyle(decision: LendingDecision): string {
  switch (decision) {
    case 'Strong collateral':
      return 'bg-green-900/50 text-green-300 border-green-700';
    case 'Acceptable collateral':
      return 'bg-blue-900/50 text-blue-300 border-blue-700';
    case 'Higher-risk collateral':
      return 'bg-amber-900/50 text-amber-300 border-amber-700';
    case 'Exercise caution':
      return 'bg-red-900/50 text-red-300 border-red-700';
  }
}

function firstSentence(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^(.+?[.!?])(?:\s|$)/);
  if (match) return match[1];
  return trimmed.length > 120 ? `${trimmed.slice(0, 117)}…` : trimmed;
}

function inferConsSeverity(text: string): 'red' | 'yellow' {
  const lower = text.toLowerCase();
  const yellowSignals = [
    'moderate',
    'monitor',
    'watch',
    'consider',
    'potential',
    'may',
    'could',
    'wear',
    'aging',
    'higher than average',
    'slightly',
  ];
  if (yellowSignals.some((signal) => lower.includes(signal))) return 'yellow';
  return 'red';
}

function inferMechanicalBadge(text: string, defaultTier: RiskTier): { label: string; tier: RiskTier } {
  const lower = text.toLowerCase();

  const redSignals = [
    'fail',
    'failure',
    'recall',
    'critical',
    'severe',
    'expensive repair',
    'known issue',
    'problem',
    'unreliable',
    'high risk',
    'caution',
    'avoid',
  ];
  const greenSignals = [
    'reliable',
    'solid',
    'low risk',
    'good condition',
    'well-maintained',
    'durable',
    'proven',
    'strong',
    'minimal',
  ];

  if (redSignals.some((signal) => lower.includes(signal))) {
    return { label: 'Elevated Risk', tier: 'red' };
  }
  if (greenSignals.some((signal) => lower.includes(signal))) {
    return { label: 'Low Risk', tier: 'green' };
  }

  if (defaultTier === 'green') return { label: 'Acceptable', tier: 'green' };
  if (defaultTier === 'yellow') return { label: 'Monitor', tier: 'yellow' };
  return { label: 'Review', tier: 'red' };
}

function formatMiles(value: number): string {
  return value.toLocaleString('en-US');
}

function getMileageMetrics(mileage: number, vehicleYear: string) {
  const year = parseInt(vehicleYear, 10);
  const currentYear = new Date().getFullYear();
  const age = Number.isFinite(year) ? Math.max(0, currentYear - year) : 0;
  const ageBasedExpected = age * 12_000;
  const referenceLifespan = Math.max(LIFESPAN_MILES, ageBasedExpected + 40_000);
  const percentUsed = Math.min(100, Math.round((mileage / referenceLifespan) * 100));
  const remaining = Math.max(0, referenceLifespan - mileage);

  let tier: RiskTier = 'green';
  if (percentUsed >= 75) tier = 'red';
  else if (percentUsed >= 50) tier = 'yellow';

  return { percentUsed, remaining, tier };
}

function ScoreMeter({ score }: { score: number }) {
  const tier = getRiskTier(score);

  return (
    <div className="flex-1 min-w-0">
      <div className="flex justify-between text-xs text-gray-500 mb-2">
        <span>1 — Too risky</span>
        <span>5 — No risk</span>
      </div>
      <div className="flex gap-1.5">
        {[1, 2, 3, 4, 5].map((segment) => {
          const filled = segment <= score;
          return (
            <div
              key={segment}
              className={`h-2.5 flex-1 rounded-sm transition-colors ${
                filled ? tierBgClass(tier) : 'bg-gray-700'
              }`}
            />
          );
        })}
      </div>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-sm font-medium text-gray-100">{value || 'N/A'}</p>
    </div>
  );
}

interface MechanicalRowProps {
  icon: ReactNode;
  category: string;
  name: string;
  note: string;
  badge: { label: string; tier: RiskTier };
  costEstimates?: string[];
  children?: ReactNode;
}

function MechanicalRow({ icon, category, name, note, badge, costEstimates, children }: MechanicalRowProps) {
  const showCosts = badge.tier !== 'green' && costEstimates && costEstimates.length > 0;
  const costClass = badge.tier === 'red' ? 'text-red-400' : 'text-amber-400';

  return (
    <div className="py-4 first:pt-0 last:pb-0">
      <div className="flex items-start gap-4">
        <div className={`mt-0.5 shrink-0 ${tierTextClass(badge.tier)}`}>{icon}</div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-500 uppercase tracking-wide">{category}</p>
          <p className="text-sm font-semibold text-gray-100 mt-0.5">{name}</p>
          <p className="text-sm text-gray-400 mt-1 leading-relaxed">{note}</p>
          {showCosts && (
            <div className="mt-2 space-y-1">
              {costEstimates.map((cost, idx) => (
                <p key={idx} className={`text-xs leading-relaxed ${costClass}`}>
                  {cost}
                </p>
              ))}
            </div>
          )}
          {children}
        </div>
        <span
          className={`shrink-0 text-xs font-medium px-2.5 py-1 rounded-full border ${tierBadgeClass(badge.tier)}`}
        >
          {badge.label}
        </span>
      </div>
    </div>
  );
}

export default function VehicleRiskReport({ report, mileage }: VehicleRiskReportProps) {
  const { vehicleInfo, mechanicalOverview, riskScore } = report;
  const tier = getRiskTier(riskScore);
  const mileageMetrics = getMileageMetrics(mileage, vehicleInfo.year);

  const vehicleCards = [
    { label: 'Year', value: vehicleInfo.year },
    { label: 'Make', value: vehicleInfo.make },
    { label: 'Model', value: vehicleInfo.model },
    { label: 'Trim', value: vehicleInfo.trim },
    { label: 'Engine', value: vehicleInfo.engine },
    { label: 'Drivetrain', value: vehicleInfo.drivetrain },
    { label: 'Body Style', value: vehicleInfo.bodyStyle },
    { label: 'Fuel Economy', value: vehicleInfo.fuelEconomy },
  ];

  const mechanicalRows = [
    {
      key: 'engine',
      category: 'Engine',
      name: vehicleInfo.engine || 'Powertrain',
      text: mechanicalOverview.engine,
      icon: <Cog className="w-5 h-5" />,
    },
    {
      key: 'transmission',
      category: 'Transmission',
      name: vehicleInfo.drivetrain ? `${vehicleInfo.drivetrain} Setup` : 'Transmission System',
      text: mechanicalOverview.transmission,
      icon: <Zap className="w-5 h-5" />,
    },
    {
      key: 'mileage',
      category: 'Mileage Assessment',
      name: `${formatMiles(mileage)} miles`,
      text: mechanicalOverview.mileageAssessment,
      icon: <Gauge className="w-5 h-5" />,
    },
    {
      key: 'maintenance',
      category: 'Maintenance Expense',
      name: 'Cost Outlook',
      text: mechanicalOverview.maintenanceExpense,
      icon: <Wrench className="w-5 h-5" />,
    },
    {
      key: 'other',
      category: 'Other Mechanical',
      name: 'Additional Considerations',
      text: mechanicalOverview.otherMechanical,
      icon: <AlertTriangle className="w-5 h-5" />,
    },
  ];

  const BottomLineIcon =
    tier === 'green' ? ShieldCheck : tier === 'yellow' ? ShieldAlert : AlertTriangle;

  return (
    <div className="space-y-5">
      {/* 1. SCORE BAR */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-5">
        <div className="flex flex-col md:flex-row items-center gap-6 md:gap-8">
          <div
            className={`w-24 h-24 shrink-0 rounded-full border-4 flex flex-col items-center justify-center ${
              tier === 'green'
                ? 'border-green-500 bg-green-900/30'
                : tier === 'yellow'
                  ? 'border-amber-500 bg-amber-900/30'
                  : 'border-red-500 bg-red-900/30'
            }`}
          >
            <span className={`text-3xl font-bold leading-none ${tierTextClass(tier)}`}>
              {riskScore}
            </span>
            <span className="text-xs text-gray-400 mt-0.5">/5</span>
          </div>

          <div className="flex-1 w-full min-w-0">
            <ScoreMeter score={riskScore} />
          </div>

          <span
            className={`shrink-0 text-xs font-semibold px-4 py-2 rounded-full border whitespace-nowrap ${lendingDecisionStyle(report.lendingDecision)}`}
          >
            {report.lendingDecision}
          </span>
        </div>
      </div>

      {/* 2. VEHICLE INFO GRID */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {vehicleCards.map((card) => (
          <InfoCard key={card.label} label={card.label} value={card.value} />
        ))}
      </div>

      {/* 3. BOTTOM LINE */}
      <div className={`rounded-lg border p-5 ${tierCalloutClass(tier)}`}>
        <div className="flex items-start gap-3">
          <BottomLineIcon className={`w-5 h-5 mt-0.5 shrink-0 ${tierTextClass(tier)}`} />
          <p className="text-sm font-bold text-gray-100 leading-relaxed">
            {report.bottomLineVerdict}
          </p>
        </div>
      </div>

      {/* 4. WOULD I BUY */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-5">
        <h3 className="text-sm font-semibold text-gray-200 mb-3">
          Would I Buy This Car?
        </h3>
        <p className="text-sm text-gray-300 leading-relaxed">
          {report.underwriterOpinion}
        </p>
      </div>

      {/* 5. STRENGTHS + RISK FACTORS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-5">
          <h3 className="text-sm font-semibold text-gray-200 mb-4 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-400" />
            Strengths
          </h3>
          <ul className="space-y-3">
            {report.pros.map((pro, idx) => (
              <li key={idx} className="flex items-start gap-2.5">
                <span className="w-2 h-2 rounded-full bg-green-400 mt-1.5 shrink-0" />
                <span className="text-sm text-gray-300 leading-relaxed">{pro}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-gray-800 border border-gray-700 rounded-lg p-5">
          <h3 className="text-sm font-semibold text-gray-200 mb-4 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400" />
            Risk Factors
          </h3>
          <ul className="space-y-3">
            {report.cons.map((con, idx) => {
              const severity = inferConsSeverity(con);
              return (
                <li key={idx} className="flex items-start gap-2.5">
                  <span
                    className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                      severity === 'red' ? 'bg-red-400' : 'bg-amber-400'
                    }`}
                  />
                  <span className="text-sm text-gray-300 leading-relaxed">{con}</span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {/* 6. MECHANICAL OVERVIEW */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-5">
        <h3 className="text-sm font-semibold text-gray-200 mb-1 flex items-center gap-2">
          <Layers className="w-4 h-4 text-blue-400" />
          Mechanical Overview
        </h3>
        <p className="text-xs text-gray-500 mb-2">
          {formatMiles(mileage)} miles · {vehicleInfo.year} {vehicleInfo.make} {vehicleInfo.model}
        </p>

        <div className="divide-y divide-gray-700">
          {mechanicalRows.map((row) => {
            const badge = inferMechanicalBadge(
              row.text,
              row.key === 'mileage' ? mileageMetrics.tier : tier,
            );
            const note = firstSentence(row.text);
            const costEstimates = extractCostEstimates(row.text);

            if (row.key === 'mileage') {
              return (
                <MechanicalRow
                  key={row.key}
                  icon={row.icon}
                  category={row.category}
                  name={row.name}
                  note={note}
                  badge={badge}
                  costEstimates={costEstimates}
                >
                  <div className="mt-3 space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-500">Estimated lifespan used</span>
                      <span className={`font-medium ${tierTextClass(mileageMetrics.tier)}`}>
                        {mileageMetrics.percentUsed}%
                      </span>
                    </div>
                    <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${tierBgClass(mileageMetrics.tier)}`}
                        style={{ width: `${mileageMetrics.percentUsed}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-500">
                      ~{formatMiles(mileageMetrics.remaining)} miles remaining
                    </p>
                  </div>
                </MechanicalRow>
              );
            }

            return (
              <MechanicalRow
                key={row.key}
                icon={row.icon}
                category={row.category}
                name={row.name}
                note={note}
                badge={badge}
                costEstimates={costEstimates}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
