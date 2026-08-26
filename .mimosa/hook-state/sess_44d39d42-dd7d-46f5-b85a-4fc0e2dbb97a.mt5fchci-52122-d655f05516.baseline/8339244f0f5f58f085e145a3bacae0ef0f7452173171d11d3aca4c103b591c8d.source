import { and, eq } from 'drizzle-orm';

import { db } from '../../db';
import type { ScenarioCaseSeedV1 } from '../../../shared/contracts/scenarios/scenario-case-seed-v1.contract';
import {
  scenarioCaseSeedProvenance,
  type ScenarioCaseSeedProvenance,
} from '../../../shared/schema/scenario-case-seed-provenance';
import {
  scenarioAuditLogs,
  scenarioCases,
  scenarios,
  type ScenarioCase,
} from '../../../shared/schema/scenario';

const PROVENANCE_IDEMPOTENCY_CONSTRAINT =
  'scenario_case_seed_provenance_fund_idempotency_key_unique';

export type ScenarioCaseSeedPersistenceErrorCode =
  | 'scenario_not_found'
  | 'scenario_locked'
  | 'version_conflict'
  | 'missing_required_override'
  | 'company_mismatch'
  | 'idempotency_conflict';

export class ScenarioCaseSeedPersistenceError extends Error {
  readonly status: number;
  readonly code: ScenarioCaseSeedPersistenceErrorCode;
  readonly details?: unknown;

  constructor(
    status: number,
    code: ScenarioCaseSeedPersistenceErrorCode,
    message: string,
    details?: unknown
  ) {
    super(message);
    this.name = 'ScenarioCaseSeedPersistenceError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export interface ScenarioCaseSeedOverrides {
  caseName: string;
  probability: string;
  exitValuation?: string;
  monthsToExit?: number | null;
  ownershipAtExit?: string | null;
  investment?: string;
  followOns?: string;
  fmv?: string | null;
}

export interface ScenarioMutationActor {
  userId: string | null;
}

export interface CreatedScenarioCase {
  case: ScenarioCase;
  provenance: ScenarioCaseSeedProvenance;
  replayed: boolean;
}

interface SeededCaseValues {
  investment: string;
  investmentSource: string;
  followOns: string;
  followOnsSource: string;
  fmv: string | null;
  fmvSource: string | null;
}

function missingRequiredOverride(field: string): ScenarioCaseSeedPersistenceError {
  return new ScenarioCaseSeedPersistenceError(
    422,
    'missing_required_override',
    `A user override is required for ${field}.`,
    { field }
  );
}

function requireTextOverride(value: string | null | undefined, field: string): string {
  const trimmed = value?.trim() ?? '';
  if (trimmed.length === 0) {
    throw missingRequiredOverride(field);
  }
  return trimmed;
}

function resolveRequiredSeedField(
  field: ScenarioCaseSeedV1['fields']['investment'],
  override: string | undefined,
  fieldName: 'investment' | 'followOns'
): { value: string; source: string } {
  if (override !== undefined) {
    return { value: requireTextOverride(override, fieldName), source: 'user_override' };
  }
  if (field.status === 'seeded') {
    return { value: field.value, source: field.source };
  }
  throw missingRequiredOverride(fieldName);
}

function composeSeededCaseValues(
  seed: ScenarioCaseSeedV1,
  overrides: ScenarioCaseSeedOverrides
): SeededCaseValues {
  const investment = resolveRequiredSeedField(
    seed.fields.investment,
    overrides.investment,
    'investment'
  );
  const followOns = resolveRequiredSeedField(
    seed.fields.followOns,
    overrides.followOns,
    'followOns'
  );

  let fmv: string | null = null;
  let fmvSource: string | null = null;
  if (Object.prototype.hasOwnProperty.call(overrides, 'fmv') && overrides.fmv !== undefined) {
    fmv = overrides.fmv;
    fmvSource = 'user_override';
  } else if (seed.fields.fmv.status === 'seeded') {
    fmv = seed.fields.fmv.value;
    fmvSource = seed.fields.fmv.source;
  } else {
    throw missingRequiredOverride('fmv');
  }

  return {
    investment: investment.value,
    investmentSource: investment.source,
    followOns: followOns.value,
    followOnsSource: followOns.source,
    fmv,
    fmvSource,
  };
}

function isProvenanceIdempotencyViolation(error: unknown): boolean {
  if (error === null || typeof error !== 'object') {
    return false;
  }
  const candidate = error as { code?: unknown; constraint?: unknown; message?: unknown };
  return (
    candidate.code === '23505' &&
    (candidate.constraint === PROVENANCE_IDEMPOTENCY_CONSTRAINT ||
      (typeof candidate.message === 'string' &&
        candidate.message.includes(PROVENANCE_IDEMPOTENCY_CONSTRAINT)))
  );
}

function assertReplayMatchesScenario(
  scenarioCase: Pick<ScenarioCase, 'scenarioId'>,
  scenarioId: string,
  idempotencyKey: string
): void {
  if (scenarioCase.scenarioId !== scenarioId) {
    throw new ScenarioCaseSeedPersistenceError(
      409,
      'idempotency_conflict',
      'The idempotency key is already associated with a different scenario.',
      { idempotencyKey, scenarioId }
    );
  }
}

async function loadReplayAfterUniqueViolation(input: {
  fundId: number;
  scenarioId: string;
  idempotencyKey: string;
}): Promise<CreatedScenarioCase> {
  const provenanceRows = await db
    .select()
    .from(scenarioCaseSeedProvenance)
    .where(
      and(
        eq(scenarioCaseSeedProvenance.fundId, input.fundId),
        eq(scenarioCaseSeedProvenance.idempotencyKey, input.idempotencyKey)
      )
    )
    .limit(1);
  const provenance = provenanceRows[0];
  if (!provenance) {
    throw new Error('Idempotent scenario case create won the unique race but was not readable.');
  }

  const caseRows = await db
    .select()
    .from(scenarioCases)
    .where(eq(scenarioCases.id, provenance.scenarioCaseId))
    .limit(1);
  const existingCase = caseRows[0];
  if (!existingCase) {
    throw new Error(
      `Seed provenance references missing scenario case ${provenance.scenarioCaseId}.`
    );
  }
  assertReplayMatchesScenario(existingCase, input.scenarioId, input.idempotencyKey);

  return { case: existingCase, provenance, replayed: true };
}

export async function createScenarioCaseFromSeed(input: {
  scenarioId: string;
  expectedScenarioVersion: number;
  seed: ScenarioCaseSeedV1;
  overrides: ScenarioCaseSeedOverrides;
  actor: ScenarioMutationActor;
  idempotencyKey: string;
}): Promise<CreatedScenarioCase> {
  try {
    return await db.transaction(async (tx) => {
      const parentRows = await tx
        .select()
        .from(scenarios)
        .where(eq(scenarios.id, input.scenarioId))
        .limit(1)
        .for('update');
      const parent = parentRows[0];

      if (!parent) {
        throw new ScenarioCaseSeedPersistenceError(
          404,
          'scenario_not_found',
          `Scenario ${input.scenarioId} was not found.`
        );
      }
      if (parent.lockedAt !== null) {
        throw new ScenarioCaseSeedPersistenceError(
          409,
          'scenario_locked',
          `Scenario ${input.scenarioId} is locked.`
        );
      }
      const hasExpectedVersion = parent.version === input.expectedScenarioVersion;
      if (parent.companyId !== input.seed.companyId) {
        throw new ScenarioCaseSeedPersistenceError(
          422,
          'company_mismatch',
          `Scenario ${input.scenarioId} belongs to company ${parent.companyId}, not ${input.seed.companyId}.`,
          {
            scenarioCompanyId: parent.companyId,
            seedCompanyId: input.seed.companyId,
          }
        );
      }

      const existingProvenanceRows = await tx
        .select()
        .from(scenarioCaseSeedProvenance)
        .where(
          and(
            eq(scenarioCaseSeedProvenance.fundId, input.seed.fundId),
            eq(scenarioCaseSeedProvenance.idempotencyKey, input.idempotencyKey)
          )
        )
        .limit(1);
      const existingProvenance = existingProvenanceRows[0];
      if (existingProvenance) {
        const existingCaseRows = await tx
          .select()
          .from(scenarioCases)
          .where(eq(scenarioCases.id, existingProvenance.scenarioCaseId))
          .limit(1);
        const existingCase = existingCaseRows[0];
        if (!existingCase) {
          throw new Error(
            `Seed provenance references missing scenario case ${existingProvenance.scenarioCaseId}.`
          );
        }
        assertReplayMatchesScenario(existingCase, input.scenarioId, input.idempotencyKey);
        return {
          case: existingCase,
          provenance: existingProvenance,
          replayed: true,
        };
      }
      if (!hasExpectedVersion) {
        throw new ScenarioCaseSeedPersistenceError(
          409,
          'version_conflict',
          `Scenario ${input.scenarioId} has version ${parent.version}, not ${input.expectedScenarioVersion}.`,
          {
            expectedVersion: input.expectedScenarioVersion,
            actualVersion: parent.version,
          }
        );
      }

      const caseName = requireTextOverride(input.overrides.caseName, 'caseName');
      const probability = requireTextOverride(input.overrides.probability, 'probability');
      const seededValues = composeSeededCaseValues(input.seed, input.overrides);
      const now = new Date();

      const createdCaseRows = await tx
        .insert(scenarioCases)
        .values({
          scenarioId: input.scenarioId,
          caseName,
          probability,
          investment: seededValues.investment,
          followOns: seededValues.followOns,
          exitProceeds: '0',
          exitValuation:
            input.overrides.exitValuation === undefined
              ? '0'
              : requireTextOverride(input.overrides.exitValuation, 'exitValuation'),
          monthsToExit: input.overrides.monthsToExit ?? null,
          ownershipAtExit:
            input.overrides.ownershipAtExit == null
              ? null
              : requireTextOverride(input.overrides.ownershipAtExit, 'ownershipAtExit'),
          fmv: seededValues.fmv,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      const createdCase = createdCaseRows[0];
      if (!createdCase) {
        throw new Error('Scenario case insert did not return a row.');
      }

      const provenanceRows = await tx
        .insert(scenarioCaseSeedProvenance)
        .values({
          scenarioCaseId: createdCase.id,
          fundId: input.seed.fundId,
          companyId: input.seed.companyId,
          idempotencyKey: input.idempotencyKey,
          factsInputHash: input.seed.factsInputHash,
          factsAsOfDate: input.seed.asOfDate,
          trustState: input.seed.trustState,
          currencyStatus: input.seed.currencyStatus,
          seededInvestment: seededValues.investment,
          seededFollowOns: seededValues.followOns,
          seededFmv: seededValues.fmv,
          investmentSource: seededValues.investmentSource,
          followOnsSource: seededValues.followOnsSource,
          fmvSource: seededValues.fmvSource,
          latestRoundValuationReference: input.seed.fields.exitValuation.marketReference,
          latestRoundDateReference: null,
        })
        .returning();
      const provenance = provenanceRows[0];
      if (!provenance) {
        throw new Error('Scenario case seed provenance insert did not return a row.');
      }

      await tx
        .update(scenarios)
        .set({ version: parent.version + 1, updatedAt: now })
        .where(eq(scenarios.id, input.scenarioId));

      await tx.insert(scenarioAuditLogs).values({
        userId: input.actor.userId,
        entityType: 'scenario_case',
        entityId: createdCase.id,
        action: 'CREATE',
        diff: {
          source: input.seed.contractVersion,
          factsInputHash: input.seed.factsInputHash,
          factsAsOfDate: input.seed.asOfDate,
          caseName,
        },
        timestamp: now,
      });

      return { case: createdCase, provenance, replayed: false };
    });
  } catch (error) {
    if (isProvenanceIdempotencyViolation(error)) {
      return loadReplayAfterUniqueViolation({
        fundId: input.seed.fundId,
        scenarioId: input.scenarioId,
        idempotencyKey: input.idempotencyKey,
      });
    }
    throw error;
  }
}
