/**
 * US VC Benchmark Defaults - Q2 2025
 * Sources: PitchBook, Crunchbase, Carta
 *
 * These defaults represent median market conditions and should be
 * used as starting points. Users can (and should) adjust based on
 * their specific fund strategy and market thesis.
 */

import type { InvestmentRound } from '@/types/investment-rounds';

/**
 * Benchmark rounds with realistic Q2 2025 market data
 *
 * Key insights from benchmarks:
 * - Graduation rates have DECLINED significantly since 2020-2021
 * - Down rounds peaked ~24% in 2023, ~18% in Q2'25
 * - >70% of 2024 exits were at Series A or earlier
 * - Nearly 90% of exits ≤ Series B
 * - Only ~3.6% of exits ≥$500M, but account for ~79% of value
 */
export const BENCHMARK_ROUNDS: InvestmentRound[] = [
  {
    id: 'pre-seed',
    name: 'Pre-Seed',

    // Valuation & Structure
    roundSize: 0.7,              // Crunchbase median (conservative vs PitchBook $0.9M)
    valuationType: 'Pre-Money',
    valuation: 1.1,              // Crunchbase (vs PitchBook $7.1M - more conservative)
    preMoney: 1.1,
    postMoney: 1.8,              // Computed: 1.1 + 0.7
    esopPct: 9,                  // Typical early stage pool

    // Progression Rates
    graduationRate: 50,          // ~50% → Seed (softening in '23-'24)
    exitRate: 5,                 // Rare; mostly <$10M acquihires
    failureRate: 45,             // Auto: 100 - 50 - 5

    // Timing
    monthsToGraduate: 15,        // Midpoint of 12-18 months
    monthsToExit: 18,            // Midpoint of 12-24 months

    // Exit Modeling
    exitValuation: 8,            // Mostly <$10M acquihires

    // Metadata
    benchmarkSource: 'Crunchbase Q2 2025',
    notes: 'Few direct exits; survival to Seed is milestone',
    isCustom: false
  },

  {
    id: 'seed',
    name: 'Seed',

    // Valuation & Structure
    roundSize: 3.6,              // PitchBook (vs Carta $5.5M)
    valuationType: 'Pre-Money',
    valuation: 15.5,             // PitchBook
    preMoney: 15.5,
    postMoney: 19.1,             // Computed: 15.5 + 3.6
    esopPct: 11,                 // Typical Seed pool expansion

    // Progression Rates
    graduationRate: 18,          // Reality check: mid-teens in 2023 (was 40%+ in 2020!)
    exitRate: 10,                // Many exits at Seed/A stage
    failureRate: 72,             // Harsh reality: most fail

    // Timing
    monthsToGraduate: 24,        // Time to Series A
    monthsToExit: 21,            // Midpoint 18-24 months

    // Exit Modeling
    exitValuation: 35,           // $30-40M range for small M&A

    // Metadata
    benchmarkSource: 'PitchBook Q2 2025',
    notes: 'Down rounds peaked ~24% in 2023, ~18% in Q2\'25',
    isCustom: false
  },

  {
    id: 'series-a',
    name: 'Series A',

    // Valuation & Structure
    roundSize: 13.7,             // PitchBook
    valuationType: 'Pre-Money',
    valuation: 45.5,             // PitchBook
    preMoney: 45.5,
    postMoney: 59.2,             // Computed: 45.5 + 13.7
    esopPct: 13.5,               // Standard A-stage pool

    // Progression Rates
    graduationRate: 20,          // Recent cohorts 15-20% (was 30-40% historically)
    exitRate: 15,                // >70% of 2024 exits ≤ A stage
    failureRate: 65,             // Still high attrition

    // Timing
    monthsToGraduate: 30,        // Time to Series B (2.5 years)
    monthsToExit: 27,            // Midpoint 24-30 months

    // Exit Modeling
    exitValuation: 95,           // $90-100M typical M&A

    // Metadata
    benchmarkSource: 'PitchBook Q2 2025',
    notes: '>70% of 2024 exits ≤ A stage; IPOs often below peak',
    isCustom: false
  },

  {
    id: 'series-b',
    name: 'Series B',

    // Valuation & Structure
    roundSize: 30.0,             // PitchBook
    valuationType: 'Pre-Money',
    valuation: 119.0,            // PitchBook
    preMoney: 119.0,
    postMoney: 149.0,            // Computed: 119.0 + 30.0
    esopPct: 15,                 // Typical B-stage pool

    // Progression Rates
    graduationRate: 30,          // 25-35% recent (was 40-50% historically)
    exitRate: 25,                // Nearly 90% of exits ≤ B
    failureRate: 45,             // Improving but still significant

    // Timing
    monthsToGraduate: 29,        // Time to Series C
    monthsToExit: 33,            // Midpoint 30-36 months

    // Exit Modeling
    exitValuation: 250,          // $250M M&A or growth equity

    // Metadata
    benchmarkSource: 'PitchBook Q2 2025',
    notes: 'Nearly 90% of exits ≤ B',
    isCustom: false
  },

  {
    id: 'series-c',
    name: 'Series C',

    // Valuation & Structure
    roundSize: 61.2,             // PitchBook
    valuationType: 'Pre-Money',
    valuation: 327.5,            // PitchBook
    preMoney: 327.5,
    postMoney: 388.7,            // Computed: 327.5 + 61.2
    esopPct: 17,                 // Expanded for IPO prep

    // Progression Rates
    graduationRate: 20,          // 15-25% now (was 50-60% historically)
    exitRate: 30,                // Fewer but larger outcomes
    failureRate: 50,             // Half still don't make it

    // Timing
    monthsToGraduate: 27,        // Midpoint 24-30 to Series D+
    monthsToExit: 30,            // Midpoint 24-36 months

    // Exit Modeling
    exitValuation: 550,          // $500-600M range

    // Metadata
    benchmarkSource: 'PitchBook Q2 2025',
    notes: 'Fewer but larger outcomes; IPO prep lengthens timing',
    isCustom: false
  },

  {
    id: 'series-d-plus',
    name: 'Series D+',

    // Valuation & Structure
    roundSize: 100.0,            // PitchBook
    valuationType: 'Pre-Money',
    valuation: 900.0,            // PitchBook
    preMoney: 900.0,
    postMoney: 1000.0,           // Computed: 900.0 + 100.0
    esopPct: 20,                 // Large late-stage pool

    // Progression Rates
    graduationRate: 0,           // Terminal stage (no "next" round)
    exitRate: 80,                // ~3.6% of exits ≥$500M but 79% of value
    failureRate: 20,             // Still some failures even this late

    // Timing
    monthsToGraduate: 0,         // N/A - terminal stage
    monthsToExit: 24,            // Midpoint 18-30 months to IPO/M&A

    // Exit Modeling
    exitValuation: 1350,         // $1.2-1.5B range

    // Metadata
    benchmarkSource: 'PitchBook Q2 2025',
    notes: '~3.6% of exits ≥$500M, but account for ~79% of value; 21 IPOs >$1B in 2024',
    isCustom: false
  }
];

/**
 * Get default rounds for new fund creation
 */
export function getDefaultRounds(): InvestmentRound[] {
  return JSON.parse(JSON.stringify(BENCHMARK_ROUNDS));
}

/**
 * Get a single round by stage name
 */
export function getRoundByStage(stageName: string): InvestmentRound | undefined {
  return BENCHMARK_ROUNDS.find(r => r.name === stageName);
}

/**
 * Create a custom round template
 */
export function createCustomRound(name: string): InvestmentRound {
  return {
    id: `custom-${Date.now()}`,
    name: name as any,
    roundSize: 0,
    valuationType: 'Pre-Money',
    valuation: 0,
    preMoney: 0,
    postMoney: 0,
    esopPct: 10,
    graduationRate: 0,
    exitRate: 0,
    failureRate: 100,
    monthsToGraduate: 18,
    monthsToExit: 24,
    exitValuation: 0,
    benchmarkSource: 'Custom',
    isCustom: true
  };
}
