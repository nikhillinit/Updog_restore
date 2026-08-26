import { describe, expect, it } from 'vitest';

import {
  CAPABILITY_GRANTS,
  EFFECTIVE_ROLE_ALIASES,
  EFFECTIVE_ROLES,
  effectiveRoleOf,
  hasCapability,
  isEffectiveAdmin,
} from '@shared/auth/effective-roles';

describe('effective roles', () => {
  it('keeps locked legacy aliases', () => {
    expect(EFFECTIVE_ROLE_ALIASES).toEqual({ operator: 'partner', viewer: 'analyst' });
    expect(effectiveRoleOf('operator')).toBe('partner');
    expect(effectiveRoleOf('viewer')).toBe('analyst');
    for (const role of EFFECTIVE_ROLES) expect(effectiveRoleOf(role)).toBe(role);
  });

  it('keeps locked capability grants', () => {
    expect(CAPABILITY_GRANTS).toEqual({
      flag_read: ['admin'],
      flag_admin: ['admin'],
      reserve_admin: ['partner'],
    });
    expect(hasCapability('partner', 'reserve_admin')).toBe(true);
    expect(hasCapability('operator', 'reserve_admin')).toBe(true);
    expect(hasCapability('viewer', 'reserve_admin')).toBe(false);
  });

  it('inherits every capability for admin', () => {
    expect(isEffectiveAdmin('admin')).toBe(true);
    expect(hasCapability('admin', 'flag_read')).toBe(true);
    expect(hasCapability('admin', 'flag_admin')).toBe(true);
    expect(hasCapability('admin', 'reserve_admin')).toBe(true);
  });

  it('fails closed for unknown roles and empty role claims', () => {
    expect(effectiveRoleOf('flag_admin')).toBeUndefined();
    expect(effectiveRoleOf('unknown')).toBeUndefined();
    expect(isEffectiveAdmin('flag_admin')).toBe(false);
    expect(hasCapability('flag_admin', 'flag_admin')).toBe(false);
    expect(hasCapability(['unknown', 'viewer'], 'flag_admin')).toBe(false);
    expect(hasCapability(undefined, 'reserve_admin')).toBe(false);
  });
});
