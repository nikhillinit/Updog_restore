import { createHash } from 'node:crypto';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { PoolClient } from 'pg';

import {
  VEHICLE_ONBOARDING_MAX_SOURCE_BYTES,
  VEHICLE_ONBOARDING_VERSION,
  VehicleOnboardingKeySchema,
  VehicleOnboardingReceiptSchema,
  VehicleOnboardingRequestSchema,
  serializeVehicleOnboardingReceipt,
  type VehicleOnboardingReceipt,
  type VehicleOnboardingRequest,
} from '@shared/contracts/lp-reporting/vehicle-onboarding.contract';
import { readActualsPilotFundId } from '../../config/actuals-pilot-env';
import { combinedSchema } from '../../db-schema';
import { applyRLSContext, getRequestDatabaseScope } from '../../db/request-context';
import {
  replayIdempotentCommandIfPresent,
  runIdempotentCommand,
} from '../../lib/idempotent-command';
import type { UserContext } from '../../lib/secure-context';
import {
  createSourceArtifact,
  type CreateSourceArtifactInput,
} from '../financial-observations/source-artifact-service';

const OPERATION = 'ensure_main_fund';
const MAX_ID = 2_147_483_647;

export class VehicleOnboardingError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'VehicleOnboardingError';
  }
}

interface OnboardingInput {
  fundId: number;
  actorId: number;
  idempotencyKey: string;
  request: VehicleOnboardingRequest;
  context?: UserContext;
}

export interface VehicleOnboardingOptions {
  /** Direct callers supply a dedicated connection; HTTP uses its existing request transaction. */
  connect?: () => Promise<PoolClient>;
  readPilotFundId?: () => number | null;
  now?: () => Date;
}

export interface VehicleOnboardingResult {
  status: 200 | 201;
  body: VehicleOnboardingReceipt;
  responseBody: string;
}

interface StoredCommand {
  requestHash: string;
  responseStatus: 200 | 201;
  responseBody: unknown;
}

type CommandDatabase = NonNullable<CreateSourceArtifactInput['database']>;
interface CommandTransaction {
  client: PoolClient;
  database: CommandDatabase;
}

function fail(status: number, code: string, message: string): never {
  throw new VehicleOnboardingError(status, code, message);
}

function sourceBytes(source: VehicleOnboardingRequest['source']) {
  const binary = 'payloadBase64' in source;
  const payload = binary
    ? Buffer.from(source.payloadBase64, 'base64')
    : Buffer.from(source.content, 'utf8');
  if (binary && payload.toString('base64') !== source.payloadBase64) {
    fail(400, 'INVALID_BODY', 'Source must use canonical base64.');
  }
  if (payload.length === 0 || payload.length > VEHICLE_ONBOARDING_MAX_SOURCE_BYTES) {
    fail(400, 'INVALID_BODY', 'Source must contain between 1 byte and 120 KiB.');
  }
  // Reject unpaired UTF-16 surrogates rather than silently replacing source characters.
  if (!binary && payload.toString('utf8') !== source.content) {
    fail(400, 'INVALID_BODY', 'Source must contain valid Unicode text.');
  }
  return {
    payload,
    sourceType: source.sourceType,
    fileName: binary ? source.fileName : null,
    mediaType:
      source.sourceType === 'xlsx'
        ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        : source.sourceType === 'csv'
          ? 'text/csv'
          : 'text/plain',
    payloadSha256: createHash('sha256').update(payload).digest('hex'),
    byteCount: payload.length,
  };
}

async function authorizeAndLock(client: PoolClient, input: OnboardingInput): Promise<void> {
  const actor = (
    await client.query<{
      role: string;
      is_active: boolean;
      is_release_canary_principal: boolean;
    }>('SELECT role, is_active, is_release_canary_principal FROM users WHERE id = $1 FOR SHARE', [
      input.actorId,
    ])
  ).rows[0];
  if (!actor || !actor.is_active || actor.is_release_canary_principal || actor.role === 'service') {
    fail(404, 'RESOURCE_NOT_FOUND', 'Resource not found.');
  }
  const grant = await client.query(
    'SELECT user_id FROM user_fund_grants WHERE user_id = $1 AND fund_id = $2 FOR SHARE',
    [input.actorId, input.fundId]
  );
  if (grant.rows.length === 0) fail(404, 'RESOURCE_NOT_FOUND', 'Resource not found.');
  if (actor.role !== 'admin') fail(403, 'INSUFFICIENT_ROLE', 'Administrator access required.');

  // Global request middleware runs before route parameters exist. Bind only the
  // fund whose live grant was just locked, retaining the verified caller claims.
  await client.query("SELECT set_config('app.current_fund', $1, true)", [String(input.fundId)]);

  // The parent row exists even when the vehicle does not. This serializes different keys.
  const fund = await client.query(
    `SELECT id FROM funds WHERE id = $1 AND data_origin = 'production'
       AND base_currency = 'USD' FOR UPDATE`,
    [input.fundId]
  );
  if (fund.rows.length !== 1) fail(404, 'RESOURCE_NOT_FOUND', 'Resource not found.');
}

async function transaction<T>(
  input: OnboardingInput,
  options: VehicleOnboardingOptions,
  work: (tx: CommandTransaction) => Promise<T>
): Promise<T> {
  const scope = getRequestDatabaseScope();
  const context = scope?.context ?? input.context;
  if (
    !context ||
    Number(context.userId) !== input.actorId ||
    (context.fundId !== undefined && Number(context.fundId) !== input.fundId)
  ) {
    fail(404, 'RESOURCE_NOT_FOUND', 'Resource not found.');
  }
  if (context.role !== 'admin') fail(403, 'INSUFFICIENT_ROLE', 'Administrator access required.');

  if (scope) {
    // The HTTP middleware owns commit, rollback, disconnect handling and response buffering.
    return work({ client: scope.client, database: scope.db });
  }
  if (!options.connect) {
    fail(503, 'TRANSACTION_REQUIRED', 'A request transaction is required.');
  }
  const client = await options.connect();
  let committing = false;
  let destroy = false;
  try {
    await client.query('BEGIN');
    await applyRLSContext(client, { ...context, fundId: String(input.fundId) });
    const result = await work({
      client,
      database: drizzle(client, { schema: combinedSchema }),
    });
    committing = true;
    await client.query('COMMIT');
    return result;
  } catch (error) {
    if (committing) {
      destroy = true;
      fail(
        503,
        'ONBOARDING_OUTCOME_UNKNOWN',
        'The declaration outcome is unknown. Retry the same request and Idempotency-Key.'
      );
    }
    try {
      await client.query('ROLLBACK');
    } catch {
      destroy = true;
    }
    throw error;
  } finally {
    client.release(destroy);
  }
}

function resultFromStored(row: StoredCommand): VehicleOnboardingResult {
  const body = VehicleOnboardingReceiptSchema.parse(row.responseBody);
  if (row.responseStatus !== 200 && row.responseStatus !== 201) {
    fail(500, 'INVALID_STORED_RECEIPT', 'Stored declaration is invalid.');
  }
  return {
    status: row.responseStatus,
    body,
    responseBody: serializeVehicleOnboardingReceipt(body),
  };
}

async function matchOrInsertMainFund(
  client: PoolClient,
  fundId: number,
  request: VehicleOnboardingRequest
): Promise<{ vehicleId: number; existing: boolean }> {
  const vehicles = await client.query<{
    id: number;
    vehicleSlug: string;
    name: string;
    vehicleType: string;
    currency: string;
    status: string;
    committedCapital: string | null;
  }>(
    `SELECT id, vehicle_slug AS "vehicleSlug", name, vehicle_type AS "vehicleType",
                  currency, status, committed_capital::text AS "committedCapital"
             FROM vehicles WHERE fund_id = $1 ORDER BY id FOR UPDATE`,
    [fundId]
  );
  const main = vehicles.rows.filter((row) => row.vehicleType === 'main_fund');
  const occupied = vehicles.rows.find((row) => row.vehicleSlug === request.vehicleSlug);
  if (main.length > 1 || (occupied && occupied.vehicleType !== 'main_fund')) {
    fail(409, 'VEHICLE_IDENTITY_CONFLICT', 'The requested main-fund identity is unavailable.');
  }
  const existing = main[0];
  if (
    existing &&
    (existing.vehicleSlug !== request.vehicleSlug ||
      existing.name !== request.name ||
      existing.currency !== 'USD' ||
      existing.status !== 'active' ||
      existing.committedCapital === null ||
      !VehicleOnboardingRequestSchema.shape.committedCapital.safeParse(existing.committedCapital)
        .success ||
      VehicleOnboardingRequestSchema.shape.committedCapital.parse(existing.committedCapital) !==
        request.committedCapital)
  ) {
    fail(
      409,
      'VEHICLE_DECLARATION_CONFLICT',
      'Existing main-fund fields do not match the declaration.'
    );
  }
  const vehicleId =
    existing?.id ??
    (
      await client.query<{ id: number }>(
        `INSERT INTO vehicles
                (fund_id, vehicle_slug, vehicle_type, name, committed_capital, currency, status)
               VALUES ($1, $2, 'main_fund', $3, $4, 'USD', 'active') RETURNING id`,
        [fundId, request.vehicleSlug, request.name, request.committedCapital]
      )
    ).rows[0]?.id;
  if (!vehicleId) fail(500, 'ONBOARDING_FAILED', 'Vehicle creation returned no identity.');
  return { vehicleId, existing: Boolean(existing) };
}

async function insertReceipt(
  client: PoolClient,
  input: {
    fundId: number;
    actorId: number;
    idempotencyKey: string;
    requestHash: string;
    request: VehicleOnboardingRequest;
    artifact: Awaited<ReturnType<typeof createSourceArtifact>>;
    now: Date;
    vehicleId: number;
    existing: boolean;
  }
): Promise<StoredCommand> {
  const commandId = (
    await client.query<{ id: number }>(
      `SELECT nextval(pg_get_serial_sequence('vehicle_onboarding_commands', 'id'))::int AS id`
    )
  ).rows[0]?.id;
  if (!commandId) fail(500, 'ONBOARDING_FAILED', 'Command allocation returned no identity.');
  const status = input.existing ? 200 : 201;
  const body = VehicleOnboardingReceiptSchema.parse({
    contractVersion: VEHICLE_ONBOARDING_VERSION,
    commandId,
    fundId: input.fundId,
    vehicleId: input.vehicleId,
    vehicleSlug: input.request.vehicleSlug,
    name: input.request.name,
    vehicleType: 'main_fund',
    currency: 'USD',
    status: 'active',
    committedCapital: input.request.committedCapital,
    sourceArtifactId: input.artifact.id,
    sourceArtifactSha256: input.artifact.payloadSha256,
    sourceLocator: input.request.sourceLocator,
    sourcePurgeAfter: input.artifact.purgeAfter,
    attestation: input.request.attestation,
    outcome: input.existing ? 'existing' : 'created',
    actorId: input.actorId,
    declaredAt: input.now.toISOString(),
  });
  await client.query(
    `INSERT INTO vehicle_onboarding_commands
            (id, fund_id, actor_id, vehicle_id, operation, contract_version, idempotency_key,
             request_hash, vehicle_slug, name, vehicle_type, currency, status, committed_capital,
             source_artifact_id, source_artifact_sha256, source_locator, attestation_version,
             outcome, created_at, response_status, response_body)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'main_fund','USD','active',$11,$12,$13,$14,$15,$16,$17,$18,$19::jsonb)`,
    [
      commandId,
      input.fundId,
      input.actorId,
      input.vehicleId,
      OPERATION,
      VEHICLE_ONBOARDING_VERSION,
      input.idempotencyKey,
      input.requestHash,
      input.request.vehicleSlug,
      input.request.name,
      input.request.committedCapital,
      input.artifact.id,
      input.artifact.payloadSha256,
      input.request.sourceLocator,
      input.request.attestation,
      body.outcome,
      input.now,
      status,
      serializeVehicleOnboardingReceipt(body),
    ]
  );
  return { requestHash: input.requestHash, responseStatus: status, responseBody: body };
}

export async function onboardMainFundVehicle(
  input: OnboardingInput,
  options: VehicleOnboardingOptions = {}
): Promise<VehicleOnboardingResult> {
  if (
    !Number.isSafeInteger(input.fundId) ||
    input.fundId < 1 ||
    input.fundId > MAX_ID ||
    !Number.isSafeInteger(input.actorId) ||
    input.actorId < 1 ||
    input.actorId > MAX_ID ||
    (options.readPilotFundId ?? readActualsPilotFundId)() !== input.fundId
  ) {
    fail(404, 'RESOURCE_NOT_FOUND', 'Resource not found.');
  }
  const parsedKey = VehicleOnboardingKeySchema.safeParse(input.idempotencyKey);
  if (!parsedKey.success) fail(400, 'INVALID_IDEMPOTENCY_KEY', 'A lowercase UUID key is required.');
  const parsed = VehicleOnboardingRequestSchema.safeParse(input.request);
  if (!parsed.success) fail(400, 'INVALID_BODY', 'Vehicle declaration is invalid.');
  const request = parsed.data;
  const source = sourceBytes(request.source);
  const lineage = {
    contractVersion: VEHICLE_ONBOARDING_VERSION,
    operation: OPERATION,
    actorId: input.actorId,
    fundId: input.fundId,
    vehicleSlug: request.vehicleSlug,
    name: request.name,
    committedCapital: request.committedCapital,
    sourceType: source.sourceType,
    sourceFileName: source.fileName,
    sourceMediaType: source.mediaType,
    sourceByteCount: source.byteCount,
    sourceArtifactSha256: source.payloadSha256,
    sourceLocator: request.sourceLocator,
    attestationVersion: request.attestation,
  };

  return transaction(input, options, async ({ client, database }) => {
    await authorizeAndLock(client, input);
    const command = {
      db: database,
      fundId: input.fundId,
      idempotencyKey: parsedKey.data,
      contractVersion: VEHICLE_ONBOARDING_VERSION,
      request: lineage,
      loadExisting: async () => {
        const row = (
          await client.query<StoredCommand>(
            `SELECT request_hash AS "requestHash", response_status AS "responseStatus",
                    response_body AS "responseBody"
               FROM vehicle_onboarding_commands
              WHERE fund_id = $1 AND operation = $2 AND idempotency_key = $3`,
            [input.fundId, OPERATION, parsedKey.data]
          )
        ).rows[0];
        return row ? { row, requestHash: row.requestHash } : null;
      },
    };
    const replay = await replayIdempotentCommandIfPresent(command);
    if (replay) return resultFromStored(replay.row);

    const saved = await runIdempotentCommand<StoredCommand>({
      ...command,
      insert: async (requestHash) => {
        const now = (options.now ?? (() => new Date()))();
        const artifact = await createSourceArtifact({
          fundId: input.fundId,
          actorId: input.actorId,
          sourceType: source.sourceType,
          fileName: source.fileName,
          mediaType: source.mediaType,
          payload: source.payload,
          idempotencyKey: `vo1:${parsedKey.data}`,
          database,
          now,
        });
        // A separately uploaded, caller-forged key is not owned by this command.
        if (artifact.replayed) {
          fail(
            409,
            'SOURCE_IDENTITY_CONFLICT',
            'The declaration source identity is already occupied.'
          );
        }

        const { vehicleId, existing } = await matchOrInsertMainFund(client, input.fundId, request);
        return insertReceipt(client, {
          fundId: input.fundId,
          actorId: input.actorId,
          idempotencyKey: parsedKey.data,
          requestHash,
          request,
          artifact,
          now,
          vehicleId,
          existing,
        });
      },
    });
    return resultFromStored(saved.row);
  });
}
