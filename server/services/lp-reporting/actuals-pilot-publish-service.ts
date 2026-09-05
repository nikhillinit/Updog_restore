import { randomUUID } from 'node:crypto';

import { drizzle } from 'drizzle-orm/node-postgres';

import { combinedSchema } from '../../db-schema';
import { pool } from '../../db';
import { logger } from '../../lib/logger';
import { canonicalSha256 } from '@shared/lib/canonical-hash';
import {
  ActualsPublishReceiptV1Schema,
  ActualsPublishRequestV1Schema,
  ActualsPilotCashFlowPayloadSchema,
  ActualsPilotCentExactMoneySchema,
  ActualsPilotValuationMarkPayloadSchema,
  IfMatchSchema,
  isCentExactMoney,
  type ActualsPilotErrorCode,
  type ActualsPublishReceiptV1,
  type ActualsPublishRequestV1,
} from '@shared/contracts/lp-reporting/actuals-pilot.contract';
import {
  AdmissionReceiptCoreV1Schema,
  EMPTY_SELECTION_SET_HASH,
  FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID_5,
  FINANCIAL_FACTS_POLICY_VERSION_1_4_0,
  FinancialFactsPayloadV5Schema,
  type AdmissionReceiptCoreV1,
} from '@shared/contracts/financial-facts-snapshot-v1.contract';
import {
  ACTUALS_LEDGER_TEMPLATE_VERSION,
  ACTUALS_VALUATION_TEMPLATE_VERSION,
} from '@shared/contracts/lp-reporting/actuals-pilot-templates';
import {
  calculateActualsV1,
  type ActualsCalculatorLedgerRowV1,
  type ActualsCalculatorValuationMarkV1,
} from '@shared/lib/financial-facts/actuals-calculator';
import { evaluatePayload5Consumers } from '@shared/lib/financial-facts/payload5-consumer-evaluator';
import { buildSnapshotInputHash } from '@shared/lib/financial-facts/snapshot-hashes';
import {
  buildFinancialFactsPayloadV5,
  type FinancialFactsPayloadV5CashFlowRow,
  type FinancialFactsPayloadV5MarksRow,
} from '../financial-facts/payload5-builder';
import { stripGeneratedAtLeaves } from '../financial-facts-snapshot-service';
import { resolveTerminalFactsHead } from '../financial-facts/terminal-head';
import { parsePersistedFactsRow } from '../financial-facts/parse-persisted-facts-row';
import { buildFundCompanyActualsFacts } from '../fund-actuals/fund-company-actuals-facts-service';
import { invalidateH9Artifacts } from '../h9-artifact-invalidation-service';
import {
  ActualsPilotPreviewError,
  computeActualsPilotRowContentHash,
  computeActualsPilotRowSourceHash,
  prepareActualsPilotPreview,
  type ActualsPilotPreparedPreview,
  type ActualsPilotPreparedRow,
} from './actuals-pilot-preview-service';

const COMMAND_BUDGET_MS = 30_000;
const MAX_MUTATION_ATTEMPTS = 3;
const RETRYABLE_SQLSTATES = new Set(['40001', '40P01']);
const RETRYABLE_UNIQUE_CONSTRAINTS = new Set([
  'source_artifacts_fund_idempotency_unique',
  'financial_facts_snapshots_fund_idempotency_unique',
  'financial_facts_snapshots_supersedes_unique',
]);
const IDEMPOTENCY_KEY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const PREFLIGHT_DATABASE_REACHED = Symbol('actuals-pilot-preflight-database-reached');
const publishLog = logger.child({ service: 'actuals-pilot-publish' });

export interface PublishQueryResult<Row = Record<string, unknown>> {
  readonly rows: Row[];
  readonly rowCount?: number | null;
}

export interface PublishConnection {
  query<Row = Record<string, unknown>>(
    text: string | { readonly text: string; readonly values?: readonly unknown[] },
    values?: readonly unknown[]
  ): Promise<PublishQueryResult<Row>>;
  release(destroy?: boolean): void;
}

export interface ActualsPilotPublishInput {
  readonly fundId: number;
  readonly actorId: number;
  readonly idempotencyKey: string;
  readonly ifMatch: string;
  readonly request: ActualsPublishRequestV1;
  readonly requestId?: string;
}

export interface ActualsPilotPublishResult {
  readonly statusCode: 200 | 201;
  readonly receipt: ActualsPublishReceiptV1;
  readonly replayed: boolean;
  readonly mutationAttempts: number;
  readonly durationMs: number;
}

export interface ActualsPilotPublishOptions {
  readonly connect?: () => Promise<PublishConnection>;
  readonly now?: () => Date;
  readonly monotonicNow?: () => number;
  readonly sleep?: (milliseconds: number) => Promise<void>;
  readonly afterCommit?: (result: ActualsPilotPublishResult) => void | Promise<void>;
  readonly invalidateAfterCommit?: (fundId: number) => Promise<void>;
}

export class ActualsPilotPublishError extends Error {
  readonly statusCode: number;
  readonly code: ActualsPilotErrorCode;
  readonly details?: unknown;

  constructor(statusCode: number, code: ActualsPilotErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'ActualsPilotPublishError';
    this.statusCode = statusCode;
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

interface SnapshotRow {
  id: number;
  fundId: number;
  policyVersion: string;
  payloadSchemaId: string;
  asOfDate: string | Date;
  knowledgeCutoff: Date | string;
  vehicleScope: 'fund_all';
  vehicleIds: number[];
  selectionSetHash: string;
  sourceFactsInputHash: string;
  snapshotInputHash: string;
  payload: unknown;
  consumerEvaluations: unknown[];
  actorId: number | null;
  idempotencyKey: string;
  requestHash: string;
  supersedesSnapshotId: number | null;
  createdAt: Date | string;
}

type BasisCashRow = FinancialFactsPayloadV5CashFlowRow & {
  readonly payload: unknown;
  readonly description: string | null;
};

type BasisMarkRow = FinancialFactsPayloadV5MarksRow & {
  readonly asOfDate: Date | string;
  readonly markSource: string;
  readonly valuationMethod: string;
  readonly costBasis: string | null;
  readonly methodologyNotes: string | null;
  readonly sourceHash: string;
};

interface BasisVehicleRow {
  readonly vehicleId: number;
  readonly vehicleType: 'main_fund' | 'spv' | 'co_invest';
  readonly vehicleSlug: string;
  readonly name: string;
  readonly currency: string;
  readonly committedCapital: string | null;
}

interface FrozenCommand {
  readonly input: ActualsPilotPublishInput;
  readonly request: ActualsPublishRequestV1;
  readonly operationHash: string;
  readonly knowledgeCutoff: Date;
  readonly knowledgeCutoffIso: string;
  readonly startedAt: number;
  readonly deadline: number;
}

function budgetedConnection(
  connection: PublishConnection,
  command: FrozenCommand,
  monotonicNow: () => number,
  timeoutCode: 'PUBLISH_RETRY_EXHAUSTED' | 'MUTATION_OUTCOME_UNKNOWN'
): PublishConnection {
  let poisoned = false;
  return {
    async query<Row = Record<string, unknown>>(
      text: string | { readonly text: string; readonly values?: readonly unknown[] },
      values?: readonly unknown[]
    ): Promise<PublishQueryResult<Row>> {
      if (poisoned) {
        fail(503, timeoutCode, 'Database connection exceeded publication deadline.');
      }
      const milliseconds = remaining(command, monotonicNow);
      if (milliseconds <= 0) {
        poisoned = true;
        fail(503, timeoutCode, 'Actuals publication deadline exhausted.');
      }
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([
          connection.query<Row>(text, values),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
              poisoned = true;
              reject(new ActualsPilotPublishError(
                503,
                timeoutCode,
                'Actuals publication deadline exhausted.'
              ));
            }, milliseconds);
          }),
        ]);
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
    },
    release(destroy?: boolean): void {
      connection.release(destroy === true || poisoned);
    },
  };
}

interface AttemptCreated {
  readonly kind: 'created';
  readonly receipt: ActualsPublishReceiptV1;
}

interface AttemptReplay {
  readonly kind: 'replay';
  readonly receipt: ActualsPublishReceiptV1;
}

type AttemptResult = AttemptCreated | AttemptReplay;

function sqlState(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const code = 'code' in error ? (error as { code?: unknown }).code : undefined;
  if (typeof code === 'string') return code;
  return 'cause' in error ? sqlState((error as { cause?: unknown }).cause) : null;
}

function sqlConstraint(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const constraint = 'constraint' in error
    ? (error as { constraint?: unknown }).constraint
    : undefined;
  if (typeof constraint === 'string') return constraint;
  return 'cause' in error ? sqlConstraint((error as { cause?: unknown }).cause) : null;
}

function isWholeTransactionRetry(error: unknown): boolean {
  const state = sqlState(error);
  if (state !== '23505') return RETRYABLE_SQLSTATES.has(state ?? '');
  const constraint = sqlConstraint(error);
  return constraint !== null && RETRYABLE_UNIQUE_CONSTRAINTS.has(constraint);
}

function isoDay(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function parseStoredValuationPayload(value: string | null) {
  try {
    return ActualsPilotValuationMarkPayloadSchema.parse(JSON.parse(value ?? 'null'));
  } catch {
    fail(409, 'FUND_LEDGER_NOT_PILOT_OWNED', 'Pilot valuation provenance is corrupt.');
  }
}

function ledgerEventType(row: BasisCashRow, expenseCategory: string | null) {
  if (row.eventType === 'lp_capital_call') return 'settled_contribution' as const;
  if (row.eventType === 'fund_expense') {
    return expenseCategory === 'management_fee' ? 'management_fee' as const : 'fund_expense' as const;
  }
  if (
    row.eventType === 'lp_distribution' ||
    row.eventType === 'portfolio_investment' ||
    row.eventType === 'realized_proceeds'
  ) return row.eventType;
  fail(422, 'SOURCE_FACT_CONTRADICTION', 'Stored pilot event type invalid.');
}

function computeSourceFactsInputHash(
  core: AdmissionReceiptCoreV1,
  payload: ReturnType<typeof FinancialFactsPayloadV5Schema.parse>,
  predecessorSnapshotInputHash: string | null
): string {
  return canonicalSha256({
    templateVersions: [
      ACTUALS_LEDGER_TEMPLATE_VERSION,
      core.admitted.valuation === null ? null : ACTUALS_VALUATION_TEMPLATE_VERSION,
    ],
    fundId: core.fundId,
    asOfDate: core.asOfDate,
    ledgerPayloadSha256: core.admitted.ledger.payloadSha256,
    ledgerCanonicalRowsHash: core.admitted.ledger.canonicalRowsHash,
    valuationPayloadSha256: core.admitted.valuation?.payloadSha256 ?? null,
    valuationCanonicalRowsHash: core.admitted.valuation?.canonicalRowsHash ?? null,
    coverage: core.coverage,
    commitmentBasis: {
      vehicleId: payload.vehicleRoster[0]?.vehicleId,
      amount: payload.capitalActuals.committedCapital.value,
    },
    predecessorSnapshotInputHash,
    companyActualsInputHash: payload.companyActuals.inputHash,
  });
}

function fail(status: number, code: ActualsPilotErrorCode, message: string, details?: unknown): never {
  throw new ActualsPilotPublishError(status, code, message, details);
}

function logSuccess(result: ActualsPilotPublishResult, requestId: string | undefined): void {
  try {
    publishLog.info({
      operation: 'actuals_pilot_publish',
      ...(requestId === undefined ? {} : { requestId }),
      fundId: result.receipt.fundId,
      outcome: result.replayed ? 'replayed' : 'created',
      replayed: result.replayed,
      mutationAttempts: result.mutationAttempts,
      durationMs: Math.round(result.durationMs),
      approvedRowCount: result.receipt.admitted.ledger.approvedCount,
      approvedMarkCount: result.receipt.admitted.valuation?.approvedCount ?? 0,
      snapshotId: result.receipt.facts.snapshotId,
      policyVersion: result.receipt.facts.policyVersion,
      payloadSchemaId: result.receipt.facts.payloadSchemaId,
    }, 'Actuals pilot publication completed');
  } catch {
    // Logging cannot change durable publication result.
  }
}

function remaining(command: FrozenCommand, monotonicNow: () => number): number {
  return Math.floor(command.deadline - monotonicNow());
}

async function withinBudget<T>(
  command: FrozenCommand,
  monotonicNow: () => number,
  work: Promise<T>,
  timeoutCode: 'PUBLISH_RETRY_EXHAUSTED' | 'MUTATION_OUTCOME_UNKNOWN',
  onLateValue?: (value: T) => void
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  const observedWork = work.then((value) => {
    if (timedOut) onLateValue?.(value);
    return value;
  });
  observedWork.catch(() => undefined);
  const milliseconds = remaining(command, monotonicNow);
  if (milliseconds <= 0) {
    timedOut = true;
    fail(503, timeoutCode, 'Actuals publication deadline exhausted.');
  }
  try {
    return await Promise.race([
      observedWork,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          timedOut = true;
          reject(
            new ActualsPilotPublishError(
              503,
              timeoutCode,
              'Actuals publication deadline exhausted.'
            )
          );
        }, milliseconds);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function defaultConnect(): Promise<PublishConnection> {
  if (typeof (pool as { connect?: unknown } | null)?.connect !== 'function') {
    fail(503, 'TRANSACTION_UNSUPPORTED', 'Database driver does not provide pooled transactions.');
  }
  return (pool as { connect: () => Promise<PublishConnection> }).connect();
}

function databaseFor(connection: PublishConnection) {
  return drizzle(connection as never, { schema: combinedSchema });
}

export function computeActualsPilotOperationHash(input: {
  readonly fundId: number;
  readonly ifMatch: string;
  readonly request: ActualsPublishRequestV1;
}): string {
  const { request } = input;
  return canonicalSha256({
    contractVersion: request.contractVersion,
    fundId: input.fundId,
    expectedFactsHead: input.ifMatch,
    asOfDate: request.asOfDate,
    ledger: {
      templateVersion: request.ledger.templateVersion,
      payloadSha256: request.ledger.expectedPayloadSha256,
      canonicalRowsHash: request.ledger.expectedCanonicalRowsHash,
      previewHash: request.ledger.expectedPreviewHash,
    },
    valuation: request.valuation === null ? null : {
      templateVersion: request.valuation.templateVersion,
      payloadSha256: request.valuation.expectedPayloadSha256,
      canonicalRowsHash: request.valuation.expectedCanonicalRowsHash,
      previewHash: request.valuation.expectedPreviewHash,
    },
    coverage: request.coverage,
  });
}

function frozenCommand(
  input: ActualsPilotPublishInput,
  now: () => Date,
  monotonicNow: () => number
): FrozenCommand {
  if (!Number.isSafeInteger(input.fundId) || input.fundId <= 0 || input.fundId > 2_147_483_647) {
    fail(400, 'INVALID_BODY', 'fundId must be a positive integer.');
  }
  if (!Number.isSafeInteger(input.actorId) || input.actorId <= 0 || input.actorId > 2_147_483_647) {
    fail(404, 'RESOURCE_NOT_FOUND', 'Resource not found.');
  }
  if (!IDEMPOTENCY_KEY_PATTERN.test(input.idempotencyKey)) {
    fail(400, 'INVALID_IDEMPOTENCY_KEY', 'Idempotency key invalid.');
  }
  if (!IfMatchSchema.safeParse(input.ifMatch).success) {
    fail(400, 'INVALID_IF_MATCH', 'If-Match invalid.');
  }
  const parsed = ActualsPublishRequestV1Schema.safeParse(input.request);
  if (!parsed.success) fail(400, 'INVALID_BODY', 'Actuals publish request invalid.');
  const startedAt = monotonicNow();
  const knowledgeCutoff = new Date(now().getTime());
  const request = parsed.data;
  const frozenInput = Object.freeze({ ...input, request });
  return {
    input: frozenInput,
    request,
    operationHash: computeActualsPilotOperationHash({ fundId: input.fundId, ifMatch: input.ifMatch, request }),
    knowledgeCutoff,
    knowledgeCutoffIso: knowledgeCutoff.toISOString(),
    startedAt,
    deadline: startedAt + COMMAND_BUDGET_MS,
  };
}

async function configureTransaction(
  connection: PublishConnection,
  command: FrozenCommand,
  monotonicNow: () => number,
  fundLockAcquired = false,
  timeoutCode: 'PUBLISH_RETRY_EXHAUSTED' | 'MUTATION_OUTCOME_UNKNOWN' = 'PUBLISH_RETRY_EXHAUSTED'
): Promise<void> {
  const budget = remaining(command, monotonicNow);
  if (budget < 1_000) fail(503, timeoutCode, 'Insufficient publication budget.');
  if (!fundLockAcquired) {
    await withinBudget(
      command,
      monotonicNow,
      connection.query("SET LOCAL TIME ZONE 'UTC'"),
      timeoutCode
    );
  }
  await withinBudget(
    command,
    monotonicNow,
    connection.query(`SET LOCAL statement_timeout = ${fundLockAcquired ? Math.min(10_000, budget) : budget}`),
    timeoutCode
  );
  await withinBudget(
    command,
    monotonicNow,
    connection.query(`SET LOCAL lock_timeout = ${fundLockAcquired ? Math.min(2_000, budget) : budget}`),
    timeoutCode
  );
  await withinBudget(
    command,
    monotonicNow,
    connection.query(`SET LOCAL idle_in_transaction_session_timeout = ${Math.min(10_000, budget)}`),
    timeoutCode
  );
}

function assertBudget(command: FrozenCommand, monotonicNow: () => number): void {
  if (remaining(command, monotonicNow) < 1_000) {
    fail(503, 'PUBLISH_RETRY_EXHAUSTED', 'Insufficient publication budget.');
  }
}

async function lockPublicationScope(
  connection: PublishConnection,
  command: FrozenCommand,
  companyIds: readonly number[] = []
): Promise<void> {
  const fund = await connection.query(
    `SELECT id FROM funds WHERE id = $1 AND data_origin = 'production' AND base_currency = 'USD' FOR SHARE`,
    [command.input.fundId]
  );
  if (fund.rows.length === 0) fail(404, 'RESOURCE_NOT_FOUND', 'Resource not found.');
  const vehicle = await connection.query<{ id: number; committedCapital: string | null }>(
    `SELECT id, committed_capital::text AS "committedCapital"
      FROM vehicles WHERE fund_id = $1 AND vehicle_type = 'main_fund'
      AND status = 'active' AND currency = 'USD' ORDER BY id FOR SHARE`,
    [command.input.fundId]
  );
  if (vehicle.rows.length !== 1) {
    fail(422, 'UNSUPPORTED_VEHICLE_SCOPE', 'Pilot requires exactly one active USD main-fund vehicle.');
  }
  const commitment = vehicle.rows[0]?.committedCapital;
  if (
    commitment === null ||
    commitment === undefined ||
    !ActualsPilotCentExactMoneySchema.safeParse(commitment).success ||
    !isCentExactMoney(commitment)
  ) {
    fail(422, 'SUBCENT_USD_UNSUPPORTED', 'Vehicle commitment must be cent-exact USD.');
  }
  const uniqueCompanyIds = [...new Set(companyIds)].sort((left, right) => left - right);
  if (uniqueCompanyIds.length === 0) return;
  const companies = await connection.query<{ id: number }>(
    'SELECT id FROM portfoliocompanies WHERE fund_id = $1 AND id = ANY($2::int[]) ORDER BY id FOR SHARE',
    [command.input.fundId, uniqueCompanyIds]
  );
  if (companies.rows.length !== uniqueCompanyIds.length) {
    fail(422, 'SOURCE_FACT_CONTRADICTION', 'Referenced company identity changed.');
  }
}

async function acquireFundLock(
  connection: PublishConnection,
  command: FrozenCommand,
  monotonicNow: () => number,
  timeoutCode: 'PUBLISH_RETRY_EXHAUSTED' | 'MUTATION_OUTCOME_UNKNOWN'
): Promise<void> {
  await withinBudget(
    command,
    monotonicNow,
    connection.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `financial-facts:${command.input.fundId}`,
    ]),
    timeoutCode
  );
}

async function authorizeActor(
  connection: PublishConnection,
  command: FrozenCommand,
  monotonicNow: () => number,
  timeoutCode: 'PUBLISH_RETRY_EXHAUSTED' | 'MUTATION_OUTCOME_UNKNOWN'
): Promise<void> {
  const actor = await withinBudget(
    command,
    monotonicNow,
    connection.query<{
      id: number;
      is_active: boolean;
      role: string;
      is_release_canary_principal: boolean;
    }>('SELECT id, is_active, role, is_release_canary_principal FROM users WHERE id = $1 FOR SHARE', [
      command.input.actorId,
    ]),
    timeoutCode
  );
  const row = actor.rows[0];
  if (
    !row ||
    !row.is_active ||
    row.is_release_canary_principal ||
    row.role === 'service'
  ) {
    fail(404, 'RESOURCE_NOT_FOUND', 'Resource not found.');
  }
  const grant = await withinBudget(
    command,
    monotonicNow,
    connection.query(
      'SELECT user_id FROM user_fund_grants WHERE user_id = $1 AND fund_id = $2 FOR SHARE',
      [command.input.actorId, command.input.fundId]
    ),
    timeoutCode
  );
  if (grant.rows.length === 0) fail(404, 'RESOURCE_NOT_FOUND', 'Resource not found.');
  if (row.role !== 'admin') fail(403, 'INSUFFICIENT_ROLE', 'Insufficient role.');
}

const SNAPSHOT_SELECT = `
  SELECT id, fund_id AS "fundId", policy_version AS "policyVersion",
    payload_schema_id AS "payloadSchemaId", as_of_date AS "asOfDate",
    knowledge_cutoff AS "knowledgeCutoff", vehicle_scope AS "vehicleScope",
    vehicle_ids AS "vehicleIds", selection_set_hash AS "selectionSetHash",
    source_facts_input_hash AS "sourceFactsInputHash",
    snapshot_input_hash AS "snapshotInputHash", payload,
    consumer_evaluations AS "consumerEvaluations", actor_id AS "actorId",
    idempotency_key AS "idempotencyKey", request_hash AS "requestHash",
    supersedes_snapshot_id AS "supersedesSnapshotId", created_at AS "createdAt"
  FROM financial_facts_snapshots`;

async function loadReceiptCandidate(
  connection: PublishConnection,
  command: FrozenCommand,
  monotonicNow: () => number,
  timeoutCode: 'PUBLISH_RETRY_EXHAUSTED' | 'MUTATION_OUTCOME_UNKNOWN'
): Promise<SnapshotRow | null> {
  const result = await withinBudget(
    command,
    monotonicNow,
    connection.query<SnapshotRow>(
      `${SNAPSHOT_SELECT} WHERE fund_id = $1 AND idempotency_key = $2`,
      [command.input.fundId, command.input.idempotencyKey]
    ),
    timeoutCode
  );
  return result.rows[0] ?? null;
}

function receiptFromStored(
  row: SnapshotRow,
  command: FrozenCommand,
  predecessorSnapshotInputHash: string | null
): ActualsPublishReceiptV1 {
  if (row.actorId !== command.input.actorId) {
    fail(404, 'RESOURCE_NOT_FOUND', 'Resource not found.');
  }
  const normalizedRow = {
    ...row,
    asOfDate: isoDay(row.asOfDate),
    knowledgeCutoff: row.knowledgeCutoff instanceof Date
      ? row.knowledgeCutoff
      : new Date(row.knowledgeCutoff),
    createdAt: row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt),
  };
  const parsed = parsePersistedFactsRow(normalizedRow as never);
  if (parsed.kind !== 'facts' || parsed.snapshot.policyVersion !== FINANCIAL_FACTS_POLICY_VERSION_1_4_0) {
    fail(500, 'INTERNAL_ERROR', 'Stored actuals receipt is corrupt.');
  }
  const payload = parsed.snapshot.payload;
  if (!('admissionReceiptCore' in payload)) {
    fail(500, 'INTERNAL_ERROR', 'Stored actuals receipt is corrupt.');
  }
  const coreResult = AdmissionReceiptCoreV1Schema.safeParse(payload.admissionReceiptCore);
  if (!coreResult.success) fail(500, 'INTERNAL_ERROR', 'Stored actuals receipt is corrupt.');
  const core = coreResult.data;
  const recomputedHash = buildSnapshotInputHash({
    fundId: row.fundId,
    vehicleIds: row.vehicleIds,
    asOfDate: normalizedRow.asOfDate,
    knowledgeCutoff: normalizedRow.knowledgeCutoff.toISOString(),
    policyVersion: FINANCIAL_FACTS_POLICY_VERSION_1_4_0,
    payloadSchemaId: FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID_5,
    selectionSetHash: row.selectionSetHash,
    payload,
  });
  if (
    row.requestHash !== core.operationHash ||
    recomputedHash !== row.snapshotInputHash ||
    core.fundId !== row.fundId ||
    core.actor.userId !== row.actorId ||
    core.asOfDate !== normalizedRow.asOfDate ||
    core.facts.policyVersion !== row.policyVersion ||
    core.facts.payloadSchemaId !== row.payloadSchemaId ||
    core.facts.supersedesSnapshotId !== row.supersedesSnapshotId ||
    core.facts.knowledgeCutoff !== normalizedRow.knowledgeCutoff.toISOString()
  ) {
    fail(500, 'INTERNAL_ERROR', 'Stored actuals receipt is incoherent.');
  }
  const expectedSourceFactsInputHash = computeSourceFactsInputHash(
    core,
    payload,
    predecessorSnapshotInputHash
  );
  if (row.sourceFactsInputHash !== expectedSourceFactsInputHash) {
    fail(500, 'INTERNAL_ERROR', 'Stored actuals source hash is incoherent.');
  }
  if (core.operationHash !== command.operationHash) {
    fail(409, 'IDEMPOTENCY_KEY_REUSED', 'Idempotency key already used for another request.');
  }
  return ActualsPublishReceiptV1Schema.parse({
    contractVersion: core.contractVersion,
    operationHash: core.operationHash,
    fundId: core.fundId,
    asOfDate: core.asOfDate,
    coverage: {
      ledger: core.coverage.ledger,
      priorFactsSnapshotId: core.coverage.priorFactsSnapshotId,
    },
    admitted: core.admitted,
    facts: {
      ...core.facts,
      snapshotId: row.id,
      snapshotInputHash: row.snapshotInputHash,
      etag: `"financial-facts:${row.id}:${row.snapshotInputHash}"`,
    },
    basisRef: {
      schemaId: 'financial-facts-basis-ref/1.0.0',
      fundId: row.fundId,
      snapshotId: row.id,
      snapshotInputHash: row.snapshotInputHash,
      sourceFactsInputHash: row.sourceFactsInputHash,
      policyVersion: FINANCIAL_FACTS_POLICY_VERSION_1_4_0,
      asOfDate: normalizedRow.asOfDate,
      knowledgeCutoff: normalizedRow.knowledgeCutoff.toISOString(),
    },
  });
}

async function projectStoredReceipt(
  connection: PublishConnection,
  row: SnapshotRow,
  command: FrozenCommand,
  monotonicNow: () => number,
  timeoutCode: 'PUBLISH_RETRY_EXHAUSTED' | 'MUTATION_OUTCOME_UNKNOWN'
): Promise<ActualsPublishReceiptV1> {
  if (row.actorId !== command.input.actorId) {
    fail(404, 'RESOURCE_NOT_FOUND', 'Resource not found.');
  }
  let predecessorSnapshotInputHash: string | null = null;
  if (row.supersedesSnapshotId !== null) {
    const predecessor = await withinBudget(
      command,
      monotonicNow,
      connection.query<{ snapshotInputHash: string }>(
        `SELECT snapshot_input_hash AS "snapshotInputHash"
          FROM financial_facts_snapshots WHERE fund_id = $1 AND id = $2`,
        [row.fundId, row.supersedesSnapshotId]
      ),
      timeoutCode
    );
    predecessorSnapshotInputHash = predecessor.rows[0]?.snapshotInputHash ?? null;
    if (predecessorSnapshotInputHash === null) {
      fail(500, 'INTERNAL_ERROR', 'Stored actuals predecessor is missing.');
    }
  }
  return receiptFromStored(row, command, predecessorSnapshotInputHash);
}

function expectedHeadTag(head: { id: number; snapshotInputHash: string } | null): string {
  return head === null
    ? '"financial-facts:none"'
    : `"financial-facts:${head.id}:${head.snapshotInputHash}"`;
}

function validateHead(command: FrozenCommand, head: Awaited<ReturnType<typeof resolveTerminalFactsHead>>) {
  if (head.kind === 'ambiguous') fail(409, 'FACTS_HEAD_AMBIGUOUS', 'Financial facts head ambiguous.');
  if (head.kind === 'invalid') fail(409, 'FACTS_LINEAGE_INVALID', 'Financial facts lineage invalid.');
  const row = head.kind === 'head' ? head.row : null;
  if (command.input.ifMatch !== expectedHeadTag(row)) {
    fail(412, 'FACTS_HEAD_PRECONDITION_FAILED', 'Financial facts head changed.',
      row === null ? undefined : { currentFactsSnapshotId: row.id });
  }
  if (row && command.request.asOfDate < row.asOfDate) {
    fail(422, 'HISTORICAL_AS_OF_NOT_HEAD_ELIGIBLE', 'Historical as-of date cannot become head.');
  }
  const coverage = command.request.coverage;
  if (row === null) {
    if (coverage.ledger !== 'inception_to_date' || coverage.priorFactsSnapshotId !== null) {
      fail(422, 'INCOMPLETE_COVERAGE', 'First publication requires inception-to-date coverage.');
    }
  } else if (coverage.priorFactsSnapshotId !== row.id) {
    fail(422, 'INCOMPLETE_COVERAGE', 'Coverage predecessor must equal current head.');
  } else if (coverage.ledger === 'incremental_since_prior_head') {
    if (row.policyVersion !== FINANCIAL_FACTS_POLICY_VERSION_1_4_0) {
      fail(422, 'INCOMPLETE_COVERAGE', 'Incremental coverage requires current policy-1.4 head.');
    }
    const predecessorPayload = FinancialFactsPayloadV5Schema.safeParse(row.payload);
    if (!predecessorPayload.success || predecessorPayload.data.capitalActuals.ledgerCoverage !== 'complete') {
      fail(422, 'INCOMPLETE_COVERAGE', 'Incremental coverage requires a complete predecessor basis.');
    }
  }
  return row;
}

async function assertPilotOwnership(connection: PublishConnection, fundId: number): Promise<void> {
  const result = await connection.query<{ count: string }>(`
    SELECT (
      (SELECT count(*) FROM cash_flow_events WHERE fund_id = $1 AND imported_from IS DISTINCT FROM 'actuals_pilot_v1') +
      (SELECT count(*) FROM valuation_marks WHERE fund_id = $1 AND imported_from IS DISTINCT FROM 'actuals_pilot_v1')
    )::text AS count`, [fundId]);
  if (result.rows[0]?.count !== '0') {
    fail(409, 'FUND_LEDGER_NOT_PILOT_OWNED', 'Fund ledger is not pilot-owned.');
  }
}

function previewRequest(file: ActualsPublishRequestV1['ledger'], asOfDate: string) {
  return {
    contractVersion: 'actuals-preview-request/1.0.0' as const,
    templateVersion: file.templateVersion,
    asOfDate,
    fileName: file.fileName,
    payload: file.payload,
  };
}

async function preflightFile(
  fundId: number,
  asOfDate: string,
  file: ActualsPublishRequestV1['ledger']
): Promise<void> {
  const database = {
    select(): never {
      throw PREFLIGHT_DATABASE_REACHED;
    },
  } as never;
  try {
    const prepared = await prepareActualsPilotPreview(
      { fundId, request: previewRequest(file, asOfDate) },
      { database }
    );
    if (prepared.preview.issues.some((issue) => issue.severity === 'error')) {
      fail(422, 'INVALID_CSV', 'Actuals CSV failed validation.');
    }
  } catch (error) {
    if (error === PREFLIGHT_DATABASE_REACHED) return;
    if (error instanceof ActualsPilotPreviewError) {
      fail(error.statusCode, error.code as ActualsPilotErrorCode, error.message);
    }
    throw error;
  }
}

function validatePrepared(
  kind: 'ledger' | 'valuation',
  prepared: ActualsPilotPreparedPreview,
  expected: ActualsPublishRequestV1['ledger']
): void {
  const preview = prepared.preview;
  if (
    preview.payloadSha256 !== expected.expectedPayloadSha256 ||
    preview.canonicalRowsHash !== expected.expectedCanonicalRowsHash ||
    preview.previewHash !== expected.expectedPreviewHash
  ) {
    fail(422, 'INVALID_CSV', `${kind} preview hashes changed.`);
  }
  if (preview.issues.some((issue) => issue.severity === 'error')) {
    fail(422, 'INVALID_CSV', `${kind} preview cannot publish.`);
  }
}

async function insertArtifacts(
  connection: PublishConnection,
  command: FrozenCommand,
  ledger: ActualsPilotPreparedPreview,
  valuation: ActualsPilotPreparedPreview | null
): Promise<{ ledgerId: number; valuationId: number | null }> {
  const files = [
    { kind: 'ledger', prepared: ledger, file: command.request.ledger },
    ...(valuation && command.request.valuation
      ? [{ kind: 'valuation', prepared: valuation, file: command.request.valuation }]
      : []),
  ];
  const ids = new Map<string, number>();
  for (const { kind, prepared, file } of files) {
    const idempotencyKey = `ap1:${kind}:${command.request.asOfDate}:${prepared.preview.previewHash}`;
    const requestHash = canonicalSha256({
        contractVersion: 'actuals-pilot-source-artifact/1.0.0',
        fundId: command.input.fundId,
        asOfDate: command.request.asOfDate,
        templateVersion: file.templateVersion,
        payloadSha256: prepared.preview.payloadSha256,
        byteCount: prepared.preview.byteCount,
        canonicalRowsHash: prepared.preview.canonicalRowsHash,
        previewHash: prepared.preview.previewHash,
      });
    const existing = await connection.query<{
      id: number;
      sourceType: string;
      mediaType: string;
      byteCount: number;
      payloadSha256: string;
      payload: Buffer | null;
      purgedAt: Date | null;
      requestHash: string;
    }>(`SELECT id, source_type AS "sourceType", media_type AS "mediaType",
      byte_count AS "byteCount", payload_sha256 AS "payloadSha256", payload,
      purged_at AS "purgedAt", request_hash AS "requestHash"
      FROM source_artifacts WHERE fund_id = $1 AND idempotency_key = $2`,
    [command.input.fundId, idempotencyKey]);
    const prior = existing.rows[0];
    if (prior) {
      const payloadStateCoherent = prior.purgedAt === null
        ? prior.payload !== null && prior.payload.equals(Buffer.from(prepared.payload))
        : prior.payload === null;
      if (
        prior.sourceType !== 'csv' ||
        prior.mediaType !== 'text/csv' ||
        prior.byteCount !== prepared.preview.byteCount ||
        prior.payloadSha256 !== prepared.preview.payloadSha256 ||
        prior.requestHash !== requestHash ||
        !payloadStateCoherent
      ) {
        fail(500, 'INTERNAL_ERROR', 'Stored source artifact is incoherent.');
      }
      ids.set(kind, prior.id);
      continue;
    }
    const inserted = await connection.query<{ id: number }>(`
      INSERT INTO source_artifacts
        (fund_id, source_type, file_name, media_type, byte_count, payload_sha256, payload,
         purge_after, created_by, idempotency_key, request_hash, created_at)
      VALUES ($1, 'csv', $2, 'text/csv', $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id`, [
      command.input.fundId,
      prepared.preview.sanitizedFileName,
      prepared.preview.byteCount,
      prepared.preview.payloadSha256,
      Buffer.from(prepared.payload),
      new Date(command.knowledgeCutoff.getTime() + 90 * 86_400_000),
      command.input.actorId,
      idempotencyKey,
      requestHash,
      command.knowledgeCutoff,
    ]);
    const id = inserted.rows[0]?.id;
    if (!id) fail(500, 'INTERNAL_ERROR', 'Source artifact insert failed.');
    ids.set(kind, id);
  }
  const ledgerId = ids.get('ledger');
  if (!ledgerId) fail(500, 'INTERNAL_ERROR', 'Ledger artifact insert failed.');
  return { ledgerId, valuationId: ids.get('valuation') ?? null };
}

function acceptedRows(rows: readonly ActualsPilotPreparedRow[]): ActualsPilotPreparedRow[] {
  return rows.filter((row) => row.status === 'valid');
}

async function insertCashRows(
  connection: PublishConnection,
  command: FrozenCommand,
  rows: readonly ActualsPilotPreparedRow[],
  importBatchId: string
): Promise<number[]> {
  const accepted = acceptedRows(rows);
  if (accepted.length === 0) return [];
  const values: unknown[] = [];
  const tuples = accepted.map((row, index) => {
    const fields = row.canonicalEconomicFields!;
    const offset = index * 12;
    const templateType = String(row.eventType);
    const eventType = templateType === 'settled_contribution'
      ? 'lp_capital_call'
      : templateType === 'management_fee' || templateType === 'fund_expense'
        ? 'fund_expense'
        : templateType;
    const perspective = ['settled_contribution', 'lp_distribution'].includes(templateType)
      ? 'lp_net'
      : 'fund_gross';
    values.push(
      command.input.fundId, row.vehicleId, row.companyId, eventType, row.canonicalAmount,
      `${row.effectiveDate}T00:00:00.000Z`, perspective, fields['description'] ?? null,
      {
        contractVersion: 'actuals-pilot-cash-flow/1.0.0',
        sourceExternalRef: row.sourceExternalRef,
        rowContentHash: row.rowContentHash,
        templateVersion: command.request.ledger.templateVersion,
        settlementStatus: templateType === 'settled_contribution' ? 'settled' : null,
        deploymentCategory: fields['deploymentCategory'] ?? null,
        expenseCategory: fields['expenseCategory'] ?? null,
        distributionType: fields['distributionType'] ?? null,
        recallable: fields['recallable'] ?? null,
      },
      importBatchId, row.rowSourceHash, command.input.actorId
    );
    return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, 'USD', $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, 'approved', 'actuals_pilot_v1', $${offset + 10}, $${offset + 11}, $${offset + 12})`;
  });
  const result = await connection.query<{ id: number }>(`
    INSERT INTO cash_flow_events
      (fund_id, vehicle_id, company_id, event_type, amount, currency, event_date, perspective,
       description, payload, status, imported_from, import_batch_id, source_hash, created_by)
    VALUES ${tuples.join(', ')} RETURNING id`, values);
  return result.rows.map(({ id }) => id).sort((a, b) => a - b);
}

async function insertMarks(
  connection: PublishConnection,
  command: FrozenCommand,
  rows: readonly ActualsPilotPreparedRow[],
  importBatchId: string
): Promise<number[]> {
  const accepted = acceptedRows(rows);
  if (accepted.length === 0) return [];
  const values: unknown[] = [];
  const tuples = accepted.map((row, index) => {
    const fields = row.canonicalEconomicFields!;
    const offset = index * 14;
    values.push(
      command.input.fundId, row.vehicleId, row.companyId, row.effectiveDate, row.canonicalAmount,
      fields['costBasis'] ?? null, fields['markSource'], fields['confidenceLevel'],
      fields['valuationMethod'], command.input.actorId, importBatchId, row.rowSourceHash,
      JSON.stringify({
        contractVersion: 'actuals-pilot-valuation-mark/1.0.0',
        sourceExternalRef: row.sourceExternalRef,
        rowContentHash: row.rowContentHash,
        templateVersion: command.request.valuation?.templateVersion,
      }), command.knowledgeCutoff
    );
    return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 4}, $${offset + 5}, 'USD', $${offset + 6}, 'planning_company_fmv', $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 13}, 'approved', $${offset + 10}, $${offset + 14}, 'actuals_pilot_v1', $${offset + 11}, $${offset + 12})`;
  });
  const result = await connection.query<{ id: number }>(`
    INSERT INTO valuation_marks
      (fund_id, vehicle_id, company_id, mark_date, as_of_date, fair_value, currency, cost_basis,
       mark_purpose, mark_source, confidence_level, valuation_method, methodology_notes, status,
       approved_by, approved_at, imported_from, import_batch_id, source_hash)
    VALUES ${tuples.join(', ')} RETURNING id`, values);
  return result.rows.map(({ id }) => id).sort((a, b) => a - b);
}

async function loadBasis(connection: PublishConnection, fundId: number, asOfDate: string) {
  const cash = await connection.query<BasisCashRow>(`SELECT id, fund_id AS "fundId", vehicle_id AS "vehicleId",
      company_id AS "companyId", event_type AS "eventType", amount::text, currency,
      event_date AS "eventDate", perspective, description, payload, status,
      imported_from AS "importedFrom",
      source_hash AS "sourceHash", supersedes_event_id AS "supersedesEventId",
      reversal_of_event_id AS "reversalOfEventId"
      FROM cash_flow_events WHERE fund_id = $1 AND imported_from = 'actuals_pilot_v1'
        AND status IN ('approved','locked') AND event_date::date <= $2 ORDER BY event_date, id`,
    [fundId, asOfDate]);
  const marks = await connection.query<BasisMarkRow>(`SELECT id, fund_id AS "fundId", vehicle_id AS "vehicleId",
      company_id AS "companyId", mark_date AS "markDate", as_of_date AS "asOfDate",
      fair_value::text AS "fairValue", currency, cost_basis::text AS "costBasis",
      mark_purpose AS "markPurpose", mark_source AS "markSource",
      confidence_level AS "confidenceLevel", valuation_method AS "valuationMethod",
      methodology_notes AS "methodologyNotes", status, imported_from AS "importedFrom",
      source_hash AS "sourceHash"
      FROM valuation_marks WHERE fund_id = $1 AND imported_from = 'actuals_pilot_v1'
        AND status IN ('approved','locked') AND as_of_date <= $2 ORDER BY mark_date, id`,
    [fundId, asOfDate]);
  const vehicles = await connection.query<BasisVehicleRow>(`SELECT id AS "vehicleId", vehicle_type AS "vehicleType",
      vehicle_slug AS "vehicleSlug", name, currency, committed_capital::text AS "committedCapital"
      FROM vehicles WHERE fund_id = $1 AND status = 'active' ORDER BY id`, [fundId]);
  return { cash: cash.rows, marks: marks.rows, vehicles: vehicles.rows };
}

function validateCumulativeBasisRows(basis: Awaited<ReturnType<typeof loadBasis>>): void {
  for (const row of basis.cash) {
    const payload = ActualsPilotCashFlowPayloadSchema.safeParse(row.payload);
    if (!payload.success || row.sourceHash !== computeActualsPilotRowSourceHash(row.fundId, payload.data.sourceExternalRef)) {
      fail(409, 'FUND_LEDGER_NOT_PILOT_OWNED', 'Pilot cash-flow provenance is corrupt.');
    }
    const templateEventType = ledgerEventType(row, payload.data.expenseCategory);
    const rowContentHash = computeActualsPilotRowContentHash({
      templateVersion: ACTUALS_LEDGER_TEMPLATE_VERSION,
      rowSourceHash: row.sourceHash,
      canonicalEconomicFields: {
        eventType: templateEventType,
        effectiveDate: isoDay(row.eventDate),
        amount: row.amount,
        currency: row.currency,
        deploymentCategory: payload.data.deploymentCategory,
        description: row.description ?? null,
        expenseCategory: payload.data.expenseCategory,
        distributionType: payload.data.distributionType,
        recallable: payload.data.recallable,
      },
      resolvedCompanyId: row.companyId,
      resolvedVehicleId: row.vehicleId,
    });
    if (rowContentHash !== payload.data.rowContentHash) {
      fail(409, 'FUND_LEDGER_NOT_PILOT_OWNED', 'Pilot cash-flow content is corrupt.');
    }
  }
  for (const row of basis.marks) {
    const payload = parseStoredValuationPayload(row.methodologyNotes);
    if (row.sourceHash !== computeActualsPilotRowSourceHash(row.fundId, payload.sourceExternalRef)) {
      fail(409, 'FUND_LEDGER_NOT_PILOT_OWNED', 'Pilot valuation provenance is corrupt.');
    }
    const rowContentHash = computeActualsPilotRowContentHash({
      templateVersion: ACTUALS_VALUATION_TEMPLATE_VERSION,
      rowSourceHash: row.sourceHash,
      canonicalEconomicFields: {
        markDate: isoDay(row.markDate),
        positionFairValue: row.fairValue,
        currency: row.currency,
        markSource: row.markSource,
        confidenceLevel: row.confidenceLevel,
        valuationMethod: row.valuationMethod,
        costBasis: row.costBasis,
      },
      resolvedCompanyId: row.companyId,
      resolvedVehicleId: row.vehicleId,
    });
    if (rowContentHash !== payload.rowContentHash) {
      fail(409, 'FUND_LEDGER_NOT_PILOT_OWNED', 'Pilot valuation content is corrupt.');
    }
  }
}

function sameIds(actual: readonly number[], expected: ReadonlySet<number>): boolean {
  return actual.length === expected.size && actual.every((id) => expected.has(id));
}

async function assertCumulativeBasisMatchesReceipts(
  connection: PublishConnection,
  fundId: number,
  predecessorId: number | null,
  basis: Awaited<ReturnType<typeof loadBasis>>,
  approvedRowIds: readonly number[],
  approvedMarkIds: readonly number[]
): Promise<void> {
  const expectedRows = new Set(approvedRowIds);
  const expectedMarks = new Set(approvedMarkIds);
  if (predecessorId !== null) {
    const snapshots = await connection.query<SnapshotRow>(
      `${SNAPSHOT_SELECT} WHERE fund_id = $1 ORDER BY id`,
      [fundId]
    );
    const byId = new Map(snapshots.rows.map((row) => [row.id, row]));
    const visited = new Set<number>();
    let currentId: number | null = predecessorId;
    while (currentId !== null) {
      if (visited.has(currentId)) fail(500, 'INTERNAL_ERROR', 'Pilot receipt lineage contains a cycle.');
      visited.add(currentId);
      const snapshot = byId.get(currentId);
      if (!snapshot) fail(500, 'INTERNAL_ERROR', 'Pilot receipt lineage is detached.');
      if (snapshot.policyVersion === FINANCIAL_FACTS_POLICY_VERSION_1_4_0) {
        const payload = FinancialFactsPayloadV5Schema.safeParse(snapshot.payload);
        if (!payload.success) fail(500, 'INTERNAL_ERROR', 'Pilot predecessor payload is corrupt.');
        const core = payload.data.admissionReceiptCore;
        const normalizedAsOfDate = isoDay(snapshot.asOfDate);
        const normalizedCutoff = snapshot.knowledgeCutoff instanceof Date
          ? snapshot.knowledgeCutoff
          : new Date(snapshot.knowledgeCutoff);
        const predecessorHash = snapshot.supersedesSnapshotId === null
          ? null
          : byId.get(snapshot.supersedesSnapshotId)?.snapshotInputHash ?? null;
        const snapshotHash = buildSnapshotInputHash({
          fundId: snapshot.fundId,
          vehicleIds: snapshot.vehicleIds,
          asOfDate: normalizedAsOfDate,
          knowledgeCutoff: normalizedCutoff.toISOString(),
          policyVersion: FINANCIAL_FACTS_POLICY_VERSION_1_4_0,
          payloadSchemaId: FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID_5,
          selectionSetHash: snapshot.selectionSetHash,
          payload: payload.data,
        });
        if (
          snapshot.requestHash !== core.operationHash ||
          snapshot.snapshotInputHash !== snapshotHash ||
          snapshot.sourceFactsInputHash !== computeSourceFactsInputHash(core, payload.data, predecessorHash) ||
          core.fundId !== snapshot.fundId ||
          core.asOfDate !== normalizedAsOfDate ||
          core.facts.supersedesSnapshotId !== snapshot.supersedesSnapshotId ||
          core.facts.knowledgeCutoff !== normalizedCutoff.toISOString()
        ) {
          fail(500, 'INTERNAL_ERROR', 'Pilot predecessor receipt is incoherent.');
        }
        for (const id of core.admitted.ledger.approvedRowIds) {
          expectedRows.add(id);
        }
        for (const id of core.admitted.valuation?.approvedMarkIds ?? []) {
          expectedMarks.add(id);
        }
      }
      currentId = snapshot.supersedesSnapshotId;
    }
  }
  if (
    !sameIds(basis.cash.map((row) => row.id), expectedRows) ||
    !sameIds(basis.marks.map((row) => row.id), expectedMarks)
  ) {
    fail(409, 'FUND_LEDGER_NOT_PILOT_OWNED', 'Pilot basis does not match admitted receipt lineage.');
  }
}

async function createPublication(
  connection: PublishConnection,
  command: FrozenCommand,
  head: ReturnType<typeof validateHead>,
  ledger: ActualsPilotPreparedPreview,
  valuation: ActualsPilotPreparedPreview | null
): Promise<ActualsPublishReceiptV1> {
  const database = databaseFor(connection) as never;
  const artifacts = await insertArtifacts(connection, command, ledger, valuation);
  const importBatchId = randomUUID();
  const approvedRowIds = await insertCashRows(connection, command, ledger.rows, importBatchId);
  const approvedMarkIds = valuation
    ? await insertMarks(connection, command, valuation.rows, importBatchId)
    : [];
  const basis = await loadBasis(connection, command.input.fundId, command.request.asOfDate);
  validateCumulativeBasisRows(basis);
  await assertCumulativeBasisMatchesReceipts(
    connection,
    command.input.fundId,
    head?.id ?? null,
    basis,
    approvedRowIds,
    approvedMarkIds
  );
  if (basis.vehicles.length !== 1 || basis.vehicles[0]?.committedCapital == null) {
    fail(422, 'UNSUPPORTED_VEHICLE_SCOPE', 'Pilot requires one active vehicle with commitment.');
  }
  const vehicle = basis.vehicles[0]!;
  const committedCapital = vehicle.committedCapital;
  if (committedCapital === null) fail(422, 'UNSUPPORTED_VEHICLE_SCOPE', 'Vehicle commitment unavailable.');
  const ledgerRows: ActualsCalculatorLedgerRowV1[] = basis.cash.map((row) => {
    const storedPayload = ActualsPilotCashFlowPayloadSchema.parse(row.payload);
    return {
      ...storedPayload,
      eventType: ledgerEventType(row, storedPayload.expenseCategory),
      canonicalAmount: row.amount,
      effectiveDate: isoDay(row.eventDate),
      resolvedCompanyId: row.companyId,
      resolvedVehicleId: row.vehicleId,
    };
  });
  const roster = [...new Map(
    ledgerRows.filter((row) => row.eventType === 'portfolio_investment')
      .map((row) => [`${row.resolvedVehicleId}:${row.resolvedCompanyId}`, {
        vehicleId: row.resolvedVehicleId, companyId: row.resolvedCompanyId,
      }])
  ).values()] as Array<{ vehicleId: number; companyId: number }>;
  const currentValuationSourceHashes = new Set(
    valuation?.rows.flatMap((row) =>
      row.rowSourceHash !== null && (row.status === 'valid' || row.status === 'already_imported')
        ? [row.rowSourceHash]
        : []) ?? []
  );
  const valuationMarks: ActualsCalculatorValuationMarkV1[] = basis.marks
    .filter((row): row is BasisMarkRow & { vehicleId: number } =>
      row.vehicleId !== null && currentValuationSourceHashes.has(row.sourceHash))
    .map((row) => ({
      ...parseStoredValuationPayload(row.methodologyNotes),
      markId: row.id,
      resolvedVehicleId: row.vehicleId,
      resolvedCompanyId: row.companyId,
      positionFairValue: row.fairValue,
      markDate: isoDay(row.markDate),
      markSource: row.markSource,
      confidenceLevel: row.confidenceLevel === 'high' || row.confidenceLevel === 'low'
        ? row.confidenceLevel
        : 'medium',
      externalRefHash: row.sourceHash,
    }));
  const calculator = calculateActualsV1({
    ledgerRows,
    vehicleCommitment: {
      vehicleId: vehicle.vehicleId,
      amount: committedCapital,
      sourceHash: canonicalSha256({ fundId: command.input.fundId, vehicleId: vehicle.vehicleId, amount: committedCapital }),
    },
    roster,
    valuationMarks,
    ledgerCoverage: 'complete',
    ledgerPayloadSha256: command.request.ledger.expectedPayloadSha256,
    valuationPayloadSha256: command.request.valuation?.expectedPayloadSha256 ?? null,
    predecessorSnapshotInputHash: head?.snapshotInputHash ?? null,
  });
  if (!calculator.ok) {
    fail(
      422,
      calculator.code === 'NEGATIVE_UNCALLED_CAPITAL'
        ? 'NEGATIVE_UNCALLED_CAPITAL'
        : 'SOURCE_FACT_CONTRADICTION',
      calculator.message
    );
  }
  const companyActuals = await buildFundCompanyActualsFacts({
    database,
    fundId: command.input.fundId,
    asOfDate: command.request.asOfDate,
    now: command.knowledgeCutoff,
    planningMarkSources: ['actuals_pilot_v1'],
  });
  const core: AdmissionReceiptCoreV1 = AdmissionReceiptCoreV1Schema.parse({
    contractVersion: 'actuals-pilot-publish-receipt/1.0.0',
    operationHash: command.operationHash,
    fundId: command.input.fundId,
    asOfDate: command.request.asOfDate,
    coverage: command.request.coverage,
    admitted: {
      ledger: {
        sourceArtifactId: artifacts.ledgerId,
        payloadSha256: ledger.preview.payloadSha256,
        canonicalRowsHash: ledger.preview.canonicalRowsHash,
        previewHash: ledger.preview.previewHash,
        approvedRowIds,
        approvedCount: approvedRowIds.length,
      },
      valuation: valuation && artifacts.valuationId
        ? {
            sourceArtifactId: artifacts.valuationId,
            payloadSha256: valuation.preview.payloadSha256,
            canonicalRowsHash: valuation.preview.canonicalRowsHash,
            previewHash: valuation.preview.previewHash,
            approvedMarkIds,
            approvedCount: approvedMarkIds.length,
          }
        : null,
      importBatchId,
    },
    facts: {
      policyVersion: FINANCIAL_FACTS_POLICY_VERSION_1_4_0,
      payloadSchemaId: FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID_5,
      supersedesSnapshotId: head?.id ?? null,
      knowledgeCutoff: command.knowledgeCutoffIso,
    },
    actor: { userId: command.input.actorId },
  });
  const payload = buildFinancialFactsPayloadV5({
    cashRows: basis.cash,
    markRows: basis.marks,
    vehicleRoster: basis.vehicles.map(({ committedCapital: _ignored, ...row }) => row),
    calculatorResult: calculator,
    companyActuals: stripGeneratedAtLeaves(companyActuals) as never,
    asOfDate: command.request.asOfDate,
    knowledgeCutoff: command.knowledgeCutoffIso,
    admissionReceiptCore: core,
  });
  const consumerEvaluations = evaluatePayload5Consumers(payload);
  const sourceFactsInputHash = canonicalSha256({
    templateVersions: [command.request.ledger.templateVersion, command.request.valuation?.templateVersion ?? null],
    fundId: command.input.fundId,
    asOfDate: command.request.asOfDate,
    ledgerPayloadSha256: ledger.preview.payloadSha256,
    ledgerCanonicalRowsHash: ledger.preview.canonicalRowsHash,
    valuationPayloadSha256: valuation?.preview.payloadSha256 ?? null,
    valuationCanonicalRowsHash: valuation?.preview.canonicalRowsHash ?? null,
    coverage: command.request.coverage,
    commitmentBasis: { vehicleId: vehicle.vehicleId, amount: committedCapital },
    predecessorSnapshotInputHash: head?.snapshotInputHash ?? null,
    companyActualsInputHash: companyActuals.inputHash,
  });
  const snapshotInputHash = buildSnapshotInputHash({
    fundId: command.input.fundId,
    vehicleIds: [vehicle.vehicleId],
    asOfDate: command.request.asOfDate,
    knowledgeCutoff: command.knowledgeCutoffIso,
    policyVersion: FINANCIAL_FACTS_POLICY_VERSION_1_4_0,
    payloadSchemaId: FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID_5,
    selectionSetHash: EMPTY_SELECTION_SET_HASH,
    payload,
  });
  const inserted = await connection.query<SnapshotRow>(`
    INSERT INTO financial_facts_snapshots
      (fund_id, policy_version, payload_schema_id, as_of_date, knowledge_cutoff, vehicle_scope,
       vehicle_ids, selection_set_hash, source_facts_input_hash, snapshot_input_hash, payload,
       consumer_evaluations, actor_id, idempotency_key, request_hash, supersedes_snapshot_id, created_at)
    VALUES ($1,$2,$3,$4,$5,'fund_all',$6::jsonb,$7,$8,$9,$10::jsonb,$11::jsonb,$12,$13,$14,$15,$5)
    RETURNING id, fund_id AS "fundId", policy_version AS "policyVersion",
      payload_schema_id AS "payloadSchemaId", as_of_date AS "asOfDate",
      knowledge_cutoff AS "knowledgeCutoff", vehicle_scope AS "vehicleScope",
      vehicle_ids AS "vehicleIds", selection_set_hash AS "selectionSetHash",
      source_facts_input_hash AS "sourceFactsInputHash", snapshot_input_hash AS "snapshotInputHash",
      payload, consumer_evaluations AS "consumerEvaluations", actor_id AS "actorId",
      idempotency_key AS "idempotencyKey", request_hash AS "requestHash",
      supersedes_snapshot_id AS "supersedesSnapshotId", created_at AS "createdAt"`,
    [command.input.fundId, FINANCIAL_FACTS_POLICY_VERSION_1_4_0,
      FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID_5, command.request.asOfDate, command.knowledgeCutoff,
      JSON.stringify([vehicle.vehicleId]), EMPTY_SELECTION_SET_HASH, sourceFactsInputHash, snapshotInputHash,
      JSON.stringify(payload), JSON.stringify(consumerEvaluations), command.input.actorId, command.input.idempotencyKey,
      command.operationHash, head?.id ?? null]);
  const row = inserted.rows[0];
  if (!row) fail(500, 'INTERNAL_ERROR', 'Financial facts insert failed.');
  return receiptFromStored(row, command, head?.snapshotInputHash ?? null);
}

async function mutationAttempt(
  connection: PublishConnection,
  command: FrozenCommand,
  monotonicNow: () => number
): Promise<AttemptResult> {
  await withinBudget(command, monotonicNow,
    connection.query('BEGIN ISOLATION LEVEL SERIALIZABLE'), 'PUBLISH_RETRY_EXHAUSTED');
  await configureTransaction(connection, command, monotonicNow);
  await acquireFundLock(connection, command, monotonicNow, 'PUBLISH_RETRY_EXHAUSTED');
  await configureTransaction(connection, command, monotonicNow, true);
  await authorizeActor(connection, command, monotonicNow, 'PUBLISH_RETRY_EXHAUSTED');
  const candidate = await loadReceiptCandidate(connection, command, monotonicNow, 'PUBLISH_RETRY_EXHAUSTED');
  if (candidate) {
    return {
      kind: 'replay',
      receipt: await projectStoredReceipt(
        connection,
        candidate,
        command,
        monotonicNow,
        'PUBLISH_RETRY_EXHAUSTED'
      ),
    };
  }
  const database = databaseFor(connection) as never;
  assertBudget(command, monotonicNow);
  const head = validateHead(command, await resolveTerminalFactsHead(database, command.input.fundId));
  await lockPublicationScope(connection, command);
  await assertPilotOwnership(connection, command.input.fundId);
  const preliminaryLedger = await prepareActualsPilotPreview(
    { fundId: command.input.fundId, request: previewRequest(command.request.ledger, command.request.asOfDate) },
    { database }
  );
  const preliminaryValuation = command.request.valuation
    ? await prepareActualsPilotPreview(
        { fundId: command.input.fundId, request: previewRequest(command.request.valuation, command.request.asOfDate) },
        { database }
      )
    : null;
  await lockPublicationScope(connection, command, [
    ...preliminaryLedger.rows.flatMap((row) => row.companyId === null ? [] : [row.companyId]),
    ...(preliminaryValuation?.rows.flatMap((row) => row.companyId === null ? [] : [row.companyId]) ?? []),
  ]);
  assertBudget(command, monotonicNow);
  const ledger = await prepareActualsPilotPreview(
    { fundId: command.input.fundId, request: previewRequest(command.request.ledger, command.request.asOfDate) },
    { database }
  );
  validatePrepared('ledger', ledger, command.request.ledger);
  const valuation = command.request.valuation
    ? await prepareActualsPilotPreview(
        { fundId: command.input.fundId, request: previewRequest(command.request.valuation, command.request.asOfDate) },
        { database }
      )
    : null;
  if (valuation && command.request.valuation) validatePrepared('valuation', valuation, command.request.valuation);
  const netNewCount = acceptedRows(ledger.rows).length + (valuation ? acceptedRows(valuation.rows).length : 0);
  if (netNewCount === 0) fail(422, 'INVALID_CSV', 'Publish requires at least one net-new row.');
  if (
    command.request.coverage.ledger === 'incremental_since_prior_head' &&
    ledger.rows.some((row) => row.status === 'already_imported')
  ) {
    fail(422, 'INCOMPLETE_COVERAGE', 'Incremental publication cannot repeat predecessor rows.');
  }
  assertBudget(command, monotonicNow);
  const receipt = await createPublication(connection, command, head, ledger, valuation);
  return { kind: 'created', receipt };
}

async function reconciliationOracle(
  connection: PublishConnection,
  command: FrozenCommand,
  monotonicNow: () => number
): Promise<{ receipt: ActualsPublishReceiptV1 | null; destroyConnection: boolean }> {
  await withinBudget(command, monotonicNow, connection.query('BEGIN ISOLATION LEVEL READ COMMITTED READ WRITE'),
    'MUTATION_OUTCOME_UNKNOWN');
  await configureTransaction(connection, command, monotonicNow, false, 'MUTATION_OUTCOME_UNKNOWN');
  await acquireFundLock(connection, command, monotonicNow, 'MUTATION_OUTCOME_UNKNOWN');
  await configureTransaction(connection, command, monotonicNow, true, 'MUTATION_OUTCOME_UNKNOWN');
  await authorizeActor(connection, command, monotonicNow, 'MUTATION_OUTCOME_UNKNOWN');
  const candidate = await loadReceiptCandidate(connection, command, monotonicNow, 'MUTATION_OUTCOME_UNKNOWN');
  const receipt = candidate
    ? await projectStoredReceipt(
        connection,
        candidate,
        command,
        monotonicNow,
        'MUTATION_OUTCOME_UNKNOWN'
      )
    : null;
  try {
    await withinBudget(command, monotonicNow, connection.query('COMMIT'), 'MUTATION_OUTCOME_UNKNOWN');
    return { receipt, destroyConnection: false };
  } catch {
    return { receipt, destroyConnection: true };
  }
}

async function rollback(connection: PublishConnection): Promise<boolean> {
  try {
    await connection.query('ROLLBACK');
    return true;
  } catch {
    // Original failure remains authoritative.
    return false;
  }
}

async function rollbackAndRelease(connection: PublishConnection, error: unknown): Promise<void> {
  const rolledBack = await rollback(connection);
  connection.release(!rolledBack || sqlState(error) === null);
}

export async function publishActualsPilot(
  input: ActualsPilotPublishInput,
  options: ActualsPilotPublishOptions = {}
): Promise<ActualsPilotPublishResult> {
  const now = options.now ?? (() => new Date());
  const monotonicNow = options.monotonicNow ?? (() => performance.now());
  const sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const command = frozenCommand(input, now, monotonicNow);
  await preflightFile(command.input.fundId, command.request.asOfDate, command.request.ledger);
  if (command.request.valuation) {
    await preflightFile(command.input.fundId, command.request.asOfDate, command.request.valuation);
  }
  const connect = options.connect ?? defaultConnect;
  const invalidateAfterCommit = options.invalidateAfterCommit ?? invalidateH9Artifacts;
  let mutationAttempts = 0;
  let postAmbiguityMutationUsed = false;

  while (mutationAttempts < MAX_MUTATION_ATTEMPTS) {
    mutationAttempts += 1;
    assertBudget(command, monotonicNow);
    const rawConnection = await withinBudget(command, monotonicNow, connect(),
      'PUBLISH_RETRY_EXHAUSTED', (late) => late.release(true));
    const connection = budgetedConnection(
      rawConnection,
      command,
      monotonicNow,
      'PUBLISH_RETRY_EXHAUSTED'
    );
    let result: AttemptResult;
    try {
      result = await mutationAttempt(connection, command, monotonicNow);
    } catch (error) {
      await rollbackAndRelease(connection, error);
      if (isWholeTransactionRetry(error) && postAmbiguityMutationUsed) {
        fail(503, 'PUBLISH_RETRY_EXHAUSTED', 'Post-ambiguity publication retry exhausted.');
      }
      if (isWholeTransactionRetry(error) && mutationAttempts < MAX_MUTATION_ATTEMPTS) {
        await sleep(Math.min(25 * 2 ** (mutationAttempts - 1), Math.max(0, remaining(command, monotonicNow))));
        continue;
      }
      if (isWholeTransactionRetry(error)) {
        fail(503, 'PUBLISH_RETRY_EXHAUSTED', 'Publication retry exhausted.');
      }
      throw error;
    }

    try {
      await withinBudget(command, monotonicNow, connection.query('COMMIT'), 'PUBLISH_RETRY_EXHAUSTED');
      connection.release();
    } catch (commitError) {
      const state = sqlState(commitError);
      connection.release(true);
      if (RETRYABLE_SQLSTATES.has(state ?? '') && postAmbiguityMutationUsed) {
        fail(503, 'PUBLISH_RETRY_EXHAUSTED', 'Post-ambiguity publication retry exhausted.');
      }
      if (RETRYABLE_SQLSTATES.has(state ?? '') && mutationAttempts < MAX_MUTATION_ATTEMPTS) continue;

      const rawOracleConnection = await withinBudget(command, monotonicNow, connect(),
        'MUTATION_OUTCOME_UNKNOWN', (late) => late.release(true));
      const oracleConnection = budgetedConnection(
        rawOracleConnection,
        command,
        monotonicNow,
        'MUTATION_OUTCOME_UNKNOWN'
      );
      try {
        const oracle = await reconciliationOracle(oracleConnection, command, monotonicNow);
        oracleConnection.release(oracle.destroyConnection);
        const { receipt } = oracle;
        if (receipt) {
          const recovered: ActualsPilotPublishResult = {
            statusCode: 200,
            receipt,
            replayed: true,
            mutationAttempts,
            durationMs: Math.max(0, monotonicNow() - command.startedAt),
          };
          try {
            if (remaining(command, monotonicNow) > 0) {
              const afterCommit = options.afterCommit?.(recovered);
              if (afterCommit) {
              await withinBudget(command, monotonicNow, Promise.resolve(afterCommit), 'PUBLISH_RETRY_EXHAUSTED');
              }
            }
          } catch {
            // Post-commit hook cannot change durable recovery result.
          }
          try {
            if (remaining(command, monotonicNow) > 0) {
              await withinBudget(
                command,
                monotonicNow,
                invalidateAfterCommit(command.input.fundId),
                'PUBLISH_RETRY_EXHAUSTED'
              );
            }
          } catch {
            // Cache invalidation is best-effort after recovered commit.
          }
          logSuccess(recovered, command.input.requestId);
          return recovered;
        }
      } catch (oracleError) {
        await rollback(oracleConnection);
        oracleConnection.release(true);
        if (
          oracleError instanceof ActualsPilotPublishError &&
          oracleError.code !== 'PUBLISH_RETRY_EXHAUSTED' &&
          oracleError.code !== 'MUTATION_OUTCOME_UNKNOWN'
        ) throw oracleError;
        fail(503, 'MUTATION_OUTCOME_UNKNOWN', 'Publication outcome could not be proven.');
      }
      if (postAmbiguityMutationUsed || mutationAttempts >= MAX_MUTATION_ATTEMPTS || remaining(command, monotonicNow) < 1_000) {
        fail(503, 'PUBLISH_RETRY_EXHAUSTED', 'Publication retry exhausted.');
      }
      postAmbiguityMutationUsed = true;
      continue;
    }

    const response: ActualsPilotPublishResult = {
      statusCode: result.kind === 'created' ? 201 : 200,
      receipt: result.receipt,
      replayed: result.kind === 'replay',
      mutationAttempts,
      durationMs: Math.max(0, monotonicNow() - command.startedAt),
    };
    try {
      if (remaining(command, monotonicNow) > 0) {
        const afterCommit = options.afterCommit?.(response);
        if (afterCommit) {
          await withinBudget(command, monotonicNow, Promise.resolve(afterCommit), 'PUBLISH_RETRY_EXHAUSTED');
        }
      }
    } catch {
      // Post-commit observability/cache work cannot change durable success.
    }
    if (result.kind === 'created') {
      try {
        if (remaining(command, monotonicNow) > 0) {
          await withinBudget(
            command,
            monotonicNow,
            invalidateAfterCommit(command.input.fundId),
            'PUBLISH_RETRY_EXHAUSTED'
          );
        }
      } catch {
        // Cache invalidation is best-effort after durable commit.
      }
    }
    logSuccess(response, command.input.requestId);
    return response;
  }

  fail(503, 'PUBLISH_RETRY_EXHAUSTED', 'Publication retry exhausted.');
}

export const actualsPilotPublishTestSeams = {
  budgetedConnection,
  mutationAttempt,
  rollbackAndRelease,
  withinBudget,
};
