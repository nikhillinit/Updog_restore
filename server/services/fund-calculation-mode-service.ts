import { and, desc, eq, sql, type SQL } from 'drizzle-orm';

import { db } from '../db';
import {
  ACTIONABILITY_POLICY_VERSION,
  H9SourceFingerprintSchema,
  type H9ActionabilityStatus,
  type H9SourceFingerprint,
} from '../../shared/contracts/h9-actionability.contract';
import { canonicalSha256 } from '../../shared/lib/canonical-hash';
import {
  FUND_MOIC_CALCULATION_KEY,
  getFundMoicRankingSources,
  type FundMoicRankingSources,
} from './fund-moic-ranking-service';
import { reconciliationRuns } from '../../shared/schema';
import { buildRoundsToModelEvidence } from './rounds-to-model-evidence-service';

const MODE_ROUTE = 'PUT /api/admin/funds/:fundId/calculation-modes/fund-moic-rankings';
export const MOIC_MODE_RESIDENCY_DAYS_REQUIRED = 7;

export type FundCalculationConfiguredMode = 'off' | 'shadow' | 'on';
export type FundCalculationEffectiveMode = 'off' | 'shadow' | 'on';
export type FundCalculationResidencyStatus = 'not_applicable' | 'pending' | 'eligible';
export type FundCalculationModeBlocker =
  | 'accepted_reconciliation_required'
  | 'accepted_reconciliation_not_found'
  | 'current_source_changed'
  | 'exit_probability_source_incomplete'
  | 'kill_switch_active'
  | 'reserve_exit_multiple_source_incomplete'
  | 'shadow_residency_pending';

export interface FundCalculationModePreview {
  calculationKey: typeof FUND_MOIC_CALCULATION_KEY;
  configuredMode: FundCalculationConfiguredMode;
  effectiveMode: FundCalculationEffectiveMode;
  killSwitchActive: boolean;
  shadowStartedAt: string | null;
  eligibleAt: string | null;
  residencyDaysRequired: typeof MOIC_MODE_RESIDENCY_DAYS_REQUIRED;
  residencyStatus: FundCalculationResidencyStatus;
  currentSourceMatchesAccepted: boolean;
  unreconciledEditsPresent: boolean;
  blockers: FundCalculationModeBlocker[];
  version: number;
}

export class FundCalculationModeVersionConflictError extends Error {
  readonly code = 'stale_expected_version';

  constructor(
    readonly expectedVersion: number,
    readonly actualVersion: number
  ) {
    super(`Expected mode version ${expectedVersion}, found ${actualVersion}`);
    this.name = 'FundCalculationModeVersionConflictError';
  }
}

export class FundCalculationModeBlockedError extends Error {
  readonly code = 'mode_activation_blocked';

  constructor(readonly blockers: FundCalculationModeBlocker[]) {
    super(`MOIC calculation mode update is blocked: ${blockers.join(', ')}`);
    this.name = 'FundCalculationModeBlockedError';
  }
}

export class FundCalculationModeIdempotencyConflictError extends Error {
  readonly code = 'idempotency_conflict';

  constructor(message: string) {
    super(message);
    this.name = 'FundCalculationModeIdempotencyConflictError';
  }
}

export class FundCalculationModeInProgressError extends Error {
  readonly code = 'idempotency_request_in_progress';

  constructor() {
    super('Idempotent MOIC mode update is still in progress');
    this.name = 'FundCalculationModeInProgressError';
  }
}

type FundCalculationModeDatabase = typeof db;
type FundCalculationModeTransaction = Parameters<
  Parameters<FundCalculationModeDatabase['transaction']>[0]
>[0];
type ExecuteResult<T> = { rows: T[] };

type ModeRow = {
  id: number;
  configured_mode: FundCalculationConfiguredMode;
  kill_switch_active: boolean;
  shadow_started_at: Date | string | null;
  last_reconciliation_run_id: number | null;
  last_moic_source_input_hash: string | null;
  last_candidate_output_hash: string | null;
  version: number;
};

type ReconciliationRow = {
  id: number;
  candidate_input_hash: string;
  candidate_output_hash: string;
  candidate_material?: boolean;
  requested_at?: Date | string;
};

type AcceptedMoicReconciliationRow = {
  id?: number;
  requestedAt?: Date | string;
  requested_at?: Date | string;
  status?: string;
  candidateInputHash?: string | null;
  candidate_input_hash?: string | null;
  evidenceInputHash?: string | null;
  evidence_input_hash?: string | null;
  assumptionsHash?: string | null;
  assumptions_hash?: string | null;
};

type RoundsCoverageForActionability = {
  activeRoundCount: number;
  activeOverrideCount: number;
  warningsByCode: Record<string, number>;
};

type RoundsEvidenceForActionability = {
  coverage: RoundsCoverageForActionability;
};

type MoicActionabilityResolveInput = {
  fundId: number;
  sources?: FundMoicRankingSources;
  evidence?: RoundsEvidenceForActionability;
};

export type MoicActionabilityResult = {
  sourceFingerprintMatches: boolean;
  actionability: H9ActionabilityStatus;
  actionabilityStatus: H9ActionabilityStatus;
  sourceFingerprint: H9SourceFingerprint;
  acceptedReconciliationRunId: string | null;
};

type SelectLimitStep = {
  limit: (count: number) => Promise<unknown[]>;
};

type SelectOrderByStep = {
  orderBy: (...clauses: unknown[]) => SelectLimitStep;
};

type SelectWhereStep = SelectLimitStep & SelectOrderByStep;

type SelectFromStep = {
  from: (table: unknown) => {
    where: (condition: unknown) => SelectWhereStep;
  };
};

type QueryReconciliationLookup = {
  query: {
    reconciliationRuns: {
      findFirst: (query: unknown) => Promise<unknown>;
    };
  };
};

type SelectReconciliationLookup = {
  select: () => SelectFromStep;
};

async function executeRows<T>(
  executor: Pick<FundCalculationModeTransaction, 'execute'>,
  query: SQL
): Promise<T[]> {
  const result = (await executor.execute(query)) as ExecuteResult<T>;
  return result.rows;
}

function hasQueryReconciliationLookup(database: unknown): database is QueryReconciliationLookup {
  return (
    typeof database === 'object' &&
    database !== null &&
    'query' in database &&
    typeof (database as { query?: unknown }).query === 'object' &&
    (database as { query?: unknown }).query !== null &&
    'reconciliationRuns' in (database as { query: { reconciliationRuns?: unknown } }).query &&
    typeof (database as { query: { reconciliationRuns?: { findFirst?: unknown } } }).query
      .reconciliationRuns?.findFirst === 'function'
  );
}

function hasSelectReconciliationLookup(database: unknown): database is SelectReconciliationLookup {
  return (
    typeof database === 'object' &&
    database !== null &&
    'select' in database &&
    typeof (database as { select?: unknown }).select === 'function'
  );
}

function coerceAcceptedReconciliationRow(value: unknown): AcceptedMoicReconciliationRow | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  return value as AcceptedMoicReconciliationRow;
}

function acceptedCandidateInputHash(row: AcceptedMoicReconciliationRow | null): string | null {
  return row?.candidateInputHash ?? row?.candidate_input_hash ?? null;
}

function acceptedEvidenceInputHash(row: AcceptedMoicReconciliationRow | null): string | null {
  return row?.evidenceInputHash ?? row?.evidence_input_hash ?? null;
}

function acceptedReconciliationRunId(row: AcceptedMoicReconciliationRow | null): string | null {
  if (row?.id === undefined) {
    return null;
  }
  return String(row.id);
}

async function loadAcceptedMoicReconciliation(params: {
  database: unknown;
  fundId: number;
}): Promise<AcceptedMoicReconciliationRow | null> {
  if (hasQueryReconciliationLookup(params.database)) {
    const row = await params.database.query.reconciliationRuns.findFirst({
      where: (run: typeof reconciliationRuns, operators: { and: typeof and; eq: typeof eq }) =>
        operators.and(
          operators.eq(run.fundId, params.fundId),
          operators.eq(run.status, 'completed')
        ),
      orderBy: (run: typeof reconciliationRuns, operators: { desc: typeof desc }) => [
        operators.desc(run.requestedAt),
        operators.desc(run.id),
      ],
    });
    return coerceAcceptedReconciliationRow(row);
  }

  if (hasSelectReconciliationLookup(params.database)) {
    const rows = await params.database
      .select()
      .from(reconciliationRuns)
      .where(
        and(
          eq(reconciliationRuns.fundId, params.fundId),
          eq(reconciliationRuns.status, 'completed')
        )
      )
      .orderBy(desc(reconciliationRuns.requestedAt), desc(reconciliationRuns.id))
      .limit(1);
    return coerceAcceptedReconciliationRow(rows[0]);
  }

  throw new Error('MOIC actionability resolver requires a reconciliation lookup database');
}

function buildRoundEvidenceAssumptionsHash(): string {
  return canonicalSha256({
    policyVersion: ACTIONABILITY_POLICY_VERSION,
  });
}

function buildH9SourceFingerprint(params: {
  moicSourceInputHash: string;
  roundEvidenceInputHash: string;
  roundEvidenceAssumptionsHash: string;
}): H9SourceFingerprint {
  const fingerprintBase = {
    moicSourceInputHash: params.moicSourceInputHash,
    roundEvidenceInputHash: params.roundEvidenceInputHash,
    roundEvidenceAssumptionsHash: params.roundEvidenceAssumptionsHash,
    policyVersion: ACTIONABILITY_POLICY_VERSION,
  };

  return H9SourceFingerprintSchema.parse({
    ...fingerprintBase,
    fingerprintHash: canonicalSha256(fingerprintBase),
  });
}

export function createMoicActionabilityResolver(params: { database?: unknown; now?: Date }) {
  if (!params.database) {
    throw new Error('createMoicActionabilityResolver requires database');
  }

  const database = params.database;

  async function resolve(input: MoicActionabilityResolveInput): Promise<MoicActionabilityResult> {
    const now = params.now ?? new Date();
    const sources =
      input.sources ??
      (await getFundMoicRankingSources(input.fundId, database as FundCalculationModeDatabase));
    const evidence =
      input.evidence ??
      (await buildRoundsToModelEvidence({
        fundId: input.fundId,
        now,
        database: database as FundCalculationModeDatabase,
      }));
    const sourceFingerprint = buildH9SourceFingerprint({
      moicSourceInputHash: sources.moicSourceInputHash,
      roundEvidenceInputHash: canonicalSha256(evidence.coverage),
      roundEvidenceAssumptionsHash: buildRoundEvidenceAssumptionsHash(),
    });
    const accepted = await loadAcceptedMoicReconciliation({ database, fundId: input.fundId });
    const sourceFingerprintMatches = Boolean(
      accepted &&
      acceptedCandidateInputHash(accepted) === sourceFingerprint.moicSourceInputHash &&
      acceptedEvidenceInputHash(accepted) === sourceFingerprint.roundEvidenceInputHash
    );
    const actionability: H9ActionabilityStatus = sourceFingerprintMatches
      ? 'actionable'
      : 'non_actionable';

    return {
      sourceFingerprintMatches,
      actionability,
      actionabilityStatus: actionability,
      sourceFingerprint,
      acceptedReconciliationRunId: acceptedReconciliationRunId(accepted),
    };
  }

  return {
    resolve,
    resolveForFund: (fundId: number) => resolve({ fundId }),
  };
}

const defaultMoicActionabilityResolver = createMoicActionabilityResolver({ database: db });

export function resolveMoicActionability(
  input: MoicActionabilityResolveInput
): Promise<MoicActionabilityResult> {
  return defaultMoicActionabilityResolver.resolve(input);
}

export function toH9SnapshotColumns(result: MoicActionabilityResult) {
  return {
    h9MoicSourceInputHash: result.sourceFingerprint.moicSourceInputHash,
    h9RoundEvidenceInputHash: result.sourceFingerprint.roundEvidenceInputHash,
    h9RoundEvidenceAssumptionsHash: result.sourceFingerprint.roundEvidenceAssumptionsHash,
    h9FingerprintHash: result.sourceFingerprint.fingerprintHash,
    h9PolicyVersion: result.sourceFingerprint.policyVersion,
    h9ActionabilityStatus: result.actionability,
  };
}

function requestHashFor(params: {
  fundId: number;
  expectedVersion: number;
  configuredMode: FundCalculationConfiguredMode;
  killSwitchActive: boolean | null;
  acceptedReconciliationRunId: number | null;
}): string {
  return canonicalSha256({
    route: MODE_ROUTE,
    fundId: params.fundId,
    calculationKey: FUND_MOIC_CALCULATION_KEY,
    expectedVersion: params.expectedVersion,
    configuredMode: params.configuredMode,
    killSwitchActive: params.killSwitchActive,
    acceptedReconciliationRunId: params.acceptedReconciliationRunId,
  });
}

function responseFromLedger(value: unknown): FundCalculationModePreview {
  const parsed: unknown = typeof value === 'string' ? (JSON.parse(value) as unknown) : value;
  if (
    typeof parsed === 'object' &&
    parsed !== null &&
    (parsed as { calculationKey?: unknown }).calculationKey === FUND_MOIC_CALCULATION_KEY &&
    typeof (parsed as { version?: unknown }).version === 'number'
  ) {
    return parsed as FundCalculationModePreview;
  }

  throw new Error('Completed MOIC mode idempotency row has an invalid response body');
}

async function claimOrReplay(params: {
  tx: FundCalculationModeTransaction;
  fundId: number;
  idempotencyKey: string;
  requestHash: string;
  actorId: number | null;
}): Promise<{ claimed: true } | { claimed: false; response: FundCalculationModePreview }> {
  const claimed = await executeRows<{ id: number }>(
    params.tx,
    sql`
      INSERT INTO fund_calculation_mode_requests
        (fund_id, calculation_key, idempotency_key, request_hash, created_by, status)
      VALUES
        (${params.fundId}, ${FUND_MOIC_CALCULATION_KEY}, ${params.idempotencyKey}, ${params.requestHash}, ${params.actorId}, 'pending')
      ON CONFLICT (fund_id, calculation_key, idempotency_key) DO NOTHING
      RETURNING id
    `
  );

  if (claimed.length > 0) {
    return { claimed: true };
  }

  const existing = await executeRows<{
    request_hash: string;
    response_body: unknown;
    status: 'pending' | 'completed';
  }>(
    params.tx,
    sql`
      SELECT request_hash, response_body, status
      FROM fund_calculation_mode_requests
      WHERE fund_id = ${params.fundId}
        AND calculation_key = ${FUND_MOIC_CALCULATION_KEY}
        AND idempotency_key = ${params.idempotencyKey}
      LIMIT 1
    `
  );

  const row = existing[0];
  if (!row) {
    throw new Error('Idempotency claim conflict did not return an existing MOIC mode request');
  }
  if (row.request_hash !== params.requestHash) {
    throw new FundCalculationModeIdempotencyConflictError(
      'Idempotency-Key reused with a different MOIC calculation mode request'
    );
  }
  if (row.status !== 'completed' || row.response_body === null) {
    throw new FundCalculationModeInProgressError();
  }

  return { claimed: false, response: responseFromLedger(row.response_body) };
}

function toDate(value: Date | string | null): Date | null {
  if (value === null) return null;
  return value instanceof Date ? value : new Date(value);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function sourceBlockers(sources: FundMoicRankingSources): FundCalculationModeBlocker[] {
  const blockers: FundCalculationModeBlocker[] = [];
  if (sources.moicInputSummary.activationBlockingDefaultedExitProbabilityCount > 0) {
    blockers.push('exit_probability_source_incomplete');
  }
  if (sources.moicInputSummary.activationBlockingDefaultedReserveExitMultipleCount > 0) {
    blockers.push('reserve_exit_multiple_source_incomplete');
  }
  return blockers;
}

function buildModePreview(params: {
  row: ModeRow | null;
  sources: FundMoicRankingSources;
  now: Date;
}): FundCalculationModePreview {
  const configuredMode = params.row?.configured_mode ?? 'off';
  const killSwitchActive = params.row?.kill_switch_active ?? false;
  const shadowStartedDate = toDate(params.row?.shadow_started_at ?? null);
  const eligibleDate = shadowStartedDate
    ? addDays(shadowStartedDate, MOIC_MODE_RESIDENCY_DAYS_REQUIRED)
    : null;
  const currentSourceMatchesAccepted =
    params.row?.last_moic_source_input_hash === params.sources.moicSourceInputHash;
  const unreconciledEditsPresent = Boolean(
    params.row?.last_moic_source_input_hash && !currentSourceMatchesAccepted
  );
  const residencyStatus: FundCalculationResidencyStatus =
    configuredMode === 'off'
      ? 'not_applicable'
      : eligibleDate && params.now.getTime() >= eligibleDate.getTime()
        ? 'eligible'
        : 'pending';
  const blockers: FundCalculationModeBlocker[] = [];

  if (killSwitchActive) {
    blockers.push('kill_switch_active');
  }
  if (configuredMode !== 'off' && !params.row?.last_reconciliation_run_id) {
    blockers.push('accepted_reconciliation_required');
  }
  if (configuredMode !== 'off' && unreconciledEditsPresent) {
    blockers.push('current_source_changed');
  }
  if (configuredMode !== 'off' && residencyStatus === 'pending') {
    blockers.push('shadow_residency_pending');
  }
  blockers.push(...sourceBlockers(params.sources));

  return {
    calculationKey: FUND_MOIC_CALCULATION_KEY,
    configuredMode,
    effectiveMode: killSwitchActive ? 'off' : configuredMode,
    killSwitchActive,
    shadowStartedAt: shadowStartedDate?.toISOString() ?? null,
    eligibleAt: eligibleDate?.toISOString() ?? null,
    residencyDaysRequired: MOIC_MODE_RESIDENCY_DAYS_REQUIRED,
    residencyStatus,
    currentSourceMatchesAccepted,
    unreconciledEditsPresent,
    blockers: [...new Set(blockers)].sort(),
    version: params.row?.version ?? 0,
  };
}

async function loadModeRow(
  executor: Pick<FundCalculationModeTransaction, 'execute'>,
  fundId: number,
  lock: boolean
): Promise<ModeRow | null> {
  const rows = await executeRows<ModeRow>(
    executor,
    lock
      ? sql`
          SELECT id, configured_mode, kill_switch_active, shadow_started_at,
                 last_reconciliation_run_id, last_moic_source_input_hash,
                 last_candidate_output_hash, version
          FROM fund_calculation_modes
          WHERE fund_id = ${fundId}
            AND calculation_key = ${FUND_MOIC_CALCULATION_KEY}
          FOR UPDATE
        `
      : sql`
          SELECT id, configured_mode, kill_switch_active, shadow_started_at,
                 last_reconciliation_run_id, last_moic_source_input_hash,
                 last_candidate_output_hash, version
          FROM fund_calculation_modes
          WHERE fund_id = ${fundId}
            AND calculation_key = ${FUND_MOIC_CALCULATION_KEY}
          LIMIT 1
        `
  );

  return rows[0] ?? null;
}

async function loadCompletedReconciliation(
  tx: FundCalculationModeTransaction,
  fundId: number,
  runId: number
): Promise<ReconciliationRow | null> {
  const rows = await executeRows<ReconciliationRow>(
    tx,
    sql`
      SELECT id, candidate_input_hash, candidate_output_hash, candidate_material, requested_at
      FROM reconciliation_runs
      WHERE fund_id = ${fundId}
        AND id = ${runId}
        AND status = 'completed'
      LIMIT 1
    `
  );

  return rows[0] ?? null;
}

function validateAcceptedReconciliation(params: {
  accepted: ReconciliationRow | null;
  sources: FundMoicRankingSources;
}): FundCalculationModeBlocker[] {
  if (!params.accepted) {
    return ['accepted_reconciliation_required'];
  }
  if (params.accepted.candidate_input_hash !== params.sources.moicSourceInputHash) {
    return ['current_source_changed'];
  }
  return [];
}

function validateOnTransition(params: {
  accepted: ReconciliationRow | null;
  nextKillSwitchActive: boolean;
  shadowStartedAt: Date | null;
  sources: FundMoicRankingSources;
  now: Date;
}): FundCalculationModeBlocker[] {
  const blockers: FundCalculationModeBlocker[] = [];
  if (params.nextKillSwitchActive) {
    blockers.push('kill_switch_active');
  }
  blockers.push(...validateAcceptedReconciliation(params));
  if (
    !params.shadowStartedAt ||
    params.now.getTime() <
      addDays(params.shadowStartedAt, MOIC_MODE_RESIDENCY_DAYS_REQUIRED).getTime()
  ) {
    blockers.push('shadow_residency_pending');
  }
  blockers.push(...sourceBlockers(params.sources));
  return [...new Set(blockers)].sort();
}

async function insertModeRow(params: {
  tx: FundCalculationModeTransaction;
  fundId: number;
  configuredMode: FundCalculationConfiguredMode;
  killSwitchActive: boolean;
  shadowStartedAt: Date | null;
  accepted: ReconciliationRow | null;
  actorId: number | null;
}): Promise<ModeRow> {
  const rows = await executeRows<ModeRow>(
    params.tx,
    sql`
      INSERT INTO fund_calculation_modes
        (fund_id, calculation_key, configured_mode, kill_switch_active,
         shadow_started_at, last_reconciliation_run_id, last_moic_source_input_hash,
         last_candidate_output_hash, version, updated_by, updated_at)
      VALUES (
        ${params.fundId},
        ${FUND_MOIC_CALCULATION_KEY},
        ${params.configuredMode},
        ${params.killSwitchActive},
        ${params.shadowStartedAt},
        ${params.accepted?.id ?? null},
        ${params.accepted?.candidate_input_hash ?? null},
        ${params.accepted?.candidate_output_hash ?? null},
        1,
        ${params.actorId},
        NOW()
      )
      ON CONFLICT (fund_id, calculation_key) DO NOTHING
      RETURNING id, configured_mode, kill_switch_active, shadow_started_at,
                last_reconciliation_run_id, last_moic_source_input_hash,
                last_candidate_output_hash, version
    `
  );

  const inserted = rows[0];
  if (!inserted) {
    throw new FundCalculationModeVersionConflictError(0, 1);
  }
  return inserted;
}

async function updateModeRow(params: {
  tx: FundCalculationModeTransaction;
  row: ModeRow;
  configuredMode: FundCalculationConfiguredMode;
  killSwitchActive: boolean;
  shadowStartedAt: Date | null;
  accepted: ReconciliationRow | null;
  actorId: number | null;
}): Promise<ModeRow> {
  const rows = await executeRows<ModeRow>(
    params.tx,
    sql`
      UPDATE fund_calculation_modes
      SET configured_mode = ${params.configuredMode},
          kill_switch_active = ${params.killSwitchActive},
          shadow_started_at = ${params.shadowStartedAt},
          last_reconciliation_run_id = ${params.accepted?.id ?? null},
          last_moic_source_input_hash = ${params.accepted?.candidate_input_hash ?? null},
          last_candidate_output_hash = ${params.accepted?.candidate_output_hash ?? null},
          version = version + 1,
          updated_by = ${params.actorId},
          updated_at = NOW()
      WHERE id = ${params.row.id}
      RETURNING id, configured_mode, kill_switch_active, shadow_started_at,
                last_reconciliation_run_id, last_moic_source_input_hash,
                last_candidate_output_hash, version
    `
  );

  const updated = rows[0];
  if (!updated) {
    throw new FundCalculationModeVersionConflictError(params.row.version, params.row.version + 1);
  }
  return updated;
}

export async function resolveFundCalculationMode(params: {
  fundId: number;
  sources?: FundMoicRankingSources;
  database?: FundCalculationModeDatabase;
  now?: Date;
}): Promise<FundCalculationModePreview> {
  const database = params.database ?? db;
  const sources = params.sources ?? (await getFundMoicRankingSources(params.fundId, database));
  const row = await loadModeRow(database as never, params.fundId, false);

  return buildModePreview({ row, sources, now: params.now ?? new Date() });
}

export async function updateFundMoicCalculationMode(params: {
  fundId: number;
  expectedVersion: number;
  configuredMode: FundCalculationConfiguredMode;
  killSwitchActive?: boolean;
  acceptedReconciliationRunId?: number | null;
  idempotencyKey: string;
  actorId: number | null;
  database?: FundCalculationModeDatabase;
  sources?: FundMoicRankingSources;
  now?: Date;
}): Promise<{ response: FundCalculationModePreview; replayed: boolean }> {
  const database = params.database ?? db;
  const sources = params.sources ?? (await getFundMoicRankingSources(params.fundId, database));
  const now = params.now ?? new Date();
  const requestHash = requestHashFor({
    fundId: params.fundId,
    expectedVersion: params.expectedVersion,
    configuredMode: params.configuredMode,
    killSwitchActive: params.killSwitchActive ?? null,
    acceptedReconciliationRunId: params.acceptedReconciliationRunId ?? null,
  });

  return database.transaction(async (tx) => {
    const claim = await claimOrReplay({
      tx,
      fundId: params.fundId,
      idempotencyKey: params.idempotencyKey,
      requestHash,
      actorId: params.actorId,
    });
    if (!claim.claimed) {
      return { response: claim.response, replayed: true };
    }

    const existing = await loadModeRow(tx, params.fundId, true);
    if (!existing && params.expectedVersion !== 0) {
      throw new FundCalculationModeVersionConflictError(params.expectedVersion, 0);
    }
    if (existing && existing.version !== params.expectedVersion) {
      throw new FundCalculationModeVersionConflictError(params.expectedVersion, existing.version);
    }

    const nextKillSwitchActive = params.killSwitchActive ?? existing?.kill_switch_active ?? false;
    let accepted: ReconciliationRow | null =
      existing?.last_reconciliation_run_id &&
      existing.last_moic_source_input_hash &&
      existing.last_candidate_output_hash
        ? {
            id: existing.last_reconciliation_run_id,
            candidate_input_hash: existing.last_moic_source_input_hash,
            candidate_output_hash: existing.last_candidate_output_hash,
          }
        : null;

    if (
      params.acceptedReconciliationRunId !== undefined &&
      params.acceptedReconciliationRunId !== null
    ) {
      accepted = await loadCompletedReconciliation(
        tx,
        params.fundId,
        params.acceptedReconciliationRunId
      );
      const blockers = validateAcceptedReconciliation({ accepted, sources });
      if (blockers.length > 0) {
        throw new FundCalculationModeBlockedError(blockers);
      }
    }

    let nextShadowStartedAt: Date | null = null;
    if (params.configuredMode === 'shadow') {
      const blockers = validateAcceptedReconciliation({ accepted, sources });
      if (blockers.length > 0) {
        throw new FundCalculationModeBlockedError(blockers);
      }

      const existingStartedAt = toDate(existing?.shadow_started_at ?? null);
      const sourceChanged =
        existing?.last_moic_source_input_hash !== accepted?.candidate_input_hash;
      nextShadowStartedAt =
        existing?.configured_mode === 'shadow' && existingStartedAt && !sourceChanged
          ? existingStartedAt
          : now;
    }

    if (params.configuredMode === 'on') {
      const shadowStartedAt = toDate(existing?.shadow_started_at ?? null);
      const blockers = validateOnTransition({
        accepted,
        nextKillSwitchActive,
        shadowStartedAt,
        sources,
        now,
      });
      if (blockers.length > 0) {
        throw new FundCalculationModeBlockedError(blockers);
      }
      nextShadowStartedAt = shadowStartedAt;
    }

    const row = existing
      ? await updateModeRow({
          tx,
          row: existing,
          configuredMode: params.configuredMode,
          killSwitchActive: nextKillSwitchActive,
          shadowStartedAt: nextShadowStartedAt,
          accepted,
          actorId: params.actorId,
        })
      : await insertModeRow({
          tx,
          fundId: params.fundId,
          configuredMode: params.configuredMode,
          killSwitchActive: nextKillSwitchActive,
          shadowStartedAt: nextShadowStartedAt,
          accepted,
          actorId: params.actorId,
        });

    const response = buildModePreview({ row, sources, now });
    await tx.execute(sql`
      UPDATE fund_calculation_mode_requests
      SET status = 'completed',
          response_status = 200,
          response_body = ${JSON.stringify(response)}::jsonb
      WHERE fund_id = ${params.fundId}
        AND calculation_key = ${FUND_MOIC_CALCULATION_KEY}
        AND idempotency_key = ${params.idempotencyKey}
    `);

    return { response, replayed: false };
  });
}
