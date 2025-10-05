/**
 * Standard Early-Stage VC Fund Configuration
 * Example showing realistic fund modeling inputs
 */

import { Decimal } from 'decimal.js';
import type { ExtendedFundModelInputs } from '../extended-fund-model';

/**
 * $100M early-stage fund with standard terms
 */
export const standardFund: ExtendedFundModelInputs = {
  // ===== BASE FUND PARAMETERS =====
  id: 'example-fund-2024',
  name: 'Example Ventures Fund I',
  committedCapital: new Decimal('100000000'), // $100M
  fundTermMonths: 120, // 10 years
  vintageYear: 2024,
  investmentPeriodMonths: 60, // 5 years

  // ===== STAGE PROFILE =====
  stageProfile: {
    id: 'early-stage-standard',
    name: 'Early Stage (Seed → Series B)',
    initialPortfolioSize: new Decimal('25'), // 25 companies
    recyclingEnabled: true,

    stages: [
      {
        stage: 'seed',
        roundSize: new Decimal('2000000'), // $2M rounds
        postMoneyValuation: new Decimal('10000000'), // $10M post
        esopPercent: new Decimal('0.15'), // 15% ESOP
        graduationRate: new Decimal('0.60'), // 60% graduate to Series A
        exitRate: new Decimal('0.05'), // 5% exit at seed
        // failureRate: 0.35 (derived: 35% fail)
        monthsToGraduate: 18,
        monthsToExit: 36,
        exitMultiple: new Decimal('2.5'), // 2.5x on seed exits
        dilutionPerRound: new Decimal('0.20') // 20% dilution
      },
      {
        stage: 'series_a',
        roundSize: new Decimal('8000000'), // $8M rounds
        postMoneyValuation: new Decimal('40000000'), // $40M post
        esopPercent: new Decimal('0.10'), // 10% ESOP
        graduationRate: new Decimal('0.50'), // 50% graduate to Series B
        exitRate: new Decimal('0.20'), // 20% exit at Series A
        // failureRate: 0.30 (derived: 30% fail)
        monthsToGraduate: 24,
        monthsToExit: 48,
        exitMultiple: new Decimal('4.0'), // 4x on Series A exits
        dilutionPerRound: new Decimal('0.18')
      },
      {
        stage: 'series_b',
        roundSize: new Decimal('20000000'), // $20M rounds
        postMoneyValuation: new Decimal('120000000'), // $120M post
        esopPercent: new Decimal('0.08'), // 8% ESOP
        graduationRate: new Decimal('0.0'), // Terminal stage in this model
        exitRate: new Decimal('0.75'), // 75% exit at Series B
        // failureRate: 0.25 (derived: 25% fail)
        monthsToGraduate: 36, // Not applicable but required
        monthsToExit: 60,
        exitMultiple: new Decimal('6.0'), // 6x on Series B exits
        dilutionPerRound: new Decimal('0.15')
      }
    ],

    assumptions: {
      dilutionPerRound: new Decimal('0.18'), // Global default
      followOnMultiplier: new Decimal('2.0'), // Reserve 2x initial check
      reserveStrategy: 'pro_rata'
    }
  },

  // ===== FEE PROFILE =====
  feeProfile: {
    id: 'standard-2-1.5',
    name: 'Standard 2% / 1.5% with Step-Down',

    tiers: [
      {
        basis: 'committed_capital',
        annualRatePercent: new Decimal('0.02'), // 2% on committed
        startYear: 1,
        endYear: 5 // Years 1-5
      },
      {
        basis: 'invested_capital',
        annualRatePercent: new Decimal('0.015'), // 1.5% on invested
        startYear: 6
        // Continues until fund end
      }
    ],

    stepDownMonths: [60], // Step down at year 5

    recyclingPolicy: {
      enabled: true,
      recyclingCapPercent: new Decimal('0.10'), // Can recycle up to 10% of fund
      recyclingTermMonths: 60, // During investment period
      basis: 'committed_capital',
      anticipatedRecycling: true // Forecast assuming full recycling
    }
  },

  // ===== CAPITAL CALL POLICY =====
  capitalCallPolicy: {
    id: 'quarterly-calls',
    name: 'Quarterly Capital Calls',
    mode: 'quarterly',

    percentagePerPeriod: new Decimal('0.05'), // 5% per quarter
    startYear: 1,
    endYear: 5, // Call over 5-year investment period

    noticePeriodDays: 30,
    fundingPeriodDays: 60
  },

  // ===== WATERFALL POLICY =====
  waterfallPolicy: {
    id: 'european-8pct',
    name: 'European Waterfall with 8% Hurdle',
    type: 'european',

    preferredReturnRate: new Decimal('0.08'), // 8% hurdle

    tiers: [
      {
        tierType: 'return_of_capital',
        priority: 1
      },
      {
        tierType: 'preferred_return',
        priority: 2,
        rate: new Decimal('0.08'), // 8% pref
        basis: 'contributed'
      },
      {
        tierType: 'gp_catch_up',
        priority: 3,
        catchUpRate: new Decimal('1.0') // 100% to GP until 80/20 achieved
      },
      {
        tierType: 'carry',
        priority: 4,
        rate: new Decimal('0.20') // 20% carry
      }
    ],

    gpCommitment: {
      percentage: new Decimal('0.01'), // 1% GP commit
      basis: 'committed_capital',
      fundedFromFees: false
    },

    clawback: {
      enabled: true,
      lookbackMonths: 36,
      securityRequired: true,
      interestRate: new Decimal('0')
    },

    hurdleRateBasis: 'contributed',
    cumulativeCalculations: true
  },

  // ===== RECYCLING POLICY =====
  recyclingPolicy: {
    id: 'exit-recycling',
    name: 'Standard Exit Proceeds Recycling',
    enabled: true,

    sources: ['exit_proceeds'], // Only recycle exits, not fees

    cap: {
      type: 'percentage',
      value: new Decimal('0.20'), // Max 20% of committed capital
      basis: 'committed_capital'
    },

    term: {
      months: 60, // 5-year investment period
      extensionMonths: 12, // Optional 1-year extension
      automaticExtension: false
    },

    anticipatedRecycling: true,
    reinvestmentTiming: 'quarterly',
    minimumReinvestmentAmount: new Decimal('500000') // $500K minimum
  },

  // ===== MODEL ASSUMPTIONS =====
  assumptions: {
    defaultHoldingPeriod: 60, // 5 years
    reinvestmentPeriod: 36, // 3 years
    portfolioConcentrationLimit: new Decimal('0.15'), // Max 15% in one company
    diversificationRules: {
      maxPerStage: new Decimal('0.40'), // Max 40% per stage
      maxPerSector: new Decimal('0.30') // Max 30% per sector
    },
    liquidateAtTermEnd: false, // Extend to allow exits
    liquidationDiscountPercent: new Decimal('0.30') // 30% haircut on forced liquidation
  },

  // ===== MONTE CARLO (DISABLED FOR DETERMINISTIC MODE) =====
  monteCarloSettings: {
    enabled: false,
    numberOfSimulations: 1000,
    confidenceInterval: new Decimal('0.95')
    // No randomSeed = fully deterministic
  }
};

/**
 * Alternative: $50M micro-VC fund
 */
export const microVCFund: Partial<ExtendedFundModelInputs> = {
  id: 'micro-vc-2024',
  name: 'Micro VC Fund I',
  committedCapital: new Decimal('50000000'), // $50M
  fundTermMonths: 120,
  vintageYear: 2024,

  stageProfile: {
    id: 'pre-seed-seed',
    name: 'Pre-Seed / Seed Focus',
    initialPortfolioSize: new Decimal('40'), // More companies, smaller checks
    recyclingEnabled: false,

    stages: [
      {
        stage: 'pre_seed',
        roundSize: new Decimal('500000'), // $500K rounds
        postMoneyValuation: new Decimal('4000000'), // $4M post
        esopPercent: new Decimal('0.12'),
        graduationRate: new Decimal('0.50'),
        exitRate: new Decimal('0.02'),
        monthsToGraduate: 12,
        monthsToExit: 24,
        exitMultiple: new Decimal('1.5'),
        dilutionPerRound: new Decimal('0.22')
      },
      {
        stage: 'seed',
        roundSize: new Decimal('1500000'), // $1.5M rounds
        postMoneyValuation: new Decimal('8000000'), // $8M post
        esopPercent: new Decimal('0.15'),
        graduationRate: new Decimal('0.60'),
        exitRate: new Decimal('0.10'),
        monthsToGraduate: 18,
        monthsToExit: 36,
        exitMultiple: new Decimal('3.0'),
        dilutionPerRound: new Decimal('0.20')
      }
      // Typically wouldn't lead Series A rounds
    ]
  }
};

/**
 * Alternative: Growth-stage fund
 */
export const growthFund: Partial<ExtendedFundModelInputs> = {
  id: 'growth-fund-2024',
  name: 'Growth Equity Fund I',
  committedCapital: new Decimal('250000000'), // $250M
  fundTermMonths: 120,

  stageProfile: {
    id: 'growth-stage',
    name: 'Series B / C / Growth',
    initialPortfolioSize: new Decimal('15'), // Larger checks, fewer companies
    recyclingEnabled: false,

    stages: [
      {
        stage: 'series_b',
        roundSize: new Decimal('15000000'),
        postMoneyValuation: new Decimal('100000000'),
        esopPercent: new Decimal('0.08'),
        graduationRate: new Decimal('0.60'),
        exitRate: new Decimal('0.15'),
        monthsToGraduate: 24,
        monthsToExit: 48,
        exitMultiple: new Decimal('4.0'),
        dilutionPerRound: new Decimal('0.15')
      },
      {
        stage: 'series_c',
        roundSize: new Decimal('40000000'),
        postMoneyValuation: new Decimal('300000000'),
        esopPercent: new Decimal('0.05'),
        graduationRate: new Decimal('0.50'),
        exitRate: new Decimal('0.30'),
        monthsToGraduate: 24,
        monthsToExit: 36,
        exitMultiple: new Decimal('5.0'),
        dilutionPerRound: new Decimal('0.12')
      },
      {
        stage: 'growth',
        roundSize: new Decimal('75000000'),
        postMoneyValuation: new Decimal('750000000'),
        esopPercent: new Decimal('0.03'),
        graduationRate: new Decimal('0.0'),
        exitRate: new Decimal('0.80'),
        monthsToGraduate: 36,
        monthsToExit: 24,
        exitMultiple: new Decimal('3.5'),
        dilutionPerRound: new Decimal('0.10')
      }
    ]
  }
};
