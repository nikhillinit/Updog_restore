import { sql } from 'drizzle-orm';

import type { db } from '../../db';
import { IdempotentCommandError } from '../../lib/idempotent-command';

type OwnershipDatabase = Pick<typeof db, 'execute'>;

function rows(result: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(result)) return result as Array<Record<string, unknown>>;
  return (result as { rows?: Array<Record<string, unknown>> } | undefined)?.rows ?? [];
}

/** Keeps existing artifact readers usable before the additive migration lands. */
export async function hasVehicleOnboardingCommands(database: OwnershipDatabase): Promise<boolean> {
  const result = await database.execute(
    sql`SELECT
      to_regclass('public.vehicle_onboarding_commands') AS relation,
      to_regprocedure('public.vehicle_onboarding_artifact_digest(integer,integer)') AS ownership_function`
  );
  const row = rows(result)[0];
  const hasTable = Boolean(row?.['relation']);
  const hasFunction = Boolean(row?.['ownership_function']);
  if (hasTable && !hasFunction) {
    throw new IdempotentCommandError(
      503,
      'VEHICLE_ONBOARDING_SCHEMA_INCOMPLETE',
      'Vehicle onboarding schema is incomplete.'
    );
  }
  return hasTable && hasFunction;
}

export async function isVehicleOnboardingArtifact(
  database: OwnershipDatabase,
  fundId: number,
  artifactId: number,
  available?: boolean
): Promise<boolean> {
  if (!(available ?? (await hasVehicleOnboardingCommands(database)))) return false;
  const result = await database.execute(sql`
    SELECT public.vehicle_onboarding_artifact_digest(${fundId}, ${artifactId}) IS NOT NULL AS owned
  `);
  const owned = rows(result)[0]?.['owned'];
  return owned === true || owned === 't' || owned === 'true';
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
