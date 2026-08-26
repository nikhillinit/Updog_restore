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
  FundCalculationModeIdempotencyConflictError,
  FundCalculationModeInProgressError,
  FundCalculationModeVersionConflictError,
} from './fund-calculation-mode-errors';
import {
  FUND_MOIC_CALCULATION_KEY,
  getFundMoicRankingSources,
  type FundMoicFactsSource,
  type FundMoicRankingSources,
} from './fund-moic-ranking-service';
import { invalidateH9Artifacts } from './h9-artifact-invalidation-service';
import { reconciliationRuns } from '../../shared/schema';
import { buildRoundsToModelEvidence } from './rounds-to-model-evidence-service';
import { CURRENT_FORECAST_CALCULATION_KEY } from './current-forecast-calc-mode-resolver';

export {
  FundCalculationModeIdempotencyConflictError,
  FundCalculationModeInProgressError,
  FundCalculationModeVersionConflictError,
} from './fund-calculation-mode-errors';

const MODE_ROUTE = 'PUT /api/admin/funds/:fundId/calculation-modes/fund-moic-rankings';
const CURRENT_FORECAST_MODE_ROUTE =
  'PUT /api/admin/funds/:fundId/calculation-modes/current-forecast';
export const MOIC_MODE_RESIDENCY_DAYS_REQUIRED = 7;
const CURRENT_FORECAST_MODE_RESIDENCY_DAYS_REQUIRED = MOIC_MODE_RESIDENCY_DAYS_REQUIRED;

export type FundCalculationConfiguredMode = 'off' | 'shadow' | 'on';
export type FundCalculationEffectiveMode = 'off' | 'shadow' | 'on';
export type FundCalculationResidencyStatus = 'not_applicable' | 'pending' | 'eligible';
export type FundCalculationModeBlocker =
  | 'accepted_reconciliation_required'
  | 'accepted_reconciliation_not_found'
  | 'current_source_changed'
  | 'exit_probability_source_incomplete'
  | 'facts_unavailable'
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

interface GenericFundCalculationModePreview {
  calculationKey: string;
  configuredMode: FundCalculationConfiguredMode;
  effectiveMode: FundCalculationEffectiveMode;
  killSwitchActive: boolean;
  shadowStartedAt: string | null;
  eligibleAt: string | null;
  residencyDaysRequired: number;
  residencyStatus: FundCalculationResidencyStatus;
  currentSourceMatchesAccepted: boolean;
  unreconciledEditsPresent: boolean;
  blockers: FundCalculationModeBlocker[];
  version: number;
}

export class FundCalculationModeBlockedError extends Error {
  readonly code = 'mode_activation_blocked';

  constructor(readonly blockers: FundCalculationModeBlocker[]) {
    super(`MOIC calculation mode update is blocked: ${blockers.join(', ')}`);
    this.name = 'FundCalculationModeBlockedError';
  }
}

export type FundCalculationModeDatabase = typeof db;
export type FundCalculationModeTransaction = Parameters<
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

type ModeMutationResult = {
  mode_exists: boolean;
  actual_version: number | null;
  existing_request_id: number | null;
  mode_write_id: number | null;
  claim_id: number | null;
};

type ReconciliationRow = {
  id: number;
  candidate_input_hash: string;
  candidate_output_hash: string;
  candidate_material?: boolean;
  requested_at?: Date | string;
};

export type AcceptedRef = ReconciliationRow;

type CurrentForecastModeSources = {
  sourceInputHash: string;
};

export interface CalculationModeStrategy<TSources> {
  calculationKey: string;
  modeRoute: string;
  residencyDaysRequired: number;
  shadowRequiresAccepted?: boolean;
  loadSources(fundId: number, database: FundCalculationModeDatabase, now: Date): Promise<TSources>;
  sourceInputHash(sources: TSources): string;
  factsAvailable(sources: TSources): boolean;
  sourceBlockers(sources: TSources): FundCalculationModeBlocker[];
  validateAccepted(accepted: AcceptedRef | null, sources: TSources): FundCalculationModeBlocker[];
  loadCompletedAccepted(
    tx: FundCalculationModeTransaction,
    fundId: number,
    acceptedId: number
  ): Promise<AcceptedRef | null>;
  postCommit(fundId: number): Promise<void>;
}

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

export function createMoicActionabilityResolver(params: {
  database?: unknown;
  now?: Date;
  reuseFactsSource?: boolean;
}) {
  if (!params.database) {
    throw new Error('createMoicActionabilityResolver requires database');
  }

  const database = params.database;
  const factsSourceByFund = new Map<number, FundMoicFactsSource>();

  async function resolve(input: MoicActionabilityResolveInput): Promise<MoicActionabilityResult> {
    const now = params.now ?? new Date();
    let sources = input.sources;
    if (!sources) {
      const reusedFactsSource = params.reuseFactsSource
        ? factsSourceByFund.get(input.fundId)
        : undefined;
      sources = reusedFactsSource
        ? await getFundMoicRankingSources(
            input.fundId,
            database as FundCalculationModeDatabase,
            reusedFactsSource,
            now
          )
        : await getFundMoicRankingSources(
            input.fundId,
            database as FundCalculationModeDatabase,
            undefined,
            now
          );
      if (params.reuseFactsSource) {
        factsSourceByFund.set(input.fundId, sources.factsSource);
      }
    }
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
    const sourceFingerprintMatches =
      sources.factsSource.status === 'available' &&
      Boolean(
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

function requestHashFor<TSources>(
  strategy: CalculationModeStrategy<TSources>,
  params: {
    fundId: number;
    expectedVersion: number;
    configuredMode: FundCalculationConfiguredMode;
    killSwitchActive: boolean | null;
    acceptedReconciliationRunId: number | null;
  }
): string {
  return canonicalSha256({
    route: strategy.modeRoute,
    fundId: params.fundId,
    calculationKey: strategy.calculationKey,
    expectedVersion: params.expectedVersion,
    configuredMode: params.configuredMode,
    killSwitchActive: params.killSwitchActive,
    acceptedReconciliationRunId: params.acceptedReconciliationRunId,
  });
}

function responseFromLedger<TSources>(
  strategy: CalculationModeStrategy<TSources>,
  value: unknown
): GenericFundCalculationModePreview {
  const parsed: unknown = typeof value === 'string' ? (JSON.parse(value) as unknown) : value;
  if (
    typeof parsed === 'object' &&
    parsed !== null &&
    (parsed as { calculationKey?: unknown }).calculationKey === strategy.calculationKey &&
    typeof (parsed as { version?: unknown }).version === 'number'
  ) {
    return parsed as GenericFundCalculationModePreview;
  }

  throw new Error('Completed MOIC mode idempotency row has an invalid response body');
}

async function readModeRequest<TSources>(
  strategy: CalculationModeStrategy<TSources>,
  params: {
    tx: Pick<FundCalculationModeTransaction, 'execute'>;
    fundId: number;
    idempotencyKey: string;
    requestHash: string;
  }
): Promise<{ response: GenericFundCalculationModePreview; replayed: true } | null> {
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
        AND calculation_key = ${strategy.calculationKey}
        AND idempotency_key = ${params.idempotencyKey}
      LIMIT 1
    `
  );

  const row = existing[0];
  if (!row) {
    return null;
  }
  if (row.request_hash !== params.requestHash) {
    throw new FundCalculationModeIdempotencyConflictError(
      'Idempotency-Key reused with a different MOIC calculation mode request'
    );
  }
  if (row.status !== 'completed' || row.response_body === null) {
    throw new FundCalculationModeInProgressError();
  }

  return { response: responseFromLedger(strategy, row.response_body), replayed: true };
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
  if (sources.factsSource.status !== 'available') {
    blockers.push('facts_unavailable');
  }
  if (sources.moicInputSummary.activationBlockingDefaultedExitProbabilityCount > 0) {
    blockers.push('exit_probability_source_incomplete');
  }
  if (sources.moicInputSummary.activationBlockingDefaultedReserveExitMultipleCount > 0) {
    blockers.push('reserve_exit_multiple_source_incomplete');
  }
  return blockers;
}

function strategySourceBlockers<TSources>(
  strategy: CalculationModeStrategy<TSources>,
  sources: TSources
): FundCalculationModeBlocker[] {
  const blockers = strategy.sourceBlockers(sources);
  if (!strategy.factsAvailable(sources) && !blockers.includes('facts_unavailable')) {
    return ['facts_unavailable', ...blockers];
  }
  return blockers;
}

function buildModePreview<TSources>(
  strategy: CalculationModeStrategy<TSources>,
  params: {
    row: ModeRow | null;
    sources: TSources;
    now: Date;
  }
): GenericFundCalculationModePreview {
  const configuredMode = params.row?.configured_mode ?? 'off';
  const killSwitchActive = params.row?.kill_switch_active ?? false;
  const shadowStartedDate = toDate(params.row?.shadow_started_at ?? null);
  const eligibleDate = shadowStartedDate
    ? addDays(shadowStartedDate, strategy.residencyDaysRequired)
    : null;
  const currentSourceMatchesAccepted =
    params.row?.last_moic_source_input_hash === strategy.sourceInputHash(params.sources);
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
  if (
    configuredMode !== 'off' &&
    strategy.shadowRequiresAccepted !== false &&
    !params.row?.last_reconciliation_run_id
  ) {
    blockers.push('accepted_reconciliation_required');
  }
  if (configuredMode !== 'off' && unreconciledEditsPresent) {
    blockers.push('current_source_changed');
  }
  if (configuredMode !== 'off' && residencyStatus === 'pending') {
    blockers.push('shadow_residency_pending');
  }
  blockers.push(...strategySourceBlockers(strategy, params.sources));

  return {
    calculationKey: strategy.calculationKey,
    configuredMode,
    effectiveMode: killSwitchActive ? 'off' : configuredMode,
    killSwitchActive,
    shadowStartedAt: shadowStartedDate?.toISOString() ?? null,
    eligibleAt: eligibleDate?.toISOString() ?? null,
    residencyDaysRequired: strategy.residencyDaysRequired,
    residencyStatus,
    currentSourceMatchesAccepted,
    unreconciledEditsPresent,
    blockers: [...new Set(blockers)].sort(),
    version: params.row?.version ?? 0,
  };
}

async function loadModeRow<TSources>(
  strategy: CalculationModeStrategy<TSources>,
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
            AND calculation_key = ${strategy.calculationKey}
          FOR UPDATE
        `
      : sql`
          SELECT id, configured_mode, kill_switch_active, shadow_started_at,
                 last_reconciliation_run_id, last_moic_source_input_hash,
                 last_candidate_output_hash, version
          FROM fund_calculation_modes
          WHERE fund_id = ${fundId}
            AND calculation_key = ${strategy.calculationKey}
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

const moicCalculationModeStrategy: CalculationModeStrategy<FundMoicRankingSources> = {
  calculationKey: FUND_MOIC_CALCULATION_KEY,
  modeRoute: MODE_ROUTE,
  residencyDaysRequired: MOIC_MODE_RESIDENCY_DAYS_REQUIRED,
  loadSources: (fundId, database, now) =>
    getFundMoicRankingSources(fundId, database, undefined, now),
  sourceInputHash: (sources) => sources.moicSourceInputHash,
  factsAvailable: (sources) => sources.factsSource.status === 'available',
  sourceBlockers,
  validateAccepted: (accepted, sources) => validateAcceptedReconciliation({ accepted, sources }),
  loadCompletedAccepted: loadCompletedReconciliation,
  postCommit: invalidateH9Artifacts,
};

const currentForecastCalculationModeStrategy: CalculationModeStrategy<CurrentForecastModeSources> =
  {
    calculationKey: CURRENT_FORECAST_CALCULATION_KEY,
    modeRoute: CURRENT_FORECAST_MODE_ROUTE,
    residencyDaysRequired: CURRENT_FORECAST_MODE_RESIDENCY_DAYS_REQUIRED,
    shadowRequiresAccepted: false,
    loadSources: async () => ({
      sourceInputHash: canonicalSha256({
        calculationKey: CURRENT_FORECAST_CALCULATION_KEY,
        referenceStatus: 'unavailable_until_task_13_1',
      }),
    }),
    sourceInputHash: (sources) => sources.sourceInputHash,
    factsAvailable: () => true,
    sourceBlockers: () => [],
    validateAccepted: () => ['accepted_reconciliation_required'],
    loadCompletedAccepted: async () => null,
    postCommit: () => Promise.resolve(),
  };

function validateOnTransition<TSources>(
  strategy: CalculationModeStrategy<TSources>,
  params: {
    accepted: AcceptedRef | null;
    nextKillSwitchActive: boolean;
    shadowStartedAt: Date | null;
    sources: TSources;
    now: Date;
  }
): FundCalculationModeBlocker[] {
  const blockers: FundCalculationModeBlocker[] = [];
  if (params.nextKillSwitchActive) {
    blockers.push('kill_switch_active');
  }
  blockers.push(...strategy.validateAccepted(params.accepted, params.sources));
  if (
    !params.shadowStartedAt ||
    params.now.getTime() < addDays(params.shadowStartedAt, strategy.residencyDaysRequired).getTime()
  ) {
    blockers.push('shadow_residency_pending');
  }
  blockers.push(...strategySourceBlockers(strategy, params.sources));
  return [...new Set(blockers)].sort();
}

type ResolveFundCalculationModeParams<TSources> = {
  fundId: number;
  sources?: TSources;
  database?: FundCalculationModeDatabase;
  now?: Date;
};

async function resolveFundCalculationModeGeneric<TSources>(
  strategy: CalculationModeStrategy<TSources>,
  params: ResolveFundCalculationModeParams<TSources>
): Promise<GenericFundCalculationModePreview> {
  const database = params.database ?? db;
  const now = params.now ?? new Date();
  const sources = params.sources ?? (await strategy.loadSources(params.fundId, database, now));
  const row = await loadModeRow(strategy, database as never, params.fundId, false);

  return buildModePreview(strategy, { row, sources, now });
}

export async function resolveFundCalculationMode(
  params: ResolveFundCalculationModeParams<FundMoicRankingSources>
): Promise<FundCalculationModePreview> {
  return resolveFundCalculationModeGeneric(
    moicCalculationModeStrategy,
    params
  ) as Promise<FundCalculationModePreview>;
}

type UpdateFundCalculationModeParams<TSources> = {
  fundId: number;
  expectedVersion: number;
  configuredMode: FundCalculationConfiguredMode;
  killSwitchActive?: boolean;
  acceptedReconciliationRunId?: number | null;
  idempotencyKey: string;
  actorId: number | null;
  database?: FundCalculationModeDatabase;
  sources?: TSources;
  now?: Date;
};

async function updateFundCalculationMode<TSources>(
  strategy: CalculationModeStrategy<TSources>,
  params: UpdateFundCalculationModeParams<TSources>
): Promise<{ response: GenericFundCalculationModePreview; replayed: boolean }> {
  const database = params.database ?? db;
  const now = params.now ?? new Date();
  const sources = params.sources ?? (await strategy.loadSources(params.fundId, database, now));
  const requestHash = requestHashFor(strategy, {
    fundId: params.fundId,
    expectedVersion: params.expectedVersion,
    configuredMode: params.configuredMode,
    killSwitchActive: params.killSwitchActive ?? null,
    acceptedReconciliationRunId: params.acceptedReconciliationRunId ?? null,
  });

  const result = await (async (tx: FundCalculationModeDatabase) => {
    // Read-only preflight supplies the values needed to build the response and
    // business guards. The write CTE below repeats the version guard while
    // holding the mode row lock, so stale preflight data cannot mutate state.
    const existing = await loadModeRow(strategy, tx, params.fundId, false);
    const versionMatches = existing
      ? existing.version === params.expectedVersion
      : params.expectedVersion === 0;
    const nextKillSwitchActive = params.killSwitchActive ?? existing?.kill_switch_active ?? false;
    let accepted: AcceptedRef | null =
      existing?.last_reconciliation_run_id &&
      existing.last_moic_source_input_hash &&
      existing.last_candidate_output_hash
        ? {
            id: existing.last_reconciliation_run_id,
            candidate_input_hash: existing.last_moic_source_input_hash,
            candidate_output_hash: existing.last_candidate_output_hash,
          }
        : null;
    const blockers: FundCalculationModeBlocker[] = [];

    let nextShadowStartedAt: Date | null = null;
    if (versionMatches) {
      if (
        params.acceptedReconciliationRunId !== undefined &&
        params.acceptedReconciliationRunId !== null
      ) {
        accepted = await strategy.loadCompletedAccepted(
          tx as unknown as FundCalculationModeTransaction,
          params.fundId,
          params.acceptedReconciliationRunId
        );
        blockers.push(...strategy.validateAccepted(accepted, sources));
      }

      if (params.configuredMode === 'shadow') {
        if (strategy.shadowRequiresAccepted !== false) {
          blockers.push(...strategy.validateAccepted(accepted, sources));
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
        blockers.push(
          ...validateOnTransition(strategy, {
            accepted,
            nextKillSwitchActive,
            shadowStartedAt,
            sources,
            now,
          })
        );
        nextShadowStartedAt = shadowStartedAt;
      }
    }

    const uniqueBlockers = [...new Set(blockers)];
    const predictedRow: ModeRow = existing
      ? {
          ...existing,
          configured_mode: params.configuredMode,
          kill_switch_active: nextKillSwitchActive,
          shadow_started_at: nextShadowStartedAt,
          last_reconciliation_run_id: accepted?.id ?? null,
          last_moic_source_input_hash: accepted?.candidate_input_hash ?? null,
          last_candidate_output_hash: accepted?.candidate_output_hash ?? null,
          version: existing.version + 1,
        }
      : {
          id: 0,
          configured_mode: params.configuredMode,
          kill_switch_active: nextKillSwitchActive,
          shadow_started_at: nextShadowStartedAt,
          last_reconciliation_run_id: accepted?.id ?? null,
          last_moic_source_input_hash: accepted?.candidate_input_hash ?? null,
          last_candidate_output_hash: accepted?.candidate_output_hash ?? null,
          version: 1,
        };
    const response =
      versionMatches && uniqueBlockers.length === 0
        ? buildModePreview(strategy, { row: predictedRow, sources, now })
        : null;

    // Ledger-row ordering: PostgreSQL data-modifying CTEs share one snapshot,
    // so a CTE can never UPDATE a row another CTE inserted in the same
    // statement. The idempotency row is therefore inserted LAST, already
    // 'completed', fenced on the mutation CTE returning a row; the mutation is
    // fenced on the guards plus the absence of an existing same-key request
    // row. A fresh request row consequently never exists in 'pending' state,
    // and a guard failure writes nothing at all.
    const rows = await executeRows<ModeMutationResult>(
      tx,
      sql`
        WITH mode_row AS (
          SELECT id, version
          FROM fund_calculation_modes
          WHERE fund_id = ${params.fundId}
            AND calculation_key = ${strategy.calculationKey}
          FOR UPDATE
        ),
        mode_guard AS (
          SELECT id, version, true::boolean AS mode_exists
          FROM mode_row
          UNION ALL
          SELECT NULL::integer, NULL::integer, false::boolean
          FROM (SELECT 1) AS missing
          WHERE NOT EXISTS (SELECT 1 FROM mode_row)
        ),
        existing_request AS (
          SELECT id
          FROM fund_calculation_mode_requests
          WHERE fund_id = ${params.fundId}
            AND calculation_key = ${strategy.calculationKey}
            AND idempotency_key = ${params.idempotencyKey}
        ),
        mode_write AS (
          INSERT INTO fund_calculation_modes AS mode
            (fund_id, calculation_key, configured_mode, kill_switch_active,
             shadow_started_at, last_reconciliation_run_id, last_moic_source_input_hash,
             last_candidate_output_hash, version, updated_by, updated_at)
          SELECT
            ${params.fundId},
            ${strategy.calculationKey},
            ${params.configuredMode},
            ${nextKillSwitchActive},
            ${nextShadowStartedAt},
            ${accepted?.id ?? null},
            ${accepted?.candidate_input_hash ?? null},
            ${accepted?.candidate_output_hash ?? null},
            1,
            ${params.actorId},
            NOW()
          FROM mode_guard
          WHERE ${uniqueBlockers.length === 0}
            AND NOT EXISTS (SELECT 1 FROM existing_request)
            AND (
              (mode_exists AND version = ${params.expectedVersion})
              OR (NOT mode_exists AND ${params.expectedVersion} = 0)
            )
          ON CONFLICT (fund_id, calculation_key) DO UPDATE
          SET configured_mode = EXCLUDED.configured_mode,
              kill_switch_active = EXCLUDED.kill_switch_active,
              shadow_started_at = EXCLUDED.shadow_started_at,
              last_reconciliation_run_id = EXCLUDED.last_reconciliation_run_id,
              last_moic_source_input_hash = EXCLUDED.last_moic_source_input_hash,
              last_candidate_output_hash = EXCLUDED.last_candidate_output_hash,
              version = mode.version + 1,
              updated_by = EXCLUDED.updated_by,
              updated_at = NOW()
          WHERE mode.version = ${params.expectedVersion}
          RETURNING mode.id, mode.version
        ),
        claim AS (
          INSERT INTO fund_calculation_mode_requests
            (fund_id, calculation_key, idempotency_key, request_hash, created_by,
             status, response_status, response_body)
          SELECT
            ${params.fundId},
            ${strategy.calculationKey},
            ${params.idempotencyKey},
            ${requestHash},
            ${params.actorId},
            'completed',
            200,
            ${JSON.stringify(response ?? {})}::jsonb
          FROM mode_write
          ON CONFLICT (fund_id, calculation_key, idempotency_key) DO NOTHING
          RETURNING id
        )
        SELECT
          mode_guard.mode_exists,
          mode_guard.version AS actual_version,
          (SELECT id FROM existing_request) AS existing_request_id,
          mode_write.id AS mode_write_id,
          claim.id AS claim_id
        FROM mode_guard
        LEFT JOIN mode_write ON TRUE
        LEFT JOIN claim ON TRUE
      `
    );

    const mutation = rows[0];
    if (!mutation) {
      throw new Error('Mode update CTE returned no guard result');
    }

    if (mutation.mode_write_id !== null && mutation.claim_id !== null && response) {
      return { response, replayed: false };
    }

    // No mutation happened. Same-key request rows (pre-existing or committed
    // by a concurrent winner) resolve via the ledger replay contract first.
    const replay = await readModeRequest(strategy, {
      tx,
      fundId: params.fundId,
      idempotencyKey: params.idempotencyKey,
      requestHash,
    });
    if (replay) {
      return replay;
    }

    const guardVersionMatches = mutation.mode_exists
      ? mutation.actual_version === params.expectedVersion
      : params.expectedVersion === 0;
    if (!guardVersionMatches) {
      throw new FundCalculationModeVersionConflictError(
        params.expectedVersion,
        mutation.actual_version ?? 0
      );
    }
    if (uniqueBlockers.length > 0) {
      throw new FundCalculationModeBlockedError(uniqueBlockers);
    }
    // Guard passed and no same-key row exists: a concurrent writer won the
    // race between our statement's guard read and its write re-check.
    throw new FundCalculationModeVersionConflictError(
      params.expectedVersion,
      params.expectedVersion + 1
    );
  })(database);
  if (!result.replayed) {
    await strategy.postCommit(params.fundId);
  }
  return result;
}

export async function updateFundMoicCalculationMode(
  params: UpdateFundCalculationModeParams<FundMoicRankingSources>
): Promise<{ response: FundCalculationModePreview; replayed: boolean }> {
  const result = await updateFundCalculationMode(moicCalculationModeStrategy, params);
  return {
    response: result.response as FundCalculationModePreview,
    replayed: result.replayed,
  };
}

export async function updateCurrentForecastCalculationMode(
  params: UpdateFundCalculationModeParams<CurrentForecastModeSources>
): Promise<{ response: GenericFundCalculationModePreview; replayed: boolean }> {
  // Transitional schema alias: last_moic_source_input_hash stores the accepted
  // source hash for whichever calculation key owns the row until Task 13.1.
  return updateFundCalculationMode(currentForecastCalculationModeStrategy, params);
}
