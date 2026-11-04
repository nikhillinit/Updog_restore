import { sql } from 'drizzle-orm';

import type { db } from '../../db';
import { getRequestDatabaseScope } from '../../db/request-context';
import { IdempotentCommandError } from '../../lib/idempotent-command';

type OwnershipDatabase = Pick<typeof db, 'execute'>;

function rows(result: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(result)) return result as Array<Record<string, unknown>>;
  return (result as { rows?: Array<Record<string, unknown>> } | undefined)?.rows ?? [];
}

/** Keeps existing artifact readers usable before the additive migration lands. */
export async function hasVehicleOnboardingCommands(database: OwnershipDatabase): Promise<boolean> {
  const result = await database.execute(
    sql`SELECT to_regclass('public.vehicle_onboarding_commands') AS relation`
  );
  return Boolean(rows(result)[0]?.['relation']);
}

/** Bind this ownership read only after verifying the authenticated request's fund access. */
async function bindOwnershipReadScope(database: OwnershipDatabase, fundId: number): Promise<void> {
  const scope = getRequestDatabaseScope();
  if (!scope) {
    const result = await database.execute(sql`
      SELECT row_security_active('public.vehicle_onboarding_commands') AS active
    `);
    // Privileged maintenance may inspect every receipt. A policy-filtered read
    // without authenticated request context cannot establish non-ownership.
    if (rows(result)[0]?.['active'] !== false) {
      throw new IdempotentCommandError(
        403,
        'ARTIFACT_OWNERSHIP_SCOPE_REQUIRED',
        'Authenticated fund scope is required to inspect artifact ownership.'
      );
    }
    return;
  }

  const actorId = Number(scope.context.userId);
  const refuse = () => {
    throw new IdempotentCommandError(404, 'RESOURCE_NOT_FOUND', 'Resource not found.');
  };
  if (
    !Number.isSafeInteger(actorId) ||
    actorId < 1 ||
    (scope.context.fundId !== undefined && scope.context.fundId !== String(fundId))
  )
    refuse();

  const actor = rows(
    await database.execute(sql`
    SELECT u.role, current_setting('app.current_fund', true) AS current_fund
    FROM users AS u
    WHERE u.id = ${actorId} AND u.id::text = current_setting('app.current_user', true)
      AND u.is_active AND NOT u.is_release_canary_principal
    FOR SHARE OF u
  `)
  )[0];
  if (!actor) refuse();
  const currentFund = actor?.['current_fund'];
  if (currentFund && currentFund !== String(fundId)) refuse();

  // Generic artifact routes already permit administrators across funds. Keep
  // that read policy here; onboarding itself still requires an explicit grant.
  if (scope.context.role !== 'admin' || actor?.['role'] !== 'admin') {
    const grants = rows(
      await database.execute(sql`
      SELECT user_id FROM user_fund_grants
      WHERE user_id = ${actorId} AND fund_id = ${fundId}
      FOR SHARE
    `)
    );
    if (grants.length !== 1) refuse();
  }
  await database.execute(sql`SELECT set_config('app.current_fund', ${String(fundId)}, true)`);
}

export async function isVehicleOnboardingArtifact(
  database: OwnershipDatabase,
  fundId: number,
  artifactId: number
): Promise<boolean> {
  if (!(await hasVehicleOnboardingCommands(database))) return false;
  await bindOwnershipReadScope(database, fundId);
  const result = await database.execute(sql`
    SELECT id FROM vehicle_onboarding_commands
    WHERE fund_id = ${fundId} AND source_artifact_id = ${artifactId}
    LIMIT 1
  `);
  return rows(result).length > 0;
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
