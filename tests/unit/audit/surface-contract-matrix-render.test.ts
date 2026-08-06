import { describe, expect, it } from 'vitest';

import {
  CONTRACT_FINGERPRINT_FIELDS,
  SurfaceMatrixDocumentSchema,
  contractFingerprint,
} from '../../../audit/surface-contract-matrix/matrix-schema.mjs';
import { renderMatrix } from '../../../audit/surface-contract-matrix/scripts/render-matrix.mjs';

describe('surface contract matrix renderer approval coverage', () => {
  it('renders closure fields, coverage obligations, persona decisions, counters, and authoring gaps', () => {
    const row = {
      id: 'api:GET:/api/fixture',
      seam: 'fixture',
      interface: 'http-api',
      personas: ['admin'],
      reachability: 'railway',
      proven_reachability: 'none',
      exposures: [{
        deployment: 'railway-api',
        runtime: 'create_server',
        mount_evidence: 'fixture.ts:1',
        ingresses: [{ external_path: '/api/fixture', express_path: '/api/fixture', rewrite_evidence: 'fixture' }],
        conditions: [],
        definitions: [{ site: 'fixture.ts:1', role: 'handler', effective_mount_order: 1 }],
        auth_evidence: [{ kind: 'policy-boundary', boundary: 'global_authenticated', file: 'server/lib/auth/jwt.ts', line: 1 }],
        boot_status: 'failed',
        boot_evidence: { command_or_artifact: 'fixture', probe: 'fixture', result: 'failed', observed_at: 'fixture' },
      }],
      persistence: 'reads-only',
      destructive: 'none',
      environment: 'prod-safe',
      owner: 'gp-team',
      evidence: ['fixture.ts:1'],
      source_mapping: { source_file: 'fixture.ts' },
      queue_roles: { producers: [], consumers: [] },
      auth_roles: ['admin'],
      auth_evidence: [{ kind: 'policy-boundary', boundary: 'global_authenticated', file: 'server/lib/auth/jwt.ts', line: 1 }],
      effective_auth: { state: 'authenticated', roles: ['admin'] },
      dormant_disposition: 'not-surface',
      anonymous_reachability: 'excluded-unreachable',
      behavior_flags: [],
      test_evidence: { derived: [], manual: [] },
      classification: 'classified',
      decision: 'in-contract',
      decision_suggestion: 'in-contract',
      decision_status: 'proposed',
      approved_source_hashes: [],
      machine_suggestions: {},
      closure_owner: 'fixture-owner',
      closure_gate: 'fixture-gate',
      closure_acceptance: 'fixture-acceptance',
    };
    const matrix = SurfaceMatrixDocumentSchema.parse({
      schema_version: '1.1.0',
      phase: 'authoring',
      provenance: { git_head: 'fixture', snapshot_id: 'fixture' },
      rows: [{ ...row, contract_fingerprint: contractFingerprint(row) }],
      coverage_review: {},
    });
    const rendered = renderMatrix({
      matrix,
      requirements: { families: [] },
      listeners: [],
      candidates: [],
      exclusions: [],
      orphans: [],
    });
    expect(contractFingerprint({ ...row, effective_auth: { state: 'public' } }))
      .not.toBe(contractFingerprint(row));

    expect(rendered).toContain('Closure owner');
    expect(rendered).toContain('Closure gate');
    expect(rendered).toContain('Closure acceptance');
    expect(rendered).toContain('Dormant disposition');
    expect(rendered).toContain('Anonymous reachability');
    expect(rendered).toContain('Effective auth');
    expect(rendered).toContain('Row auth evidence');
    expect(rendered).toContain('Exposure auth evidence');
    for (const field of CONTRACT_FINGERPRINT_FIELDS) expect(rendered).toContain(`| ${field} |`);
    expect(rendered).toContain('global_authenticated');
    expect(rendered).toContain('authenticated');
    expect(rendered).toContain('Exposure obligations: **1**');
    expect(rendered).toContain('api:GET:/api/fixture | railway-api | create_server | gap');
    expect(rendered).toContain('| admin | admin | yes |');
    expect(rendered).toContain('## Classification completeness');
    expect(rendered).toContain('| Rows | 1 |');
    expect(rendered).toContain('## Coverage gaps');
    expect(rendered).toContain('This standing section is evaluated during ordinary authoring as well as tentative closure.');
  });
});
