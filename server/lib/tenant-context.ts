/**
 * Tenant Context Management for Row-Level Security (RLS)
 *
 * Provides utilities for managing tenant context in database sessions.
 * Essential for multi-tenant isolation testing and development.
 *
 * @example
 * ```typescript
 * // Switch to a specific tenant
 * await withTenantContext(db, 'tech-ventures', async () => {
 *   const funds = await db.select().from(fundsTable);
 *   // Only sees tech-ventures funds due to RLS
 * });
 *
 * // Manual control
 * await switchTenant(db, 'bio-capital');
 * const companies = await db.select().from(companiesTable);
 * await resetTenant(db);
 * ```
 */

import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

export interface TenantContext {
  orgId: number | null;
  orgSlug: string | null;
  orgName: string | null;
}

/**
 * Switch the current database session to a specific organization context.
 * All subsequent queries will be filtered by RLS policies for this tenant.
 *
 * @param db - Drizzle database instance
 * @param orgSlug - Organization slug (e.g., 'tech-ventures')
 * @throws Error if organization not found
 *
 * @example
 * ```typescript
 * await switchTenant(db, 'tech-ventures');
 * // Now all queries are scoped to tech-ventures
 * ```
 */
export async function switchTenant(db: NodePgDatabase, orgSlug: string): Promise<void> {
  const result = await db.execute<{ id: number }>(
    sql`SELECT id FROM organizations WHERE slug = ${orgSlug} AND deleted_at IS NULL`
  );

  if (result.rows.length === 0) {
    throw new Error(`Organization not found: ${orgSlug}`);
  }

  const orgId = result.rows[0]!.id;
  await db.execute(sql`SELECT switch_tenant(${orgId})`);
}

/**
 * Switch to a specific organization by ID.
 *
 * @param db - Drizzle database instance
 * @param orgId - Organization ID
 *
 * @example
 * ```typescript
 * await switchTenantById(db, 42);
 * ```
 */
export async function switchTenantById(db: NodePgDatabase, orgId: number): Promise<void> {
  await db.execute(sql`SELECT switch_tenant(${orgId})`);
}

/**
 * Reset the tenant context to see all records (admin mode).
 * Use with caution - bypasses RLS isolation.
 *
 * @param db - Drizzle database instance
 *
 * @example
 * ```typescript
 * await resetTenant(db);
 * // Now sees all records across all tenants
 * ```
 */
export async function resetTenant(db: NodePgDatabase): Promise<void> {
  await db.execute(sql`SELECT reset_tenant()`);
}

/**
 * Get the current tenant context information.
 *
 * @param db - Drizzle database instance
 * @returns Current tenant context or null if no tenant set
 *
 * @example
 * ```typescript
 * const context = await getCurrentTenant(db);
 * console.log(`Current tenant: ${context?.orgName} (${context?.orgSlug})`);
 * ```
 */
export async function getCurrentTenant(db: NodePgDatabase): Promise<TenantContext | null> {
  const result = await db.execute<Record<string, unknown>>(sql`
    SELECT
      current_org_id() as "orgId",
      (SELECT slug FROM organizations WHERE id = current_org_id()) as "orgSlug",
      (SELECT name FROM organizations WHERE id = current_org_id()) as "orgName"
  `);

  const row = result.rows[0];
  if (!row || !row['orgId']) {
    return null;
  }

  return row as unknown as TenantContext;
}

/**
 * Execute a function within a specific tenant context.
 * Automatically resets the tenant context after execution (even on error).
 *
 * @param db - Drizzle database instance
 * @param orgSlug - Organization slug to switch to
 * @param fn - Async function to execute in tenant context
 * @returns Result of the function
 *
 * @example
 * ```typescript
 * const funds = await withTenantContext(db, 'tech-ventures', async () => {
 *   return await db.select().from(fundsTable);
 * });
 * // Tenant context automatically reset
 * ```
 */
export async function withTenantContext<T>(
  db: NodePgDatabase,
  orgSlug: string,
  fn: () => Promise<T>
): Promise<T> {
  try {
    await switchTenant(db, orgSlug);
    return await fn();
  } finally {
    await resetTenant(db);
  }
}

/**
 * Execute a function within a specific tenant context (by ID).
 *
 * @param db - Drizzle database instance
 * @param orgId - Organization ID
 * @param fn - Async function to execute in tenant context
 * @returns Result of the function
 */
export async function withTenantContextById<T>(
  db: NodePgDatabase,
  orgId: number,
  fn: () => Promise<T>
): Promise<T> {
  try {
    await switchTenantById(db, orgId);
    return await fn();
  } finally {
    await resetTenant(db);
  }
}

/**
 * Get a list of all available organizations.
 * Useful for tenant switcher UIs and testing.
 *
 * @param db - Drizzle database instance
 * @returns Array of organizations with id, slug, and name
 *
 * @example
 * ```typescript
 * const orgs = await listOrganizations(db);
 * for (const org of orgs) {
 *   console.log(`${org.name} (${org.slug})`);
 * }
 * ```
 */
export async function listOrganizations(
  db: NodePgDatabase
): Promise<Array<{ id: number; slug: string; name: string }>> {
  const result = await db.execute<{ id: number; slug: string; name: string }>(
    sql`SELECT id, slug, name FROM organizations WHERE deleted_at IS NULL ORDER BY name`
  );

  return result.rows;
}

/**
 * Verify that RLS is enabled and working correctly.
 * Useful for integration tests and health checks.
 *
 * @param db - Drizzle database instance
 * @param tableName - Table to check (e.g., 'funds')
 * @returns Object with RLS status information
 *
 * @example
 * ```typescript
 * const status = await verifyRLS(db, 'funds');
 * if (!status.enabled) {
 *   throw new Error('RLS not enabled on funds table!');
 * }
 * ```
 */
export async function verifyRLS(
  db: NodePgDatabase,
  tableName: string
): Promise<{
  enabled: boolean;
  policyCount: number;
  policies: Array<{ name: string; command: string }>;
}> {
  // Check if RLS is enabled
  const rlsEnabled = await db.execute<{ relrowsecurity: boolean }>(
    sql`SELECT relrowsecurity FROM pg_class WHERE relname = ${tableName}`
  );

  // Get policy details
  const policies = await db.execute<{ policyname: string; cmd: string }>(
    sql`SELECT policyname, cmd FROM pg_policies WHERE tablename = ${tableName}`
  );

  return {
    enabled: rlsEnabled.rows[0]?.relrowsecurity ?? false,
    policyCount: policies.rows.length,
    policies: policies.rows.map((p) => ({
      name: p.policyname,
      command: p.cmd,
    })),
  };
}

/**
 * Create a visual tenant indicator for terminal output.
 * Helps developers see which tenant context they're in.
 *
 * @param db - Drizzle database instance
 * @returns Formatted string for terminal display
 *
 * @example
 * ```typescript
 * console.log(await getTenantIndicator(db));
 * // Output: "[TENANT: tech-ventures (Tech Ventures LLC)]"
 * ```
 */
export async function getTenantIndicator(db: NodePgDatabase): Promise<string> {
  const context = await getCurrentTenant(db);

  if (!context || !context.orgId) {
    return '[TENANT: NONE (Admin Mode)]';
  }

  return `[TENANT: ${context.orgSlug} (${context.orgName})]`;
}

/**
 * Middleware helper to set tenant context from Express request.
 * Extract org_slug from headers, query params, or JWT claims.
 *
 * @param db - Drizzle database instance
 * @param orgSlugOrId - Organization slug or ID from request
 *
 * @example
 * ```typescript
 * // In Express middleware
 * app.use(async (req, res, next) => {
 *   const orgSlug = req.headers['x-org-slug'] || req.query.org;
 *   if (orgSlug) {
 *     await setTenantFromRequest(db, orgSlug as string);
 *   }
 *   next();
 * });
 * ```
 */
export async function setTenantFromRequest(
  db: NodePgDatabase,
  orgSlugOrId: string | number
): Promise<void> {
  if (typeof orgSlugOrId === 'number') {
    await switchTenantById(db, orgSlugOrId);
  } else {
    await switchTenant(db, orgSlugOrId);
  }
}
