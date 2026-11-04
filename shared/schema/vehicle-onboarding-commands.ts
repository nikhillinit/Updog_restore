import { sql } from 'drizzle-orm';
import {
  check,
  decimal,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import type { VehicleOnboardingReceipt } from '../contracts/lp-reporting/vehicle-onboarding.contract';
import { sourceArtifacts } from './financial-observations';
import { funds } from './fund';
import { users } from './user';
import { vehicles } from './vehicles';

export const vehicleOnboardingCommands = pgTable(
  'vehicle_onboarding_commands',
  {
    id: serial('id').primaryKey(),
    fundId: integer('fund_id')
      .notNull()
      .references(() => funds.id, { onDelete: 'cascade' }),
    actorId: integer('actor_id')
      .notNull()
      .references(() => users.id),
    vehicleId: integer('vehicle_id').notNull(),
    operation: text('operation').notNull(),
    contractVersion: text('contract_version').notNull(),
    idempotencyKey: uuid('idempotency_key').notNull(),
    requestHash: varchar('request_hash', { length: 64 }).notNull(),
    vehicleSlug: varchar('vehicle_slug', { length: 64 }).notNull(),
    name: varchar('name', { length: 128 }).notNull(),
    vehicleType: varchar('vehicle_type', { length: 16 }).notNull(),
    currency: varchar('currency', { length: 3 }).notNull(),
    status: varchar('status', { length: 16 }).notNull(),
    committedCapital: decimal('committed_capital', { precision: 20, scale: 6 }).notNull(),
    sourceArtifactId: integer('source_artifact_id').notNull(),
    sourceArtifactSha256: varchar('source_artifact_sha256', { length: 64 }).notNull(),
    sourceLocator: varchar('source_locator', { length: 1024 }).notNull(),
    attestationVersion: text('attestation_version').notNull(),
    outcome: text('outcome').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    responseStatus: integer('response_status').notNull(),
    responseBody: jsonb('response_body').notNull().$type<VehicleOnboardingReceipt>(),
  },
  (table) => ({
    identityUnique: unique('vehicle_onboarding_commands_identity_unique').on(
      table.fundId,
      table.operation,
      table.idempotencyKey
    ),
    artifactUnique: unique('vehicle_onboarding_commands_artifact_unique').on(
      table.sourceArtifactId
    ),
    fundIdx: index('vehicle_onboarding_commands_fund_idx').on(table.fundId),
    vehicleFk: foreignKey({
      columns: [table.vehicleId, table.fundId],
      foreignColumns: [vehicles.id, vehicles.fundId],
      name: 'vehicle_onboarding_commands_vehicle_fund_fk',
    }),
    sourceFk: foreignKey({
      columns: [table.sourceArtifactId, table.fundId],
      foreignColumns: [sourceArtifacts.id, sourceArtifacts.fundId],
      name: 'vehicle_onboarding_commands_source_fund_fk',
    }),
    contractCheck: check(
      'vehicle_onboarding_commands_contract_check',
      sql`
      ${table.operation} = 'ensure_main_fund'
      AND ${table.contractVersion} = 'vehicle-onboarding/1.0.0'
      AND ${table.attestationVersion} = 'source-supports-commitment/1.0.0'
    `
    ),
    identityCheck: check(
      'vehicle_onboarding_commands_identity_check',
      sql`
      ${table.vehicleType} = 'main_fund' AND ${table.currency} = 'USD' AND ${table.status} = 'active'
      AND ${table.vehicleSlug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
      AND length(btrim(${table.name})) > 0 AND length(btrim(${table.sourceLocator})) > 0
    `
    ),
    commitmentCheck: check(
      'vehicle_onboarding_commands_commitment_check',
      sql`
      ${table.committedCapital} >= 0 AND ${table.committedCapital} = round(${table.committedCapital}, 2)
    `
    ),
    hashCheck: check(
      'vehicle_onboarding_commands_hash_check',
      sql`
      ${table.requestHash} ~ '^[a-f0-9]{64}$' AND ${table.sourceArtifactSha256} ~ '^[a-f0-9]{64}$'
    `
    ),
    responseCheck: check(
      'vehicle_onboarding_commands_response_check',
      sql`
      (${table.outcome} = 'created' AND ${table.responseStatus} = 201
        OR ${table.outcome} = 'existing' AND ${table.responseStatus} = 200)
      AND jsonb_typeof(${table.responseBody}) = 'object'
    `
    ),
  })
);

export type VehicleOnboardingCommand = typeof vehicleOnboardingCommands.$inferSelect;
