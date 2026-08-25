export const SCORE_LABELS = [
  'Poor',
  'Fair',
  'Acceptable',
  'Strong',
  'Excellent',
] as const;

export type ScoreLabel = (typeof SCORE_LABELS)[number];

export interface VehicleInfo {
  year: string;
  make: string;
  model: string;
  trim: string;
  engine: string;
}

export interface VehicleRiskReportData {
  riskScore: number;
  scoreLabel: ScoreLabel | string;
  vehicleInfo: VehicleInfo;
  scoreSummary: string;
  strengths: string[];
  weaknesses: string[];
}

export const NHTSA_EXTRACT_FIELDS = [
  'ModelYear',
  'Make',
  'Model',
  'Trim',
  'DisplacementL',
  'EngineCylinders',
  'DriveType',
  'BodyClass',
  'FuelTypePrimary',
] as const;
