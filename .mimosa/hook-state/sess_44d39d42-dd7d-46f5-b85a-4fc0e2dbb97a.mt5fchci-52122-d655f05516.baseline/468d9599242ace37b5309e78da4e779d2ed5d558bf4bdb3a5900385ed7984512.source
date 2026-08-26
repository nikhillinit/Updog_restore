import { pathToFileURL } from 'node:url';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from './db';
import { logger } from './lib/logger';
import {
  backtestResults,
  dealOpportunities,
  fundBaselines,
  fundMetrics,
  funds,
  pacingHistory,
  portfolioCompanies,
  reserveStrategies,
  users,
  varianceReports,
} from '@shared/schema';
import { SYSTEM_ACTOR_ID, SYSTEM_ACTOR_USERNAME } from '@shared/constants/system-actor';

type FundInsert = typeof funds.$inferInsert;
type DealOpportunityInsert = typeof dealOpportunities.$inferInsert;
type FundMetricsInsert = typeof fundMetrics.$inferInsert;
type FundBaselineInsert = typeof fundBaselines.$inferInsert;
type VarianceReportInsert = typeof varianceReports.$inferInsert;
type BacktestResultInsert = typeof backtestResults.$inferInsert;
type PacingHistoryInsert = typeof pacingHistory.$inferInsert;
type ReserveStrategyInsert = typeof reserveStrategies.$inferInsert;
type DemoSeedTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

const DEMO_FUND_NAME = 'Test Fund I';
const DEMO_TAG = 'demo-seed';
const DEMO_BACKTEST_SEEDS = [2026051201, 2026051202] as const;
const DEMO_BASELINE_NAME = 'Demo Baseline - Test Fund I';
const DEMO_VARIANCE_REPORT_NAME = 'Demo Variance Report - Test Fund I';
const DEMO_METRIC_DATES = [
  '2025-05-12',
  '2025-06-12',
  '2025-07-12',
  '2025-08-12',
  '2025-09-12',
  '2025-10-12',
  '2025-11-12',
  '2025-12-12',
  '2026-01-12',
  '2026-02-12',
  '2026-03-12',
  '2026-04-12',
  '2026-05-12',
] as const;

const DEMO_DEALS = [
  {
    companyName: 'Arbor Ledger',
    sector: 'Fintech',
    stage: 'Seed',
    sourceType: 'Referral',
    dealSize: '1800000.00',
    valuation: '12000000.00',
    status: 'lead',
    priority: 'high',
    foundedYear: 2023,
    employeeCount: 14,
    revenue: '450000.00',
    description: 'Treasury automation for vertical SaaS operators.',
    website: 'https://arborledger.example',
    contactName: 'Maya Chen',
    contactEmail: 'maya@arborledger.example',
    sourceNotes: 'Warm intro from portfolio CFO.',
    nextAction: 'Partner intro call',
    nextActionDate: new Date('2026-05-16T15:00:00.000Z'),
  },
  {
    companyName: 'Northstar Data Rooms',
    sector: 'AI/ML',
    stage: 'Series A',
    sourceType: 'Inbound',
    dealSize: '3500000.00',
    valuation: '28000000.00',
    status: 'qualified',
    priority: 'high',
    foundedYear: 2021,
    employeeCount: 38,
    revenue: '2200000.00',
    description: 'AI-native diligence workspace for private-market teams.',
    website: 'https://northstardatarooms.example',
    contactName: 'Elliot Singh',
    contactEmail: 'elliot@northstardatarooms.example',
    sourceNotes: 'Strong founder-market fit; compare against legal workflow incumbents.',
    nextAction: 'Product teardown',
    nextActionDate: new Date('2026-05-18T18:00:00.000Z'),
  },
  {
    companyName: 'PulseGrid Health',
    sector: 'HealthTech',
    stage: 'Series A',
    sourceType: 'Event',
    dealSize: '4200000.00',
    valuation: '34000000.00',
    status: 'pitch',
    priority: 'medium',
    foundedYear: 2020,
    employeeCount: 52,
    revenue: '3100000.00',
    description: 'Remote monitoring infrastructure for specialty clinics.',
    website: 'https://pulsegrid.example',
    contactName: 'Nora Williams',
    contactEmail: 'nora@pulsegrid.example',
    sourceNotes: 'Met at operator dinner.',
    nextAction: 'Market reference calls',
    nextActionDate: new Date('2026-05-20T16:00:00.000Z'),
  },
  {
    companyName: 'QuarryOps',
    sector: 'Industrial SaaS',
    stage: 'Seed',
    sourceType: 'Cold outreach',
    dealSize: '1500000.00',
    valuation: '9000000.00',
    status: 'dd',
    priority: 'medium',
    foundedYear: 2022,
    employeeCount: 18,
    revenue: '950000.00',
    description: 'Workflow and compliance system for aggregates producers.',
    website: 'https://quarryops.example',
    contactName: 'Sam Patel',
    contactEmail: 'sam@quarryops.example',
    sourceNotes: 'Low churn in pilot cohort.',
    nextAction: 'Customer diligence',
    nextActionDate: new Date('2026-05-22T14:00:00.000Z'),
  },
  {
    companyName: 'BrightLoop Commerce',
    sector: 'Commerce Enablement',
    stage: 'Series A',
    sourceType: 'Referral',
    dealSize: '5000000.00',
    valuation: '42000000.00',
    status: 'committee',
    priority: 'high',
    foundedYear: 2019,
    employeeCount: 64,
    revenue: '6800000.00',
    description: 'Margin intelligence for multi-channel consumer brands.',
    website: 'https://brightloop.example',
    contactName: 'Priya Raman',
    contactEmail: 'priya@brightloop.example',
    sourceNotes: 'IC memo draft in progress.',
    nextAction: 'Investment committee',
    nextActionDate: new Date('2026-05-24T17:00:00.000Z'),
  },
  {
    companyName: 'Harbor Cloud Security',
    sector: 'Security',
    stage: 'Series B',
    sourceType: 'Referral',
    dealSize: '6500000.00',
    valuation: '80000000.00',
    status: 'term_sheet',
    priority: 'medium',
    foundedYear: 2018,
    employeeCount: 95,
    revenue: '14500000.00',
    description: 'Runtime access controls for cloud data platforms.',
    website: 'https://harborcloud.example',
    contactName: 'Jon Reed',
    contactEmail: 'jon@harborcloud.example',
    sourceNotes: 'Co-investor allocation pending.',
    nextAction: 'Terms review',
    nextActionDate: new Date('2026-05-19T19:00:00.000Z'),
  },
  {
    companyName: 'Canopy Robotics',
    sector: 'ClimateTech',
    stage: 'Seed',
    sourceType: 'Inbound',
    dealSize: '2200000.00',
    valuation: '16000000.00',
    status: 'closed',
    priority: 'low',
    foundedYear: 2021,
    employeeCount: 27,
    revenue: '1200000.00',
    description: 'Autonomous canopy monitoring for high-value agriculture.',
    website: 'https://canopyrobotics.example',
    contactName: 'Alex Morgan',
    contactEmail: 'alex@canopyrobotics.example',
    sourceNotes: 'Closed as small strategic position.',
    nextAction: 'Post-close onboarding',
    nextActionDate: new Date('2026-05-27T15:00:00.000Z'),
  },
  {
    companyName: 'Atlas Legal Systems',
    sector: 'LegalTech',
    stage: 'Pre-seed',
    sourceType: 'Event',
    dealSize: '750000.00',
    valuation: '6000000.00',
    status: 'passed',
    priority: 'low',
    foundedYear: 2024,
    employeeCount: 8,
    revenue: '120000.00',
    description: 'Matter intake automation for boutique firms.',
    website: 'https://atlaslegal.example',
    contactName: 'Iris Cohen',
    contactEmail: 'iris@atlaslegal.example',
    sourceNotes: 'Too early for current fund strategy.',
    nextAction: 'Revisit after seed round',
    nextActionDate: new Date('2026-06-15T15:00:00.000Z'),
  },
] satisfies Array<Omit<DealOpportunityInsert, 'fundId'>>;

function assertDemoSeedEnabled(): void {
  if (process.env['DEMO_SEED'] !== '1') {
    throw new Error('Refusing to seed demo data unless DEMO_SEED=1 is set.');
  }

  if (
    process.env['NODE_ENV'] === 'production' &&
    process.env['ALLOW_PRODUCTION_DEMO_SEED'] !== '1'
  ) {
    throw new Error(
      'Refusing to seed demo data in production unless ALLOW_PRODUCTION_DEMO_SEED=1 is set.'
    );
  }
}

function asDate(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

function requireRow<T>(rows: T[], label: string): T {
  const row = rows[0];
  if (!row) {
    throw new Error(`Expected ${label} to be returned from database`);
  }
  return row;
}

async function ensureDemoFund(tx: DemoSeedTransaction) {
  const demoFund: FundInsert = {
    name: DEMO_FUND_NAME,
    size: '50000000.00',
    deployedCapital: '18250000.00',
    managementFee: '0.0200',
    carryPercentage: '0.2000',
    vintageYear: 2022,
    establishmentDate: '2022-01-01',
    status: 'active',
    isActive: true,
  };

  const existing = await tx.select().from(funds).where(eq(funds.name, DEMO_FUND_NAME)).limit(1);
  const existingFund = existing[0];

  if (existingFund) {
    return requireRow(
      await tx.update(funds).set(demoFund).where(eq(funds.id, existingFund.id)).returning(),
      DEMO_FUND_NAME
    );
  }

  return requireRow(await tx.insert(funds).values(demoFund).returning(), DEMO_FUND_NAME);
}

function buildMetricRows(fundId: number): FundMetricsInsert[] {
  return DEMO_METRIC_DATES.map((date, index) => {
    const totalValue = 23_500_000 + index * 1_425_000;
    const irr = 0.095 + index * 0.0048;
    const tvpi = 1.08 + index * 0.035;
    const dpi = 0.03 + index * 0.012;

    return {
      fundId,
      metricDate: asDate(date),
      asOfDate: asDate(date),
      totalValue: totalValue.toFixed(2),
      irr: irr.toFixed(4),
      multiple: tvpi.toFixed(2),
      dpi: dpi.toFixed(2),
      tvpi: tvpi.toFixed(2),
    };
  });
}

function buildBaselineRow(fundId: number): FundBaselineInsert {
  return {
    fundId,
    name: DEMO_BASELINE_NAME,
    description: 'Demo baseline for GP readiness walkthroughs.',
    baselineType: 'quarterly',
    periodStart: asDate('2025-10-01'),
    periodEnd: asDate('2025-12-31'),
    snapshotDate: asDate('2026-01-12'),
    totalValue: '35112500.00',
    deployedCapital: '16500000.00',
    irr: '0.1238',
    multiple: '1.36',
    dpi: '0.10',
    tvpi: '1.36',
    portfolioCount: 8,
    averageInvestment: '2062500.00',
    topPerformers: [
      { company: 'BrightLoop Commerce', multiple: 2.4 },
      { company: 'Northstar Data Rooms', multiple: 2.1 },
    ],
    companySnapshots: DEMO_DEALS.slice(0, 5).map((deal) => ({
      companyName: deal.companyName,
      sector: deal.sector,
      stage: deal.stage,
      status: deal.status,
    })),
    sectorDistribution: {
      fintech: 0.18,
      ai: 0.22,
      healthcare: 0.14,
      industrial: 0.12,
      commerce: 0.18,
      security: 0.16,
    },
    stageDistribution: {
      seed: 0.42,
      seriesA: 0.45,
      seriesB: 0.13,
    },
    reserveAllocation: {
      plannedReserveRatio: 0.45,
      committedReserveRatio: 0.31,
    },
    pacingMetrics: {
      targetDeploymentPct: 0.38,
      actualDeploymentPct: 0.365,
    },
    isActive: true,
    isDefault: true,
    confidence: '0.90',
    version: 'demo-20260512',
    createdBy: SYSTEM_ACTOR_ID,
    tags: [DEMO_TAG],
  };
}

function buildVarianceReportRow(fundId: number, baselineId: string): VarianceReportInsert {
  return {
    fundId,
    baselineId,
    reportName: DEMO_VARIANCE_REPORT_NAME,
    reportType: 'periodic',
    reportPeriod: 'monthly',
    analysisStart: asDate('2026-01-01'),
    analysisEnd: asDate('2026-05-12'),
    asOfDate: asDate('2026-05-12'),
    currentMetrics: {
      totalValue: 40_600_000,
      deployedCapital: 18_250_000,
      irr: 0.1526,
      multiple: 1.5,
      dpi: 0.17,
      tvpi: 1.5,
      distributedCapital: 3_100_000,
      residualValue: 37_500_000,
    },
    baselineMetrics: {
      totalValue: 35_112_500,
      deployedCapital: 16_500_000,
      irr: 0.1238,
      multiple: 1.36,
      dpi: 0.1,
      tvpi: 1.36,
    },
    totalValueVariance: '5487500.00',
    totalValueVariancePct: '0.1563',
    irrVariance: '0.0288',
    multipleVariance: '0.14',
    dpiVariance: '0.07',
    tvpiVariance: '0.14',
    portfolioVariances: [
      { company: 'BrightLoop Commerce', variancePct: 0.24 },
      { company: 'Northstar Data Rooms', variancePct: 0.19 },
    ],
    sectorVariances: {
      ai: 0.18,
      fintech: 0.11,
      security: -0.04,
    },
    stageVariances: {
      seed: 0.08,
      seriesA: 0.15,
      seriesB: -0.02,
    },
    reserveVariances: {
      reserveRatioVariance: -0.03,
      followOnCoverageVariance: 0.05,
    },
    pacingVariances: {
      deploymentPctVariance: -0.015,
      quarterlyPaceVariance: 0.04,
    },
    overallVarianceScore: '82.50',
    significantVariances: [
      'TVPI ahead of baseline due to valuation marks',
      'Deployment slightly behind target pacing',
    ],
    varianceFactors: {
      primaryDrivers: ['Series A markups', 'deferred Q2 deployment'],
    },
    alertsTriggered: [],
    thresholdBreaches: [],
    riskLevel: 'low',
    calculationEngine: 'variance-v1',
    calculationDurationMs: 124,
    dataQualityScore: '0.94',
    generatedBy: SYSTEM_ACTOR_ID,
    status: 'approved',
    isPublic: false,
    sharedWith: [],
  };
}

function buildDistribution(
  mean: number,
  standardDeviation: number,
  lowerSpread: number,
  upperSpread: number
) {
  return {
    mean,
    median: mean,
    p5: mean - lowerSpread,
    p25: mean - lowerSpread * 0.35,
    p75: mean + upperSpread * 0.35,
    p95: mean + upperSpread,
    min: mean - lowerSpread * 1.3,
    max: mean + upperSpread * 1.3,
    standardDeviation,
  };
}

function buildBacktestRows(fundId: number, baselineId: string): BacktestResultInsert[] {
  return DEMO_BACKTEST_SEEDS.map((randomSeed, index) => {
    const actualIrr = index === 0 ? 0.148 : 0.153;
    const actualTvpi = index === 0 ? 1.45 : 1.5;
    const actualDpi = 0.17;
    const qualityScore = index === 0 ? 84 : 88;

    return {
      fundId,
      config: {
        fundId,
        startDate: '2025-05-12',
        endDate: '2026-05-12',
        simulationRuns: 5000,
        comparisonMetrics: ['irr', 'tvpi', 'dpi', 'multiple'],
        includeHistoricalScenarios: true,
        historicalScenarios: ['dot_com_crash', 'global_financial_crisis'],
        baselineId,
        randomSeed,
      },
      simulationSummary: {
        runs: 5000,
        engineUsed: 'streaming',
        executionTimeMs: 890 + index * 45,
        metrics: {
          irr: buildDistribution(actualIrr - 0.004, 0.052, 0.08, 0.09),
          tvpi: buildDistribution(actualTvpi - 0.03, 0.21, 0.36, 0.42),
          dpi: buildDistribution(actualDpi - 0.01, 0.025, 0.05, 0.06),
          multiple: buildDistribution(actualTvpi - 0.03, 0.21, 0.36, 0.42),
        },
      },
      actualPerformance: {
        asOfDate: '2026-05-12',
        irr: actualIrr,
        tvpi: actualTvpi,
        dpi: actualDpi,
        multiple: actualTvpi,
        deployedCapital: 18_250_000,
        distributedCapital: 3_100_000,
        residualValue: 37_500_000,
        dataSource: 'baseline',
        dataFreshness: 'fresh',
      },
      validationMetrics: {
        meanAbsoluteError: {
          irr: 0.004,
          tvpi: 0.03,
          dpi: 0.01,
          multiple: 0.03,
        },
        rootMeanSquareError: {
          irr: 0.004,
          tvpi: 0.03,
          dpi: 0.01,
          multiple: 0.03,
        },
        percentileHitRates: {
          p50: { irr: true, tvpi: true, dpi: true, multiple: true },
          p90: { irr: true, tvpi: true, dpi: true, multiple: true },
          p100: { irr: true, tvpi: true, dpi: true, multiple: true },
        },
        modelQualityScore: qualityScore,
        calibrationStatus: 'well-calibrated',
        incalculableMetrics: [],
      },
      dataQuality: {
        hasBaseline: true,
        baselineAgeInDays: 0,
        varianceHistoryCount: 1,
        snapshotAvailable: false,
        isStale: false,
        warnings: [],
        overallQuality: 'acceptable',
      },
      scenarioComparisons: [
        {
          scenario: 'dot_com_crash',
          simulatedPerformance: {
            mean: 0.072,
            median: 0.08,
            p5: -0.08,
            p95: 0.19,
          },
          description: 'Lower multiple environment with extended holds.',
          keyInsights: ['Reserve discipline protects downside in compressed exit markets.'],
          marketParameters: { exitMultiplierMean: 1.7, failureRate: 0.34 },
        },
        {
          scenario: 'global_financial_crisis',
          simulatedPerformance: {
            mean: 0.061,
            median: 0.067,
            p5: -0.1,
            p95: 0.17,
          },
          description: 'Liquidity-constrained downturn scenario.',
          keyInsights: ['Follow-on concentration should be actively monitored.'],
          marketParameters: { exitMultiplierMean: 1.5, failureRate: 0.38 },
        },
      ],
      scenarioComparisonSummary: {
        requestedScenarios: 2,
        scenariosCompared: 2,
        failedScenarios: [],
      },
      recommendations: [
        'Model performing within expected parameters - continue monitoring',
        'Run a fresh backtest after Q2 marks close',
      ],
      executionTimeMs: 1040 + index * 52,
      status: 'completed',
      baselineId,
      createdBy: SYSTEM_ACTOR_ID,
      tags: [DEMO_TAG, 'completed-backtest'],
    };
  });
}

function buildPacingRows(fundId: number): PacingHistoryInsert[] {
  return [
    {
      fundId,
      quarter: '2025Q4',
      deploymentAmount: '4200000.00',
      marketCondition: 'neutral',
    },
    {
      fundId,
      quarter: '2026Q1',
      deploymentAmount: '5100000.00',
      marketCondition: 'bull',
    },
    {
      fundId,
      quarter: '2026Q2',
      deploymentAmount: '3750000.00',
      marketCondition: 'neutral',
    },
  ];
}

export async function seedDemoData() {
  assertDemoSeedEnabled();
  logger.info({ fundName: DEMO_FUND_NAME }, 'Seeding demo readiness data');

  const summary = await db.transaction(async (tx) => {
    await tx
      .insert(users)
      .values({
        id: SYSTEM_ACTOR_ID,
        username: SYSTEM_ACTOR_USERNAME,
        password: 'SYSTEM_ACTOR_NO_LOGIN_00000000',
      })
      .onConflictDoUpdate({
        target: users.id,
        set: {
          username: SYSTEM_ACTOR_USERNAME,
          password: 'SYSTEM_ACTOR_NO_LOGIN_00000000',
        },
      });

    const demoFund = await ensureDemoFund(tx);
    const fundId = demoFund.id;

    await tx
      .delete(backtestResults)
      .where(
        and(
          eq(backtestResults.fundId, fundId),
          sql`${backtestResults.tags} @> ARRAY[${DEMO_TAG}]::text[]`
        )
      );
    await tx
      .delete(varianceReports)
      .where(
        and(
          eq(varianceReports.fundId, fundId),
          inArray(varianceReports.reportName, [DEMO_VARIANCE_REPORT_NAME])
        )
      );
    await tx
      .delete(fundBaselines)
      .where(
        and(eq(fundBaselines.fundId, fundId), inArray(fundBaselines.name, [DEMO_BASELINE_NAME]))
      );
    await tx.delete(dealOpportunities).where(
      and(
        eq(dealOpportunities.fundId, fundId),
        inArray(
          dealOpportunities.companyName,
          DEMO_DEALS.map((deal) => deal.companyName)
        )
      )
    );
    await tx
      .delete(fundMetrics)
      .where(
        and(
          eq(fundMetrics.fundId, fundId),
          inArray(fundMetrics.metricDate, DEMO_METRIC_DATES.map(asDate))
        )
      );

    await tx
      .update(fundBaselines)
      .set({ isDefault: false })
      .where(and(eq(fundBaselines.fundId, fundId), eq(fundBaselines.isDefault, true)));

    await tx.insert(dealOpportunities).values(
      DEMO_DEALS.map((deal) => ({
        ...deal,
        fundId,
      }))
    );

    await tx.insert(fundMetrics).values(buildMetricRows(fundId));

    const baseline = requireRow(
      await tx.insert(fundBaselines).values(buildBaselineRow(fundId)).returning(),
      DEMO_BASELINE_NAME
    );

    await tx.insert(varianceReports).values(buildVarianceReportRow(fundId, baseline.id));
    await tx.insert(backtestResults).values(buildBacktestRows(fundId, baseline.id));

    await tx
      .insert(pacingHistory)
      .values(buildPacingRows(fundId))
      .onConflictDoUpdate({
        target: [pacingHistory.fundId, pacingHistory.quarter],
        set: {
          deploymentAmount: sql`excluded.deployment_amount`,
          marketCondition: sql`excluded.market_condition`,
        },
      });

    const reserveCompanies = await tx
      .select({ id: portfolioCompanies.id })
      .from(portfolioCompanies)
      .where(eq(portfolioCompanies.fundId, fundId))
      .limit(2);

    if (reserveCompanies.length > 0) {
      const companyIds = reserveCompanies.map((company) => company.id);
      await tx
        .delete(reserveStrategies)
        .where(
          and(
            eq(reserveStrategies.fundId, fundId),
            inArray(reserveStrategies.companyId, companyIds)
          )
        );

      const reserveRows: ReserveStrategyInsert[] = reserveCompanies.map((company, index) => ({
        fundId,
        companyId: company.id,
        allocation: index === 0 ? '500000.00' : '750000.00',
        confidence: index === 0 ? '0.75' : '0.85',
      }));
      await tx.insert(reserveStrategies).values(reserveRows);
    }

    return {
      fundId,
      deals: DEMO_DEALS.length,
      metricSnapshots: DEMO_METRIC_DATES.length,
      backtests: DEMO_BACKTEST_SEEDS.length,
      varianceBaselines: 1,
      varianceReports: 1,
      reserveStrategies: reserveCompanies.length,
    };
  });

  logger.info(summary, 'Demo readiness data seeded successfully');
  return summary;
}

function isDirectExecution(): boolean {
  const entrypoint = process.argv[1];
  return entrypoint ? pathToFileURL(entrypoint).href === import.meta.url : false;
}

if (isDirectExecution()) {
  seedDemoData().catch((error: unknown) => {
    logger.error({ error }, 'Demo data seed failed');
    process.exitCode = 1;
  });
}
