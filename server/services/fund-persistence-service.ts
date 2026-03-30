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
import { eq, and, max } from 'drizzle-orm';
import type { Fund, FundConfig, CalcRun, DispatchState } from '@shared/schema/fund';
import type { EngineResults } from '@shared/schemas/engine-results-schema';
import {
  AUTHORITATIVE_ENGINE_KEYS,
  getCalculationEngineDescriptor,
  isAuthoritativeEngineKey,
  type AuthoritativeEngineKey,
} from '@shared/contracts/fund-authoritative-calculations.contract';
import type { Queue } from 'bullmq';
import { runReserveCalculation } from './reserve-calculation-service';
import { runPacingCalculation } from './pacing-calculation-service';
import { fundStateReadService } from './fund-state-read-service';

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

const inlineExecutionByEngine: Record<
  AuthoritativeEngineKey,
  (jobData: PublishJobData) => Promise<unknown>
> = {
  reserve: runReserveCalculation,
  pacing: runPacingCalculation,
};

export interface FinalizeInput {
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
          config: configInput ?? {},
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
    const engines = [...AUTHORITATIVE_ENGINE_KEYS];

    try {
      const created = await db.transaction(async (tx) => {
        const draft = await tx.query.fundConfigs.findFirst({
          where: and(eq(fundConfigs.fundId, fundId), eq(fundConfigs.isDraft, true)),
          orderBy: (configs, { desc }) => desc(configs.version),
        });

        if (!draft) {
          throw new NoPublishableDraftError();
        }

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
      ...draftConfig,
    };

    // Step 1+2: Create fund with initial draft containing full config
    const { fund, draft } = await this.createFundWithInitialDraft(fundInput, configInput);

    // Step 3: Publish the draft (creates calcRun, dispatches engines)
    const publishResult = await this.publishDraft(fund.id, queues);

    return {
      fundId: fund.id,
      configVersion: draft.version,
      correlationId: publishResult.correlationId,
      published: true,
    };
  }

  async recalculatePublished(
    fundId: number,
    queues: PublishQueues,
    userId?: number
  ): Promise<RecalcResult> {
    const { v4: generateUuid } = await import('uuid');
    const engines = [...AUTHORITATIVE_ENGINE_KEYS];

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

      if (isAuthoritativeEngineKey(engine)) {
        const descriptor = getCalculationEngineDescriptor(engine);
        if (descriptor.syncCapable) {
          try {
            await inlineExecutionByEngine[engine](jobData);
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

  private async getDispatchTargets(
    run: CalcRun,
    redispatchExistingRun: boolean
  ): Promise<AuthoritativeEngineKey[]> {
    const runEngines = run.engines.filter((engine): engine is AuthoritativeEngineKey =>
      isAuthoritativeEngineKey(engine)
    );

    if (!redispatchExistingRun || run.dispatchState !== 'partial') {
      return [...runEngines];
    }

    const snapshots = await db.query.fundSnapshots.findMany({
      where: eq(fundSnapshots.runId, run.id),
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
