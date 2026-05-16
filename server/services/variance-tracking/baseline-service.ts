import { db } from '../../db';
import { Decimal, toDecimal } from '@shared/lib/decimal-utils';
import {
  fundBaselines,
  fundMetrics,
  portfolioCompanies,
  investments,
  fundSnapshots,
  calcRuns,
  users,
} from '@shared/schema';
import type { FundBaseline, InsertFundBaseline } from '@shared/schema';
import { eq, and, desc, inArray } from 'drizzle-orm';
import { recordBaselineOperation, recordSystemError } from '../../metrics/variance-metrics';
import { SYSTEM_ACTOR_ID, SYSTEM_ACTOR_USERNAME } from '@shared/constants/system-actor';
import { logger } from '../../lib/logger';
import { isUniqueConstraintViolation } from './db-error-helpers';

export type BaselineCreationMode = 'manual' | 'calc_run' | 'backfill';
type BaselineDefaultBehavior = 'auto' | 'force_default' | 'never_default';

type CreateBaselineFromCalcRunOptions = {
  mode?: Extract<BaselineCreationMode, 'calc_run' | 'backfill'>;
  additionalTags?: string[];
  defaultBehavior?: BaselineDefaultBehavior;
};

function getBaselineTagsForMode(mode: Extract<BaselineCreationMode, 'calc_run' | 'backfill'>) {
  return mode === 'backfill' ? ['backfill', 'approximate'] : ['automatic', 'calc-run'];
}

function mergeUniqueTags(...tagGroups: Array<string[] | undefined>): string[] {
  return [...new Set(tagGroups.flatMap((tags) => tags ?? []))];
}

function ensureOrderedPeriod(start: Date, end: Date): Date {
  if (end.getTime() > start.getTime()) {
    return end;
  }

  return new Date(start.getTime() + 1000);
}

const log = logger.child({ module: 'variance-tracking' });

/**
 * Baseline creation and management
 */
export class BaselineService {
  /**
   * Create a new baseline from current fund state
   */
  async createBaseline(params: {
    fundId: number;
    name: string;
    description?: string;
    baselineType: 'initial' | 'quarterly' | 'annual' | 'milestone' | 'custom';
    periodStart: Date;
    periodEnd: Date;
    createdBy?: number;
    sourceRunId?: number;
    tags?: string[];
    mode?: BaselineCreationMode;
    snapshotDate?: Date;
    defaultBehavior?: BaselineDefaultBehavior;
  }): Promise<FundBaseline> {
    const startTime = Date.now();
    const {
      fundId,
      name,
      description,
      baselineType,
      periodStart,
      periodEnd,
      createdBy,
      sourceRunId,
      tags = [],
      mode = 'manual',
      snapshotDate,
      defaultBehavior = 'auto',
    } = params;
    const actorId = createdBy ?? SYSTEM_ACTOR_ID;
    let operationType: 'create' | 'reuse' = 'create';

    if (mode !== 'manual' && sourceRunId == null) {
      throw new Error(`Automated baseline mode ${mode} requires sourceRunId`);
    }

    try {
      const baseline = await db.transaction(async (tx) => {
        if (actorId === SYSTEM_ACTOR_ID) {
          await this.verifySystemActorExists(tx);
        }

        if (sourceRunId != null) {
          const existingBaseline = await tx.query.fundBaselines.findFirst({
            where: and(
              eq(fundBaselines.fundId, fundId),
              eq(fundBaselines.sourceRunId, sourceRunId)
            ),
          });

          if (existingBaseline) {
            operationType = 'reuse';
            log.info(
              {
                event: 'baseline.reused',
                fundId,
                sourceRunId,
                baselineId: existingBaseline.id,
                mode,
              },
              'Reused existing baseline'
            );
            return existingBaseline;
          }
        }

        const latestMetrics = await this.getBaselineMetrics(tx, fundId, mode, sourceRunId);
        if (!latestMetrics) {
          recordSystemError('baseline-service', 'missing_fund_metrics');
          throw new Error('No fund metrics available to create baseline');
        }

        const portfolioData = await this.getPortfolioComposition(tx, fundId);
        const reserveData = await this.getReserveSnapshot(tx, fundId, mode, sourceRunId);
        const pacingData = await this.getPacingSnapshot(tx, fundId, mode, sourceRunId);

        const existingDefault = await tx.query.fundBaselines.findFirst({
          where: and(
            eq(fundBaselines.fundId, fundId),
            eq(fundBaselines.isDefault, true),
            eq(fundBaselines.isActive, true)
          ),
        });

        const shouldBeDefault =
          defaultBehavior === 'force_default'
            ? true
            : defaultBehavior === 'never_default'
              ? false
              : !existingDefault;

        const baselineData: InsertFundBaseline = {
          fundId,
          name,
          baselineType,
          periodStart,
          periodEnd,
          snapshotDate: snapshotDate ?? new Date(),
          totalValue: latestMetrics.totalValue,
          deployedCapital: portfolioData.deployedCapital,
          irr: latestMetrics.irr,
          multiple: latestMetrics.multiple,
          dpi: latestMetrics.dpi,
          tvpi: latestMetrics.tvpi,
          portfolioCount: portfolioData.portfolioCount,
          averageInvestment: portfolioData.averageInvestment,
          topPerformers: portfolioData.topPerformers,
          companySnapshots: portfolioData.companySnapshots,
          sectorDistribution: portfolioData.sectorDistribution,
          stageDistribution: portfolioData.stageDistribution,
          reserveAllocation: reserveData,
          pacingMetrics: pacingData,
          createdBy: actorId,
          isDefault: shouldBeDefault,
          description,
          sourceRunId,
          tags,
        };

        const [createdBaseline] = await tx.insert(fundBaselines).values(baselineData).returning();

        if (!createdBaseline) {
          throw new Error('Failed to create baseline');
        }

        log.info(
          {
            event: 'baseline.created',
            fundId,
            sourceRunId,
            baselineId: createdBaseline.id,
            mode,
            isDefault: createdBaseline.isDefault,
          },
          'Created baseline'
        );

        return createdBaseline;
      });

      // Record metrics
      const duration = (Date.now() - startTime) / 1000;
      recordBaselineOperation(
        fundId.toString(),
        operationType,
        baselineType,
        operationType === 'create' ? duration : undefined
      );

      return baseline;
    } catch (error: unknown) {
      if (
        sourceRunId != null &&
        (isUniqueConstraintViolation(error, 'fund_baselines_source_run_unique') ||
          isUniqueConstraintViolation(error, 'fund_baselines_default_unique'))
      ) {
        const existingBaseline = await db.query.fundBaselines.findFirst({
          where: and(eq(fundBaselines.fundId, fundId), eq(fundBaselines.sourceRunId, sourceRunId)),
        });

        if (existingBaseline) {
          log.info(
            {
              event: 'baseline.reused_after_race',
              fundId,
              sourceRunId,
              baselineId: existingBaseline.id,
              mode,
            },
            'Reused existing baseline after unique-constraint race'
          );
          recordBaselineOperation(fundId.toString(), 'reuse', baselineType);
          return existingBaseline;
        }
      }

      recordSystemError('baseline-service', 'creation_failed');
      throw error;
    }
  }

  async createBaselineFromCalcRun(
    runId: number,
    options: CreateBaselineFromCalcRunOptions = {}
  ): Promise<FundBaseline> {
    const run = await db.query.calcRuns.findFirst({
      where: eq(calcRuns.id, runId),
    });

    if (!run) {
      throw new Error(`Calc run ${runId} not found`);
    }

    if (!run.completedAt) {
      throw new Error(`Calc run ${runId} is not completed`);
    }

    const periodStart = run.requestedAt;
    const periodEnd = ensureOrderedPeriod(periodStart, run.completedAt);
    const mode = options.mode ?? 'calc_run';
    const tags = mergeUniqueTags(getBaselineTagsForMode(mode), options.additionalTags);
    const defaultBehavior =
      options.defaultBehavior ?? (mode === 'backfill' ? 'never_default' : 'auto');

    return await this.createBaseline({
      fundId: run.fundId,
      name: `Automated Baseline v${run.configVersion}`,
      description: `Auto-created from calc run ${run.id} for config version ${run.configVersion}`,
      baselineType: 'milestone',
      periodStart,
      periodEnd,
      createdBy: SYSTEM_ACTOR_ID,
      sourceRunId: run.id,
      tags,
      mode,
      snapshotDate: run.completedAt,
      defaultBehavior,
    });
  }

  /**
   * Get active baselines for a fund
   */
  async getBaselines(
    fundId: number,
    options?: {
      baselineType?: string;
      isDefault?: boolean;
      limit?: number;
    }
  ): Promise<FundBaseline[]> {
    const conditions = [eq(fundBaselines.fundId, fundId), eq(fundBaselines.isActive, true)];

    if (options?.baselineType) {
      conditions.push(eq(fundBaselines.baselineType, options.baselineType));
    }

    if (options?.isDefault !== undefined) {
      conditions.push(eq(fundBaselines.isDefault, options.isDefault));
    }

    const query = db.query.fundBaselines.findMany({
      where: and(...conditions),
      orderBy: desc(fundBaselines.createdAt),
      limit: options?.limit || 50,
    });

    return await query;
  }

  /**
   * Get a specific baseline owned by a fund.
   * This intentionally does not filter on isActive so historical/inactive
   * baselines can still be referenced explicitly.
   */
  async getBaselineById(fundId: number, baselineId: string): Promise<FundBaseline | undefined> {
    return await db.query.fundBaselines.findFirst({
      where: and(eq(fundBaselines.fundId, fundId), eq(fundBaselines.id, baselineId)),
    });
  }

  async resolveBaselineForFund(fundId: number, baselineId?: string): Promise<FundBaseline> {
    if (baselineId) {
      const baseline = await this.getBaselineById(fundId, baselineId);
      if (!baseline) {
        throw new Error('Baseline not found for fund');
      }

      return baseline;
    }

    const defaultBaselines = await this.getBaselines(fundId, { isDefault: true, limit: 1 });
    const defaultBaseline = defaultBaselines[0];
    if (!defaultBaseline) {
      throw new Error('No default baseline found for fund');
    }

    return defaultBaseline;
  }

  /**
   * Set a baseline as default
   */
  async setDefaultBaseline(baselineId: string, fundId: number): Promise<void> {
    await db.transaction(async (tx) => {
      // Clear existing defaults
      await tx
        .update(fundBaselines)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(and(eq(fundBaselines.fundId, fundId), eq(fundBaselines.isDefault, true)));

      // Set new default
      await tx
        .update(fundBaselines)
        .set({ isDefault: true, updatedAt: new Date() })
        .where(eq(fundBaselines.id, baselineId));
    });
  }

  /**
   * Deactivate a baseline
   */
  async deactivateBaseline(baselineId: string): Promise<void> {
    await db
      .update(fundBaselines)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(fundBaselines.id, baselineId));
  }

  private async getBaselineMetrics(
    reader: {
      query: {
        fundMetrics: {
          findFirst: typeof db.query.fundMetrics.findFirst;
        };
      };
    },
    fundId: number,
    mode: BaselineCreationMode,
    sourceRunId?: number
  ) {
    if (mode !== 'manual' && sourceRunId == null) {
      throw new Error(`Automated baseline mode ${mode} requires sourceRunId`);
    }

    if (sourceRunId != null) {
      const attributedMetrics = await reader.query.fundMetrics.findFirst({
        where: and(eq(fundMetrics.fundId, fundId), eq(fundMetrics.runId, sourceRunId)),
        orderBy: desc(fundMetrics.metricDate),
      });

      if (attributedMetrics) {
        return attributedMetrics;
      }

      if (mode !== 'manual') {
        throw new Error(`No attributed fund metrics for run ${sourceRunId}`);
      }

      log.warn(
        {
          event: 'baseline.metric_fallback',
          fundId,
          sourceRunId,
          mode,
          reason: 'manual_latest_by_fund',
        },
        'Falling back to latest fund metrics for manual baseline creation'
      );
    }

    return await reader.query.fundMetrics.findFirst({
      where: eq(fundMetrics.fundId, fundId),
      orderBy: desc(fundMetrics.metricDate),
    });
  }

  /**
   * Get portfolio composition for baseline creation
   */
  private async getPortfolioComposition(
    reader: {
      query: {
        portfolioCompanies: {
          findMany: typeof db.query.portfolioCompanies.findMany;
        };
        investments?: {
          findMany: typeof db.query.investments.findMany;
        };
      };
    },
    fundId: number
  ) {
    // KNOWN LIMITATION: This reads live portfolio company and investment state, not an
    // immutable calc-run snapshot. If the portfolio changes between calc dispatch and
    // completion, the baseline captures completion-time composition rather than
    // dispatch-time composition. True drift detection needs mutation timestamps or
    // immutable portfolio snapshots and is intentionally deferred.
    const companies = await reader.query.portfolioCompanies.findMany({
      where: eq(portfolioCompanies.fundId, fundId),
    });

    const companiesWithInvestments = companies as Array<
      (typeof companies)[number] & {
        investments?: Array<{ amount: string | number }>;
      }
    >;

    const companyIds = companiesWithInvestments.map((company) => company.id);
    const shouldLookupInvestments =
      companyIds.length > 0 &&
      companiesWithInvestments.some((company) => !Array.isArray(company.investments));

    const investmentLookup = new Map<number, Array<{ amount: string | number }>>();

    if (shouldLookupInvestments && reader.query.investments) {
      const companyInvestments = await reader.query.investments.findMany({
        where: and(
          eq(investments.fundId, fundId),
          inArray(
            investments.companyId,
            companyIds.filter((companyId): companyId is number => typeof companyId === 'number')
          )
        ),
      });

      for (const investment of companyInvestments) {
        const companyId = investment.companyId;
        if (companyId == null) {
          continue;
        }

        const existing = investmentLookup.get(companyId) ?? [];
        existing.push({ amount: investment.amount });
        investmentLookup.set(companyId, existing);
      }
    }

    const companyInvestedCapital = new Map<number, Decimal>();

    const totalInvestments = companiesWithInvestments.reduce((sum: Decimal, company) => {
      const companyInvestments = Array.isArray(company.investments)
        ? company.investments
        : (investmentLookup.get(company.id) ?? []);

      const normalizedInvestments = Array.isArray(companyInvestments) ? companyInvestments : [];

      const companyInvestment = normalizedInvestments.reduce(
        (compSum: Decimal, inv) => compSum.plus(toDecimal(String(inv.amount))),
        new Decimal(0)
      );
      companyInvestedCapital.set(company.id, companyInvestment);
      return sum.plus(companyInvestment);
    }, new Decimal(0));

    const portfolioCount = companiesWithInvestments.length;
    const averageInvestment =
      portfolioCount > 0 ? totalInvestments.div(portfolioCount) : new Decimal(0);

    // Get sector distribution
    const sectorCounts = companiesWithInvestments.reduce(
      (acc, company) => {
        acc[company.sector] = (acc[company.sector] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    // Get stage distribution
    const stageCounts = companiesWithInvestments.reduce(
      (acc, company) => {
        acc[company.stage] = (acc[company.stage] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    // Identify top performers (top 20% by current valuation)
    const sortedCompanies = companiesWithInvestments
      .filter((c) => c.currentValuation)
      .sort((a, b) =>
        toDecimal(b.currentValuation!.toString()).comparedTo(
          toDecimal(a.currentValuation!.toString())
        )
      );

    const topPerformersCount = Math.ceil(sortedCompanies.length * 0.2);
    const topPerformers = sortedCompanies.slice(0, topPerformersCount).map((c) => ({
      id: c.id,
      name: c.name,
      sector: c.sector,
      currentValuation: c.currentValuation,
    }));

    const companySnapshots = companiesWithInvestments.map((company) => ({
      portfolioCompanyId: company.id,
      companyId: company.id,
      companyName: company.name,
      sector: company.sector || '',
      stage: company.stage ?? null,
      status: company.status ?? null,
      investedCapital: (companyInvestedCapital.get(company.id) ?? new Decimal(0)).toString(),
      currentValuation: company.currentValuation == null ? null : String(company.currentValuation),
    }));

    return {
      deployedCapital: totalInvestments.toString(),
      portfolioCount,
      averageInvestment: averageInvestment.toString(),
      topPerformers,
      companySnapshots,
      sectorDistribution: sectorCounts,
      stageDistribution: stageCounts,
    };
  }

  /**
   * Get reserve allocation snapshot
   */
  private async getReserveSnapshot(
    reader: {
      query: {
        fundSnapshots: {
          findFirst: typeof db.query.fundSnapshots.findFirst;
        };
      };
    },
    fundId: number,
    mode: BaselineCreationMode,
    sourceRunId?: number
  ) {
    if (mode !== 'manual' && sourceRunId == null) {
      throw new Error(`Automated baseline mode ${mode} requires sourceRunId`);
    }

    if (sourceRunId != null && mode !== 'manual') {
      const attributedSnapshot = await reader.query.fundSnapshots.findFirst({
        where: and(
          eq(fundSnapshots.fundId, fundId),
          eq(fundSnapshots.type, 'RESERVE'),
          eq(fundSnapshots.runId, sourceRunId)
        ),
        orderBy: [desc(fundSnapshots.snapshotTime), desc(fundSnapshots.createdAt)],
      });

      if (!attributedSnapshot) {
        throw new Error(`No RESERVE snapshot found for run ${sourceRunId}`);
      }

      return attributedSnapshot.payload || {};
    }

    const snapshot = await reader.query.fundSnapshots.findFirst({
      where: and(eq(fundSnapshots.fundId, fundId), eq(fundSnapshots.type, 'RESERVE')),
      orderBy: desc(fundSnapshots.createdAt),
    });

    return snapshot?.payload || {};
  }

  /**
   * Get pacing metrics snapshot
   */
  private async getPacingSnapshot(
    reader: {
      query: {
        fundSnapshots: {
          findFirst: typeof db.query.fundSnapshots.findFirst;
        };
      };
    },
    fundId: number,
    mode: BaselineCreationMode,
    sourceRunId?: number
  ) {
    if (mode !== 'manual' && sourceRunId == null) {
      throw new Error(`Automated baseline mode ${mode} requires sourceRunId`);
    }

    if (sourceRunId != null && mode !== 'manual') {
      const attributedSnapshot = await reader.query.fundSnapshots.findFirst({
        where: and(
          eq(fundSnapshots.fundId, fundId),
          eq(fundSnapshots.type, 'PACING'),
          eq(fundSnapshots.runId, sourceRunId)
        ),
        orderBy: [desc(fundSnapshots.snapshotTime), desc(fundSnapshots.createdAt)],
      });

      if (!attributedSnapshot) {
        throw new Error(`No PACING snapshot found for run ${sourceRunId}`);
      }

      return attributedSnapshot.payload || {};
    }

    const snapshot = await reader.query.fundSnapshots.findFirst({
      where: and(eq(fundSnapshots.fundId, fundId), eq(fundSnapshots.type, 'PACING')),
      orderBy: desc(fundSnapshots.createdAt),
    });

    return snapshot?.payload || {};
  }

  private async verifySystemActorExists(reader: {
    query: {
      users: {
        findFirst: typeof db.query.users.findFirst;
      };
    };
  }): Promise<void> {
    const systemActor = await reader.query.users.findFirst({
      where: and(eq(users.id, SYSTEM_ACTOR_ID), eq(users.username, SYSTEM_ACTOR_USERNAME)),
      columns: {
        id: true,
      },
    });

    if (!systemActor) {
      throw new Error(
        `System actor (id=${SYSTEM_ACTOR_ID}, username=${SYSTEM_ACTOR_USERNAME}) not found`
      );
    }
  }
}
