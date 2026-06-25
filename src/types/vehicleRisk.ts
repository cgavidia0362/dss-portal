export const LENDING_DECISIONS = [
  'Strong collateral',
  'Acceptable collateral',
  'Higher-risk collateral',
  'Exercise caution',
] as const;

export type LendingDecision = (typeof LENDING_DECISIONS)[number];

export interface VehicleInfo {
  year: string;
  make: string;
  model: string;
  trim: string;
  engine: string;
  drivetrain: string;
  bodyStyle: string;
  fuelEconomy: string;
}

export interface MechanicalOverview {
  engine: string;
  transmission: string;
  mileageAssessment: string;
  maintenanceExpense: string;
  otherMechanical: string;
}

export interface VehicleRiskReportData {
  riskScore: number;
  lendingDecision: LendingDecision;
  vehicleInfo: VehicleInfo;
  bottomLineVerdict: string;
  vehicleSummary: string;
  underwriterOpinion: string;
  pros: string[];
  cons: string[];
  mechanicalOverview: MechanicalOverview;
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
