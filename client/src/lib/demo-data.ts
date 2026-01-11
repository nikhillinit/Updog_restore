// Demo data utilities for rapid prototyping and presentations
// Provides pre-configured fund scenarios for different use cases

import type { FundModelWire } from '@shared/fund-wire-schema';
import type { CapitalFirstInputsV2 } from './capital-first';

export interface DemoScenario {
  id: string;
  name: string;
  description: string;
  category: 'early_stage' | 'growth' | 'climate' | 'evergreen' | 'comparison';
  fundData: Partial<FundModelWire>;
  highlights: string[];
  kpis?: {
    expectedTVPI: number;
    expectedIRR: number;
    reserveRatio: number;
    riskLevel: 'low' | 'medium' | 'high';
  };
}

/**
 * Pre-built demo scenarios for different fund strategies
 * Perfect for switching between examples during live demos
 */
export const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: 'demo-saas-001',
    name: 'SaaS Ventures I',
    description: 'Balanced early-stage SaaS fund with proven metrics',
    category: 'early_stage',
    highlights: [
      'Balanced allocation across Pre-Seed to Series A',
      'Conservative graduation rates (20-35%)',
      'Mixed follow-on strategy (ownership + fixed)',
      'Target 8.5x MOIC over 6.5 years'
    ],
    kpis: {
      expectedTVPI: 2.8,
      expectedIRR: 0.22,
      reserveRatio: 0.35,
      riskLevel: 'medium'
    },
    fundData: {
      id: 'demo-saas-001',
      name: 'SaaS Ventures I',
      currency: 'USD',
      waterfall: 'american',
      version: 1,
      state: {
        foundation: {
          startDate: '2024-01-01',
          termMonths: 120
        },
        capital: {
          totalCommitment: 15_000_000
        },
        fees: {
          managementFee: 0.02,
          carryPercentage: 0.20
        },
        investmentStrategy: {
          allocations: [
            { id: 'preseed', category: 'Pre-Seed', percentage: 25 },
            { id: 'seed', category: 'Seed', percentage: 40 },
            { id: 'series_a', category: 'Series A', percentage: 30 },
            { id: 'series_b', category: 'Series B+', percentage: 5 }
          ],
          stages: [
            { id: 'preseed', name: 'Pre-Seed', graduationRate: 20, exitRate: 5 },
            { id: 'seed', name: 'Seed', graduationRate: 35, exitRate: 10 },
            { id: 'series_a', name: 'Series A', graduationRate: 50, exitRate: 25 },
            { id: 'series_b', name: 'Series B+', graduationRate: 0, exitRate: 65 }
          ]
        },
        followOnRules: [
          {
            from: 'preseed',
            to: 'seed',
            mode: 'maintain_ownership',
            participationPct: 80,
            targetOwnershipPct: 12,
            nextRoundSize: 5_000_000
          },
          {
            from: 'seed',
            to: 'series_a',
            mode: 'fixed_check',
            participationPct: 60,
            fixedAmount: 750_000
          }
        ]
      }
    }
  },

  {
    id: 'demo-climate-002',
    name: 'Climate Innovation Fund',
    description: 'High-risk climate tech fund with concentrated pre-seed focus',
    category: 'climate',
    highlights: [
      '60% allocation to Pre-Seed (high conviction)',
      'Lower graduation rates (climate challenges)',
      'Higher carry (25%) for risk compensation',
      'Longer fund life (12 years) for deep tech'
    ],
    kpis: {
      expectedTVPI: 3.2,
      expectedIRR: 0.18,
      reserveRatio: 0.25,
      riskLevel: 'high'
    },
    fundData: {
      id: 'demo-climate-002',
      name: 'Climate Innovation Fund',
      currency: 'USD',
      waterfall: 'american',
      version: 1,
      state: {
        foundation: {
          startDate: '2024-06-01',
          termMonths: 144
        },
        capital: {
          totalCommitment: 20_000_000
        },
        fees: {
          managementFee: 0.025,
          carryPercentage: 0.25
        },
        investmentStrategy: {
          allocations: [
            { id: 'preseed', category: 'Pre-Seed', percentage: 60 },
            { id: 'seed', category: 'Seed', percentage: 30 },
            { id: 'series_a', category: 'Series A', percentage: 10 }
          ],
          stages: [
            { id: 'preseed', name: 'Pre-Seed', graduationRate: 15, exitRate: 3 },
            { id: 'seed', name: 'Seed', graduationRate: 25, exitRate: 8 },
            { id: 'series_a', name: 'Series A', graduationRate: 0, exitRate: 45 }
          ]
        },
        followOnRules: [
          {
            from: 'preseed',
            to: 'seed',
            mode: 'maintain_ownership',
            participationPct: 70,
            targetOwnershipPct: 15,
            nextRoundSize: 3_000_000
          }
        ]
      }
    }
  },

  {
    id: 'demo-growth-003',
    name: 'Growth Capital Partners II',
    description: 'Later-stage growth fund with larger check sizes',
    category: 'growth',
    highlights: [
      'Series B+ focus (80% allocation)',
      'High graduation rates (45-60%)',
      'Large follow-on reserves (45%)',
      'Shorter time to exit (4 years avg)'
    ],
    kpis: {
      expectedTVPI: 2.1,
      expectedIRR: 0.28,
      reserveRatio: 0.45,
      riskLevel: 'low'
    },
    fundData: {
      id: 'demo-growth-003',
      name: 'Growth Capital Partners II',
      currency: 'USD',
      waterfall: 'american',
      version: 1,
      state: {
        foundation: {
          startDate: '2024-03-01',
          termMonths: 96
        },
        capital: {
          totalCommitment: 50_000_000
        },
        fees: {
          managementFee: 0.02,
          carryPercentage: 0.20
        },
        investmentStrategy: {
          allocations: [
            { id: 'series_a', category: 'Series A', percentage: 20 },
            { id: 'series_b', category: 'Series B', percentage: 50 },
            { id: 'series_c', category: 'Series C+', percentage: 30 }
          ],
          stages: [
            { id: 'series_a', name: 'Series A', graduationRate: 60, exitRate: 15 },
            { id: 'series_b', name: 'Series B', graduationRate: 45, exitRate: 35 },
            { id: 'series_c', name: 'Series C+', graduationRate: 0, exitRate: 80 }
          ]
        },
        followOnRules: [
          {
            from: 'series_a',
            to: 'series_b',
            mode: 'fixed_check',
            participationPct: 80,
            fixedAmount: 2_000_000
          },
          {
            from: 'series_b',
            to: 'series_c',
            mode: 'maintain_ownership',
            participationPct: 60,
            targetOwnershipPct: 8,
            nextRoundSize: 25_000_000
          }
        ]
      }
    }
  },

  {
    id: 'demo-whatif-004',
    name: 'SaaS Ventures I (Alt Strategy)',
    description: 'Alternative strategy for comparison with base SaaS fund',
    category: 'comparison',
    highlights: [
      '+5% more allocation to Seed stage',
      'Higher graduation rates (+5% each)',
      'Different follow-on mix (fixed first)',
      'Demonstrates strategy impact on outcomes'
    ],
    kpis: {
      expectedTVPI: 3.0,
      expectedIRR: 0.24,
      reserveRatio: 0.40,
      riskLevel: 'medium'
    },
    fundData: {
      id: 'demo-whatif-004',
      name: 'SaaS Ventures I (Alt Strategy)',
      currency: 'USD',
      waterfall: 'american',
      version: 1,
      state: {
        foundation: {
          startDate: '2024-01-01',
          termMonths: 120
        },
        capital: {
          totalCommitment: 15_000_000
        },
        fees: {
          managementFee: 0.02,
          carryPercentage: 0.20
        },
        investmentStrategy: {
          allocations: [
            { id: 'preseed', category: 'Pre-Seed', percentage: 20 },
            { id: 'seed', category: 'Seed', percentage: 45 },
            { id: 'series_a', category: 'Series A', percentage: 30 },
            { id: 'series_b', category: 'Series B+', percentage: 5 }
          ],
          stages: [
            { id: 'preseed', name: 'Pre-Seed', graduationRate: 25, exitRate: 5 },
            { id: 'seed', name: 'Seed', graduationRate: 40, exitRate: 10 },
            { id: 'series_a', name: 'Series A', graduationRate: 55, exitRate: 20 },
            { id: 'series_b', name: 'Series B+', graduationRate: 0, exitRate: 70 }
          ]
        },
        followOnRules: [
          {
            from: 'preseed',
            to: 'seed',
            mode: 'fixed_check',
            participationPct: 85,
            fixedAmount: 400_000
          },
          {
            from: 'seed',
            to: 'series_a',
            mode: 'maintain_ownership',
            participationPct: 70,
            targetOwnershipPct: 10,
            nextRoundSize: 12_000_000
          }
        ]
      }
    }
  },

  {
    id: 'demo-evergreen-005',
    name: 'Perpetual Ventures',
    description: 'Evergreen fund structure with continuous deployment',
    category: 'evergreen',
    highlights: [
      'No fixed term (evergreen structure)',
      'Balanced allocation across all stages',
      'Moderate risk profile',
      'Continuous capital recycling'
    ],
    kpis: {
      expectedTVPI: 2.6,
      expectedIRR: 0.20,
      reserveRatio: 0.38,
      riskLevel: 'medium'
    },
    fundData: {
      id: 'demo-evergreen-005',
      name: 'Perpetual Ventures',
      currency: 'USD',
      waterfall: 'american',
      version: 1,
      state: {
        foundation: {
          startDate: '2024-09-01',
          termMonths: null
        },
        capital: {
          totalCommitment: 25_000_000
        },
        fees: {
          managementFee: 0.022,
          carryPercentage: 0.22
        },
        investmentStrategy: {
          allocations: [
            { id: 'preseed', category: 'Pre-Seed', percentage: 35 },
            { id: 'seed', category: 'Seed', percentage: 35 },
            { id: 'series_a', category: 'Series A', percentage: 25 },
            { id: 'series_b', category: 'Series B+', percentage: 5 }
          ],
          stages: [
            { id: 'preseed', name: 'Pre-Seed', graduationRate: 18, exitRate: 7 },
            { id: 'seed', name: 'Seed', graduationRate: 32, exitRate: 13 },
            { id: 'series_a', name: 'Series A', graduationRate: 48, exitRate: 27 },
            { id: 'series_b', name: 'Series B+', graduationRate: 0, exitRate: 62 }
          ]
        },
        followOnRules: [
          {
            from: 'preseed',
            to: 'seed',
            mode: 'maintain_ownership',
            participationPct: 75,
            targetOwnershipPct: 14,
            nextRoundSize: 4_500_000
          },
          {
            from: 'seed',
            to: 'series_a',
            mode: 'maintain_ownership',
            participationPct: 65,
            targetOwnershipPct: 9,
            nextRoundSize: 15_000_000
          }
        ]
      }
    }
  }
];

/**
 * Get demo scenario by ID
 */
export function getDemoScenario(id: string): DemoScenario | undefined {
  return DEMO_SCENARIOS.find(scenario => scenario.id === id);
}

/**
 * Get demo scenarios by category
 */
export function getDemoScenariosByCategory(category: DemoScenario['category']): DemoScenario[] {
  return DEMO_SCENARIOS.filter(scenario => scenario.category === category);
}

/**
 * Convert demo scenario to capital-first inputs for calculations
 */
export function scenarioToCapitalFirstInputs(scenario: DemoScenario): CapitalFirstInputsV2 {
  const fundData = scenario.fundData;
  const allocations = fundData['state']?.investmentStrategy?.allocations || [];
  const stages = fundData['state']?.investmentStrategy?.stages || [];

  // Create allocation percentages map
  const allocationPctByStage: Record<string, number> = {};
  allocations.forEach(alloc => {
    allocationPctByStage[alloc.id] = alloc.percentage;
  });

  // Create graduation percentages map
  const graduationPctByStage: Record<string, number> = {};
  stages.forEach(stage => {
    graduationPctByStage[stage.id] = stage.graduationRate;
  });

  // Create initial check sizes (estimated based on fund size and allocations)
  const totalCommitment = fundData['state']?.capital?.totalCommitment || 15_000_000;
  const initialCheckByStage: Record<string, number> = {
    preseed: totalCommitment < 20_000_000 ? 250_000 : 500_000,
    seed: totalCommitment < 30_000_000 ? 500_000 : 1_000_000,
    seriesA: totalCommitment < 30_000_000 ? 1_000_000 : 2_000_000,
    seriesBplus: totalCommitment < 30_000_000 ? 2_000_000 : 5_000_000
  };

  // Estimate market data
  const marketByStage = {
    preseed: { valuationPost: 3_000_000, roundSize: 1_500_000 },
    seed: { valuationPost: 8_000_000, roundSize: 5_000_000 },
    seriesA: { valuationPost: 25_000_000, roundSize: 15_000_000 },
    seriesBplus: { valuationPost: 75_000_000, roundSize: 40_000_000 }
  };

  return {
    totalCommitment: totalCommitment,
    feeDragPct: 12, // Estimate: 2% annual over 6 years
    allocationPctByStage: allocationPctByStage as any,
    initialCheckByStage: initialCheckByStage as any,
    graduationPctByStage: graduationPctByStage as any,
    marketByStage,
    followOnRules: (fundData['state']?.followOnRules || []) as any
  };
}

/**
 * Generate quick demo query parameter for URL
 * Useful for instant demo loading: ?demo=saas
 */
export function getDemoQueryParam(scenarioId: string): string {
  const mapping: Record<string, string> = {
    'demo-saas-001': 'saas',
    'demo-climate-002': 'climate',
    'demo-growth-003': 'growth',
    'demo-whatif-004': 'whatif',
    'demo-evergreen-005': 'evergreen'
  };
  return mapping[scenarioId] || scenarioId;
}

/**
 * Parse demo query parameter to scenario ID
 */
export function parseDemoQueryParam(param: string): string | undefined {
  const mapping: Record<string, string> = {
    'saas': 'demo-saas-001',
    'climate': 'demo-climate-002',
    'growth': 'demo-growth-003',
    'whatif': 'demo-whatif-004',
    'evergreen': 'demo-evergreen-005'
  };
  return mapping[param] || param;
}

/**
 * Demo-safe scenario loader with fallback
 */
export function loadDemoScenarioSafe(id: string): DemoScenario {
  const scenario = getDemoScenario(id);
  if (scenario) return scenario;

  // Fallback to default SaaS scenario
  console.warn(`Demo scenario ${id} not found, using default SaaS scenario`);
  const fallback = DEMO_SCENARIOS[0];
  if (!fallback) throw new Error('No demo scenarios available');
  return fallback;
}