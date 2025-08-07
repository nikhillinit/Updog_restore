export const DEFAULT_CONSTANTS = {
  // Fund Configuration
  FUND_SIZE: 10000000, // $10M default
  MANAGEMENT_FEE: 0.02, // 2%
  CARRY_RATE: 0.20, // 20%
  DEPLOYMENT_PERIOD_YEARS: 3,
  FUND_LIFE_YEARS: 10,
  
  // Portfolio Settings
  INITIAL_CHECK_SIZE: 250000,
  FOLLOW_ON_RESERVE_RATIO: 1.5,
  MAX_OWNERSHIP_TARGET: 0.20,
  
  // Graduation Matrix Defaults
  GRADUATION_PROBABILITIES: {
    SEED_TO_A: 0.35,
    A_TO_B: 0.45,
    B_TO_C: 0.40,
    C_TO_D: 0.35,
    D_TO_EXIT: 0.25
  },
  
  // Financial Modeling
  DEFAULT_VALUATION_STEP_UP: 2.5,
  DEFAULT_DILUTION_PER_ROUND: 0.20,
  DEFAULT_EXIT_MULTIPLE: 5.0,
  
  // Cohort Settings
  DEFAULT_COHORT_SIZE: 20,
  DEFAULT_COHORTS_PER_YEAR: 4,
  
  // UI Settings
  CHART_COLORS: {
    primary: '#3B82F6',
    secondary: '#10B981',
    tertiary: '#F59E0B',
    danger: '#EF4444'
  }
};

export const STAGE_NAMES = [
  'Pre-Seed',
  'Seed',
  'Series A',
  'Series B',
  'Series C',
  'Series D',
  'Exit'
] as const;

export const DEFAULT_TIMING = {
  monthsBetweenRounds: 18,
  monthsToFirstDeploy: 3,
  monthsToFullDeploy: 36
};
