import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  assertAuthRoleMappingExhaustive,
  discoverAuthRoleLiterals,
  discoverAuthRoleEvidence,
  extractAuthRoleEvidenceForRoute,
  suggestedPersonasForAuthRoles,
} from '../../../audit/surface-contract-matrix/matrix-schema.mjs';

describe('surface contract matrix auth persona mapping', () => {
  it('requires every injected enum and guard role to have an explicit mapping', () => {
    const roles = discoverAuthRoleLiterals({
      sourceFiles: {
        'shared/schema/user.ts': `export const USER_ROLES = ['viewer'] as const;`,
        'server/routes/synthetic.ts': `router.get('/', requireRole('future_capability'), handler);`,
      },
    });

    expect(roles).toEqual(['future_capability', 'viewer']);
    expect(() => assertAuthRoleMappingExhaustive(roles)).toThrow(
      'missing entries: future_capability'
    );
  });

  it('maps decided identities and exposes undecided roles as unknown', () => {
    expect(
      suggestedPersonasForAuthRoles(['admin', 'partner', 'operator', 'flag_read', 'lpId'])
    ).toEqual(['admin', 'gp', 'lp', 'unknown']);
  });

  it('discovers current enum, capability, and LP guard roles from tracked sources', () => {
    const discovered = discoverAuthRoleEvidence({ rootDir: process.cwd() });
    expect(discovered.roles).toEqual(
      expect.arrayContaining([
        'admin',
        'analyst',
        'flag_admin',
        'flag_read',
        'lp',
        'operator',
        'partner',
        'reserve_admin',
        'service',
        'viewer',
      ])
    );
    expect(() => assertAuthRoleMappingExhaustive(discovered.roles)).not.toThrow();
  });

  it('recognizes bracket-notation route registrations', () => {
    const evidence = extractAuthRoleEvidenceForRoute(
      `adminRouter['get']('/', requireRole('flag_read'), handler);`,
      'server/routes/flags.ts',
      { method: 'GET', registrationLines: [1] }
    );
    expect(evidence.map((entry) => entry.role)).toContain('flag_read');
  });

  it('keeps route-local evidence isolated for login and public share verification', () => {
    const matrix = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'audit/surface-contract-matrix/matrix.json'), 'utf8')
    ) as {
      rows: Array<{ id: string; auth_roles?: string[] }>;
    };
    const login = matrix.rows.find((row) => row.id === 'api:POST:/api/auth/login');
    expect(login?.auth_roles ?? []).toEqual([]);
    for (const row of matrix.rows.filter((entry) => entry.id.includes('/api/public/shares/'))) {
      expect(row.auth_roles ?? []).not.toContain('admin');
    }
  });
});
