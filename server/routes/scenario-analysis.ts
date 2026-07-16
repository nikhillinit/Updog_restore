/**
 * Scenario Analysis API Routes
 *
 * Implements deal-level scenario modeling with optimistic locking, audit logging,
 * and reserves optimization.
 */

import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { db } from '../db';
import {
  FundCompanyActualsCurrencyStatusSchema,
  Sha256Schema,
} from '@shared/contracts/fund-actuals/fund-company-actuals-fact.contract';
import { DatasetTrustStateSchema } from '@shared/contracts/provenance-envelope.contract';
import { ScenarioCaseSeedV1Schema } from '@shared/contracts/scenarios/scenario-case-seed-v1.contract';
import { DecimalStringSchema } from '@shared/contracts/lp-reporting/cash-flow-event.contract';
import {
  scenarios,
  scenarioCases,
  scenarioAuditLogs,
  scenarioCaseSeedProvenance,
} from '@shared/schema';
import { FundIdParamSchema } from '@shared/schemas/portfolio-route';
import { parseFundIdParam } from '@shared/number';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import {
  calculateWeightedSummary,
  validateProbabilities,
  normalizeProbabilities,
  addMOICToCases,
} from '@shared/utils/scenario-math';
import type { ScenarioCase } from '@shared/types/scenario';
import { requireAuth, requireFundAccess, requireWriteRole } from '../lib/auth/jwt.js';
import { FEATURES } from '../config/features.js';
import { firstString } from '../lib/request-values';
import { createRouteLogger } from '../lib/route-logger.js';
import { enforceCompanyFundScope, resolveCompanyFundId } from '../lib/auth/company-fund-scope';
import {
  buildFundCompanyActualsFacts,
  FundActualsFactsServiceError,
} from '../services/fund-actuals/fund-company-actuals-facts-service';
import { buildScenarioCaseSeed } from '../services/scenarios/scenario-case-seed-service';
import {
  createScenarioCaseFromSeed,
  ScenarioCaseSeedPersistenceError,
} from '../services/scenarios/scenario-case-seed-persistence-service';
import {
  CompanyScenarioCreateIdempotencyConflictError,
  CompanyScenarioCreateInProgressError,
  CompanyScenarioCreateScopeError,
  createCompanyScenario,
} from '../services/scenarios/company-scenario-create-service';

const routeLog = createRouteLogger('scenario-analysis');
const WRITE_SCENARIO_ROLES = ['partner', 'admin', 'analyst'] as const;

const router = Router();

// ============================================================================
// Validation Schemas
// ============================================================================

const ScenarioCaseSchema = z.object({
  case_name: z.string().min(1).max(255),
  description: z.string().optional(),
  probability: z.number().min(0).max(1),
  investment: z.number().min(0),
  follow_ons: z.number().min(0),
  exit_proceeds: z.number().min(0),
  exit_valuation: z.number().min(0),
  months_to_exit: z.number().int().positive().optional(),
  ownership_at_exit: z.number().min(0).max(1).optional(),
});

const UpdateScenarioRequestSchema = z.object({
  scenario_id: z.string().uuid(),
  cases: z.array(ScenarioCaseSchema),
  normalize: z.boolean().optional(),
  version: z.number().int().optional(), // Optimistic locking
});

const CreateScenarioSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
});

const CompanyScenarioSummarySchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    version: z.number().int(),
    updatedAt: z.string().datetime(),
    isLocked: z.boolean(),
    caseCount: z.number().int().nonnegative(),
  })
  .strict();

const CompanyScenarioListResponseSchema = z.array(CompanyScenarioSummarySchema);

const ReserveSuggestionsSchema = z.object({
  scenario_id: z.string(),
});

const ScenarioSeedQuerySchema = z
  .object({
    asOfDate: z.string().date().optional(),
  })
  .strict();

const ScenarioSeedResponseSchema = z.discriminatedUnion('factsStatus', [
  z
    .object({
      fundId: z.number().int().positive(),
      asOfDate: z.string().date(),
      factsStatus: z.literal('available'),
      factsInputHash: Sha256Schema,
      seeds: z.array(ScenarioCaseSeedV1Schema),
    })
    .strict(),
  z
    .object({
      fundId: z.number().int().positive(),
      asOfDate: z.string().date(),
      factsStatus: z.literal('failed'),
      factsInputHash: z.null(),
      seeds: z.array(ScenarioCaseSeedV1Schema).max(0),
    })
    .strict(),
]);

const NonnegativeDecimalStringSchema = DecimalStringSchema.refine(
  (value) => Number(value) >= 0,
  'Must be a non-negative decimal string'
);

const FractionDecimalStringSchema = NonnegativeDecimalStringSchema.refine(
  (value) => Number(value) <= 1,
  'Must be between 0 and 1'
);

const ScenarioCaseSeedOverridesSchema = z
  .object({
    caseName: z.string().trim().min(1).max(255),
    probability: FractionDecimalStringSchema,
    exitValuation: NonnegativeDecimalStringSchema,
    monthsToExit: z.number().int().positive(),
    ownershipAtExit: FractionDecimalStringSchema,
    investment: NonnegativeDecimalStringSchema.optional(),
    followOns: NonnegativeDecimalStringSchema.optional(),
    fmv: NonnegativeDecimalStringSchema.optional(),
  })
  .strict();

const CreateScenarioCaseFromSeedRequestSchema = z
  .object({
    seed: ScenarioCaseSeedV1Schema,
    overrides: ScenarioCaseSeedOverridesSchema,
    expectedScenarioVersion: z.number().int(),
  })
  .strict();

const CreateScenarioCaseFromSeedResponseSchema = z
  .object({
    scenarioCaseId: z.string().uuid(),
    scenarioId: z.string().uuid(),
    scenarioVersion: z.number().int(),
    seededAt: z.string().datetime(),
    replay: z.boolean(),
  })
  .strict();

const ScenarioCaseSeedProvenanceReadSchema = z
  .object({
    facts_input_hash: Sha256Schema,
    facts_as_of_date: z.string().date(),
    seeded_at: z.string().datetime(),
    trust_state: DatasetTrustStateSchema,
    currency_status: FundCompanyActualsCurrencyStatusSchema,
    staleness: z.enum(['current', 'stale', 'unknown']),
  })
  .strict();

const ScenarioCaseReadSchema = z
  .object({
    id: z.string().optional(),
    case_name: z.string(),
    description: z.string().optional(),
    probability: z.number(),
    investment: z.number(),
    follow_ons: z.number(),
    exit_proceeds: z.number(),
    exit_valuation: z.number(),
    moic: z.number().optional(),
    months_to_exit: z.number().optional(),
    ownership_at_exit: z.number().optional(),
    seed_provenance: ScenarioCaseSeedProvenanceReadSchema.optional(),
  })
  .strict();

const ScenarioAnalysisReadResponseSchema = z
  .object({
    company_name: z.string(),
    company_id: z.string(),
    scenario: z
      .object({
        id: z.string(),
        company_id: z.string(),
        name: z.string(),
        description: z.string().optional(),
        version: z.number().int(),
        is_default: z.boolean(),
        locked_at: z.date().optional(),
        created_by: z.string().optional(),
        created_at: z.date(),
        updated_at: z.date(),
      })
      .strict(),
    cases: z.array(ScenarioCaseReadSchema),
    weighted_summary: z
      .object({
        moic: z.number().nullable(),
        investment: z.number(),
        follow_ons: z.number(),
        exit_proceeds: z.number(),
        exit_valuation: z.number(),
        months_to_exit: z.number().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

function failedScenarioSeedResponse(fundId: number, asOfDate: string) {
  return ScenarioSeedResponseSchema.parse({
    fundId,
    asOfDate,
    factsStatus: 'failed',
    factsInputHash: null,
    seeds: [],
  });
}

function validateScenarioSeedFundId(req: Request, res: Response, next: NextFunction) {
  const parsed = FundIdParamSchema.safeParse(req.params);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'invalid_fund_id',
      message: 'Fund ID must be a positive integer',
    });
  }
  next();
}

function validateScenarioIdParam(req: Request, res: Response, next: NextFunction) {
  const parsed = z.string().uuid().safeParse(req.params['scenarioId']);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'invalid_scenario_id',
      message: 'Scenario ID must be a UUID',
    });
  }
  next();
}

function statusForScenarioCaseSeedError(code: ScenarioCaseSeedPersistenceError['code']): number {
  switch (code) {
    case 'scenario_not_found':
      return 404;
    case 'scenario_locked':
      return 423;
    case 'version_conflict':
    case 'idempotency_conflict':
      return 409;
    case 'missing_required_override':
    case 'company_mismatch':
      return 400;
  }
}

// ============================================================================
// Middleware: User tracking for audit
// ============================================================================

// Extend Request type for scenario routes
interface ScenarioRequest extends Request {
  userId: string;
}

/**
 * Extract user ID for audit logging (use after requireAuth)
 */
function extractUserId(req: Request, _res: Response, next: () => void) {
  const userId = (req as { user?: { id: string } }).user?.id || 'system';
  (req as ScenarioRequest).userId = userId;
  next();
}

// ============================================================================
// Audit Logging Helper
// ============================================================================

async function auditLog(params: {
  userId: string;
  entityType: 'scenario' | 'scenario_case';
  entityId: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  diff?: Record<string, unknown>;
}) {
  await db.insert(scenarioAuditLogs).values({
    userId: params.userId,
    entityType: params.entityType,
    entityId: params.entityId,
    action: params.action,
    diff: params.diff,
    timestamp: new Date(),
  });
}

// ============================================================================
// Scenario CRUD (Deal-Level)
// ============================================================================

router['get'](
  '/companies/:companyId/scenarios',
  requireAuth(),
  async (req: Request, res: Response) => {
    try {
      const companyId = firstString(req.params['companyId']);
      const companyIdNum = parseFundIdParam(companyId);
      if (companyIdNum === null) {
        return res.status(400).json({ error: 'Invalid company ID' });
      }
      if (!(await enforceCompanyFundScope(req, res, companyIdNum))) {
        return;
      }

      const rows = await db
        .select({
          id: scenarios.id,
          name: scenarios.name,
          version: scenarios.version,
          updatedAt: scenarios.updatedAt,
          lockedAt: scenarios.lockedAt,
          caseCount: sql<number>`count(${scenarioCases.id})::int`,
        })
        .from(scenarios)
        .leftJoin(scenarioCases, eq(scenarioCases.scenarioId, scenarios.id))
        .where(eq(scenarios.companyId, companyIdNum))
        .groupBy(scenarios.id)
        .orderBy(desc(scenarios.updatedAt), asc(scenarios.id));

      return res.json(
        CompanyScenarioListResponseSchema.parse(
          rows.map((row) => ({
            id: row.id,
            name: row.name,
            version: row.version,
            updatedAt: row.updatedAt.toISOString(),
            isLocked: row.lockedAt !== null,
            caseCount: Number(row.caseCount),
          }))
        )
      );
    } catch (error: unknown) {
      routeLog.error('List company scenarios error:', error);
      return res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

router['get'](
  '/funds/:fundId/scenario-analysis/seeds',
  requireAuth(),
  validateScenarioSeedFundId,
  requireFundAccess,
  async (req: Request, res: Response) => {
    const { fundId } = FundIdParamSchema.parse(req.params);
    const parsedQuery = ScenarioSeedQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      return res.status(400).json({
        error: 'invalid_as_of_date',
        message: 'asOfDate must be YYYY-MM-DD when provided',
      });
    }
    const asOfDate = parsedQuery.data.asOfDate ?? new Date().toISOString().slice(0, 10);

    let facts: Awaited<ReturnType<typeof buildFundCompanyActualsFacts>>;
    try {
      facts = await buildFundCompanyActualsFacts({ fundId, asOfDate });
    } catch (error: unknown) {
      if (error instanceof FundActualsFactsServiceError && error.status === 404) {
        return res.status(404).json({ error: error.code, message: error.message });
      }
      routeLog.error('Scenario seed facts load failed:', error);
      return res.json(failedScenarioSeedResponse(fundId, asOfDate));
    }

    if (facts.fundId !== fundId || facts.asOfDate !== asOfDate) {
      routeLog.error(
        'Scenario seed facts scope mismatch:',
        new Error(
          `Requested fund ${fundId} as of ${asOfDate}, received fund ${facts.fundId} as of ${facts.asOfDate}`
        )
      );
      return res.json(failedScenarioSeedResponse(fundId, asOfDate));
    }

    return res.json(
      ScenarioSeedResponseSchema.parse({
        fundId,
        asOfDate,
        factsStatus: 'available',
        factsInputHash: facts.inputHash,
        seeds: facts.facts.map((fact) => buildScenarioCaseSeed({ fundId, fact, asOfDate })),
      })
    );
  }
);

router['post'](
  '/funds/:fundId/scenario-analysis/scenarios/:scenarioId/cases/from-seed',
  requireAuth(),
  requireWriteRole(WRITE_SCENARIO_ROLES),
  validateScenarioSeedFundId,
  requireFundAccess,
  validateScenarioIdParam,
  async (req: Request, res: Response) => {
    const { fundId } = FundIdParamSchema.parse(req.params);
    const scenarioId = z.string().uuid().parse(req.params['scenarioId']);
    if (!FEATURES.scenarioSeedPicker) {
      return res.status(404).json({ error: 'not_found' });
    }

    const parsedBody = CreateScenarioCaseFromSeedRequestSchema.safeParse(req.body);
    if (!parsedBody.success) {
      return res.status(400).json({
        error: 'invalid_request',
        message: 'Request body does not match the from-seed case creation contract',
      });
    }

    const idempotencyKey = req.get('Idempotency-Key')?.trim();
    if (!idempotencyKey) {
      return res.status(400).json({
        error: 'missing_idempotency_key',
        message: 'Idempotency-Key header is required',
      });
    }

    const { seed, overrides, expectedScenarioVersion } = parsedBody.data;
    if (seed.fundId !== fundId) {
      return res.status(400).json({
        error: 'seed_fund_mismatch',
        message: 'Seed fund ID must match the route fund ID',
      });
    }

    try {
      const companyFundId = await resolveCompanyFundId(seed.companyId);
      if (companyFundId !== fundId) {
        return res.status(400).json({
          error: 'company_mismatch',
          message: 'Seed company must belong to the route fund',
        });
      }

      const existingReplayRows = await db
        .select({ scenarioId: scenarioCases.scenarioId })
        .from(scenarioCaseSeedProvenance)
        .innerJoin(scenarioCases, eq(scenarioCases.id, scenarioCaseSeedProvenance.scenarioCaseId))
        .where(
          and(
            eq(scenarioCaseSeedProvenance.fundId, fundId),
            eq(scenarioCaseSeedProvenance.idempotencyKey, idempotencyKey)
          )
        )
        .limit(1);
      const existingReplay = existingReplayRows[0];
      if (existingReplay && existingReplay.scenarioId !== scenarioId) {
        return res.status(409).json({
          error: 'idempotency_conflict',
          message: 'Idempotency-Key is already associated with another scenario',
        });
      }
      if (!existingReplay) {
        const facts = await buildFundCompanyActualsFacts({ fundId, asOfDate: seed.asOfDate });
        const fact = facts.facts.find((candidate) => candidate.companyId === seed.companyId);
        const canonicalSeed =
          facts.fundId === fundId && facts.asOfDate === seed.asOfDate && fact
            ? buildScenarioCaseSeed({ fundId, fact, asOfDate: seed.asOfDate })
            : null;
        if (!canonicalSeed || !isDeepStrictEqual(seed, canonicalSeed)) {
          return res.status(409).json({
            error: 'seed_conflict',
            message: 'Seed no longer matches disclosed portfolio actuals. Refresh and try again.',
          });
        }
      }

      const actorUserId = (req as { user?: { id?: string } }).user?.id ?? null;
      const persistenceOverrides = {
        caseName: overrides.caseName,
        probability: overrides.probability,
        exitValuation: overrides.exitValuation,
        monthsToExit: overrides.monthsToExit,
        ownershipAtExit: overrides.ownershipAtExit,
        ...(overrides.investment !== undefined ? { investment: overrides.investment } : {}),
        ...(overrides.followOns !== undefined ? { followOns: overrides.followOns } : {}),
        ...(overrides.fmv !== undefined ? { fmv: overrides.fmv } : {}),
      };
      const created = await createScenarioCaseFromSeed({
        scenarioId,
        expectedScenarioVersion,
        seed,
        overrides: persistenceOverrides,
        actor: { userId: actorUserId },
        idempotencyKey,
      });
      const currentScenario = await db.query.scenarios.findFirst({
        where: eq(scenarios.id, scenarioId),
        columns: { version: true },
      });
      if (!currentScenario) {
        throw new Error('Scenario version unavailable after case creation');
      }

      return res.status(201).json(
        CreateScenarioCaseFromSeedResponseSchema.parse({
          scenarioCaseId: created.case.id,
          scenarioId: created.case.scenarioId,
          scenarioVersion: currentScenario.version,
          seededAt: created.provenance.seededAt.toISOString(),
          replay: created.replayed,
        })
      );
    } catch (error: unknown) {
      if (error instanceof ScenarioCaseSeedPersistenceError) {
        return res.status(statusForScenarioCaseSeedError(error.code)).json({
          error: error.code,
          message: error.message,
          ...(error.details !== undefined ? { details: error.details } : {}),
        });
      }
      routeLog.error('Create scenario case from seed failed:', error);
      return res.status(500).json({
        error: 'internal_error',
        message: 'Scenario case creation failed',
      });
    }
  }
);

/**
 * GET /api/companies/:companyId/scenarios/:scenarioId
 *
 * Get scenario with cases, rounds, and weighted summary
 */
router['get'](
  '/companies/:companyId/scenarios/:scenarioId',
  requireAuth(),
  extractUserId,
  async (req: Request, res: Response) => {
    try {
      const companyId = firstString(req.params['companyId']);
      const scenarioId = firstString(req.params['scenarioId']);

      if (!companyId || !scenarioId) {
        return res.status(400).json({ error: 'Missing required parameters' });
      }

      const companyIdNum = parseFundIdParam(companyId);
      if (companyIdNum === null) {
        return res.status(400).json({ error: 'Invalid company ID' });
      }
      if (!(await enforceCompanyFundScope(req, res, companyIdNum))) {
        return;
      }

      const include = firstString(req.query['include'])?.split(',') || [
        'cases',
        'weighted_summary',
      ];

      const scenario = await db
        .select()
        .from(scenarios)
        .where(and(eq(scenarios.id, scenarioId), eq(scenarios.companyId, companyIdNum)))
        .limit(1);

      if (!scenario || scenario.length === 0 || !scenario[0]) {
        return res.status(404).json({ error: 'Scenario not found' });
      }

      const scenarioData = scenario[0];

      // Fetch cases if requested
      let mappedCases: ScenarioCase[] = [];
      if (include.includes('cases')) {
        const cases = await db
          .select()
          .from(scenarioCases)
          .where(eq(scenarioCases.scenarioId, scenarioId));

        mappedCases = cases.map((c) => ({
          id: c.id,
          case_name: c.caseName,
          ...(c.description !== null && { description: c.description }),
          probability: Number(c.probability),
          investment: Number(c.investment),
          follow_ons: Number(c.followOns),
          exit_proceeds: Number(c.exitProceeds),
          exit_valuation: Number(c.exitValuation),
          ...(c.monthsToExit !== null && { months_to_exit: c.monthsToExit }),
          ...(c.ownershipAtExit !== null && { ownership_at_exit: Number(c.ownershipAtExit) }),
        }));
      }

      // Add MOIC to each case
      const casesWithMOIC = addMOICToCases(mappedCases);

      // Calculate weighted summary
      const weighted_summary =
        include.includes('weighted_summary') && casesWithMOIC.length > 0
          ? calculateWeightedSummary(casesWithMOIC)
          : undefined;

      const seedProvenanceByCaseId = new Map<
        string,
        z.infer<typeof ScenarioCaseSeedProvenanceReadSchema>
      >();
      const caseIds = casesWithMOIC.flatMap((scenarioCase) =>
        scenarioCase.id === undefined ? [] : [scenarioCase.id]
      );
      if (caseIds.length > 0) {
        const provenanceRows = await db
          .select({
            scenarioCaseId: scenarioCaseSeedProvenance.scenarioCaseId,
            fundId: scenarioCaseSeedProvenance.fundId,
            companyId: scenarioCaseSeedProvenance.companyId,
            factsInputHash: scenarioCaseSeedProvenance.factsInputHash,
            factsAsOfDate: scenarioCaseSeedProvenance.factsAsOfDate,
            seededAt: scenarioCaseSeedProvenance.seededAt,
            trustState: scenarioCaseSeedProvenance.trustState,
            currencyStatus: scenarioCaseSeedProvenance.currencyStatus,
          })
          .from(scenarioCaseSeedProvenance)
          .where(inArray(scenarioCaseSeedProvenance.scenarioCaseId, caseIds));

        if (provenanceRows.length > 0) {
          const asOfDate = new Date().toISOString().slice(0, 10);
          const fundId = provenanceRows[0]!.fundId;
          let currentHashByCompanyId: Map<number, string> | null = null;
          try {
            const facts = await buildFundCompanyActualsFacts({ fundId, asOfDate });
            if (facts.fundId === fundId && facts.asOfDate === asOfDate) {
              currentHashByCompanyId = new Map(
                facts.facts.map((fact) => [fact.companyId, fact.inputHash])
              );
            } else {
              routeLog.error(
                'Scenario seed staleness facts scope mismatch:',
                new Error(
                  `Requested fund ${fundId} as of ${asOfDate}, received fund ${facts.fundId} as of ${facts.asOfDate}`
                )
              );
            }
          } catch (error: unknown) {
            routeLog.error('Scenario seed staleness facts load failed:', error);
          }

          for (const provenance of provenanceRows) {
            const currentHash = currentHashByCompanyId?.get(provenance.companyId);
            seedProvenanceByCaseId.set(
              provenance.scenarioCaseId,
              ScenarioCaseSeedProvenanceReadSchema.parse({
                facts_input_hash: provenance.factsInputHash,
                facts_as_of_date: provenance.factsAsOfDate,
                seeded_at: provenance.seededAt.toISOString(),
                trust_state: provenance.trustState,
                currency_status: provenance.currencyStatus,
                staleness:
                  currentHash === undefined
                    ? 'unknown'
                    : currentHash === provenance.factsInputHash
                      ? 'current'
                      : 'stale',
              })
            );
          }
        }
      }

      const responseCases = casesWithMOIC.map((scenarioCase) => {
        const seedProvenance =
          scenarioCase.id === undefined ? undefined : seedProvenanceByCaseId.get(scenarioCase.id);
        return {
          ...scenarioCase,
          ...(seedProvenance === undefined ? {} : { seed_provenance: seedProvenance }),
        };
      });

      // Get investment rounds if requested (commented out - investmentRounds not in schema)
      // let rounds = [];
      // if (include.includes('rounds')) {
      //   rounds = await db.query.investments.findMany({
      //     where: eq(investments.companyId, parseInt(companyId)),
      //     orderBy: (investments: any, { asc }: any) => [asc(investments.investmentDate)]
      //   });
      // }

      const response = ScenarioAnalysisReadResponseSchema.parse({
        company_name: '', // TODO: fetch company name separately if needed
        company_id: companyId,
        scenario: {
          id: scenarioData.id,
          company_id: String(scenarioData.companyId),
          name: scenarioData.name,
          ...(scenarioData.description && { description: scenarioData.description }),
          version: scenarioData.version,
          is_default: scenarioData.isDefault,
          ...(scenarioData.lockedAt && { locked_at: scenarioData.lockedAt }),
          ...(scenarioData.createdBy && { created_by: scenarioData.createdBy }),
          created_at: scenarioData.createdAt,
          updated_at: scenarioData.updatedAt,
        },
        cases: responseCases,
        ...(weighted_summary && { weighted_summary }),
        // rounds: undefined, // include.includes('rounds') ? rounds : undefined,
      });

      res.json(response);
    } catch (error: unknown) {
      routeLog.error('Get scenario error:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * POST /api/companies/:companyId/scenarios
 *
 * Create new scenario
 */
router['post'](
  '/companies/:companyId/scenarios',
  requireAuth(),
  requireWriteRole(WRITE_SCENARIO_ROLES),
  extractUserId,
  async (req: Request, res: Response) => {
    try {
      const companyId = firstString(req.params['companyId']);

      if (!companyId) {
        return res.status(400).json({ error: 'Missing company ID' });
      }

      const companyIdNum = parseFundIdParam(companyId);
      if (companyIdNum === null) {
        return res.status(400).json({ error: 'Invalid company ID' });
      }
      const fundId = await resolveCompanyFundId(companyIdNum);
      if (!(await enforceCompanyFundScope(req, res, companyIdNum))) {
        return;
      }
      if (fundId === null || fundId === undefined) {
        return res.status(404).json({ error: 'Company not found' });
      }

      const rawIdempotencyKey = req.get('Idempotency-Key');
      const idempotencyKey = rawIdempotencyKey?.trim() ?? '';
      if (idempotencyKey.length === 0) {
        return res.status(400).json({
          error: 'missing_idempotency_key',
          message: 'Idempotency-Key header is required',
        });
      }
      if (idempotencyKey.length > 128) {
        return res.status(400).json({
          error: 'invalid_idempotency_key',
          message: 'Idempotency-Key must be 128 characters or fewer',
        });
      }

      const parsed = CreateScenarioSchema.parse(req.body);
      const actorId = parseFundIdParam((req as ScenarioRequest).userId);
      const response = await createCompanyScenario({
        fundId,
        companyId: companyIdNum,
        name: parsed.name || 'New Scenario',
        description: parsed.description ?? null,
        idempotencyKey,
        actorId,
      });

      return res.status(201).json(response);
    } catch (error: unknown) {
      if (error instanceof CompanyScenarioCreateIdempotencyConflictError) {
        return res.status(409).json({ error: error.code, message: error.message });
      }
      if (error instanceof CompanyScenarioCreateInProgressError) {
        return res.status(409).json({ error: error.code, message: error.message });
      }
      if (error instanceof CompanyScenarioCreateScopeError) {
        return res.status(404).json({ error: 'Company not found' });
      }
      routeLog.error('Create scenario error:', error);
      return res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * PATCH /api/companies/:companyId/scenarios/:scenarioId
 *
 * Update scenario cases with optimistic locking
 */
router['patch'](
  '/companies/:companyId/scenarios/:scenarioId',
  requireAuth(),
  requireWriteRole(WRITE_SCENARIO_ROLES),
  extractUserId,
  async (req: Request, res: Response) => {
    try {
      const companyId = firstString(req.params['companyId']);
      const scenarioId = firstString(req.params['scenarioId']);

      if (!companyId || !scenarioId) {
        return res.status(400).json({ error: 'Missing required parameters' });
      }

      const companyIdNum = parseFundIdParam(companyId);
      if (companyIdNum === null) {
        return res.status(400).json({ error: 'Invalid company ID' });
      }
      if (!(await enforceCompanyFundScope(req, res, companyIdNum))) {
        return;
      }

      const body = UpdateScenarioRequestSchema.parse(req.body);

      // Fetch current scenario
      const currentScenario = await db
        .select()
        .from(scenarios)
        .where(and(eq(scenarios.id, scenarioId), eq(scenarios.companyId, companyIdNum)))
        .limit(1);

      if (!currentScenario || currentScenario.length === 0 || !currentScenario[0]) {
        return res.status(404).json({ error: 'Scenario not found' });
      }

      const current = currentScenario[0];

      // Fetch current cases for audit log
      const currentCases = await db
        .select()
        .from(scenarioCases)
        .where(eq(scenarioCases.scenarioId, scenarioId));

      // BLOCKER #1 FIX: Optimistic locking
      if (body.version !== undefined && current.version !== body.version) {
        return res.status(409).json({
          error: 'Conflict',
          message: 'Scenario was modified by another user. Please refresh.',
          current_version: current.version,
        });
      }

      // Validate probabilities
      let cases = body.cases as ScenarioCase[];
      const validation = validateProbabilities(cases);

      if (!validation.is_valid && !body.normalize) {
        return res.status(400).json({
          error: 'Invalid probabilities',
          message: validation.message,
          sum: validation.sum,
          severity: validation.severity,
        });
      }

      // Auto-normalize if requested
      let normalized = false;
      const original_sum = validation.sum;
      if (body.normalize && !validation.is_valid) {
        cases = normalizeProbabilities(cases);
        normalized = true;
      }

      // Delete existing cases and insert new ones (transaction)
      await db.transaction(async (tx) => {
        await tx.delete(scenarioCases).where(eq(scenarioCases.scenarioId, scenarioId));

        if (cases.length > 0) {
          await tx.insert(scenarioCases).values(
            cases.map((c) => ({
              scenarioId: scenarioId,
              caseName: String(c['case_name'] || ''),
              description: c['description'] as string | undefined,
              probability: String(c['probability'] || 0),
              investment: String(c['investment'] || 0),
              followOns: String(c['follow_ons'] || 0),
              exitProceeds: String(c['exit_proceeds'] || 0),
              exitValuation: String(c['exit_valuation'] || 0),
              monthsToExit: c['months_to_exit'] as number | undefined,
              ownershipAtExit: c['ownership_at_exit'] ? String(c['ownership_at_exit']) : null,
            }))
          );
        }

        // Increment version
        await tx
          .update(scenarios)
          .set({
            version: current.version + 1,
            updatedAt: new Date(),
          })
          .where(eq(scenarios.id, scenarioId));
      });

      // BLOCKER #2 FIX: Audit logging
      await auditLog({
        userId: (req as ScenarioRequest).userId ?? 'system',
        entityType: 'scenario',
        entityId: scenarioId,
        action: 'UPDATE',
        diff: {
          old: currentCases,
          new: cases,
          normalized,
        },
      });

      // Return updated data
      const casesWithMOIC = addMOICToCases(cases);
      const weighted_summary = calculateWeightedSummary(casesWithMOIC);

      res.json({
        scenario_id: scenarioId,
        cases: casesWithMOIC,
        weighted_summary,
        version: current.version + 1,
        normalized,
        original_sum: normalized ? original_sum : undefined,
      });
    } catch (error: unknown) {
      routeLog.error('Update scenario error:', error);

      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Validation error',
          details: error.errors,
        });
      }

      res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * DELETE /api/companies/:companyId/scenarios/:scenarioId
 *
 * Delete scenario and all its cases
 */
router['delete'](
  '/companies/:companyId/scenarios/:scenarioId',
  requireAuth(),
  requireWriteRole(WRITE_SCENARIO_ROLES),
  extractUserId,
  async (req: Request, res: Response) => {
    try {
      const companyId = firstString(req.params['companyId']);
      const scenarioId = firstString(req.params['scenarioId']);

      if (!companyId || !scenarioId) {
        return res.status(400).json({ error: 'Missing required parameters' });
      }

      const companyIdNum = parseFundIdParam(companyId);
      if (companyIdNum === null) {
        return res.status(400).json({ error: 'Invalid company ID' });
      }
      if (!(await enforceCompanyFundScope(req, res, companyIdNum))) {
        return;
      }

      const scenarioResult = await db
        .select()
        .from(scenarios)
        .where(and(eq(scenarios.id, scenarioId), eq(scenarios.companyId, companyIdNum)))
        .limit(1);

      if (!scenarioResult || scenarioResult.length === 0 || !scenarioResult[0]) {
        return res.status(404).json({ error: 'Scenario not found' });
      }

      const scenario = scenarioResult[0];

      // Prevent deleting default scenario
      if (scenario.isDefault) {
        return res.status(400).json({
          error: 'Cannot delete default scenario',
        });
      }

      // Delete (cascade will remove cases)
      await db.delete(scenarios).where(eq(scenarios.id, scenarioId));

      // Audit log
      await auditLog({
        userId: (req as ScenarioRequest).userId ?? 'system',
        entityType: 'scenario',
        entityId: scenarioId,
        action: 'DELETE',
      });

      res.status(204).send();
    } catch (error: unknown) {
      routeLog.error('Delete scenario error:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

// ============================================================================
// Reserves Optimization Integration
// ============================================================================

/**
 * POST /api/companies/:companyId/reserves/optimize
 *
 * Call DeterministicReserveEngine to suggest optimal reserve allocation
 */
router['post'](
  '/companies/:companyId/reserves/optimize',
  requireAuth(),
  extractUserId,
  async (req: Request, res: Response) => {
    try {
      const companyId = firstString(req.params['companyId']);

      if (!companyId) {
        return res.status(400).json({ error: 'Missing company ID' });
      }

      const companyIdNum = parseFundIdParam(companyId);
      if (companyIdNum === null) {
        return res.status(400).json({ error: 'Invalid company ID' });
      }
      if (!(await enforceCompanyFundScope(req, res, companyIdNum))) {
        return;
      }

      // Validate request body before destructuring to preserve types
      const { scenario_id } = ReserveSuggestionsSchema.parse(req.body);

      // TODO: Wire to existing DeterministicReserveEngine
      // This is a placeholder showing the integration pattern

      // 1. Fetch scenario data
      const scenario = await db.query.scenarios.findFirst({
        where: eq(scenarios.id, scenario_id),
        with: { cases: true, company: true },
      });

      if (!scenario) {
        return res.status(404).json({ error: 'Scenario not found' });
      }

      // 2. Call reserve engine (lift from your existing pattern)
      // const suggestions = await DeterministicReserveEngine.calculateOptimalReserveAllocation({
      //   portfolio: [scenario.company],
      //   graduationMatrix: ...,
      //   stageStrategies: ...,
      //   availableReserves: ...
      // });

      // 3. Return ranked suggestions
      const suggestions = [
        {
          company_id: companyId,
          stage: 'Series A',
          recommended_amount: 5000000,
          exit_moic_on_planned_reserves: 3.2,
          confidence: 0.85,
        },
      ];

      res.json({
        scenario_id,
        suggestions,
        generated_at: new Date(),
      });
    } catch (error: unknown) {
      routeLog.error('Reserves optimization error:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

export default router;
