/**
 * FundPersistenceService
 *
 * Encapsulates transactional fund lifecycle operations:
 *   - createFundWithInitialDraft (Item 4): atomic fund + config insert
 *   - publishDraft (Item 7): publish with calcRun tracking
 *
 * @module server/services/fund-persistence-service
 */

import { db } from '../db';
import { funds, fundConfigs, fundEvents, calcRuns, fundSnapshots } from '@shared/schema';
import { eq, and, max, isNull } from 'drizzle-orm';
import type { Fund, FundConfig, CalcRun, DispatchState } from '@shared/schema/fund';
import type { EngineResults } from '@shared/schemas/engine-results-schema';
import {
  AUTHORITATIVE_ENGINE_KEYS,
  getCalculationEngineDescriptor,
  isAuthoritativeEngineKey,
  type FundCalculationEngineKey,
} from '@shared/contracts/fund-authoritative-calculations.contract';
import { FundDraftWriteV1Schema } from '@shared/contracts/fund-draft-write-v1.contract';
import { isFlagEnabled } from '@shared/flags/getFlag';
import type { Queue } from 'bullmq';
import { runReserveCalculation } from './reserve-calculation-service';
import { runPacingCalculation } from './pacing-calculation-service';
import { runEconomicsCalculation } from './economics-calculation-service';
import { fundStateReadService } from './fund-state-read-service';
import { omitEconomicsAssumptionsWhenDisabled } from './economics-feature-gate';

export interface CreateFundInput {
  name: string;
  size: string;
  managementFee: string;
  carryPercentage: string;
  vintageYear: number;
  engineResults?: EngineResults | null;
}

export interface CreateFundResult {
  fund: Fund;
  draft: FundConfig;
}

export interface PublishQueues {
  reserve: Queue | null;
  pacing: Queue | null;
  cohort: Queue | null;
  economics?: Queue | null;
}

export interface PublishResult {
  published: FundConfig;
  run: CalcRun;
  correlationId: string;
}

interface PublishJobData {
  fundId: number;
  correlationId: string;
  runId: number;
  configId: number;
  configVersion: number;
}

const inlineExecutionByEngine: Partial<
  Record<FundCalculationEngineKey, (jobData: PublishJobData) => Promise<unknown>>
> = {
  reserve: runReserveCalculation,
  pacing: runPacingCalculation,
  economics: runEconomicsCalculation,
};

export interface FinalizeInput {
  draftFundId?: number | undefined;
  name: string;
  size: number;
  managementFee?: number | undefined;
  carryPercentage?: number | undefined;
  vintageYear?: number | undefined;
  modelVersion?: string | undefined;
  engineResults?: EngineResults | null | undefined;
  [key: string]: unknown;
}

export interface FinalizeResult {
  fundId: number;
  configVersion: number;
  correlationId: string;
  runId: number;
  dispatchState: DispatchState;
  published: boolean;
}

export interface RecalcResult {
  run: CalcRun;
  correlationId: string;
}

export class NoPublishedConfigError extends Error {
  constructor() {
    super('No published configuration');
    this.name = 'NoPublishedConfigError';
  }
}

export class CalculationInProgressError extends Error {
  constructor() {
    super('Calculation already in progress');
    this.name = 'CalculationInProgressError';
  }
}

class NoPublishableDraftError extends Error {
  constructor() {
    super('No draft to publish');
  }
}

export class NoActiveDraftForFinalizeError extends Error {
  constructor(fundId: number) {
    super(`No active draft exists for fund ID: ${fundId}`);
    this.name = 'NoActiveDraftForFinalizeError';
  }
}

class PublishDraftRaceLostError extends Error {
  constructor() {
    super('Draft was already published by another request');
  }
}

export class FundPersistenceService {
  async createFundWithInitialDraft(
    fundInput: CreateFundInput,
    configInput?: Record<string, unknown>
  ): Promise<CreateFundResult> {
    const gatedConfigInput = omitEconomicsAssumptionsWhenDisabled(configInput ?? {});

    return await db.transaction(async (tx) => {
      const [fund] = await tx
        .insert(funds)
        .values({
          name: fundInput.name,
          size: fundInput.size,
          managementFee: fundInput.managementFee,
          carryPercentage: fundInput.carryPercentage,
          vintageYear: fundInput.vintageYear,
          ...(fundInput.engineResults != null && {
            engineResults: fundInput.engineResults,
          }),
        })
        .returning();

      if (!fund) throw new Error('Failed to insert fund row');

      const [draft] = await tx
        .insert(fundConfigs)
        .values({
          fundId: fund.id,
          version: 1,
          config: gatedConfigInput,
          isDraft: true,
          isPublished: false,
        })
        .returning();

      if (!draft) throw new Error('Failed to insert initial draft config');

      await tx.insert(fundEvents).values({
        fundId: fund.id,
        eventType: 'FUND_CREATED',
        eventTime: new Date(),
        payload: {
          configId: draft.id,
          configVersion: draft.version,
        },
      });

      return { fund, draft };
    });
  }

  async allocateNextVersion(fundId: number): Promise<number> {
    const [result] = await db
      .select({ maxVersion: max(fundConfigs.version) })
      .from(fundConfigs)
      .where(eq(fundConfigs.fundId, fundId));

    const currentMax = result?.maxVersion ?? 0;
    return currentMax + 1;
  }

  async publishDraft(
    fundId: number,
    queues: PublishQueues,
    userId?: number
  ): Promise<PublishResult> {
    const { v4: generateUuid } = await import('uuid');
    const correlationId = generateUuid();

    try {
      const created = await db.transaction(async (tx) => {
        const draft = await tx.query.fundConfigs.findFirst({
          where: and(eq(fundConfigs.fundId, fundId), eq(fundConfigs.isDraft, true)),
          orderBy: (configs, { desc }) => desc(configs.version),
        });

        if (!draft) {
          throw new NoPublishableDraftError();
        }

        const engines = this.getEnginesForConfig(draft.config);

        await tx
          .update(fundConfigs)
          .set({ isPublished: false, updatedAt: new Date() })
          .where(and(eq(fundConfigs.fundId, fundId), eq(fundConfigs.isPublished, true)));

        const [pub] = await tx
          .update(fundConfigs)
          .set({
            isPublished: true,
            isDraft: false,
            publishedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(and(eq(fundConfigs.id, draft.id), eq(fundConfigs.isDraft, true)))
          .returning();

        if (!pub) {
          throw new PublishDraftRaceLostError();
        }

        const [newRun] = await tx
          .insert(calcRuns)
          .values({
            fundId,
            configId: draft.id,
            configVersion: draft.version,
            correlationId,
            engines,
            dispatchState: 'pending',
            requestedAt: new Date(),
          })
          .returning();

        if (!newRun) throw new Error('Failed to create calcRun');

        await tx.insert(fundEvents).values({
          fundId,
          eventType: 'PUBLISHED',
          eventTime: new Date(),
          correlationId,
        });

        await tx.insert(fundEvents).values({
          fundId,
          eventType: 'CALC_TRIGGERED',
          eventTime: new Date(),
          payload: { engines, correlationId },
          ...(userId != null && { userId }),
          correlationId,
        });

        return { published: pub, run: newRun };
      });

      const dispatchedRun = await this.dispatchCalcJobs(created.run, queues);
      return { published: created.published, run: dispatchedRun, correlationId };
    } catch (error) {
      if (
        !(error instanceof NoPublishableDraftError || error instanceof PublishDraftRaceLostError)
      ) {
        throw error;
      }

      const existing = await this.loadExistingPublishRun(fundId);
      if (!existing) {
        throw new Error('No draft to publish');
      }

      const run =
        existing.run.dispatchState === 'pending' || existing.run.dispatchState === 'partial'
          ? await this.dispatchCalcJobs(existing.run, queues, { redispatchExistingRun: true })
          : existing.run;

      return {
        published: existing.published,
        run,
        correlationId: run.correlationId,
      };
    }
  }

  /**
   * Atomic finalize: create fund + save draft config + publish in one call.
   * Orchestrates existing methods; no logic duplication.
   */
  async finalize(input: FinalizeInput, queues: PublishQueues): Promise<FinalizeResult> {
    if (!input.name || input.name.trim().length === 0) {
      throw new Error('Fund name is required');
    }

    // Extract fund-level fields for createFundWithInitialDraft
    const currentYear = new Date().getFullYear();
    const fundInput: CreateFundInput = {
      name: input.name.trim(),
      size: String(input.size),
      managementFee: String(input.managementFee ?? 0.02),
      carryPercentage: String(input.carryPercentage ?? 0.2),
      vintageYear: input.vintageYear ?? currentYear,
      ...(input.engineResults != null && { engineResults: input.engineResults }),
    };

    // Extract draft config fields (everything except fund-level fields)
    const {
      draftFundId: _draftFundId,
      name: _name,
      size: _size,
      managementFee: _mf,
      carryPercentage: _cp,
      vintageYear: _vy,
      modelVersion: _mv,
      engineResults: _er,
      ...draftConfig
    } = input;

    // Build config object matching FundDraftWriteV1 shape for persistence
    const configInput: Record<string, unknown> = {
      fundName: input.name.trim(),
      fundSize: input.size,
      vintageYear: input.vintageYear ?? currentYear,
      managementFeeRate: (input.managementFee ?? 0.02) * 100,
      carriedInterest: (input.carryPercentage ?? 0.2) * 100,
      ...draftConfig,
    };

    const draftFundId =
      Number.isInteger(input.draftFundId) && Number(input.draftFundId) > 0
        ? Number(input.draftFundId)
        : null;

    if (draftFundId != null) {
      const draft = await this.syncExistingDraftForFinalize(draftFundId, fundInput, configInput);
      if (!draft) {
        throw new NoActiveDraftForFinalizeError(draftFundId);
      }

      const publishResult = await this.publishDraft(draftFundId, queues);

      return {
        fundId: draftFundId,
        configVersion: publishResult.published.version,
        correlationId: publishResult.correlationId,
        runId: publishResult.run.id,
        dispatchState: publishResult.run.dispatchState,
        published: true,
      };
    }

    // Step 1+2: Create fund with initial draft containing full config
    const { fund, draft } = await this.createFundWithInitialDraft(fundInput, configInput);

    // Step 3: Publish the draft (creates calcRun, dispatches engines)
    const publishResult = await this.publishDraft(fund.id, queues);

    return {
      fundId: fund.id,
      configVersion: draft.version,
      correlationId: publishResult.correlationId,
      runId: publishResult.run.id,
      dispatchState: publishResult.run.dispatchState,
      published: true,
    };
  }

  private async syncExistingDraftForFinalize(
    fundId: number,
    fundInput: CreateFundInput,
    configInput: Record<string, unknown>
  ): Promise<FundConfig | null> {
    const gatedConfigInput = omitEconomicsAssumptionsWhenDisabled(configInput);

    return await db.transaction(async (tx) => {
      const [draft] = await tx
        .update(fundConfigs)
        .set({ config: gatedConfigInput, updatedAt: new Date() })
        .where(and(eq(fundConfigs.fundId, fundId), eq(fundConfigs.isDraft, true)))
        .returning();

      if (!draft) {
        return null;
      }

      const updateValues: Partial<typeof funds.$inferInsert> = {
        name: fundInput.name,
        size: fundInput.size,
        managementFee: fundInput.managementFee,
        carryPercentage: fundInput.carryPercentage,
        vintageYear: fundInput.vintageYear,
      };
      if (fundInput.engineResults != null) {
        updateValues.engineResults = fundInput.engineResults;
      }

      const [fund] = await tx
        .update(funds)
        .set(updateValues)
        .where(eq(funds.id, fundId))
        .returning();

      if (!fund) {
        throw new Error(`No fund exists with ID: ${fundId}`);
      }

      await tx.insert(fundEvents).values({
        fundId,
        eventType: 'DRAFT_SAVED',
        eventTime: new Date(),
      });

      return draft;
    });
  }

  async recalculatePublished(
    fundId: number,
    queues: PublishQueues,
    userId?: number
  ): Promise<RecalcResult> {
    const { v4: generateUuid } = await import('uuid');

    // 1. Load fund state to check preconditions
    const state = await fundStateReadService.getState(fundId);
    if (!state || !state.configState.hasPublished) {
      throw new NoPublishedConfigError();
    }

    const calcStatus = state.calculationState.status;
    if (calcStatus === 'submitted' || calcStatus === 'calculating') {
      throw new CalculationInProgressError();
    }

    // 2. Load the published fundConfig
    const publishedConfig = await db.query.fundConfigs.findFirst({
      where: and(eq(fundConfigs.fundId, fundId), eq(fundConfigs.isPublished, true)),
      orderBy: (configs, { desc }) => desc(configs.version),
    });

    if (!publishedConfig) {
      throw new NoPublishedConfigError();
    }

    const engines = this.getEnginesForConfig(publishedConfig.config);

    // 3. Check for existing calcRun for this configVersion
    const existingRun = await db.query.calcRuns.findFirst({
      where: and(eq(calcRuns.fundId, fundId), eq(calcRuns.configVersion, publishedConfig.version)),
      orderBy: (runs, { desc }) => desc(runs.requestedAt),
    });

    // 4. If pending or partial: redispatch existing run (no new transaction)
    if (
      existingRun &&
      (existingRun.dispatchState === 'pending' || existingRun.dispatchState === 'partial')
    ) {
      const redispatched = await this.dispatchCalcJobs(existingRun, queues, {
        redispatchExistingRun: true,
      });
      return { run: redispatched, correlationId: existingRun.correlationId };
    }

    // 5. Failed or no existing run: create new calcRun in transaction
    const correlationId = generateUuid();

    const newRun = await db.transaction(async (tx) => {
      const [run] = await tx
        .insert(calcRuns)
        .values({
          fundId,
          configId: publishedConfig.id,
          configVersion: publishedConfig.version,
          correlationId,
          engines,
          dispatchState: 'pending',
          requestedAt: new Date(),
        })
        .returning();

      if (!run) throw new Error('Failed to create calcRun');

      await tx.insert(fundEvents).values({
        fundId,
        eventType: 'CALC_TRIGGERED',
        eventTime: new Date(),
        payload: { engines, correlationId },
        ...(userId != null && { userId }),
        correlationId,
      });

      return run;
    });

    // 6. Dispatch
    const dispatchedRun = await this.dispatchCalcJobs(newRun, queues);
    return { run: dispatchedRun, correlationId };
  }

  private async dispatchCalcJobs(
    run: CalcRun,
    queues: PublishQueues,
    options: { redispatchExistingRun?: boolean } = {}
  ): Promise<CalcRun> {
    const targetEngines = await this.getDispatchTargets(
      run,
      options.redispatchExistingRun === true
    );
    if (targetEngines.length === 0) {
      return run;
    }

    const jobData: PublishJobData = {
      fundId: run.fundId,
      correlationId: run.correlationId,
      runId: run.id,
      configId: run.configId,
      configVersion: run.configVersion,
    };

    const jobOptions = {
      removeOnComplete: true,
      removeOnFail: false,
    };

    const queueByEngine: Record<string, Queue | null> = {
      reserve: queues.reserve,
      pacing: queues.pacing,
      cohort: queues.cohort,
      economics: queues.economics ?? null,
    };

    let dispatched = 0;
    let failed = 0;
    let lastError: string | null = null;

    for (const engine of targetEngines) {
      const queue = queueByEngine[engine] ?? null;
      if (queue) {
        try {
          const jobId = `run:${run.id}:${engine}`;
          await queue.add('calculate', jobData, { ...jobOptions, jobId });
          dispatched++;
          continue;
        } catch (err) {
          failed++;
          lastError = err instanceof Error ? err.message : String(err);
          console.error(`Failed to dispatch ${engine} job for run ${run.id}:`, err);
          continue;
        }
      }

      const descriptor = getCalculationEngineDescriptor(engine);
      const inlineExecution = inlineExecutionByEngine[engine];
      if (descriptor.syncCapable && inlineExecution) {
        try {
          await inlineExecution(jobData);
          dispatched++;
          continue;
        } catch (err) {
          failed++;
          const detail = err instanceof Error ? err.message : String(err);
          lastError = `Inline ${engine} calculation failed: ${detail}`;
          console.error(`Failed inline ${engine} calculation for run ${run.id}:`, err);
          continue;
        }
      }

      failed++;
      lastError = `No execution path configured for ${engine} calculations`;
    }

    let newState: DispatchState;
    if (failed === 0 && dispatched > 0) {
      newState = 'dispatched';
    } else if (dispatched > 0 && failed > 0) {
      newState = 'partial';
    } else {
      newState = 'failed';
    }

    const updateValues: Record<string, unknown> = {
      dispatchState: newState,
    };
    if (newState === 'dispatched' || newState === 'partial') {
      updateValues['dispatchedAt'] = new Date();
    }
    if (newState === 'failed') {
      updateValues['failedAt'] = new Date();
    }
    if (lastError) {
      updateValues['lastError'] = lastError;
    }

    const [updatedRun] = await db
      .update(calcRuns)
      .set(updateValues)
      .where(eq(calcRuns.id, run.id))
      .returning();

    return updatedRun ?? ({ ...run, ...updateValues } as CalcRun);
  }

  private async loadExistingPublishRun(
    fundId: number
  ): Promise<{ published: FundConfig; run: CalcRun } | null> {
    const published = await db.query.fundConfigs.findFirst({
      where: and(eq(fundConfigs.fundId, fundId), eq(fundConfigs.isPublished, true)),
      orderBy: (configs, { desc }) => desc(configs.version),
    });

    if (!published) {
      return null;
    }

    const run = await db.query.calcRuns.findFirst({
      where: and(eq(calcRuns.fundId, fundId), eq(calcRuns.configVersion, published.version)),
      orderBy: (runs, { desc }) => desc(runs.requestedAt),
    });

    if (!run) {
      return null;
    }

    if (
      run.dispatchState !== 'pending' &&
      run.dispatchState !== 'partial' &&
      run.dispatchState !== 'dispatched'
    ) {
      return null;
    }

    return { published, run };
  }

  private getEnginesForConfig(config: unknown): FundCalculationEngineKey[] {
    const engines: FundCalculationEngineKey[] = [...AUTHORITATIVE_ENGINE_KEYS];
    if (!isFlagEnabled('enable_gp_economics_engine')) {
      return engines;
    }

    const parsedConfig = FundDraftWriteV1Schema.safeParse(config);
    if (parsedConfig.success && parsedConfig.data.economicsAssumptions != null) {
      engines.push('economics');
    }

    return engines;
  }

  private isDispatchableEngineKey(engine: string): engine is FundCalculationEngineKey {
    return isAuthoritativeEngineKey(engine) || engine === 'economics';
  }

  private async getDispatchTargets(
    run: CalcRun,
    redispatchExistingRun: boolean
  ): Promise<FundCalculationEngineKey[]> {
    const runEngines = run.engines.filter((engine): engine is FundCalculationEngineKey =>
      this.isDispatchableEngineKey(engine)
    );

    if (!redispatchExistingRun || run.dispatchState !== 'partial') {
      return [...runEngines];
    }

    const snapshots = await db.query.fundSnapshots.findMany({
      where: and(eq(fundSnapshots.runId, run.id), isNull(fundSnapshots.scenarioSetId)),
      columns: {
        type: true,
      },
    });

    const snapshotTypes = new Set(snapshots.map((snapshot) => snapshot.type));

    return runEngines.filter((engine) => {
      const descriptor = getCalculationEngineDescriptor(engine);
      return !snapshotTypes.has(descriptor.snapshotType);
    });
  }
}

export const fundPersistenceService = new FundPersistenceService();
