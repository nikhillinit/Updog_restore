import { randomUUID } from 'node:crypto';

import { drizzle } from 'drizzle-orm/node-postgres';
import { and, eq } from 'drizzle-orm';

import { combinedSchema } from '../../db-schema';
import { pool, createClientDatabase } from '../../db';
import { applyRLSContext, getRequestDatabaseScope } from '../../db/request-context';
import type { UserContext } from '../../lib/secure-context';
import { logger } from '../../lib/logger';
import { readActualsPilotPublishFundId } from '../../config/actuals-pilot-env';
import { canonicalSha256 } from '@shared/lib/canonical-hash';
import {
  ActualsPublishReceiptV1Schema,
  ActualsPublishReceiptV2Schema,
  ActualsPublishRequestV1Schema,
  ActualsPilotCashFlowPayloadSchema,
  ActualsPilotCentExactMoneySchema,
  ActualsPilotValuationMarkPayloadSchema,
  IfMatchSchema,
  isCentExactMoney,
  type ActualsPilotErrorCode,
  type ActualsPublishReceipt,
  type ActualsPublishFileV1,
  type ActualsPublishRequestV1,
} from '@shared/contracts/lp-reporting/actuals-pilot.contract';
import {
  AdmissionReceiptCoreV1Schema,
  AdmissionReceiptCoreV2Schema,
  EMPTY_SELECTION_SET_HASH,
  FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID_5,
  FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID_6,
  FINANCIAL_FACTS_POLICY_VERSION_1_4_0,
  FINANCIAL_FACTS_POLICY_VERSION_1_5_0,
  FinancialFactsPayloadV5Schema,
  FinancialFactsPayloadV6Schema,
  FinancialFactsSnapshotV5Schema,
  FinancialFactsSnapshotV6Schema,
  FinancialFactsBasisRefSchema,
  type AdmissionReceiptCoreV1,
  type AdmissionReceiptCoreV2,
  type ActualsCorrectionProvenanceV1,
  type ActualsRecordIdentityV1,
  type FinancialFactsPayloadV6,
  type FinancialFactsBasisRef,
} from '@shared/contracts/financial-facts-snapshot-v1.contract';
import {
  ActualsRestatementPublishRequestV1Schema,
  ActualsRestatementPreviewRequestV1Schema,
  ActualsRestatementPreviewResponseV1Schema,
  ActualsRestatementTargetV1Schema,
  ActualsRestatementRecordFieldsV1Schema,
  ActualsRestatementReadRequestV1Schema,
  ActualsRestatementCursorV1Schema,
  ActualsRestatementTargetsResponseV1Schema,
  ActualsRestatementHistoryResponseV1Schema,
  type ActualsRestatementPublishRequestV1,
  type ActualsRestatementPreviewRequestV1,
  type ActualsRestatementPreviewResponseV1,
  type ActualsRestatementReadRequestV1,
  type ActualsRestatementTargetsResponseV1,
  type ActualsRestatementHistoryResponseV1,
  type ActualsRestatementErrorCodeV1,
} from '@shared/contracts/lp-reporting/actuals-restatement.contract';
import {
  projectActualsEffectiveBasis,
  ActualsEffectiveBasisError,
  type ActualsAdmittedProjectionRecord,
} from './actuals-restatement-service';
import {
  buildFinancialFactsPayloadV6,
  projectCompanyActualsFromEffectiveLedger,
} from '../financial-facts/payload6-builder';
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
import {
  actualsRestatementCommands,
  actualsRestatementItems,
} from '@shared/schema/actuals-restatement-commands';
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
const IDEMPOTENCY_KEY_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
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
  readonly context?: UserContext;
}

export interface ActualsPilotPublishResult {
  readonly statusCode: 200 | 201;
  readonly receipt: ActualsPublishReceipt;
  readonly replayed: boolean;
  readonly mutationAttempts: number;
  readonly durationMs: number;
}

export interface ActualsRestatementPublishInput extends Omit<ActualsPilotPublishInput, 'request'> {
  readonly request: ActualsRestatementPublishRequestV1;
}

export interface ActualsRestatementReadInput<Request> {
  readonly fundId: number;
  readonly actorId: number;
  readonly request: Request;
  readonly context?: UserContext;
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
  readonly code: ActualsPilotErrorCode | ActualsRestatementErrorCodeV1;
  readonly details?: unknown;

  constructor(
    statusCode: number,
    code: ActualsPilotErrorCode | ActualsRestatementErrorCodeV1,
    message: string,
    details?: unknown
  ) {
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
  readonly priorMarkId: number | null;
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

interface PublicationContext {
  readonly input: {
    readonly fundId: number;
    readonly actorId: number;
    readonly context?: UserContext;
  };
  readonly knowledgeCutoff: Date;
  readonly knowledgeCutoffIso: string;
  readonly startedAt: number;
  readonly deadline: number;
}

interface FrozenCommand extends PublicationContext {
  readonly input: ActualsPilotPublishInput | ActualsRestatementPublishInput;
  readonly request: {
    readonly asOfDate: string;
    readonly ledger: ActualsPublishFileV1 | null;
    readonly valuation: ActualsPublishFileV1 | null;
    readonly coverage: ActualsPublishRequestV1['coverage'];
  };
  readonly restatementRequest: ActualsRestatementPublishRequestV1 | null;
  readonly operationHash: string;
}

function budgetedConnection(
  connection: PublishConnection,
  command: PublicationContext,
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
    },
    release(destroy?: boolean): void {
      connection.release(destroy === true || poisoned);
    },
  };
}

interface AttemptCreated {
  readonly kind: 'created';
  readonly receipt: ActualsPublishReceipt;
}

interface AttemptReplay {
  readonly kind: 'replay';
  readonly receipt: ActualsPublishReceipt;
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
  const constraint =
    'constraint' in error ? (error as { constraint?: unknown }).constraint : undefined;
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
    return expenseCategory === 'management_fee'
      ? ('management_fee' as const)
      : ('fund_expense' as const);
  }
  if (
    row.eventType === 'lp_distribution' ||
    row.eventType === 'portfolio_investment' ||
    row.eventType === 'realized_proceeds'
  )
    return row.eventType;
  fail(422, 'SOURCE_FACT_CONTRADICTION', 'Stored pilot event type invalid.');
}

function computeSourceFactsInputHash(
  core: AdmissionReceiptCoreV1 | AdmissionReceiptCoreV2,
  payload: ReturnType<typeof FinancialFactsPayloadV5Schema.parse> | FinancialFactsPayloadV6,
  predecessorSnapshotInputHash: string | null
): string {
  const preimage = {
    templateVersions: [
      ACTUALS_LEDGER_TEMPLATE_VERSION,
      core.admitted.valuation === null ? null : ACTUALS_VALUATION_TEMPLATE_VERSION,
    ],
    fundId: core.fundId,
    asOfDate: core.asOfDate,
    ledgerPayloadSha256: core.admitted.ledger?.payloadSha256 ?? null,
    ledgerCanonicalRowsHash: core.admitted.ledger?.canonicalRowsHash ?? null,
    valuationPayloadSha256: core.admitted.valuation?.payloadSha256 ?? null,
    valuationCanonicalRowsHash: core.admitted.valuation?.canonicalRowsHash ?? null,
    coverage: core.coverage,
    commitmentBasis: {
      vehicleId: payload.vehicleRoster[0]?.vehicleId,
      amount: payload.capitalActuals.committedCapital.value,
    },
    predecessorSnapshotInputHash,
    companyActualsInputHash: payload.companyActuals.inputHash,
  };
  return canonicalSha256(
    core.contractVersion === 'actuals-admission/2.0.0'
      ? { ...preimage, operationKind: core.operationKind, effectiveBasis: core.effectiveBasis }
      : preimage
  );
}

function fail(
  status: number,
  code: ActualsPilotErrorCode | ActualsRestatementErrorCodeV1,
  message: string,
  details?: unknown
): never {
  throw new ActualsPilotPublishError(status, code, message, details);
}

function logSuccess(result: ActualsPilotPublishResult, requestId: string | undefined): void {
  try {
    publishLog.info(
      {
        operation: 'actuals_pilot_publish',
        ...(requestId === undefined ? {} : { requestId }),
        fundId: result.receipt.fundId,
        outcome: result.replayed ? 'replayed' : 'created',
        replayed: result.replayed,
        mutationAttempts: result.mutationAttempts,
        durationMs: Math.round(result.durationMs),
        approvedRowCount: result.receipt.admitted.ledger?.approvedCount ?? 0,
        approvedMarkCount: result.receipt.admitted.valuation?.approvedCount ?? 0,
        snapshotId: result.receipt.facts.snapshotId,
        policyVersion: result.receipt.facts.policyVersion,
        payloadSchemaId: result.receipt.facts.payloadSchemaId,
      },
      'Actuals pilot publication completed'
    );
  } catch {
    // Logging cannot change durable publication result.
  }
}

function remaining(command: PublicationContext, monotonicNow: () => number): number {
  return Math.floor(command.deadline - monotonicNow());
}

async function withinBudget<T>(
  command: PublicationContext,
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
  return pool
    ? createClientDatabase(connection as never)
    : drizzle(connection as never, { schema: combinedSchema });
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
    valuation:
      request.valuation === null
        ? null
        : {
            templateVersion: request.valuation.templateVersion,
            payloadSha256: request.valuation.expectedPayloadSha256,
            canonicalRowsHash: request.valuation.expectedCanonicalRowsHash,
            previewHash: request.valuation.expectedPreviewHash,
          },
    coverage: request.coverage,
  });
}

export function computeActualsRestatementOperationHash(input: {
  readonly fundId: number;
  readonly ifMatch: string;
  readonly request: Omit<ActualsRestatementPublishRequestV1, 'ledger' | 'valuation'> & {
    readonly ledger: Pick<
      ActualsPublishFileV1,
      | 'templateVersion'
      | 'expectedPayloadSha256'
      | 'expectedCanonicalRowsHash'
      | 'expectedPreviewHash'
    > | null;
    readonly valuation: Pick<
      ActualsPublishFileV1,
      | 'templateVersion'
      | 'expectedPayloadSha256'
      | 'expectedCanonicalRowsHash'
      | 'expectedPreviewHash'
    > | null;
  };
}): string {
  const fileIdentity = (file: typeof input.request.ledger) =>
    file === null
      ? null
      : {
          templateVersion: file.templateVersion,
          payloadSha256: file.expectedPayloadSha256,
          canonicalRowsHash: file.expectedCanonicalRowsHash,
          previewHash: file.expectedPreviewHash,
        };
  return canonicalSha256({
    ...input.request,
    fundId: input.fundId,
    expectedFactsHead: input.ifMatch,
    ledger: fileIdentity(input.request.ledger),
    valuation: fileIdentity(input.request.valuation),
  });
}

function frozenCommand(
  input: ActualsPilotPublishInput | ActualsRestatementPublishInput,
  now: () => Date,
  monotonicNow: () => number
): FrozenCommand {
  if (!Number.isSafeInteger(input.fundId) || input.fundId <= 0 || input.fundId > 2_147_483_647) {
    fail(400, 'INVALID_BODY', 'fundId must be a positive integer.');
  }
  if (!Number.isSafeInteger(input.actorId) || input.actorId <= 0 || input.actorId > 2_147_483_647) {
    fail(404, 'RESOURCE_NOT_FOUND', 'Resource not found.');
  }
  if (!IDEMPOTENCY_KEY_PATTERN.test(input.idempotencyKey))
    fail(400, 'INVALID_IDEMPOTENCY_KEY', 'Idempotency key is invalid.');
  if (!IfMatchSchema.safeParse(input.ifMatch).success)
    fail(400, 'INVALID_IF_MATCH', 'If-Match is invalid.');
  const startedAt = monotonicNow();
  const knowledgeCutoff = new Date(now().getTime());
  const context = input.context ?? getRequestDatabaseScope()?.context;
  if (context && context.fundId && Number(context.fundId) !== input.fundId)
    fail(404, 'RESOURCE_NOT_FOUND', 'Resource not found.');
  let request: FrozenCommand['request'];
  let restatementRequest: ActualsRestatementPublishRequestV1 | null = null;
  let operationHash: string;
  if (input.request.contractVersion === 'actuals-restatement/1.0.0') {
    const parsed = ActualsRestatementPublishRequestV1Schema.safeParse(input.request);
    if (!parsed.success) fail(400, 'INVALID_BODY', 'Restatement publish request is invalid.');
    restatementRequest = parsed.data;
    if (
      restatementRequest.expectedBasis.fundId !== input.fundId ||
      restatementRequest.expectedETag !== input.ifMatch
    ) {
      fail(409, 'STALE_BASIS', 'Restatement must identify the exact current fund basis.');
    }
    request = {
      asOfDate: restatementRequest.expectedBasis.asOfDate,
      ledger: restatementRequest.ledger,
      valuation: restatementRequest.valuation,
      coverage: {
        ledger: 'incremental_since_prior_head',
        priorFactsSnapshotId: restatementRequest.expectedBasis.snapshotId,
        evidenceNote: restatementRequest.reason,
      },
    };
    operationHash = computeActualsRestatementOperationHash({
      fundId: input.fundId,
      ifMatch: input.ifMatch,
      request: restatementRequest,
    });
  } else {
    const parsed = ActualsPublishRequestV1Schema.safeParse(input.request);
    if (!parsed.success) fail(400, 'INVALID_BODY', 'Actuals publish request is invalid.');
    request = parsed.data;
    operationHash = computeActualsPilotOperationHash({
      fundId: input.fundId,
      ifMatch: input.ifMatch,
      request: parsed.data,
    });
  }
  const frozenInput = Object.freeze({
    ...input,
    ...(context && { context: Object.freeze({ ...context, fundId: String(input.fundId) }) }),
  });
  return {
    input: frozenInput,
    request,
    restatementRequest,
    operationHash,
    knowledgeCutoff,
    knowledgeCutoffIso: knowledgeCutoff.toISOString(),
    startedAt,
    deadline: startedAt + COMMAND_BUDGET_MS,
  };
}

async function configureTransaction(
  connection: PublishConnection,
  command: PublicationContext,
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
    connection.query(
      `SET LOCAL statement_timeout = ${fundLockAcquired ? Math.min(10_000, budget) : budget}`
    ),
    timeoutCode
  );
  await withinBudget(
    command,
    monotonicNow,
    connection.query(
      `SET LOCAL lock_timeout = ${fundLockAcquired ? Math.min(2_000, budget) : budget}`
    ),
    timeoutCode
  );
  await withinBudget(
    command,
    monotonicNow,
    connection.query(`SET LOCAL idle_in_transaction_session_timeout = ${Math.min(10_000, budget)}`),
    timeoutCode
  );
}

function assertBudget(command: PublicationContext, monotonicNow: () => number): void {
  if (remaining(command, monotonicNow) < 1_000) {
    fail(503, 'PUBLISH_RETRY_EXHAUSTED', 'Insufficient publication budget.');
  }
}

async function lockPublicationScope(
  connection: PublishConnection,
  command: PublicationContext,
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
    fail(
      422,
      'UNSUPPORTED_VEHICLE_SCOPE',
      'Pilot requires exactly one active USD main-fund vehicle.'
    );
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
  command: PublicationContext,
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
  command: PublicationContext,
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
    }>(
      'SELECT id, is_active, role, is_release_canary_principal FROM users WHERE id = $1 FOR SHARE',
      [command.input.actorId]
    ),
    timeoutCode
  );
  const row = actor.rows[0];
  if (!row || !row.is_active || row.is_release_canary_principal || row.role === 'service') {
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

function verifyPublicationSnapshot(row: SnapshotRow, predecessorSnapshotInputHash: string | null) {
  const normalized = {
    ...row,
    asOfDate: isoDay(row.asOfDate),
    knowledgeCutoff: new Date(row.knowledgeCutoff).toISOString(),
    createdAt: new Date(row.createdAt).toISOString(),
  };
  const value = {
    policyVersion: row.policyVersion,
    payloadSchemaId: row.payloadSchemaId,
    fundId: row.fundId,
    asOfDate: normalized.asOfDate,
    knowledgeCutoff: normalized.knowledgeCutoff,
    vehicleScope: row.vehicleScope,
    vehicleIds: row.vehicleIds,
    selectionSetHash: row.selectionSetHash,
    sourceFactsInputHash: row.sourceFactsInputHash,
    snapshotInputHash: row.snapshotInputHash,
    payload: row.payload,
    consumerEvaluations: row.consumerEvaluations,
    actorId: row.actorId,
    createdAt: normalized.createdAt,
  };
  const snapshot =
    row.policyVersion === FINANCIAL_FACTS_POLICY_VERSION_1_4_0
      ? FinancialFactsSnapshotV5Schema.parse(value)
      : row.policyVersion === FINANCIAL_FACTS_POLICY_VERSION_1_5_0
        ? FinancialFactsSnapshotV6Schema.parse(value)
        : fail(500, 'INTERNAL_ERROR', 'Stored actuals receipt uses an unsupported policy.');
  const core = snapshot.payload.admissionReceiptCore;
  const common = {
    fundId: row.fundId,
    vehicleIds: row.vehicleIds,
    asOfDate: normalized.asOfDate,
    knowledgeCutoff: normalized.knowledgeCutoff,
    selectionSetHash: row.selectionSetHash,
  };
  const snapshotHash =
    snapshot.policyVersion === FINANCIAL_FACTS_POLICY_VERSION_1_4_0
      ? buildSnapshotInputHash({
          ...common,
          policyVersion: FINANCIAL_FACTS_POLICY_VERSION_1_4_0,
          payloadSchemaId: FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID_5,
          payload: snapshot.payload,
        })
      : buildSnapshotInputHash({
          ...common,
          policyVersion: FINANCIAL_FACTS_POLICY_VERSION_1_5_0,
          payloadSchemaId: FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID_6,
          payload: snapshot.payload,
        });
  if (
    row.requestHash !== core.operationHash ||
    row.snapshotInputHash !== snapshotHash ||
    core.fundId !== row.fundId ||
    core.actor.userId !== row.actorId ||
    core.asOfDate !== normalized.asOfDate ||
    core.facts.policyVersion !== row.policyVersion ||
    core.facts.payloadSchemaId !== row.payloadSchemaId ||
    core.facts.supersedesSnapshotId !== row.supersedesSnapshotId ||
    core.facts.knowledgeCutoff !== normalized.knowledgeCutoff ||
    row.sourceFactsInputHash !==
      computeSourceFactsInputHash(core, snapshot.payload, predecessorSnapshotInputHash)
  ) {
    fail(500, 'INTERNAL_ERROR', 'Stored actuals receipt identity is incoherent.');
  }
  if (
    snapshot.policyVersion === FINANCIAL_FACTS_POLICY_VERSION_1_5_0 &&
    (snapshot.payload.effectiveBasis.predecessorSnapshotInputHash !==
      predecessorSnapshotInputHash ||
      canonicalSha256(snapshot.payload.effectiveBasis) !==
        canonicalSha256(snapshot.payload.admissionReceiptCore.effectiveBasis))
  ) {
    fail(500, 'INTERNAL_ERROR', 'Stored effective basis is incoherent.');
  }
  return snapshot;
}

function receiptFromStored(
  row: SnapshotRow,
  command: FrozenCommand,
  predecessorSnapshotInputHash: string | null
): ActualsPublishReceipt {
  if (row.actorId !== command.input.actorId) fail(404, 'RESOURCE_NOT_FOUND', 'Resource not found.');
  const snapshot = verifyPublicationSnapshot(row, predecessorSnapshotInputHash);
  const core = snapshot.payload.admissionReceiptCore;
  if (core.operationHash !== command.operationHash)
    fail(409, 'IDEMPOTENCY_KEY_REUSED', 'Idempotency key was already used for another request.');
  const receipt = {
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
      policyVersion: row.policyVersion,
      asOfDate: snapshot.asOfDate,
      knowledgeCutoff: snapshot.knowledgeCutoff,
    },
  };
  return core.contractVersion === 'actuals-admission/2.0.0'
    ? ActualsPublishReceiptV2Schema.parse({
        ...receipt,
        contractVersion: 'actuals-pilot-publish/2.0.0',
        operationKind: core.operationKind,
        restatement: core.restatement,
        effectiveBasis: core.effectiveBasis,
      })
    : ActualsPublishReceiptV1Schema.parse({ ...receipt, contractVersion: core.contractVersion });
}

async function projectStoredReceipt(
  connection: PublishConnection,
  row: SnapshotRow,
  command: FrozenCommand,
  monotonicNow: () => number,
  timeoutCode: 'PUBLISH_RETRY_EXHAUSTED' | 'MUTATION_OUTCOME_UNKNOWN'
): Promise<ActualsPublishReceipt> {
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
  if (row.policyVersion === FINANCIAL_FACTS_POLICY_VERSION_1_5_0) {
    const core = FinancialFactsPayloadV6Schema.parse(row.payload).admissionReceiptCore;
    if (core.operationKind === 'restatement') {
      const prior = await connection.query<SnapshotRow>(
        `${SNAPSHOT_SELECT} WHERE fund_id=$1 AND id=$2`,
        [row.fundId, row.supersedesSnapshotId]
      );
      const predecessor = prior.rows[0];
      if (!predecessor)
        fail(409, 'INVALID_REPLACEMENT_LINEAGE', 'Correction predecessor is missing.');
      await verifyCorrectionMetadata(connection, row, predecessor, core);
    }
  }
  return receiptFromStored(row, command, predecessorSnapshotInputHash);
}

function expectedHeadTag(head: { id: number; snapshotInputHash: string } | null): string {
  return head === null
    ? '"financial-facts:none"'
    : `"financial-facts:${head.id}:${head.snapshotInputHash}"`;
}

function validateHead(
  command: FrozenCommand,
  head: Awaited<ReturnType<typeof resolveTerminalFactsHead>>
) {
  if (head.kind === 'ambiguous')
    fail(409, 'FACTS_HEAD_AMBIGUOUS', 'Financial facts head ambiguous.');
  if (head.kind === 'invalid')
    fail(409, 'FACTS_LINEAGE_INVALID', 'Financial facts lineage invalid.');
  const row = head.kind === 'head' ? head.row : null;
  if (command.input.ifMatch !== expectedHeadTag(row)) {
    fail(
      412,
      'FACTS_HEAD_PRECONDITION_FAILED',
      'Financial facts head changed.',
      row === null ? undefined : { currentFactsSnapshotId: row.id }
    );
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
    if (
      row.policyVersion !== FINANCIAL_FACTS_POLICY_VERSION_1_4_0 &&
      row.policyVersion !== FINANCIAL_FACTS_POLICY_VERSION_1_5_0
    ) {
      fail(422, 'INCOMPLETE_COVERAGE', 'Incremental coverage requires current policy-1.4 head.');
    }
    const predecessorPayload =
      row.policyVersion === FINANCIAL_FACTS_POLICY_VERSION_1_5_0
        ? FinancialFactsPayloadV6Schema.safeParse(row.payload)
        : FinancialFactsPayloadV5Schema.safeParse(row.payload);
    if (
      !predecessorPayload.success ||
      predecessorPayload.data.capitalActuals.ledgerCoverage !== 'complete'
    ) {
      fail(
        422,
        'INCOMPLETE_COVERAGE',
        'Incremental coverage requires a complete predecessor basis.'
      );
    }
  }
  if (
    command.restatementRequest &&
    (!row ||
      canonicalSha256(command.restatementRequest.expectedBasis) !==
        canonicalSha256(basisRefForHead(row)))
  ) {
    fail(409, 'STALE_BASIS', 'Restatement basis changed.');
  }
  return row;
}

async function assertPilotOwnership(connection: PublishConnection, fundId: number): Promise<void> {
  const result = await connection.query<{ count: string }>(
    `
    SELECT (
      (SELECT count(*) FROM cash_flow_events WHERE fund_id = $1 AND imported_from IS DISTINCT FROM 'actuals_pilot_v1') +
      (SELECT count(*) FROM valuation_marks WHERE fund_id = $1 AND imported_from IS DISTINCT FROM 'actuals_pilot_v1')
    )::text AS count`,
    [fundId]
  );
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
  ledger: ActualsPilotPreparedPreview | null,
  valuation: ActualsPilotPreparedPreview | null
): Promise<{ ledgerId: number | null; valuationId: number | null }> {
  const files = [
    ...(ledger && command.request.ledger
      ? [{ kind: 'ledger', prepared: ledger, file: command.request.ledger }]
      : []),
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
    }>(
      `SELECT id, source_type AS "sourceType", media_type AS "mediaType",
      byte_count AS "byteCount", payload_sha256 AS "payloadSha256", payload,
      purged_at AS "purgedAt", request_hash AS "requestHash"
      FROM source_artifacts WHERE fund_id = $1 AND idempotency_key = $2`,
      [command.input.fundId, idempotencyKey]
    );
    const prior = existing.rows[0];
    if (prior) {
      const payloadStateCoherent =
        prior.purgedAt === null
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
    const inserted = await connection.query<{ id: number }>(
      `
      INSERT INTO source_artifacts
        (fund_id, source_type, file_name, media_type, byte_count, payload_sha256, payload,
         purge_after, created_by, idempotency_key, request_hash, created_at)
      VALUES ($1, 'csv', $2, 'text/csv', $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id`,
      [
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
      ]
    );
    const id = inserted.rows[0]?.id;
    if (!id) fail(500, 'INTERNAL_ERROR', 'Source artifact insert failed.');
    ids.set(kind, id);
  }
  const ledgerId = ids.get('ledger');
  if (ledger && !ledgerId) fail(500, 'INTERNAL_ERROR', 'Ledger artifact insert failed.');
  return { ledgerId: ledgerId ?? null, valuationId: ids.get('valuation') ?? null };
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
    const offset = index * 13;
    const templateType = String(row.eventType);
    const eventType =
      templateType === 'settled_contribution'
        ? 'lp_capital_call'
        : templateType === 'management_fee' || templateType === 'fund_expense'
          ? 'fund_expense'
          : templateType;
    const perspective = ['settled_contribution', 'lp_distribution'].includes(templateType)
      ? 'lp_net'
      : 'fund_gross';
    values.push(
      command.input.fundId,
      row.vehicleId,
      row.companyId,
      eventType,
      row.canonicalAmount,
      `${row.effectiveDate}T00:00:00.000Z`,
      perspective,
      fields['description'] ?? null,
      {
        contractVersion: 'actuals-pilot-cash-flow/1.0.0',
        sourceExternalRef: row.sourceExternalRef,
        rowContentHash: row.rowContentHash,
        templateVersion: ACTUALS_LEDGER_TEMPLATE_VERSION,
        settlementStatus: templateType === 'settled_contribution' ? 'settled' : null,
        deploymentCategory: fields['deploymentCategory'] ?? null,
        expenseCategory: fields['expenseCategory'] ?? null,
        distributionType: fields['distributionType'] ?? null,
        recallable: fields['recallable'] ?? null,
      },
      importBatchId,
      row.rowSourceHash,
      command.input.actorId,
      command.restatementRequest?.items.find(
        (item) =>
          item.target.kind === 'ledger' && item.replacementExternalRef === row.sourceExternalRef
      )?.target.recordId ?? null
    );
    return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, 'USD', $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, 'approved', 'actuals_pilot_v1', $${offset + 10}, $${offset + 11}, $${offset + 12}, $${offset + 13})`;
  });
  const result = await connection.query<{ id: number }>(
    `
    INSERT INTO cash_flow_events
      (fund_id, vehicle_id, company_id, event_type, amount, currency, event_date, perspective,
       description, payload, status, imported_from, import_batch_id, source_hash, created_by, supersedes_event_id)
    VALUES ${tuples.join(', ')} RETURNING id`,
    values
  );
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
    const offset = index * 15;
    values.push(
      command.input.fundId,
      row.vehicleId,
      row.companyId,
      row.effectiveDate,
      row.canonicalAmount,
      fields['costBasis'] ?? null,
      fields['markSource'],
      fields['confidenceLevel'],
      fields['valuationMethod'],
      command.input.actorId,
      importBatchId,
      row.rowSourceHash,
      JSON.stringify({
        contractVersion: 'actuals-pilot-valuation-mark/1.0.0',
        sourceExternalRef: row.sourceExternalRef,
        rowContentHash: row.rowContentHash,
        templateVersion: command.request.valuation?.templateVersion,
      }),
      command.knowledgeCutoff,
      command.restatementRequest?.items.find(
        (item) =>
          item.target.kind === 'valuation' && item.replacementExternalRef === row.sourceExternalRef
      )?.target.recordId ?? null
    );
    return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 4}, $${offset + 5}, 'USD', $${offset + 6}, 'planning_company_fmv', $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 13}, 'approved', $${offset + 10}, $${offset + 14}, 'actuals_pilot_v1', $${offset + 11}, $${offset + 12}, $${offset + 15})`;
  });
  const result = await connection.query<{ id: number }>(
    `
    INSERT INTO valuation_marks
      (fund_id, vehicle_id, company_id, mark_date, as_of_date, fair_value, currency, cost_basis,
       mark_purpose, mark_source, confidence_level, valuation_method, methodology_notes, status,
       approved_by, approved_at, imported_from, import_batch_id, source_hash, prior_mark_id)
    VALUES ${tuples.join(', ')} RETURNING id`,
    values
  );
  return result.rows.map(({ id }) => id).sort((a, b) => a - b);
}

async function loadBasis(connection: PublishConnection, fundId: number, asOfDate: string) {
  const cash = await connection.query<BasisCashRow>(
    `SELECT id, fund_id AS "fundId", vehicle_id AS "vehicleId",
      company_id AS "companyId", event_type AS "eventType", amount::text, currency,
      event_date AS "eventDate", perspective, description, payload, status,
      imported_from AS "importedFrom",
      source_hash AS "sourceHash", supersedes_event_id AS "supersedesEventId",
      reversal_of_event_id AS "reversalOfEventId"
      FROM cash_flow_events WHERE fund_id = $1 AND imported_from = 'actuals_pilot_v1'
        AND status IN ('approved','locked') AND event_date::date <= $2 ORDER BY event_date, id`,
    [fundId, asOfDate]
  );
  const marks = await connection.query<BasisMarkRow>(
    `SELECT id, fund_id AS "fundId", vehicle_id AS "vehicleId",
      company_id AS "companyId", mark_date AS "markDate", as_of_date AS "asOfDate",
      fair_value::text AS "fairValue", currency, cost_basis::text AS "costBasis",
      mark_purpose AS "markPurpose", mark_source AS "markSource",
      confidence_level AS "confidenceLevel", valuation_method AS "valuationMethod",
      methodology_notes AS "methodologyNotes", status, imported_from AS "importedFrom",
      source_hash AS "sourceHash", prior_mark_id AS "priorMarkId"
      FROM valuation_marks WHERE fund_id = $1 AND imported_from = 'actuals_pilot_v1'
        AND status IN ('approved','locked') AND as_of_date <= $2 ORDER BY mark_date, id`,
    [fundId, asOfDate]
  );
  const vehicles = await connection.query<BasisVehicleRow>(
    `SELECT id AS "vehicleId", vehicle_type AS "vehicleType",
      vehicle_slug AS "vehicleSlug", name, currency, committed_capital::text AS "committedCapital"
      FROM vehicles WHERE fund_id = $1 AND status = 'active' ORDER BY id`,
    [fundId]
  );
  return { cash: cash.rows, marks: marks.rows, vehicles: vehicles.rows };
}

function validateCumulativeBasisRows(basis: Awaited<ReturnType<typeof loadBasis>>): void {
  for (const row of basis.cash) {
    const payload = ActualsPilotCashFlowPayloadSchema.safeParse(row.payload);
    if (
      !payload.success ||
      row.sourceHash !==
        computeActualsPilotRowSourceHash(row.fundId, payload.data.sourceExternalRef)
    ) {
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
    if (
      row.sourceHash !== computeActualsPilotRowSourceHash(row.fundId, payload.sourceExternalRef)
    ) {
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

function basisRefForHead(row: {
  id: number;
  fundId: number;
  snapshotInputHash: string;
  sourceFactsInputHash: string;
  policyVersion: string;
  asOfDate: Date | string;
  knowledgeCutoff: Date | string;
}): FinancialFactsBasisRef {
  return FinancialFactsBasisRefSchema.parse({
    schemaId: 'financial-facts-basis-ref/1.0.0',
    fundId: row.fundId,
    snapshotId: row.id,
    snapshotInputHash: row.snapshotInputHash,
    sourceFactsInputHash: row.sourceFactsInputHash,
    policyVersion: row.policyVersion,
    asOfDate: isoDay(row.asOfDate),
    knowledgeCutoff: new Date(row.knowledgeCutoff).toISOString(),
  });
}

async function verifyCorrectionMetadata(
  connection: PublishConnection,
  row: SnapshotRow,
  predecessor: SnapshotRow,
  core: AdmissionReceiptCoreV2
) {
  if (core.operationKind !== 'restatement') return;
  const database = databaseFor(connection);
  const commands = await database
    .select()
    .from(actualsRestatementCommands)
    .where(
      and(
        eq(actualsRestatementCommands.fundId, row.fundId),
        eq(actualsRestatementCommands.commandId, core.restatement.commandId)
      )
    );
  const command = commands[0];
  if (
    commands.length !== 1 ||
    !command ||
    command.publicationSnapshotId !== row.id ||
    command.expectedSnapshotId !== predecessor.id ||
    command.expectedSnapshotInputHash !== predecessor.snapshotInputHash ||
    command.operationHash !== core.operationHash ||
    command.idempotencyKey !== row.idempotencyKey ||
    command.asOfDate !== core.asOfDate ||
    command.reason !== core.restatement.reason ||
    command.createdBy !== core.actor.userId ||
    core.restatement.actor.userId !== core.actor.userId ||
    command.createdAt.toISOString() !== core.facts.knowledgeCutoff ||
    core.restatement.createdAt !== core.facts.knowledgeCutoff ||
    core.restatement.asOfDate !== core.asOfDate ||
    command.ledgerSourceArtifactId !== (core.admitted.ledger?.sourceArtifactId ?? null) ||
    command.valuationSourceArtifactId !== (core.admitted.valuation?.sourceArtifactId ?? null)
  ) {
    fail(
      409,
      'INVALID_REPLACEMENT_LINEAGE',
      'Immutable correction command differs from its receipt.'
    );
  }
  const items = await database
    .select()
    .from(actualsRestatementItems)
    .where(
      and(
        eq(actualsRestatementItems.fundId, row.fundId),
        eq(actualsRestatementItems.commandId, core.restatement.commandId)
      )
    )
    .orderBy(actualsRestatementItems.id);
  const mappings: ActualsRestatementPublishRequestV1['items'] = items.map((item) => {
    const kind = item.targetCashFlowEventId !== null ? 'ledger' : 'valuation';
    const targetId = item.targetCashFlowEventId ?? item.targetValuationMarkId;
    const replacementId = item.replacementCashFlowEventId ?? item.replacementValuationMarkId;
    if (targetId === null || replacementId === null)
      fail(409, 'INVALID_REPLACEMENT_LINEAGE', 'Correction item lacks endpoints.');
    const target = {
      kind,
      recordId: targetId,
      sourceHash: item.targetSourceHash,
      contentHash: item.targetContentHash,
    };
    const replacement = {
      kind,
      recordId: replacementId,
      sourceHash: item.replacementSourceHash,
      contentHash: item.replacementContentHash,
    };
    const originalPublication = {
      snapshotId: item.originalPublicationSnapshotId,
      snapshotInputHash: item.originalPublicationSnapshotInputHash,
      operationHash: item.originalPublicationOperationHash,
    };
    const receiptItem = core.restatement.items.find(
      (entry) => entry.target.kind === kind && entry.target.recordId === targetId
    );
    if (
      !receiptItem ||
      canonicalSha256(receiptItem) !==
        canonicalSha256({ target, replacement, originalPublication }) ||
      item.replacementSourceHash !==
        computeActualsPilotRowSourceHash(row.fundId, item.replacementExternalRef)
    ) {
      fail(
        409,
        'INVALID_REPLACEMENT_LINEAGE',
        'Immutable correction item differs from its receipt.'
      );
    }
    return {
      target: receiptItem.target,
      originalPublication,
      replacementExternalRef: item.replacementExternalRef,
      expectedReplacementContentHash: item.replacementContentHash,
    };
  });
  const file = (
    admission:
      | AdmissionReceiptCoreV2['admitted']['ledger']
      | AdmissionReceiptCoreV2['admitted']['valuation'],
    templateVersion: ActualsPublishFileV1['templateVersion']
  ) =>
    admission === null
      ? null
      : {
          templateVersion,
          expectedPayloadSha256: admission.payloadSha256,
          expectedCanonicalRowsHash: admission.canonicalRowsHash,
          expectedPreviewHash: admission.previewHash,
        };
  const expectedBasis = basisRefForHead(predecessor);
  const expectedETag = expectedHeadTag(predecessor);
  const reconstructedHash = computeActualsRestatementOperationHash({
    fundId: row.fundId,
    ifMatch: expectedETag,
    request: {
      contractVersion: 'actuals-restatement/1.0.0',
      expectedBasis,
      expectedETag,
      ledger: file(core.admitted.ledger, ACTUALS_LEDGER_TEMPLATE_VERSION),
      valuation: file(core.admitted.valuation, ACTUALS_VALUATION_TEMPLATE_VERSION),
      items: mappings,
      reason: command.reason,
      expectedPreviewHash: command.expectedPreviewHash,
    },
  });
  if (items.length !== core.restatement.items.length || reconstructedHash !== core.operationHash) {
    fail(
      409,
      'INVALID_REPLACEMENT_LINEAGE',
      'Correction command body does not match its recorded operation hash.'
    );
  }
}

function cashIdentity(row: BasisCashRow): ActualsRecordIdentityV1 {
  const payload = ActualsPilotCashFlowPayloadSchema.parse(row.payload);
  if (row.sourceHash === null)
    fail(409, 'EFFECTIVE_BASIS_INVALID', 'Cash source identity is missing.');
  return {
    kind: 'ledger',
    recordId: row.id,
    sourceHash: row.sourceHash,
    contentHash: payload.rowContentHash,
  };
}

function markIdentity(row: BasisMarkRow): ActualsRecordIdentityV1 {
  return {
    kind: 'valuation',
    recordId: row.id,
    sourceHash: row.sourceHash,
    contentHash: parseStoredValuationPayload(row.methodologyNotes).rowContentHash,
  };
}

function projectLoadedBasis(
  basis: Awaited<ReturnType<typeof loadBasis>>,
  fundId: number,
  asOfDate: string,
  admittedRecords: readonly ActualsAdmittedProjectionRecord[],
  corrections: readonly ActualsCorrectionProvenanceV1[],
  predecessorSnapshotInputHash: string,
  pendingRecords: readonly {
    identity: ActualsRecordIdentityV1;
    correctionCommandId: string | null;
  }[] = []
) {
  try {
    return projectActualsEffectiveBasis({
      fundId,
      asOfDate,
      predecessorSnapshotInputHash,
      admittedRecords,
      pendingRecords,
      corrections,
      ledgerRows: basis.cash.map((row) => ({
        row,
        identity: cashIdentity(row),
        fundId: row.fundId,
        effectiveDate: isoDay(row.eventDate),
        supersedesEventId: row.supersedesEventId,
        reversalOfEventId: row.reversalOfEventId,
      })),
      valuationMarks: basis.marks.map((row) => {
        if (row.vehicleId === null)
          fail(409, 'VALUATION_SCOPE_MISMATCH', 'Valuation vehicle is missing.');
        return {
          row,
          identity: markIdentity(row),
          fundId: row.fundId,
          effectiveDate: isoDay(row.markDate),
          priorMarkId: row.priorMarkId,
          companyId: row.companyId,
          vehicleId: row.vehicleId,
          markPurpose: row.markPurpose,
        };
      }),
    });
  } catch (error) {
    if (error instanceof ActualsEffectiveBasisError) fail(409, error.code, error.message);
    throw error;
  }
}

async function loadRestatementBasis(
  connection: PublishConnection,
  fundId: number,
  expectedBasis: FinancialFactsBasisRef
) {
  const database = databaseFor(connection);
  const terminal = await resolveTerminalFactsHead(database, fundId);
  if (
    terminal.kind !== 'head' ||
    canonicalSha256(basisRefForHead(terminal.row)) !== canonicalSha256(expectedBasis)
  ) {
    fail(409, 'STALE_BASIS', 'Expected financial facts basis is no longer current.');
  }
  const basis = await loadBasis(connection, fundId, expectedBasis.asOfDate);
  validateCumulativeBasisRows(basis);
  const snapshots = await connection.query<SnapshotRow>(
    `${SNAPSHOT_SELECT} WHERE fund_id = $1 ORDER BY id`,
    [fundId]
  );
  const byId = new Map(snapshots.rows.map((row) => [row.id, row]));
  const ancestry: SnapshotRow[] = [];
  const visited = new Set<number>();
  let cursor: number | null = expectedBasis.snapshotId;
  while (cursor !== null) {
    if (visited.has(cursor))
      fail(409, 'INVALID_REPLACEMENT_LINEAGE', 'Snapshot ancestry contains a cycle.');
    visited.add(cursor);
    const row = byId.get(cursor);
    if (!row) fail(409, 'INVALID_REPLACEMENT_LINEAGE', 'Snapshot ancestry is detached.');
    ancestry.unshift(row);
    cursor = row.supersedesSnapshotId;
  }
  const cashById = new Map(basis.cash.map((row) => [row.id, row]));
  const marksById = new Map(basis.marks.map((row) => [row.id, row]));
  const admittedRecords: ActualsAdmittedProjectionRecord[] = [];
  const corrections: ActualsCorrectionProvenanceV1[] = [];
  let ledgerPayloadSha256: string | null = null;
  let valuationPayloadSha256: string | null = null;
  for (const row of ancestry) {
    if (
      row.policyVersion !== FINANCIAL_FACTS_POLICY_VERSION_1_4_0 &&
      row.policyVersion !== FINANCIAL_FACTS_POLICY_VERSION_1_5_0
    )
      continue;
    const previousHash =
      row.supersedesSnapshotId === null
        ? null
        : (byId.get(row.supersedesSnapshotId)?.snapshotInputHash ?? null);
    if (row.supersedesSnapshotId !== null && previousHash === null)
      fail(409, 'INVALID_REPLACEMENT_LINEAGE', 'Snapshot predecessor is missing.');
    const snapshot = verifyPublicationSnapshot(row, previousHash);
    const core = snapshot.payload.admissionReceiptCore;
    if (
      core.contractVersion === 'actuals-admission/2.0.0' &&
      core.operationKind === 'restatement'
    ) {
      const predecessor =
        row.supersedesSnapshotId === null ? undefined : byId.get(row.supersedesSnapshotId);
      if (!predecessor)
        fail(409, 'INVALID_REPLACEMENT_LINEAGE', 'Correction predecessor is missing.');
      await verifyCorrectionMetadata(connection, row, predecessor, core);
    }
    ledgerPayloadSha256 = core.admitted.ledger?.payloadSha256 ?? ledgerPayloadSha256;
    valuationPayloadSha256 = core.admitted.valuation?.payloadSha256 ?? valuationPayloadSha256;
    const correction = core.contractVersion === 'actuals-admission/2.0.0' ? core.restatement : null;
    if (correction) corrections.push(correction);
    const publication = {
      snapshotId: row.id,
      snapshotInputHash: row.snapshotInputHash,
      operationHash: row.requestHash,
    };
    for (const id of core.admitted.ledger?.approvedRowIds ?? []) {
      const record = cashById.get(id);
      if (!record) fail(409, 'TARGET_NOT_ADMITTED', 'Admitted cash record is missing.');
      admittedRecords.push({
        identity: cashIdentity(record),
        publication,
        correctionCommandId: correction?.commandId ?? null,
      });
    }
    for (const id of core.admitted.valuation?.approvedMarkIds ?? []) {
      const record = marksById.get(id);
      if (!record) fail(409, 'TARGET_NOT_ADMITTED', 'Admitted valuation record is missing.');
      admittedRecords.push({
        identity: markIdentity(record),
        publication,
        correctionCommandId: correction?.commandId ?? null,
      });
    }
    if (expectedBasis.policyVersion === FINANCIAL_FACTS_POLICY_VERSION_1_4_0) {
      for (const kind of ['ledger', 'valuation'] as const) {
        const artifact = core.admitted[kind];
        if (!artifact) continue;
        const stored = await connection.query<{ payload: Buffer | null; payloadSha256: string }>(
          'SELECT payload, payload_sha256 AS "payloadSha256" FROM source_artifacts WHERE fund_id=$1 AND id=$2',
          [fundId, artifact.sourceArtifactId]
        );
        const source = stored.rows[0];
        if (!source?.payload || source.payloadSha256 !== artifact.payloadSha256) {
          fail(
            409,
            'EFFECTIVE_BASIS_INVALID',
            'An original admitted source is unavailable for identity verification.'
          );
        }
        const prepared = await prepareActualsPilotPreview(
          {
            fundId,
            request: {
              contractVersion: 'actuals-preview-request/1.0.0',
              templateVersion:
                kind === 'ledger'
                  ? ACTUALS_LEDGER_TEMPLATE_VERSION
                  : ACTUALS_VALUATION_TEMPLATE_VERSION,
              asOfDate: core.asOfDate,
              fileName: 'verified-source.csv',
              payload: source.payload.toString('base64'),
            },
          },
          {
            database,
            historicalIdentities: new Map(
              [...basis.cash, ...basis.marks].flatMap((record) =>
                record.sourceHash === null
                  ? []
                  : [
                      [
                        record.sourceHash,
                        { companyId: record.companyId, vehicleId: record.vehicleId },
                      ] as const,
                    ]
              )
            ),
          }
        );
        if (
          prepared.preview.payloadSha256 !== artifact.payloadSha256 ||
          prepared.preview.canonicalRowsHash !== artifact.canonicalRowsHash
        ) {
          fail(
            409,
            'EFFECTIVE_BASIS_INVALID',
            'Admitted source bytes no longer match their receipt identity.'
          );
        }
        const sourceRows = new Map(
          prepared.rows.map((record) => [record.rowSourceHash, record.rowContentHash])
        );
        for (const membership of admittedRecords.filter(
          (record) => record.publication.snapshotId === row.id && record.identity.kind === kind
        )) {
          if (sourceRows.get(membership.identity.sourceHash) !== membership.identity.contentHash) {
            fail(
              409,
              'TARGET_HASH_MISMATCH',
              'Admitted record content differs from its source artifact.'
            );
          }
        }
      }
    }
  }
  const projected = projectLoadedBasis(
    basis,
    fundId,
    expectedBasis.asOfDate,
    admittedRecords,
    corrections,
    expectedBasis.snapshotInputHash
  );
  const head = byId.get(expectedBasis.snapshotId);
  if (!head) fail(409, 'STALE_BASIS', 'Expected head is missing.');
  if (head.policyVersion === FINANCIAL_FACTS_POLICY_VERSION_1_5_0) {
    const payload = FinancialFactsPayloadV6Schema.parse(head.payload);
    if (
      payload.effectiveBasis.recordsHash !== projected.effectiveBasis.recordsHash ||
      canonicalSha256(payload.effectiveBasis.corrections) !== canonicalSha256(corrections)
    ) {
      fail(
        409,
        'EFFECTIVE_BASIS_INVALID',
        'Persisted effective identities differ from admitted history.'
      );
    }
  }
  const targets = [
    ...projected.ledgerRows.map((row) => {
      const payload = ActualsPilotCashFlowPayloadSchema.parse(row.payload);
      return {
        identity: cashIdentity(row),
        fields: {
          kind: 'ledger',
          eventType: ledgerEventType(row, payload.expenseCategory),
          effectiveDate: isoDay(row.eventDate),
          amount: row.amount,
          currency: row.currency,
          companyId: row.companyId,
          vehicleId: row.vehicleId,
          deploymentCategory: payload.deploymentCategory,
          expenseCategory: payload.expenseCategory,
          distributionType: payload.distributionType,
          recallable: payload.recallable,
          description: row.description,
        },
        sourceExternalRef: payload.sourceExternalRef,
        predecessorId: row.supersedesEventId,
      };
    }),
    ...projected.valuationMarks
      .filter((row) => isoDay(row.markDate) === expectedBasis.asOfDate)
      .map((row) => ({
        identity: markIdentity(row),
        fields: {
          kind: 'valuation',
          markDate: isoDay(row.markDate),
          fairValue: row.fairValue,
          currency: row.currency,
          companyId: row.companyId,
          vehicleId: row.vehicleId,
          markPurpose: row.markPurpose,
          markSource: row.markSource,
          confidenceLevel: row.confidenceLevel,
          valuationMethod: row.valuationMethod,
          costBasis: row.costBasis,
        },
        sourceExternalRef: parseStoredValuationPayload(row.methodologyNotes).sourceExternalRef,
        predecessorId: row.priorMarkId,
      })),
  ].map(({ identity, fields, sourceExternalRef, predecessorId }) => {
    const membership = admittedRecords.find(
      (record) =>
        record.identity.kind === identity.kind && record.identity.recordId === identity.recordId
    );
    if (!membership) fail(409, 'TARGET_NOT_ADMITTED', 'Effective target has no publication.');
    const predecessor =
      predecessorId === null
        ? null
        : admittedRecords.find(
            (record) =>
              record.identity.kind === identity.kind && record.identity.recordId === predecessorId
          )?.identity;
    if (predecessorId !== null && !predecessor)
      fail(409, 'INVALID_REPLACEMENT_LINEAGE', 'Effective target predecessor is missing.');
    return ActualsRestatementTargetV1Schema.parse({
      identity,
      fields,
      sourceExternalRef,
      originalPublication: membership.publication,
      predecessor: predecessor ?? null,
      correctionCommandId: membership.correctionCommandId,
    });
  });
  if (ledgerPayloadSha256 === null)
    fail(409, 'EFFECTIVE_BASIS_INVALID', 'Historical ledger source identity is missing.');
  return {
    basis,
    projected,
    admittedRecords,
    corrections,
    targets,
    head,
    ancestry,
    ledgerPayloadSha256,
    valuationPayloadSha256,
  };
}

function replacementFields(row: ActualsPilotPreparedRow, kind: 'ledger' | 'valuation') {
  const fields = row.canonicalEconomicFields;
  if (!fields || !row.rowContentHash || !row.rowSourceHash || !row.sourceExternalRef)
    fail(422, 'INVALID_CSV', 'Replacement row is incomplete.');
  return ActualsRestatementRecordFieldsV1Schema.parse(
    kind === 'ledger'
      ? {
          kind,
          eventType: row.eventType,
          effectiveDate: row.effectiveDate,
          amount: row.canonicalAmount,
          currency: 'USD',
          companyId: row.companyId,
          vehicleId: row.vehicleId,
          deploymentCategory: fields['deploymentCategory'] ?? null,
          expenseCategory: fields['expenseCategory'] ?? null,
          distributionType: fields['distributionType'] ?? null,
          recallable: fields['recallable'] ?? null,
          description: fields['description'] ?? null,
        }
      : {
          kind,
          markDate: row.effectiveDate,
          fairValue: row.canonicalAmount,
          currency: 'USD',
          companyId: row.companyId,
          vehicleId: row.vehicleId,
          markPurpose: 'planning_company_fmv',
          markSource: fields['markSource'],
          confidenceLevel: fields['confidenceLevel'],
          valuationMethod: fields['valuationMethod'],
          costBasis: fields['costBasis'] ?? null,
        }
  );
}

async function prepareRestatementReview(
  connection: PublishConnection,
  scope: PublicationContext,
  request: ActualsRestatementPreviewRequestV1,
  loaded: Awaited<ReturnType<typeof loadRestatementBasis>>
) {
  const database = databaseFor(connection);
  const preparedFiles = new Map<'ledger' | 'valuation', ActualsPilotPreparedPreview>();
  const reviewedItems: ActualsRestatementPreviewResponseV1['items'] = [];
  for (const item of request.items) {
    const target = loaded.targets.find(
      (record) =>
        record.identity.kind === item.target.kind &&
        record.identity.recordId === item.target.recordId
    );
    if (
      !target &&
      item.target.kind === 'valuation' &&
      loaded.projected.valuationMarks.some(
        (record) =>
          record.id === item.target.recordId &&
          isoDay(record.markDate) < request.expectedBasis.asOfDate
      )
    ) {
      fail(
        409,
        'HISTORICAL_MARK_RESTATEMENT_UNSUPPORTED',
        'Valuation restatement supports only the current basis as-of date.'
      );
    }
    if (!target)
      fail(409, 'TARGET_NOT_EFFECTIVE', 'Correction target is not an eligible effective record.');
    if (
      canonicalSha256(target.identity) !== canonicalSha256(item.target) ||
      canonicalSha256(target.originalPublication) !== canonicalSha256(item.originalPublication)
    ) {
      fail(409, 'TARGET_HASH_MISMATCH', 'Correction target identity changed.');
    }
  }
  for (const kind of ['ledger', 'valuation'] as const) {
    const file = request[kind];
    if (file === null) continue;
    const prepared = await prepareActualsPilotPreview(
      { fundId: scope.input.fundId, request: previewRequest(file, request.expectedBasis.asOfDate) },
      { database }
    );
    if (
      prepared.preview.payloadSha256 !== file.expectedPayloadSha256 ||
      prepared.preview.canonicalRowsHash !== file.expectedCanonicalRowsHash ||
      prepared.preview.previewHash !== file.expectedPreviewHash
    ) {
      fail(409, 'PREVIEW_HASH_MISMATCH', 'Replacement source preview changed.');
    }
    if (
      prepared.preview.issues.some(
        (issue) =>
          issue.severity === 'error' &&
          !(kind === 'valuation' && issue.code === 'VALUATION_MARK_ALREADY_EXISTS')
      )
    ) {
      fail(422, 'INVALID_CSV', 'Replacement source failed template validation.');
    }
    const mappings = request.items.filter((item) => item.target.kind === kind);
    if (prepared.rows.length !== mappings.length)
      fail(
        409,
        'REPLACEMENT_MAPPING_MISMATCH',
        'Each replacement row must map to exactly one target.'
      );
    for (const row of prepared.rows) {
      const mapping = mappings.find(
        (item) => item.replacementExternalRef === row.sourceExternalRef
      );
      if (
        !mapping ||
        row.rowContentHash !== mapping.expectedReplacementContentHash ||
        row.status === 'already_imported' ||
        row.duplicateInFile
      ) {
        fail(
          409,
          'REPLACEMENT_MAPPING_MISMATCH',
          'Replacement row identity does not match its target mapping.'
        );
      }
      const original = loaded.targets.find(
        (record) =>
          record.identity.kind === kind && record.identity.recordId === mapping.target.recordId
      );
      if (!original) fail(409, 'TARGET_NOT_EFFECTIVE', 'Correction target is no longer effective.');
      const fields = replacementFields(row, kind);
      if (
        fields.kind === 'valuation' &&
        original.fields.kind === 'valuation' &&
        (fields.markDate !== original.fields.markDate ||
          fields.companyId !== original.fields.companyId ||
          fields.vehicleId !== original.fields.vehicleId ||
          fields.markPurpose !== original.fields.markPurpose)
      ) {
        fail(
          409,
          'VALUATION_SCOPE_MISMATCH',
          'Valuation replacement must preserve company, vehicle, date, and type.'
        );
      }
      row.issues = row.issues.filter((issue) => issue.code !== 'VALUATION_MARK_ALREADY_EXISTS');
      if (row.issues.some((issue) => issue.severity === 'error'))
        fail(422, 'INVALID_CSV', 'Replacement row is invalid.');
      row.status = 'valid';
      if (!row.sourceExternalRef || !row.rowContentHash)
        fail(422, 'INVALID_CSV', 'Replacement identity is incomplete.');
      reviewedItems.push({
        original,
        replacementExternalRef: row.sourceExternalRef,
        replacementContentHash: row.rowContentHash,
        replacementFields: fields,
      });
    }
    preparedFiles.set(kind, prepared);
  }
  const sourceHashes = [...preparedFiles.values()].flatMap((prepared) =>
    prepared.rows.flatMap((row) => (row.rowSourceHash === null ? [] : [row.rowSourceHash]))
  );
  const reused = await connection.query(
    `SELECT id FROM cash_flow_events WHERE fund_id=$1 AND source_hash=ANY($2::text[])
    UNION ALL SELECT id FROM valuation_marks WHERE fund_id=$1 AND source_hash=ANY($2::text[]) LIMIT 1`,
    [scope.input.fundId, sourceHashes]
  );
  if (reused.rows.length > 0)
    fail(409, 'EXTERNAL_REF_REUSE_CONFLICT', 'Replacement external references must be fresh.');
  const candidate = {
    ...loaded.basis,
    cash: loaded.projected.ledgerRows.map((row) => {
      const item = reviewedItems.find(
        (entry) =>
          entry.original.identity.kind === 'ledger' && entry.original.identity.recordId === row.id
      );
      if (!item || item.replacementFields.kind !== 'ledger') return row;
      const fields = item.replacementFields;
      return {
        ...row,
        companyId: fields.companyId,
        vehicleId: fields.vehicleId,
        eventType:
          fields.eventType === 'settled_contribution'
            ? 'lp_capital_call'
            : fields.eventType === 'management_fee'
              ? 'fund_expense'
              : fields.eventType,
        eventDate: new Date(`${fields.effectiveDate}T00:00:00.000Z`),
        perspective: ['settled_contribution', 'lp_distribution'].includes(fields.eventType)
          ? 'lp_net'
          : 'fund_gross',
        amount: fields.amount,
        description: fields.description,
        sourceHash: computeActualsPilotRowSourceHash(
          scope.input.fundId,
          item.replacementExternalRef
        ),
        payload: {
          ...ActualsPilotCashFlowPayloadSchema.parse(row.payload),
          sourceExternalRef: item.replacementExternalRef,
          rowContentHash: item.replacementContentHash,
          settlementStatus: fields.eventType === 'settled_contribution' ? 'settled' : null,
          deploymentCategory: fields.deploymentCategory,
          expenseCategory: fields.expenseCategory,
          distributionType: fields.distributionType,
          recallable: fields.recallable,
        },
      };
    }),
    marks: loaded.projected.valuationMarks
      .filter((row) => isoDay(row.markDate) === request.expectedBasis.asOfDate)
      .map((row) => {
        const item = reviewedItems.find(
          (entry) =>
            entry.original.identity.kind === 'valuation' &&
            entry.original.identity.recordId === row.id
        );
        if (!item || item.replacementFields.kind !== 'valuation') return row;
        return {
          ...row,
          fairValue: item.replacementFields.fairValue,
          costBasis: item.replacementFields.costBasis,
          markSource: item.replacementFields.markSource,
          confidenceLevel: item.replacementFields.confidenceLevel,
          valuationMethod: item.replacementFields.valuationMethod,
          sourceHash: computeActualsPilotRowSourceHash(
            scope.input.fundId,
            item.replacementExternalRef
          ),
          methodologyNotes: JSON.stringify({
            ...parseStoredValuationPayload(row.methodologyNotes),
            sourceExternalRef: item.replacementExternalRef,
            rowContentHash: item.replacementContentHash,
          }),
        };
      }),
  };
  const calculator = calculateLoadedActuals(
    candidate,
    scope.input.fundId,
    request.ledger?.expectedPayloadSha256 ?? loaded.ledgerPayloadSha256,
    candidate.marks.length === 0
      ? null
      : (request.valuation?.expectedPayloadSha256 ?? loaded.valuationPayloadSha256),
    loaded.head.snapshotInputHash
  );
  const metadata = await buildFundCompanyActualsFacts({
    database,
    fundId: scope.input.fundId,
    asOfDate: request.expectedBasis.asOfDate,
    now: scope.knowledgeCutoff,
    planningMarkSources: ['actuals_pilot_v1'],
  });
  const companies = projectCompanyActualsFromEffectiveLedger(metadata, candidate.cash);
  const impact = {
    capitalActuals: calculator.capitalActuals,
    valuationActuals: calculator.valuationActuals,
    unavailableCompanyIds: companies.facts
      .filter((fact) => fact.monetaryFacts.availability === 'unavailable')
      .map((fact) => fact.companyId)
      .sort((left, right) => left - right),
  };
  const previewHash = canonicalSha256({
    contractVersion: request.contractVersion,
    expectedBasis: request.expectedBasis,
    reason: request.reason,
    items: request.items,
    ledger:
      request.ledger === null
        ? null
        : {
            payloadSha256: request.ledger.expectedPayloadSha256,
            canonicalRowsHash: request.ledger.expectedCanonicalRowsHash,
          },
    valuation:
      request.valuation === null
        ? null
        : {
            payloadSha256: request.valuation.expectedPayloadSha256,
            canonicalRowsHash: request.valuation.expectedCanonicalRowsHash,
          },
    effectiveRecordsHash: loaded.projected.effectiveBasis.recordsHash,
    impact,
  });
  const preview = ActualsRestatementPreviewResponseV1Schema.parse({
    contractVersion: request.contractVersion,
    basisRef: request.expectedBasis,
    previewHash,
    canPublish: true,
    items: reviewedItems,
    errors: [],
    impact,
  });
  return {
    preview,
    ledger: preparedFiles.get('ledger') ?? null,
    valuation: preparedFiles.get('valuation') ?? null,
  };
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
      if (visited.has(currentId))
        fail(500, 'INTERNAL_ERROR', 'Pilot receipt lineage contains a cycle.');
      visited.add(currentId);
      const snapshot = byId.get(currentId);
      if (!snapshot) fail(500, 'INTERNAL_ERROR', 'Pilot receipt lineage is detached.');
      if (snapshot.policyVersion === FINANCIAL_FACTS_POLICY_VERSION_1_4_0) {
        const payload = FinancialFactsPayloadV5Schema.safeParse(snapshot.payload);
        if (!payload.success) fail(500, 'INTERNAL_ERROR', 'Pilot predecessor payload is corrupt.');
        const core = payload.data.admissionReceiptCore;
        const normalizedAsOfDate = isoDay(snapshot.asOfDate);
        const normalizedCutoff =
          snapshot.knowledgeCutoff instanceof Date
            ? snapshot.knowledgeCutoff
            : new Date(snapshot.knowledgeCutoff);
        const predecessorHash =
          snapshot.supersedesSnapshotId === null
            ? null
            : (byId.get(snapshot.supersedesSnapshotId)?.snapshotInputHash ?? null);
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
          snapshot.sourceFactsInputHash !==
            computeSourceFactsInputHash(core, payload.data, predecessorHash) ||
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
    !sameIds(
      basis.cash.map((row) => row.id),
      expectedRows
    ) ||
    !sameIds(
      basis.marks.map((row) => row.id),
      expectedMarks
    )
  ) {
    fail(
      409,
      'FUND_LEDGER_NOT_PILOT_OWNED',
      'Pilot basis does not match admitted receipt lineage.'
    );
  }
}

function calculateLoadedActuals(
  basis: Awaited<ReturnType<typeof loadBasis>>,
  fundId: number,
  ledgerPayloadSha256: string,
  valuationPayloadSha256: string | null,
  predecessorSnapshotInputHash: string | null
) {
  const vehicle = basis.vehicles[0];
  if (basis.vehicles.length !== 1 || !vehicle || vehicle.committedCapital === null)
    fail(422, 'UNSUPPORTED_VEHICLE_SCOPE', 'One committed main-fund vehicle is required.');
  const committedCapital = vehicle.committedCapital;
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
  const roster = [
    ...new Map(
      ledgerRows
        .filter((row) => row.eventType === 'portfolio_investment')
        .map((row) => [
          `${row.resolvedVehicleId}:${row.resolvedCompanyId}`,
          {
            vehicleId: row.resolvedVehicleId,
            companyId: row.resolvedCompanyId,
          },
        ])
    ).values(),
  ].filter(
    (position): position is { vehicleId: number; companyId: number } =>
      position.vehicleId !== null && position.companyId !== null
  );
  const valuationMarks: ActualsCalculatorValuationMarkV1[] = basis.marks
    .filter((row): row is BasisMarkRow & { vehicleId: number } => row.vehicleId !== null)
    .map((row) => ({
      ...parseStoredValuationPayload(row.methodologyNotes),
      markId: row.id,
      resolvedVehicleId: row.vehicleId,
      resolvedCompanyId: row.companyId,
      positionFairValue: row.fairValue,
      markDate: isoDay(row.markDate),
      markSource: row.markSource,
      confidenceLevel:
        row.confidenceLevel === 'high' || row.confidenceLevel === 'low'
          ? row.confidenceLevel
          : 'medium',
      externalRefHash: row.sourceHash,
    }));
  const calculator = calculateActualsV1({
    ledgerRows,
    vehicleCommitment: {
      vehicleId: vehicle.vehicleId,
      amount: committedCapital,
      sourceHash: canonicalSha256({
        fundId: fundId,
        vehicleId: vehicle.vehicleId,
        amount: committedCapital,
      }),
    },
    roster,
    valuationMarks,
    ledgerCoverage: 'complete',
    ledgerPayloadSha256: ledgerPayloadSha256,
    valuationPayloadSha256: valuationPayloadSha256,
    predecessorSnapshotInputHash: predecessorSnapshotInputHash,
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
  return calculator;
}

async function insertPublicationSnapshot(
  connection: PublishConnection,
  command: FrozenCommand,
  headId: number | null,
  vehicleId: number,
  payload: ReturnType<typeof FinancialFactsPayloadV5Schema.parse> | FinancialFactsPayloadV6,
  sourceFactsInputHash: string,
  snapshotInputHash: string
) {
  const consumerEvaluations = evaluatePayload5Consumers(payload);
  const inserted = await connection.query<SnapshotRow>(
    `
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
    [
      command.input.fundId,
      payload.admissionReceiptCore.facts.policyVersion,
      payload.admissionReceiptCore.facts.payloadSchemaId,
      command.request.asOfDate,
      command.knowledgeCutoff,
      JSON.stringify([vehicleId]),
      EMPTY_SELECTION_SET_HASH,
      sourceFactsInputHash,
      snapshotInputHash,
      JSON.stringify(payload),
      JSON.stringify(consumerEvaluations),
      command.input.actorId,
      command.input.idempotencyKey,
      command.operationHash,
      headId,
    ]
  );
  const row = inserted.rows[0];
  if (!row) fail(500, 'INTERNAL_ERROR', 'Financial facts insert failed.');
  return row;
}

async function createPublicationV6(
  connection: PublishConnection,
  command: FrozenCommand,
  loaded: Awaited<ReturnType<typeof loadRestatementBasis>>,
  ledger: ActualsPilotPreparedPreview | null,
  valuation: ActualsPilotPreparedPreview | null
): Promise<ActualsPublishReceipt> {
  const artifacts = await insertArtifacts(connection, command, ledger, valuation);
  const importBatchId = randomUUID();
  const approvedRowIds = ledger
    ? await insertCashRows(connection, command, ledger.rows, importBatchId)
    : [];
  const approvedMarkIds = valuation
    ? await insertMarks(connection, command, valuation.rows, importBatchId)
    : [];
  const basis = await loadBasis(connection, command.input.fundId, command.request.asOfDate);
  validateCumulativeBasisRows(basis);
  const newIdentities = [
    ...basis.cash.filter((row) => approvedRowIds.includes(row.id)).map(cashIdentity),
    ...basis.marks.filter((row) => approvedMarkIds.includes(row.id)).map(markIdentity),
  ];
  const restatement = command.restatementRequest;
  const correction: ActualsCorrectionProvenanceV1 | null =
    restatement === null
      ? null
      : {
          commandId: randomUUID(),
          asOfDate: command.request.asOfDate,
          reason: restatement.reason,
          actor: { userId: command.input.actorId },
          createdAt: command.knowledgeCutoffIso,
          items: restatement.items.map((item) => {
            const replacement = newIdentities.find(
              (identity) =>
                identity.kind === item.target.kind &&
                identity.sourceHash ===
                  computeActualsPilotRowSourceHash(
                    command.input.fundId,
                    item.replacementExternalRef
                  )
            );
            if (!replacement || replacement.contentHash !== item.expectedReplacementContentHash)
              fail(
                409,
                'REPLACEMENT_MAPPING_MISMATCH',
                'Inserted replacement identity differs from preview.'
              );
            return {
              target: item.target,
              replacement,
              originalPublication: item.originalPublication,
            };
          }),
        };
  const corrections =
    correction === null ? loaded.corrections : [...loaded.corrections, correction];
  const projected = projectLoadedBasis(
    basis,
    command.input.fundId,
    command.request.asOfDate,
    loaded.admittedRecords,
    corrections,
    loaded.head.snapshotInputHash,
    newIdentities.map((identity) => ({
      identity,
      correctionCommandId: correction?.commandId ?? null,
    }))
  );
  const effectiveMarks = projected.valuationMarks.filter(
    (row) => isoDay(row.markDate) === command.request.asOfDate
  );
  const calculator = calculateLoadedActuals(
    { ...basis, cash: projected.ledgerRows, marks: effectiveMarks },
    command.input.fundId,
    ledger?.preview.payloadSha256 ?? loaded.ledgerPayloadSha256,
    effectiveMarks.length === 0
      ? null
      : (valuation?.preview.payloadSha256 ?? loaded.valuationPayloadSha256),
    loaded.head.snapshotInputHash
  );
  const vehicle = basis.vehicles[0];
  if (!vehicle) fail(422, 'UNSUPPORTED_VEHICLE_SCOPE', 'Main-fund vehicle is missing.');
  const database = databaseFor(connection);
  const metadata = await buildFundCompanyActualsFacts({
    database,
    fundId: command.input.fundId,
    asOfDate: command.request.asOfDate,
    now: command.knowledgeCutoff,
    planningMarkSources: ['actuals_pilot_v1'],
  });
  const companyActuals = projectCompanyActualsFromEffectiveLedger(metadata, projected.ledgerRows);
  const core = AdmissionReceiptCoreV2Schema.parse({
    contractVersion: 'actuals-admission/2.0.0',
    operationKind: correction === null ? 'append' : 'restatement',
    operationHash: command.operationHash,
    fundId: command.input.fundId,
    asOfDate: command.request.asOfDate,
    coverage: command.request.coverage,
    admitted: {
      ledger:
        ledger && artifacts.ledgerId !== null
          ? {
              sourceArtifactId: artifacts.ledgerId,
              payloadSha256: ledger.preview.payloadSha256,
              canonicalRowsHash: ledger.preview.canonicalRowsHash,
              previewHash: ledger.preview.previewHash,
              approvedRowIds,
              approvedCount: approvedRowIds.length,
            }
          : null,
      valuation:
        valuation && artifacts.valuationId !== null
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
      policyVersion: FINANCIAL_FACTS_POLICY_VERSION_1_5_0,
      payloadSchemaId: FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID_6,
      supersedesSnapshotId: loaded.head.id,
      knowledgeCutoff: command.knowledgeCutoffIso,
    },
    actor: { userId: command.input.actorId },
    restatement: correction,
    effectiveBasis: projected.effectiveBasis,
  });
  const payload = buildFinancialFactsPayloadV6({
    cashRows: projected.ledgerRows,
    markRows: effectiveMarks,
    vehicleRoster: basis.vehicles.map(({ committedCapital: _ignored, ...row }) => row),
    calculatorResult: calculator,
    companyActuals,
    asOfDate: command.request.asOfDate,
    knowledgeCutoff: command.knowledgeCutoffIso,
    admissionReceiptCore: core,
  });
  const sourceFactsInputHash = computeSourceFactsInputHash(
    core,
    payload,
    loaded.head.snapshotInputHash
  );
  const snapshotInputHash = buildSnapshotInputHash({
    fundId: command.input.fundId,
    vehicleIds: [vehicle.vehicleId],
    asOfDate: command.request.asOfDate,
    knowledgeCutoff: command.knowledgeCutoffIso,
    policyVersion: FINANCIAL_FACTS_POLICY_VERSION_1_5_0,
    payloadSchemaId: FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID_6,
    selectionSetHash: EMPTY_SELECTION_SET_HASH,
    payload,
  });
  const snapshot = await insertPublicationSnapshot(
    connection,
    command,
    loaded.head.id,
    vehicle.vehicleId,
    payload,
    sourceFactsInputHash,
    snapshotInputHash
  );
  if (correction && restatement) {
    await connection.query(
      `INSERT INTO actuals_restatement_commands
      (command_id,fund_id,idempotency_key,operation_hash,expected_snapshot_id,expected_snapshot_input_hash,
       expected_preview_hash,as_of_date,reason,created_by,created_at,publication_snapshot_id,ledger_source_artifact_id,valuation_source_artifact_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        correction.commandId,
        command.input.fundId,
        command.input.idempotencyKey,
        command.operationHash,
        loaded.head.id,
        loaded.head.snapshotInputHash,
        restatement.expectedPreviewHash,
        command.request.asOfDate,
        restatement.reason,
        command.input.actorId,
        command.knowledgeCutoff,
        snapshot.id,
        artifacts.ledgerId,
        artifacts.valuationId,
      ]
    );
    for (const item of correction.items) {
      const mapping = restatement.items.find(
        (entry) =>
          entry.target.kind === item.target.kind && entry.target.recordId === item.target.recordId
      );
      if (!mapping) fail(409, 'REPLACEMENT_MAPPING_MISMATCH', 'Correction mapping is incomplete.');
      await connection.query(
        `INSERT INTO actuals_restatement_items
        (command_id,fund_id,target_cash_flow_event_id,replacement_cash_flow_event_id,target_valuation_mark_id,replacement_valuation_mark_id,
         target_source_hash,target_content_hash,replacement_source_hash,replacement_content_hash,replacement_external_ref,
         original_publication_snapshot_id,original_publication_snapshot_input_hash,original_publication_operation_hash)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [
          correction.commandId,
          command.input.fundId,
          item.target.kind === 'ledger' ? item.target.recordId : null,
          item.target.kind === 'ledger' ? item.replacement.recordId : null,
          item.target.kind === 'valuation' ? item.target.recordId : null,
          item.target.kind === 'valuation' ? item.replacement.recordId : null,
          item.target.sourceHash,
          item.target.contentHash,
          item.replacement.sourceHash,
          item.replacement.contentHash,
          mapping.replacementExternalRef,
          item.originalPublication.snapshotId,
          item.originalPublication.snapshotInputHash,
          item.originalPublication.operationHash,
        ]
      );
    }
  }
  if (core.operationKind === 'restatement')
    await verifyCorrectionMetadata(connection, snapshot, loaded.head, core);
  return receiptFromStored(snapshot, command, loaded.head.snapshotInputHash);
}

async function createPublication(
  connection: PublishConnection,
  command: FrozenCommand,
  head: ReturnType<typeof validateHead>,
  ledger: ActualsPilotPreparedPreview,
  valuation: ActualsPilotPreparedPreview | null
): Promise<ActualsPublishReceipt> {
  const database = databaseFor(connection) as never;
  const artifacts = await insertArtifacts(connection, command, ledger, valuation);
  if (artifacts.ledgerId === null) fail(500, 'INTERNAL_ERROR', 'Ledger artifact is missing.');
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
  if (committedCapital === null)
    fail(422, 'UNSUPPORTED_VEHICLE_SCOPE', 'Vehicle commitment unavailable.');
  const currentValuationSourceHashes = new Set(
    valuation?.rows.flatMap((row) =>
      row.rowSourceHash !== null && (row.status === 'valid' || row.status === 'already_imported')
        ? [row.rowSourceHash]
        : []
    ) ?? []
  );
  if (command.request.ledger === null)
    fail(400, 'INVALID_BODY', 'Ordinary publication requires a ledger.');
  const calculator = calculateLoadedActuals(
    {
      ...basis,
      marks: basis.marks.filter((row) => currentValuationSourceHashes.has(row.sourceHash)),
    },
    command.input.fundId,
    command.request.ledger.expectedPayloadSha256,
    command.request.valuation?.expectedPayloadSha256 ?? null,
    head?.snapshotInputHash ?? null
  );
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
      valuation:
        valuation && artifacts.valuationId
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
  const sourceFactsInputHash = canonicalSha256({
    templateVersions: [
      command.request.ledger.templateVersion,
      command.request.valuation?.templateVersion ?? null,
    ],
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
  const row = await insertPublicationSnapshot(
    connection,
    command,
    head?.id ?? null,
    vehicle.vehicleId,
    payload,
    sourceFactsInputHash,
    snapshotInputHash
  );
  return receiptFromStored(row, command, head?.snapshotInputHash ?? null);
}

async function mutationAttempt(
  connection: PublishConnection,
  command: FrozenCommand,
  monotonicNow: () => number
): Promise<AttemptResult> {
  await withinBudget(
    command,
    monotonicNow,
    connection.query('BEGIN ISOLATION LEVEL SERIALIZABLE'),
    'PUBLISH_RETRY_EXHAUSTED'
  );
  if (command.input.context) await applyRLSContext(connection as never, command.input.context);
  await configureTransaction(connection, command, monotonicNow);
  await acquireFundLock(connection, command, monotonicNow, 'PUBLISH_RETRY_EXHAUSTED');
  await configureTransaction(connection, command, monotonicNow, true);
  await authorizeActor(connection, command, monotonicNow, 'PUBLISH_RETRY_EXHAUSTED');
  const candidate = await loadReceiptCandidate(
    connection,
    command,
    monotonicNow,
    'PUBLISH_RETRY_EXHAUSTED'
  );
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
  if (readActualsPilotPublishFundId() !== command.input.fundId) {
    fail(409, 'ACTUALS_PUBLICATION_DISABLED', 'New actuals publication is disabled.');
  }
  const database = databaseFor(connection) as never;
  assertBudget(command, monotonicNow);
  const head = validateHead(
    command,
    await resolveTerminalFactsHead(database, command.input.fundId)
  );
  await lockPublicationScope(connection, command);
  await assertPilotOwnership(connection, command.input.fundId);
  if (command.restatementRequest) {
    const loaded = await loadRestatementBasis(
      connection,
      command.input.fundId,
      command.restatementRequest.expectedBasis
    );
    const review = await prepareRestatementReview(
      connection,
      command,
      command.restatementRequest,
      loaded
    );
    if (review.preview.previewHash !== command.restatementRequest.expectedPreviewHash)
      fail(409, 'PREVIEW_HASH_MISMATCH', 'Restatement preview changed.');
    const receipt = await createPublicationV6(
      connection,
      command,
      loaded,
      review.ledger,
      review.valuation
    );
    return { kind: 'created', receipt };
  }
  if (command.request.ledger === null)
    fail(400, 'INVALID_BODY', 'Ordinary publication requires a ledger.');
  const preliminaryLedger = await prepareActualsPilotPreview(
    {
      fundId: command.input.fundId,
      request: previewRequest(command.request.ledger, command.request.asOfDate),
    },
    { database }
  );
  const preliminaryValuation = command.request.valuation
    ? await prepareActualsPilotPreview(
        {
          fundId: command.input.fundId,
          request: previewRequest(command.request.valuation, command.request.asOfDate),
        },
        { database }
      )
    : null;
  await lockPublicationScope(connection, command, [
    ...preliminaryLedger.rows.flatMap((row) => (row.companyId === null ? [] : [row.companyId])),
    ...(preliminaryValuation?.rows.flatMap((row) =>
      row.companyId === null ? [] : [row.companyId]
    ) ?? []),
  ]);
  assertBudget(command, monotonicNow);
  const ledger = await prepareActualsPilotPreview(
    {
      fundId: command.input.fundId,
      request: previewRequest(command.request.ledger, command.request.asOfDate),
    },
    { database }
  );
  validatePrepared('ledger', ledger, command.request.ledger);
  const valuation = command.request.valuation
    ? await prepareActualsPilotPreview(
        {
          fundId: command.input.fundId,
          request: previewRequest(command.request.valuation, command.request.asOfDate),
        },
        { database }
      )
    : null;
  if (valuation && command.request.valuation)
    validatePrepared('valuation', valuation, command.request.valuation);
  const netNewCount =
    acceptedRows(ledger.rows).length + (valuation ? acceptedRows(valuation.rows).length : 0);
  if (netNewCount === 0) fail(422, 'INVALID_CSV', 'Publish requires at least one net-new row.');
  if (
    command.request.coverage.ledger === 'incremental_since_prior_head' &&
    ledger.rows.some((row) => row.status === 'already_imported')
  ) {
    fail(422, 'INCOMPLETE_COVERAGE', 'Incremental publication cannot repeat predecessor rows.');
  }
  assertBudget(command, monotonicNow);
  const receipt =
    head?.policyVersion === FINANCIAL_FACTS_POLICY_VERSION_1_5_0
      ? await createPublicationV6(
          connection,
          command,
          await loadRestatementBasis(connection, command.input.fundId, basisRefForHead(head)),
          ledger,
          valuation
        )
      : await createPublication(connection, command, head, ledger, valuation);
  return { kind: 'created', receipt };
}

async function reconciliationOracle(
  connection: PublishConnection,
  command: FrozenCommand,
  monotonicNow: () => number
): Promise<{ receipt: ActualsPublishReceipt | null; destroyConnection: boolean }> {
  await withinBudget(
    command,
    monotonicNow,
    connection.query('BEGIN ISOLATION LEVEL READ COMMITTED READ WRITE'),
    'MUTATION_OUTCOME_UNKNOWN'
  );
  if (command.input.context) await applyRLSContext(connection as never, command.input.context);
  await configureTransaction(connection, command, monotonicNow, false, 'MUTATION_OUTCOME_UNKNOWN');
  await acquireFundLock(connection, command, monotonicNow, 'MUTATION_OUTCOME_UNKNOWN');
  await configureTransaction(connection, command, monotonicNow, true, 'MUTATION_OUTCOME_UNKNOWN');
  await authorizeActor(connection, command, monotonicNow, 'MUTATION_OUTCOME_UNKNOWN');
  const candidate = await loadReceiptCandidate(
    connection,
    command,
    monotonicNow,
    'MUTATION_OUTCOME_UNKNOWN'
  );
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
    await withinBudget(
      command,
      monotonicNow,
      connection.query('COMMIT'),
      'MUTATION_OUTCOME_UNKNOWN'
    );
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

async function publishActualsCommand(
  input: ActualsPilotPublishInput | ActualsRestatementPublishInput,
  options: ActualsPilotPublishOptions = {}
): Promise<ActualsPilotPublishResult> {
  const now = options.now ?? (() => new Date());
  const monotonicNow = options.monotonicNow ?? (() => performance.now());
  const sleep =
    options.sleep ??
    ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const command = frozenCommand(input, now, monotonicNow);
  if (!command.input.context && !options.connect) {
    fail(404, 'RESOURCE_NOT_FOUND', 'Organization context required.');
  }
  if (command.request.ledger)
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
    const rawConnection = await withinBudget(
      command,
      monotonicNow,
      connect(),
      'PUBLISH_RETRY_EXHAUSTED',
      (late) => late.release(true)
    );
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
        await sleep(
          Math.min(25 * 2 ** (mutationAttempts - 1), Math.max(0, remaining(command, monotonicNow)))
        );
        continue;
      }
      if (isWholeTransactionRetry(error)) {
        fail(503, 'PUBLISH_RETRY_EXHAUSTED', 'Publication retry exhausted.');
      }
      throw error;
    }

    try {
      await withinBudget(
        command,
        monotonicNow,
        connection.query('COMMIT'),
        'PUBLISH_RETRY_EXHAUSTED'
      );
      connection.release();
    } catch (commitError) {
      const state = sqlState(commitError);
      connection.release(true);
      if (RETRYABLE_SQLSTATES.has(state ?? '') && postAmbiguityMutationUsed) {
        fail(503, 'PUBLISH_RETRY_EXHAUSTED', 'Post-ambiguity publication retry exhausted.');
      }
      if (RETRYABLE_SQLSTATES.has(state ?? '') && mutationAttempts < MAX_MUTATION_ATTEMPTS)
        continue;

      const rawOracleConnection = await withinBudget(
        command,
        monotonicNow,
        connect(),
        'MUTATION_OUTCOME_UNKNOWN',
        (late) => late.release(true)
      );
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
                await withinBudget(
                  command,
                  monotonicNow,
                  Promise.resolve(afterCommit),
                  'PUBLISH_RETRY_EXHAUSTED'
                );
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
        )
          throw oracleError;
        fail(503, 'MUTATION_OUTCOME_UNKNOWN', 'Publication outcome could not be proven.');
      }
      if (
        postAmbiguityMutationUsed ||
        mutationAttempts >= MAX_MUTATION_ATTEMPTS ||
        remaining(command, monotonicNow) < 1_000
      ) {
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
          await withinBudget(
            command,
            monotonicNow,
            Promise.resolve(afterCommit),
            'PUBLISH_RETRY_EXHAUSTED'
          );
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

export async function publishActualsPilot(
  input: ActualsPilotPublishInput,
  options: ActualsPilotPublishOptions = {}
): Promise<ActualsPilotPublishResult> {
  return publishActualsCommand(input, options);
}

export async function publishActualsRestatement(
  input: ActualsRestatementPublishInput,
  options: ActualsPilotPublishOptions = {}
): Promise<ActualsPilotPublishResult> {
  return publishActualsCommand(input, options);
}

async function withRestatementRead<Request, Result>(
  input: ActualsRestatementReadInput<Request>,
  expectedBasis: FinancialFactsBasisRef,
  options: ActualsPilotPublishOptions,
  work: (
    connection: PublishConnection,
    scope: PublicationContext,
    loaded: Awaited<ReturnType<typeof loadRestatementBasis>>
  ) => Promise<Result>
): Promise<Result> {
  if (
    !Number.isSafeInteger(input.fundId) ||
    input.fundId <= 0 ||
    !Number.isSafeInteger(input.actorId) ||
    input.actorId <= 0
  )
    fail(404, 'RESOURCE_NOT_FOUND', 'Resource not found.');
  if (expectedBasis.fundId !== input.fundId)
    fail(409, 'STALE_BASIS', 'Expected basis belongs to a different fund.');
  const context = input.context ?? getRequestDatabaseScope()?.context;
  if (
    (context?.fundId && Number(context.fundId) !== input.fundId) ||
    (!context && !options.connect)
  )
    fail(404, 'RESOURCE_NOT_FOUND', 'Organization context is required.');
  const monotonicNow = options.monotonicNow ?? (() => performance.now());
  const startedAt = monotonicNow();
  const knowledgeCutoff = new Date((options.now ?? (() => new Date()))().getTime());
  const scope: PublicationContext = {
    input: { ...input, ...(context ? { context } : {}) },
    knowledgeCutoff,
    knowledgeCutoffIso: knowledgeCutoff.toISOString(),
    startedAt,
    deadline: startedAt + COMMAND_BUDGET_MS,
  };
  const rawConnection = await withinBudget(
    scope,
    monotonicNow,
    (options.connect ?? defaultConnect)(),
    'PUBLISH_RETRY_EXHAUSTED',
    (late) => late.release(true)
  );
  const connection = budgetedConnection(
    rawConnection,
    scope,
    monotonicNow,
    'PUBLISH_RETRY_EXHAUSTED'
  );
  try {
    await connection.query('BEGIN ISOLATION LEVEL READ COMMITTED');
    if (context) await applyRLSContext(connection as never, context);
    await configureTransaction(connection, scope, monotonicNow);
    await acquireFundLock(connection, scope, monotonicNow, 'PUBLISH_RETRY_EXHAUSTED');
    await authorizeActor(connection, scope, monotonicNow, 'PUBLISH_RETRY_EXHAUSTED');
    await lockPublicationScope(connection, scope);
    await assertPilotOwnership(connection, input.fundId);
    const loaded = await loadRestatementBasis(connection, input.fundId, expectedBasis);
    const result = await work(connection, scope, loaded);
    await connection.query('COMMIT');
    connection.release();
    return result;
  } catch (error) {
    await rollbackAndRelease(connection, error);
    throw error;
  }
}

export async function previewActualsRestatement(
  input: ActualsRestatementReadInput<ActualsRestatementPreviewRequestV1>,
  options: ActualsPilotPublishOptions = {}
): Promise<ActualsRestatementPreviewResponseV1> {
  const request = ActualsRestatementPreviewRequestV1Schema.parse(input.request);
  return withRestatementRead(
    input,
    request.expectedBasis,
    options,
    async (connection, scope, loaded) =>
      (await prepareRestatementReview(connection, scope, request, loaded)).preview
  );
}

function parseReadCursor(request: ActualsRestatementReadRequestV1, scope: 'targets' | 'history') {
  if (request.cursor === null) return null;
  try {
    const bytes = Buffer.from(request.cursor, 'base64url');
    if (!/^[A-Za-z0-9_-]+$/.test(request.cursor) || bytes.toString('base64url') !== request.cursor)
      fail(400, 'INVALID_CURSOR', 'Cursor must use canonical base64url.');
    const decoded: unknown = JSON.parse(bytes.toString('utf8'));
    const cursor = ActualsRestatementCursorV1Schema.parse(decoded);
    if (
      cursor.scope !== scope ||
      cursor.fundId !== request.expectedBasis.fundId ||
      cursor.snapshotId !== request.expectedBasis.snapshotId ||
      cursor.snapshotInputHash !== request.expectedBasis.snapshotInputHash
    ) {
      fail(409, 'INVALID_CURSOR', 'Cursor does not belong to the expected fund and basis.');
    }
    return cursor;
  } catch (error) {
    if (error instanceof ActualsPilotPublishError) throw error;
    fail(400, 'INVALID_CURSOR', 'Cursor is malformed.');
  }
}

function encodeReadCursor(
  basis: FinancialFactsBasisRef,
  scope: 'targets' | 'history',
  afterKind: 'ledger' | 'valuation' | 'command',
  afterId: number
) {
  return Buffer.from(
    JSON.stringify({
      contractVersion: 'actuals-restatement-cursor/1.0.0',
      scope,
      fundId: basis.fundId,
      snapshotId: basis.snapshotId,
      snapshotInputHash: basis.snapshotInputHash,
      afterKind,
      afterId,
    })
  ).toString('base64url');
}

export async function readActualsRestatementTargets(
  input: ActualsRestatementReadInput<ActualsRestatementReadRequestV1>,
  options: ActualsPilotPublishOptions = {}
): Promise<ActualsRestatementTargetsResponseV1> {
  const request = ActualsRestatementReadRequestV1Schema.parse(input.request);
  const cursor = parseReadCursor(request, 'targets');
  return withRestatementRead(
    input,
    request.expectedBasis,
    options,
    async (_connection, _scope, loaded) => {
      const sorted = [...loaded.targets].sort((left, right) =>
        left.identity.kind === right.identity.kind
          ? left.identity.recordId - right.identity.recordId
          : left.identity.kind === 'ledger'
            ? -1
            : 1
      );
      const remainingTargets =
        cursor === null
          ? sorted
          : sorted.filter((target) =>
              target.identity.kind === cursor.afterKind
                ? target.identity.recordId > cursor.afterId
                : cursor.afterKind === 'ledger' && target.identity.kind === 'valuation'
            );
      const targets = remainingTargets.slice(0, request.limit);
      const last = targets.at(-1);
      return ActualsRestatementTargetsResponseV1Schema.parse({
        contractVersion: 'actuals-restatement/1.0.0',
        basisRef: request.expectedBasis,
        targets,
        nextCursor:
          remainingTargets.length > targets.length && last
            ? encodeReadCursor(
                request.expectedBasis,
                'targets',
                last.identity.kind,
                last.identity.recordId
              )
            : null,
      });
    }
  );
}

export async function readActualsRestatementHistory(
  input: ActualsRestatementReadInput<ActualsRestatementReadRequestV1>,
  options: ActualsPilotPublishOptions = {}
): Promise<ActualsRestatementHistoryResponseV1> {
  const request = ActualsRestatementReadRequestV1Schema.parse(input.request);
  const cursor = parseReadCursor(request, 'history');
  return withRestatementRead(
    input,
    request.expectedBasis,
    options,
    async (connection, _scope, loaded) => {
      const commands = await connection.query<{
        id: number;
        commandId: string;
        publicationSnapshotId: number;
      }>(
        'SELECT id, command_id AS "commandId", publication_snapshot_id AS "publicationSnapshotId" FROM actuals_restatement_commands WHERE fund_id=$1 AND id>$2 ORDER BY id LIMIT $3',
        [input.fundId, cursor?.afterId ?? 0, request.limit + 1]
      );
      const history = commands.rows.slice(0, request.limit).map((command) => {
        const correction = loaded.corrections.find(
          (record) => record.commandId === command.commandId
        );
        const snapshot = loaded.ancestry.find((row) => row.id === command.publicationSnapshotId);
        if (!correction || !snapshot)
          fail(
            409,
            'INVALID_REPLACEMENT_LINEAGE',
            'Correction history is detached from current ancestry.'
          );
        return {
          id: command.id,
          publication: {
            snapshotId: snapshot.id,
            snapshotInputHash: snapshot.snapshotInputHash,
            operationHash: snapshot.requestHash,
          },
          correction,
        };
      });
      const last = history.at(-1);
      return ActualsRestatementHistoryResponseV1Schema.parse({
        contractVersion: 'actuals-restatement/1.0.0',
        basisRef: request.expectedBasis,
        history,
        nextCursor:
          commands.rows.length > history.length && last
            ? encodeReadCursor(request.expectedBasis, 'history', 'command', last.id)
            : null,
      });
    }
  );
}

export const actualsPilotPublishTestSeams = {
  budgetedConnection,
  mutationAttempt,
  reconciliationOracle,
  rollbackAndRelease,
  withinBudget,
};
