import { describe, expect, it } from 'vitest';
import { getTableColumns } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/pg-core';

import { revokedTokens, insertUserSchema, USER_ROLES, userFundGrants, users } from '@shared/schema';

describe('identity store schema', () => {
  it('defines the complete user role set and identity columns', () => {
    expect(USER_ROLES).toEqual(['admin', 'partner', 'analyst', 'operator', 'viewer', 'service']);

    expect(Object.keys(getTableColumns(users))).toEqual(
      expect.arrayContaining(['role', 'isActive', 'passwordUpdatedAt', 'createdAt', 'updatedAt'])
    );
    expect(users.role.default).toBe('viewer');
    expect(users.isActive.default).toBe(true);
    expect(insertUserSchema.safeParse({ username: 'valid', password: 'hash' }).success).toBe(true);
    expect(
      insertUserSchema.safeParse({ username: 'invalid', password: 'hash', role: 'not-a-role' })
        .success
    ).toBe(false);
  });

  it('defines composite fund grants with cascading user and fund ownership', () => {
    const config = getTableConfig(userFundGrants);

    expect(config.primaryKeys).toHaveLength(1);
    expect(config.primaryKeys[0]?.columns.map((column) => column.name)).toEqual([
      'user_id',
      'fund_id',
    ]);
    expect(config.foreignKeys.map((foreignKey) => foreignKey.getName())).toEqual(
      expect.arrayContaining([
        'user_fund_grants_user_id_users_id_fk',
        'user_fund_grants_fund_id_funds_id_fk',
      ])
    );
    expect(config.foreignKeys.every((foreignKey) => foreignKey.onDelete === 'cascade')).toBe(true);
  });

  it('defines a jti denylist with expiry pruning and cascading user ownership', () => {
    const columns = getTableColumns(revokedTokens);
    const config = getTableConfig(revokedTokens);

    expect(columns.jti.primary).toBe(true);
    expect(columns.expiresAt.notNull).toBe(true);
    expect(config.indexes.map((indexDefinition) => indexDefinition.config.name)).toContain(
      'revoked_tokens_expires_at_idx'
    );
    expect(config.foreignKeys.map((foreignKey) => foreignKey.getName())).toContain(
      'revoked_tokens_user_id_users_id_fk'
    );
    expect(config.foreignKeys[0]?.onDelete).toBe('cascade');
  });
});
