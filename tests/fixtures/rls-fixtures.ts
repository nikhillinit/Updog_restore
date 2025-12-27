/**
 * Test fixtures for Row-Level Security (RLS) middleware
 *
 * Supports: tests/integration/rls-middleware.test.ts
 * Provides typed factories for RLS user context and fund access mappings.
 *
 * Version: 1.0.0
 * Created: 2025-12-26
 *
 * @module tests/fixtures/rls-fixtures
 */

import { randomUUID } from 'crypto';
import { type InferInsertModel } from 'drizzle-orm';
import type { JWTClaims, UserContext } from '../../server/lib/secure-context.js';
import type * as schema from '@shared/schema';

// =====================
// TYPE DEFINITIONS
// =====================

export type UserInsert = InferInsertModel<typeof schema.users>;
export type FundInsert = InferInsertModel<typeof schema.funds>;

export type PermissionLevel = 'view' | 'edit' | 'admin';

/**
 * Fund access mapping aligned with the fund_permissions migration.
 */
export interface FundAccessInsert {
  id?: string;
  fundId: number;
  userId: string;
  organizationId: string;
  permissionLevel: PermissionLevel;
  grantedAt?: Date;
  grantedBy?: string | null;
}

export interface RLSUserFixture {
  user: UserInsert;
  context: UserContext;
  claims: JWTClaims;
  permissionLevel: PermissionLevel;
}

export interface RLSTestContext {
  user: UserInsert;
  context: UserContext;
  claims: JWTClaims;
  permissionLevel: PermissionLevel;
  accessibleFunds: number[];
  restrictedFunds: number[];
  fundAccess: FundAccessInsert[];
}

const DEFAULT_ORG_ID = '00000000-0000-0000-0000-000000000001';
const DEFAULT_ADMIN_ID = '00000000-0000-0000-0000-000000000101';
const DEFAULT_LIMITED_ID = '00000000-0000-0000-0000-000000000102';
const DEFAULT_NO_ACCESS_ID = '00000000-0000-0000-0000-000000000103';

const DEFAULT_FUND_IDS = {
  primary: 1,
  secondary: 2,
  restricted: 99,
};

const TOKEN_TTL_SECONDS = 60 * 60;

// =====================
// FACTORY FUNCTIONS
// =====================

/**
 * Create a user fixture with RLS context and JWT claims.
 */
export function createUserFixture(overrides: Partial<RLSUserFixture> = {}): RLSUserFixture {
  const claimsOverride = overrides.claims ?? {};
  const contextOverride = overrides.context ?? {};
  const now = Math.floor(Date.now() / 1000);

  const userId = contextOverride.userId ?? claimsOverride.sub ?? randomUUID();
  const orgId = contextOverride.orgId ?? claimsOverride.org_id ?? DEFAULT_ORG_ID;
  const email =
    contextOverride.email ?? claimsOverride.email ?? `user-${userId.slice(0, 8)}@example.com`;
  const role = contextOverride.role ?? claimsOverride.role ?? 'user';
  const partnerId = contextOverride.partnerId ?? claimsOverride.partner_id;

  const context: UserContext = {
    userId,
    orgId,
    email,
    role,
    fundId: contextOverride.fundId,
    partnerId,
  };

  const claims: JWTClaims = {
    sub: userId,
    email,
    role,
    org_id: orgId,
    partner_id: partnerId,
    iat: claimsOverride.iat ?? now,
    exp: claimsOverride.exp ?? now + TOKEN_TTL_SECONDS,
  };

  const usernameDefault = email.split('@')[0] ?? `user_${userId.slice(0, 8)}`;
  const user: UserInsert = {
    username: usernameDefault,
    password: 'test-password',
    ...overrides.user,
  };

  return {
    user,
    context,
    claims,
    permissionLevel: overrides.permissionLevel ?? 'view',
  };
}

/**
 * Create a fund access mapping for user-to-fund permissions.
 */
export function createFundAccessFixture(
  overrides: Partial<FundAccessInsert> = {}
): FundAccessInsert {
  return {
    id: randomUUID(),
    fundId: DEFAULT_FUND_IDS.primary,
    userId: randomUUID(),
    organizationId: DEFAULT_ORG_ID,
    permissionLevel: 'view',
    grantedAt: new Date('2024-09-01T00:00:00Z'),
    grantedBy: null,
    ...overrides,
  };
}

/**
 * Create a complete RLS test context with access mappings.
 */
export function createRLSTestContext(overrides: Partial<RLSTestContext> = {}): RLSTestContext {
  const accessibleFunds = overrides.accessibleFunds ?? [
    DEFAULT_FUND_IDS.primary,
    DEFAULT_FUND_IDS.secondary,
  ];
  const restrictedFunds = overrides.restrictedFunds ?? [DEFAULT_FUND_IDS.restricted];

  const contextOverride = overrides.context ?? {};
  const fundId =
    contextOverride.fundId ?? (accessibleFunds.length > 0 ? String(accessibleFunds[0]) : undefined);

  const userFixture = createUserFixture({
    user: overrides.user,
    context: { ...contextOverride, fundId },
    claims: overrides.claims,
    permissionLevel: overrides.permissionLevel,
  });

  const fundAccess =
    overrides.fundAccess ??
    accessibleFunds.map((fundIdValue) =>
      createFundAccessFixture({
        fundId: fundIdValue,
        userId: userFixture.context.userId,
        organizationId: userFixture.context.orgId,
        permissionLevel: userFixture.permissionLevel,
      })
    );

  return {
    user: userFixture.user,
    context: userFixture.context,
    claims: userFixture.claims,
    permissionLevel: userFixture.permissionLevel,
    accessibleFunds,
    restrictedFunds,
    fundAccess,
  };
}

/**
 * Create an array of users with varied access levels.
 */
export function createMultiUserScenario(): RLSTestContext[] {
  return [RLS_SCENARIOS.adminUser, RLS_SCENARIOS.limitedUser, RLS_SCENARIOS.noAccessUser];
}

/**
 * Create a user with access to exactly one fund.
 */
export function createIsolatedFundAccess(): RLSTestContext {
  return createRLSTestContext({
    permissionLevel: 'edit',
    context: {
      userId: randomUUID(),
      orgId: DEFAULT_ORG_ID,
      email: 'isolated.user@example.com',
      role: 'user',
      fundId: String(DEFAULT_FUND_IDS.secondary),
    },
    accessibleFunds: [DEFAULT_FUND_IDS.secondary],
    restrictedFunds: [DEFAULT_FUND_IDS.primary, DEFAULT_FUND_IDS.restricted],
  });
}

// =====================
// PRE-BUILT SCENARIOS
// =====================

export const RLS_SCENARIOS = {
  adminUser: createRLSTestContext({
    permissionLevel: 'admin',
    context: {
      userId: DEFAULT_ADMIN_ID,
      orgId: DEFAULT_ORG_ID,
      email: 'admin@example.com',
      role: 'admin',
      fundId: String(DEFAULT_FUND_IDS.primary),
    },
    accessibleFunds: [DEFAULT_FUND_IDS.primary, DEFAULT_FUND_IDS.secondary],
    restrictedFunds: [],
  }),
  limitedUser: createRLSTestContext({
    permissionLevel: 'view',
    context: {
      userId: DEFAULT_LIMITED_ID,
      orgId: DEFAULT_ORG_ID,
      email: 'limited.user@example.com',
      role: 'user',
      fundId: String(DEFAULT_FUND_IDS.primary),
    },
    accessibleFunds: [DEFAULT_FUND_IDS.primary],
    restrictedFunds: [DEFAULT_FUND_IDS.secondary, DEFAULT_FUND_IDS.restricted],
  }),
  noAccessUser: createRLSTestContext({
    permissionLevel: 'view',
    context: {
      userId: DEFAULT_NO_ACCESS_ID,
      orgId: DEFAULT_ORG_ID,
      email: 'noaccess.user@example.com',
      role: 'user',
      fundId: String(DEFAULT_FUND_IDS.primary),
    },
    accessibleFunds: [],
    restrictedFunds: [
      DEFAULT_FUND_IDS.primary,
      DEFAULT_FUND_IDS.secondary,
      DEFAULT_FUND_IDS.restricted,
    ],
  }),
};
