import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  assertAuthRoleMappingExhaustive,
  discoverAuthRoleLiterals,
  discoverAuthRoleEvidence,
  extractAuthRoleEvidenceFromSource,
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
    // G1 locked persona table decides operator -> partner alias and flag_*
    // capabilities; reserve_admin inherits partner's mapping through admin.
    expect(
      suggestedPersonasForAuthRoles(['admin', 'partner', 'operator', 'flag_read', 'lpId'])
    ).toEqual(['admin', 'gp', 'lp']);
  });

  it('discovers current enum, capability, and LP guard roles from tracked sources', () => {
    const discovered = discoverAuthRoleEvidence({ rootDir: process.cwd() });
    expect(discovered.roles).toEqual(
      expect.arrayContaining(['admin', 'analyst', 'lp', 'operator', 'partner', 'service', 'viewer'])
    );
    expect(discovered.roles).not.toEqual(
      expect.arrayContaining(['flag_admin', 'flag_read', 'reserve_admin'])
    );
    expect(() => assertAuthRoleMappingExhaustive(discovered.roles)).not.toThrow();
  });

  it('resolves role-array constants imported from shared auth modules', () => {
    const evidence = extractAuthRoleEvidenceForRoute(
      [
        `import { PARTNER_WRITE_ROLES } from '@shared/auth/effective-roles';`,
        `router.post('/', requireWriteRole(PARTNER_WRITE_ROLES), handler);`,
      ].join('\n'),
      'server/routes/synthetic.ts',
      {
        method: 'POST',
        registrationLines: [2],
        sourceFiles: {
          'shared/auth/effective-roles.ts': `export const PARTNER_WRITE_ROLES = ['partner', 'admin'] as const;`,
        },
      }
    );
    const roles = evidence.map((entry) => entry.role);
    expect(roles).toEqual(expect.arrayContaining(['partner', 'admin']));
    expect(roles).not.toContain('unresolved');
  });

  it('resolves lazy-init role constants in bundled sources', () => {
    const evidence = extractAuthRoleEvidenceForRoute(
      [
        `var TEAM_WRITE_ROLES;`,
        `TEAM_WRITE_ROLES = ['partner', 'admin', 'analyst'];`,
        `router.post('/', requireWriteRole(TEAM_WRITE_ROLES), handler);`,
      ].join('\n'),
      'api/_app.generated.mjs',
      { method: 'POST', registrationLines: [3] }
    );
    const roles = evidence.map((entry) => entry.role);
    expect(roles).toEqual(expect.arrayContaining(['partner', 'admin', 'analyst']));
    expect(roles).not.toContain('unresolved');
  });

  it('does not resolve a bundled role assignment that occurs after the guard', () => {
    const evidence = extractAuthRoleEvidenceForRoute(
      [
        `var TEAM_WRITE_ROLES;`,
        `router.post('/', requireWriteRole(TEAM_WRITE_ROLES), handler);`,
        `TEAM_WRITE_ROLES = ['admin'];`,
      ].join('\n'),
      'api/_app.generated.mjs',
      { method: 'POST', registrationLines: [2] }
    );

    expect(evidence.map((entry) => entry.role)).toContain('unresolved');
    expect(evidence.map((entry) => entry.role)).not.toContain('admin');
  });

  it('ignores dead, commented, and string-contained bundled assignments', () => {
    for (const misleadingAssignment of [
      `if (false) TEAM_WRITE_ROLES = ['admin'];`,
      `false && (TEAM_WRITE_ROLES = ['admin']);`,
      `false ? (TEAM_WRITE_ROLES = ['admin']) : undefined;`,
      `// TEAM_WRITE_ROLES = ['admin'];`,
      `const note = "TEAM_WRITE_ROLES = ['admin']";`,
    ]) {
      const evidence = extractAuthRoleEvidenceForRoute(
        [
          `var TEAM_WRITE_ROLES;`,
          misleadingAssignment,
          `router.post('/', requireWriteRole(TEAM_WRITE_ROLES), handler);`,
        ].join('\n'),
        'api/_app.generated.mjs',
        { method: 'POST', registrationLines: [3] }
      );

      expect(evidence.map((entry) => entry.role)).toContain('unresolved');
      expect(evidence.map((entry) => entry.role)).not.toContain('admin');
    }
  });

  it('ignores guard-like text in comments and string literals', () => {
    for (const misleadingGuard of [
      `/* requireCapability('flag_read') */`,
      `const note = "requireRole('admin')";`,
    ]) {
      const evidence = extractAuthRoleEvidenceFromSource(
        misleadingGuard,
        'server/routes/synthetic.ts'
      );

      expect(evidence.map((entry) => entry.role)).not.toContain('admin');
    }
  });

  it('extracts role checks from nested request context expressions', () => {
    const evidence = extractAuthRoleEvidenceFromSource(
      `if (req.context?.role === 'admin') return true;`,
      'server/routes/synthetic.ts'
    );

    expect(evidence.map((entry) => entry.role)).toContain('admin');
  });

  it('resolves capability guards through tracked capability grants', () => {
    const evidence = extractAuthRoleEvidenceForRoute(
      `router.post('/', requireCapability('reserve_admin'), handler);`,
      'server/routes/synthetic.ts',
      {
        method: 'POST',
        registrationLines: [1],
        sourceFiles: {
          'shared/auth/effective-roles.ts': [
            `export const CAPABILITY_GRANTS = {`,
            `  flag_read: ['admin'],`,
            `  flag_admin: ['admin'],`,
            `  reserve_admin: ['partner'],`,
            `} as const;`,
          ].join('\n'),
        },
      }
    );

    expect(evidence.map((entry) => entry.role)).toEqual(
      expect.arrayContaining(['partner', 'admin'])
    );
    expect(evidence.map((entry) => entry.role)).not.toContain('reserve_admin');
    expect(evidence.map((entry) => entry.role)).not.toContain('unresolved');
  });

  it('treats supplied auth sources as authoritative when an imported module is omitted', () => {
    const evidence = extractAuthRoleEvidenceForRoute(
      [
        `import { PARTNER_WRITE_ROLES } from '@shared/auth/effective-roles';`,
        `router.post('/', requireWriteRole(PARTNER_WRITE_ROLES), handler);`,
      ].join('\n'),
      'server/routes/synthetic.ts',
      { method: 'POST', registrationLines: [2], sourceFiles: {} }
    );

    expect(evidence.map((entry) => entry.role)).toContain('unresolved');
    expect(evidence.map((entry) => entry.role)).not.toContain('partner');
    expect(evidence.map((entry) => entry.role)).not.toContain('admin');
  });

  it('keeps unknown imported guard constants unresolved', () => {
    const evidence = extractAuthRoleEvidenceForRoute(
      [
        `import { MYSTERY_ROLES } from './not-tracked';`,
        `router.post('/', requireWriteRole(MYSTERY_ROLES), handler);`,
      ].join('\n'),
      'server/routes/synthetic.ts',
      { method: 'POST', registrationLines: [2], sourceFiles: {} }
    );
    expect(evidence.map((entry) => entry.role)).toContain('unresolved');
  });

  it('recognizes bracket-notation route registrations', () => {
    const evidence = extractAuthRoleEvidenceForRoute(
      `adminRouter['get']('/', requireRole('partner'), handler);`,
      'server/routes/flags.ts',
      { method: 'GET', registrationLines: [1] }
    );
    expect(evidence.map((entry) => entry.role)).toContain('partner');
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
