import { sql, type SQL } from 'drizzle-orm';

import type { db } from '../../db';
import { IdempotentCommandError } from '../../lib/idempotent-command';

type OwnershipDatabase = Pick<typeof db, 'execute'>;

/**
 * How declaration ownership can be read on this database:
 * - `function`: migration 0062 applied; the SECURITY DEFINER digest function answers for every role.
 * - `table`: the table exists without the function (schema pushed from Drizzle definitions, or an
 *   earlier 0062 draft) and row security does not filter it for this role, so a direct read is exact.
 * - `absent`: neither exists yet (code deployed before the migration).
 */
export type VehicleOnboardingOwnership = 'function' | 'table' | 'absent';

function rows(result: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(result)) return result as Array<Record<string, unknown>>;
  return (result as { rows?: Array<Record<string, unknown>> } | undefined)?.rows ?? [];
}

/** Drivers in use return booleans; also accept the text form. */
function flag(value: unknown): boolean | null {
  if (value === true || value === 't') return true;
  if (value === false || value === 'f') return false;
  return null;
}

export async function resolveVehicleOnboardingOwnership(
  database: OwnershipDatabase
): Promise<VehicleOnboardingOwnership> {
  const result = await database.execute(sql`
    SELECT
      to_regprocedure('public.vehicle_onboarding_artifact_digest(integer,integer)') IS NOT NULL
        AS has_function,
      to_regclass('public.vehicle_onboarding_commands') IS NOT NULL AS has_table,
      CASE WHEN to_regclass('public.vehicle_onboarding_commands') IS NULL THEN false
        ELSE row_security_active('public.vehicle_onboarding_commands') END AS filtered
  `);
  const row = rows(result)[0];
  if (flag(row?.['has_function'])) return 'function';
  if (flag(row?.['has_table']) !== true) return 'absent';
  // A policy-filtered read cannot prove non-ownership; refuse rather than switch the guard off.
  if (flag(row?.['filtered']) !== false) {
    throw new IdempotentCommandError(
      503,
      'VEHICLE_ONBOARDING_SCHEMA_INCOMPLETE',
      'Vehicle onboarding schema is incomplete.'
    );
  }
  return 'table';
}

/** The declared source digest for an onboarding-owned artifact, or NULL. */
export function vehicleOnboardingDigestSql(
  ownership: Exclude<VehicleOnboardingOwnership, 'absent'>,
  fundId: SQL,
  artifactId: SQL
): SQL {
  return ownership === 'function'
    ? sql`public.vehicle_onboarding_artifact_digest(${fundId}, ${artifactId})`
    : sql`(SELECT command.source_artifact_sha256::text
        FROM public.vehicle_onboarding_commands AS command
        WHERE command.fund_id = ${fundId} AND command.source_artifact_id = ${artifactId})`;
}

export async function isVehicleOnboardingArtifact(
  database: OwnershipDatabase,
  fundId: number,
  artifactId: number,
  ownership?: VehicleOnboardingOwnership
): Promise<boolean> {
  const resolved = ownership ?? (await resolveVehicleOnboardingOwnership(database));
  if (resolved === 'absent') return false;
  const digest = vehicleOnboardingDigestSql(
    resolved,
    sql`${fundId}::integer`,
    sql`${artifactId}::integer`
  );
  const result = await database.execute(sql`SELECT ${digest} IS NOT NULL AS owned`);
  return flag(rows(result)[0]?.['owned']) === true;
}

export async function assertArtifactNotVehicleOnboardingOwned(
  database: OwnershipDatabase,
  fundId: number,
  artifactId: number
): Promise<void> {
  if (await isVehicleOnboardingArtifact(database, fundId, artifactId)) {
    throw new IdempotentCommandError(
      409,
      'ARTIFACT_RESERVED_FOR_VEHICLE_ONBOARDING',
      'Vehicle declaration evidence cannot be reused as another financial source.'
    );
  }
}
