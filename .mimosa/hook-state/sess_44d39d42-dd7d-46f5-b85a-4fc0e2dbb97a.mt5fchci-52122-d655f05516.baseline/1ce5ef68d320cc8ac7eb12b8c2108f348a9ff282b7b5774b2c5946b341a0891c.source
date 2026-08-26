// REFLECTION_ID: REFL-041
// This test is linked to: docs/skills/REFL-041-production-activation-requires-schema-provisioning-proof.md
// Do not rename without updating the reflection's test_file field.

import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const INTERNAL_ANALYSIS_TABLES = [
  'internal_analysis_drafts',
  'internal_analysis_references',
  'internal_analysis_revision_events',
  'internal_narrative_drafts',
  'internal_narrative_claims',
  'internal_analysis_notes',
] as const;

describe('REFL-041: Production Activation Requires Schema Provisioning Proof', () => {
  it('keeps migration 0044 fully represented by one production reconciliation manifest', async () => {
    const manifest = JSON.parse(
      await readFile('scripts/prod-schema-manifests/18-internal-analysis.json', 'utf8')
    ) as {
      name: string;
      missingTablePolicy: string;
      sqlFiles: string[];
      allowedCreateTables: string[];
      expectedTables: Array<{ name: string }>;
    };
    const journal = JSON.parse(await readFile('migrations/meta/_journal.json', 'utf8')) as {
      entries: Array<{ tag: string }>;
    };

    expect(manifest.name).toBe('internal-analysis');
    expect(manifest.missingTablePolicy).toBe('create_or_repair');
    expect(manifest.sqlFiles).toEqual(['migrations/0044_internal_analysis.sql']);
    expect(manifest.allowedCreateTables).toEqual(INTERNAL_ANALYSIS_TABLES);
    expect(manifest.expectedTables.map(({ name }) => name)).toEqual(INTERNAL_ANALYSIS_TABLES);
    expect(journal.entries.some(({ tag }) => tag === '0044_internal_analysis')).toBe(true);
  });

  it('keeps an authenticated read-only internal-analysis canary in production smoke', async () => {
    const smoke = await readFile('tests/smoke/production-boundaries.spec.ts', 'utf8');
    const canaryStart = smoke.indexOf(
      "test('authenticated internal-analysis canary reaches provisioned schema'"
    );
    const canaryEnd = smoke.indexOf('\n  test(', canaryStart + 1);
    const canary = smoke.slice(canaryStart, canaryEnd);

    expect(canaryStart).toBeGreaterThanOrEqual(0);
    expect(canaryEnd).toBeGreaterThan(canaryStart);
    expect(canary).toContain('await loginProdSmoke(request);');
    expect(canary).toContain('/api/funds/1/internal-analysis/drafts');
    expect(canary).toContain('expect(response.status()).toBe(200);');
    expect(canary).toContain("expect(body['drafts']).toEqual(expect.any(Array));");
  });
});
