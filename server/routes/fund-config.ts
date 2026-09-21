import type { Express, Request, Response } from 'express';
import { db } from '../db';
import { PARTNER_WRITE_ROLES } from '@shared/auth/effective-roles';
import { fundConfigs, fundEvents, fundSnapshots } from '@shared/schema';
import { eq, and, desc, isNull, sql } from 'drizzle-orm';
import type { ApiError } from '@shared/types';
import { toNumber } from '@shared/number';
import { createRouteLogger } from '../lib/route-logger.js';
import { requireWriteRole } from '../lib/auth/jwt.js';
import type { PublishQueues } from '../services/fund-persistence-service.js';
import { FundDraftWriteV1Schema } from '@shared/contracts/fund-draft-write-v1.contract';
import { sendApiError } from '../lib/apiError';
import { enforceProvidedFundScope } from '../lib/auth/provided-fund-scope';
import { creatorUserIdFromRequest, renewCreationCredential } from '../lib/auth/creator-identity';
import { handleNumberParseError } from '../lib/number-parse-error';
import {
  draftETag,
  draftResponse,
  executeFundWorkflowCommand,
  fundWorkflowHeaders,
  fundWorkflowWritesAllowed,
  sendFundWorkflowError,
  setFundWorkflowResponseHeaders,
} from '../services/fund-workflow-service';
import { omitEconomicsAssumptionsWhenDisabled } from '../services/economics-feature-gate';
import { parseScenarioRepresentation } from '../lib/scenario-representation.js';

const routeLog = createRouteLogger('fund-config');

// Reserve and pacing have synchronous engines. Cohort is experimental and is
// excluded from authoritative dispatch. Their former application-process queues
// have no G3 production consumer, so the API never creates route-owned queues.
const inlineCalculationQueues: PublishQueues = {
  reserve: null,
  pacing: null,
  cohort: null,
};

function numericIdentity(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === 'string' && /^[1-9]\d*$/.test(value)) {
    return Number.parseInt(value, 10);
  }
  return undefined;
}

function optionalNumericUserId(req: Request): number | undefined {
  const user = req.user as (Express.User & { userId?: unknown }) | undefined;
  return numericIdentity(user?.userId) ?? numericIdentity(user?.id) ?? numericIdentity(user?.sub);
}

async function getScopedFundId(req: Request, res: Response): Promise<number | null> {
  let fundId: number;
  try {
    fundId = toNumber(req.params['id'], 'fund ID', { integer: true, min: 1 });
  } catch (err) {
    if (handleNumberParseError(err, res, 'Invalid fund ID')) {
      return null;
    }
    throw err;
  }

  if (!(await enforceProvidedFundScope(req, res, fundId))) {
    return null;
  }

  return fundId;
}

export function registerFundConfigRoutes(app: Express) {
  // Atomic finalize: create fund + save config + publish in one call
  app.post(
    '/api/funds/finalize',
    requireWriteRole(PARTNER_WRITE_ROLES),
    fundWorkflowWritesAllowed,
    async (req: Request, res: Response) => {
      try {
        const { FundFinalizeV1Schema: Schema } =
          await import('@shared/contracts/fund-finalize-v1.contract');
        const validation = Schema.safeParse(req.body);
        if (!validation.success) {
          return sendApiError(res, 400, {
            error: 'Finalize payload is invalid',
            code: 'FINALIZE_VALIDATION_ERROR',
            issues: validation.error.issues.map((i) => ({ path: i.path, message: i.message })),
          });
        }

        const creatorUserId = creatorUserIdFromRequest(req);
        if (creatorUserId === undefined) {
          return sendApiError(res, 401, {
            error: 'Authentication identity is invalid',
            code: 'INVALID_AUTHENTICATION_IDENTITY',
          });
        }

        const draftFundId = validation.data.draftFundId;
        if (draftFundId != null && !(await enforceProvidedFundScope(req, res, draftFundId))) {
          return;
        }

        const { fundPersistenceService } = await import('../services/fund-persistence-service');
        const result = await executeFundWorkflowCommand(
          {
            actorId: creatorUserId,
            operation: 'finalize',
            ...fundWorkflowHeaders(req, draftFundId != null),
            targetFundId: draftFundId ?? null,
            unrestricted: req.user?.role === 'admin',
            body: {
              ...validation.data,
              vintageYear:
                (req.body as Record<string, unknown>)['vintageYear'] === undefined
                  ? null
                  : validation.data.vintageYear,
            },
          },
          async () => {
            const published = await fundPersistenceService.finalize(
              { ...validation.data, creatorUserId },
              inlineCalculationQueues,
              { command: true }
            );
            const [config] = await db
              .select()
              .from(fundConfigs)
              .where(
                and(
                  eq(fundConfigs.fundId, published.fundId),
                  eq(fundConfigs.version, published.configVersion)
                )
              );
            if (!config) throw new Error('Published config missing');
            return {
              status: 201,
              body: { success: true, data: published },
              etag: draftETag(config),
              fundId: published.fundId,
              configId: config.id,
              runId: published.runId,
            };
          }
        );
        const credentialRenewal = await renewCreationCredential(
          req,
          res,
          result.fundId,
          creatorUserId
        );

        setFundWorkflowResponseHeaders(res, result);
        res.status(result.status).json({ ...result.body, ...credentialRenewal });
      } catch (error) {
        if (sendFundWorkflowError(res, error)) return;
        if (error instanceof Error && error.name === 'NoActiveDraftForFinalizeError') {
          return sendApiError(res, 409, {
            error: error.message,
            code: 'NO_ACTIVE_DRAFT',
          });
        }

        routeLog.error('Finalize failed', { code: 'FINALIZE_FAILED' });
        const apiError: ApiError = {
          error: 'Failed to finalize fund',
          message: 'Publication could not be confirmed; retry the same command',
        };
        res.status(500).json(apiError);
      }
    }
  );

  // Full replacement of the active draft under its acknowledged revision.
  app.put(
    '/api/funds/:id/draft',
    requireWriteRole(PARTNER_WRITE_ROLES),
    fundWorkflowWritesAllowed,
    async (req: Request, res: Response) => {
      try {
        const actorId = creatorUserIdFromRequest(req);
        if (actorId === undefined)
          return sendApiError(res, 401, {
            error: 'Authentication identity is invalid',
            code: 'INVALID_AUTHENTICATION_IDENTITY',
          });
        const fundId = await getScopedFundId(req, res);
        if (fundId === null) return;
        const validation = FundDraftWriteV1Schema.safeParse(req.body);
        if (!validation.success)
          return sendApiError(res, 400, {
            error: 'Draft configuration is invalid',
            code: 'DRAFT_VALIDATION_ERROR',
            issues: validation.error.issues.map((i) => ({ path: i.path, message: i.message })),
          });
        const result = await executeFundWorkflowCommand(
          {
            actorId,
            operation: 'save_draft',
            ...fundWorkflowHeaders(req, true),
            targetFundId: fundId,
            body: validation.data,
            unrestricted: req.user?.role === 'admin',
          },
          async (draft) => {
            if (!draft) throw new Error('Active draft missing');
            const [saved] = await db
              .update(fundConfigs)
              .set({
                config: omitEconomicsAssumptionsWhenDisabled(validation.data),
                updatedAt: new Date(),
                draftRevision: sql`${fundConfigs.draftRevision} + 1`,
              })
              .where(eq(fundConfigs.id, draft.id))
              .returning();
            if (!saved) throw new Error('Draft save failed');
            await db
              .insert(fundEvents)
              .values({ fundId, userId: actorId, eventType: 'DRAFT_SAVED', eventTime: new Date() });
            return {
              status: 200,
              fundId,
              configId: saved.id,
              etag: draftETag(saved),
              body: {
                success: true,
                data: draftResponse(saved),
                message: 'Draft saved successfully',
              },
            };
          }
        );
        setFundWorkflowResponseHeaders(res, result);
        res.status(result.status).json(result.body);
      } catch (error) {
        if (sendFundWorkflowError(res, error)) return;
        routeLog.error('Draft save failed', { code: 'DRAFT_SAVE_FAILED' });
        res.status(500).json({
          error: 'Failed to save draft',
          message: 'Save could not be confirmed; retry the same command',
        });
      }
    }
  );

  // Get latest draft
  app['get']('/api/funds/:id/draft', async (req: Request, res: Response) => {
    try {
      const fundId = await getScopedFundId(req, res);
      if (fundId === null) {
        return;
      }

      const [draft] = await db
        .select()
        .from(fundConfigs)
        .where(and(eq(fundConfigs.fundId, fundId), eq(fundConfigs.isDraft, true)))
        .orderBy(desc(fundConfigs.version))
        .limit(1);

      if (!draft) {
        const error: ApiError = {
          error: 'No draft found',
          message: 'No draft configuration exists for this fund',
        };
        return res.status(404).json(error);
      }

      res.setHeader('ETag', draftETag(draft));
      res.setHeader('Cache-Control', 'no-store');
      res.json(draftResponse(draft));
    } catch (error) {
      const apiError: ApiError = {
        error: 'Failed to fetch draft',
        message: error instanceof Error ? error.message : 'Unknown error',
      };
      res.status(500).json(apiError);
    }
  });

  // Publication shares the same durable command and revision guard as finalize.
  app.post(
    '/api/funds/:id/publish',
    requireWriteRole(PARTNER_WRITE_ROLES),
    fundWorkflowWritesAllowed,
    async (req: Request, res: Response) => {
      try {
        const actorId = creatorUserIdFromRequest(req);
        if (actorId === undefined)
          return sendApiError(res, 401, {
            error: 'Authentication identity is invalid',
            code: 'INVALID_AUTHENTICATION_IDENTITY',
          });
        const fundId = await getScopedFundId(req, res);
        if (fundId === null) return;
        const { fundPersistenceService } = await import('../services/fund-persistence-service');
        const result = await executeFundWorkflowCommand(
          {
            actorId,
            operation: 'publish_draft',
            ...fundWorkflowHeaders(req, true),
            targetFundId: fundId,
            body: req.body ?? {},
            unrestricted: req.user?.role === 'admin',
          },
          async () => {
            const published = await fundPersistenceService.publishDraft(
              fundId,
              inlineCalculationQueues,
              actorId,
              { command: true }
            );
            return {
              status: 200,
              fundId,
              configId: published.published.id,
              runId: published.run.id,
              etag: draftETag(published.published),
              body: {
                success: true,
                data: draftResponse(published.published),
                message: 'Configuration published and calculations started',
                correlationId: published.correlationId,
                runId: published.run.id,
                dispatchState: published.run.dispatchState,
              },
            };
          }
        );
        setFundWorkflowResponseHeaders(res, result);
        res.status(result.status).json(result.body);
      } catch (error) {
        if (sendFundWorkflowError(res, error)) return;
        if (error instanceof Error && error.name === 'ModelInputsAsOfDateRequiredError') {
          return sendApiError(res, 422, {
            error: error.message,
            code: 'MODEL_INPUTS_AS_OF_DATE_REQUIRED',
          });
        }
        routeLog.error('Publish failed', { code: 'PUBLISH_FAILED' });
        res.status(500).json({
          error: 'Failed to publish configuration',
          message: 'Publication could not be confirmed; retry the same command',
        });
      }
    }
  );

  // Recalculate published configuration
  app.post(
    '/api/funds/:id/recalculate',
    requireWriteRole(PARTNER_WRITE_ROLES),
    async (req: Request, res: Response) => {
      try {
        const fundId = await getScopedFundId(req, res);
        if (fundId === null) {
          return;
        }

        const userId = optionalNumericUserId(req);

        const { fundPersistenceService } = await import('../services/fund-persistence-service');

        const result = await fundPersistenceService.recalculatePublished(
          fundId,
          inlineCalculationQueues,
          userId
        );

        res.json({
          success: true,
          correlationId: result.correlationId,
          runId: result.run.id,
          dispatchState: result.run.dispatchState,
        });
      } catch (error) {
        if (error instanceof Error && error.name === 'NoPublishedConfigError') {
          const apiError: ApiError = {
            error: 'No published configuration',
            message: 'Publish a configuration first',
          };
          return res.status(400).json(apiError);
        }
        if (error instanceof Error && error.name === 'CalculationInProgressError') {
          const apiError: ApiError = {
            error: 'Calculation already in progress',
            message: 'Wait for the current calculation to complete',
          };
          return res.status(409).json(apiError);
        }
        routeLog.error('Recalculate error:', error);
        const apiError: ApiError = {
          error: 'Failed to recalculate',
          message: error instanceof Error ? error.message : 'Unknown error',
        };
        res.status(500).json(apiError);
      }
    }
  );

  // Get fund reserves (from snapshots)
  app['get']('/api/funds/:id/reserves', async (req: Request, res: Response) => {
    try {
      const fundId = await getScopedFundId(req, res);
      if (fundId === null) {
        return;
      }

      const [snapshot] = await db
        .select()
        .from(fundSnapshots)
        .where(
          and(
            eq(fundSnapshots.fundId, fundId),
            eq(fundSnapshots.type, 'RESERVE'),
            isNull(fundSnapshots.scenarioSetId)
          )
        )
        .orderBy(desc(fundSnapshots.createdAt))
        .limit(1);

      if (!snapshot) {
        const error: ApiError = {
          error: 'No reserve calculations found',
          message: 'Publish a fund configuration to trigger calculations',
        };
        return res.status(404).json(error);
      }

      // Check if snapshot is stale (> 24 hours old)
      const isStale = snapshot.createdAt
        ? new Date().getTime() - snapshot.createdAt.getTime() > 24 * 60 * 60 * 1000
        : true;

      res.json({
        reserves: snapshot.payload,
        calculatedAt: snapshot.createdAt,
        version: snapshot.calcVersion,
        correlationId: snapshot.correlationId,
        stale: isStale,
      });
    } catch (error) {
      const apiError: ApiError = {
        error: 'Failed to fetch reserves',
        message: error instanceof Error ? error.message : 'Unknown error',
      };
      res.status(500).json(apiError);
    }
  });

  // Get fund lifecycle state (two-axis: config + calculation)
  app['get']('/api/funds/:id/state', async (req: Request, res: Response) => {
    try {
      const fundId = await getScopedFundId(req, res);
      if (fundId === null) {
        return;
      }

      const { fundStateReadService } = await import('../services/fund-state-read-service');
      const state = await fundStateReadService.getState(fundId);

      if (!state) {
        const error: ApiError = {
          error: 'Fund not found',
          message: `No fund exists with ID: ${fundId}`,
        };
        return res.status(404).json(error);
      }

      res.json(state);
    } catch (error) {
      routeLog.error('Fund state read error:', error);
      const apiError: ApiError = {
        error: 'Failed to read fund state',
        message: error instanceof Error ? error.message : 'Unknown error',
      };
      res.status(500).json(apiError);
    }
  });

  // GET /api/funds/:id/results -- Phase 3 results read model
  app.get('/api/funds/:id/results', async (req: Request, res: Response) => {
    try {
      const fundId = await getScopedFundId(req, res);
      if (fundId === null) {
        return;
      }

      const representation = parseScenarioRepresentation(req, res);
      if (representation === null) return;
      if (representation) {
        return res.status(406).json({
          error: 'scenario_representation_not_applicable',
          message: 'The fund results aggregate supports legacy scenarios only',
        });
      }
      const { fundResultsReadService } = await import('../services/fund-results-read-service');
      const results = await fundResultsReadService.getResults(fundId);
      if (!results) {
        return res.status(404).json({ error: 'Fund not found' });
      }
      return res.json(results);
    } catch (err) {
      routeLog.error('[fund-results] Error:', err);
      return res.status(500).json({ error: 'Failed to read fund results' });
    }
  });

  // GET /api/funds/:id/lifecycle-history -- M6 lifecycle history read model
  app['get']('/api/funds/:id/lifecycle-history', async (req: Request, res: Response) => {
    try {
      const fundId = await getScopedFundId(req, res);
      if (fundId === null) {
        return;
      }

      const { fundLifecycleHistoryService } =
        await import('../services/fund-lifecycle-history-service');
      const history = await fundLifecycleHistoryService.getHistory(fundId);

      if (!history) {
        const error: ApiError = {
          error: 'Fund not found',
          message: `No fund exists with ID: ${fundId}`,
        };
        return res.status(404).json(error);
      }

      res.json(history);
    } catch (error) {
      routeLog.error('[lifecycle-history] Error:', error);
      const apiError: ApiError = {
        error: 'Failed to read lifecycle history',
        message: error instanceof Error ? error.message : 'Unknown error',
      };
      res.status(500).json(apiError);
    }
  });

  // GET /api/funds/:id/results-comparison -- Post-stabilization results comparison read model
  // Summary-level comparison only: this route is intentionally narrow and must
  // not be treated as automatic authorization for broader PR4 live-surface
  // rollout or generic forecasting API expansion.
  app['get']('/api/funds/:id/results-comparison', async (req: Request, res: Response) => {
    try {
      const fundId = await getScopedFundId(req, res);
      if (fundId === null) {
        return;
      }

      const { fundResultsComparisonService } =
        await import('../services/fund-results-comparison-service');
      const comparison = await fundResultsComparisonService.getComparison(fundId);

      if (!comparison) {
        const error: ApiError = {
          error: 'Fund not found',
          message: `No fund exists with ID: ${fundId}`,
        };
        return res.status(404).json(error);
      }

      res.json(comparison);
    } catch (error) {
      routeLog.error('[results-comparison] Error:', error);
      const apiError: ApiError = {
        error: 'Failed to read results comparison',
        message: error instanceof Error ? error.message : 'Unknown error',
      };
      res.status(500).json(apiError);
    }
  });
}
