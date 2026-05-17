import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  ACTIVE_SCHEMA_SURFACES,
  ACTIVE_SURFACE_IDS,
  formatSchemaDriftReport,
  validateActiveSchemaSurfaces,
  type ActiveSchemaSurface,
} from '../../../scripts/schema-drift-active-surfaces.ts';

describe('active schema drift surface manifest', () => {
  it('covers every B1 active surface exactly once', () => {
    const surfaceIds = ACTIVE_SCHEMA_SURFACES.map((surface) => surface.id);

    expect(surfaceIds).toHaveLength(ACTIVE_SURFACE_IDS.length);
    expect(new Set(surfaceIds)).toEqual(new Set(ACTIVE_SURFACE_IDS));
  });

  it('uses current repo authority paths instead of stale legacy defaults', () => {
    const referencedPaths = ACTIVE_SCHEMA_SURFACES.flatMap((surface) => [
      ...surface.requiredFiles.map((file) => file.path),
      ...surface.requiredExports.map((entry) => entry.path),
      ...surface.migrationEvidence.map((entry) => entry.pattern),
      ...surface.tests,
    ]);

    expect(referencedPaths).toContain('server/migrations/*lp_reporting*.sql');
    expect(referencedPaths).toContain('shared/schema.ts');
    expect(referencedPaths).toContain('shared/schema/lp-reporting-evidence.ts');
    expect(referencedPaths).toContain('shared/contracts/fund-state-read-v1.contract.ts');
    expect(
      referencedPaths.some((entry) => entry === 'migrations' || entry.startsWith('migrations/'))
    ).toBe(false);
    expect(
      referencedPaths.some(
        (entry) => entry === 'server/db/schema' || entry.startsWith('server/db/schema/')
      )
    ).toBe(false);
  });

  it('fails with structured context when a required export is missing', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'schema-drift-surface-'));

    try {
      writeFixtureFile(
        rootDir,
        'shared/schema.ts',
        'export const cohortUnitEnum = {};\nexport const cohortDefinitions = {};\n'
      );
      writeFixtureFile(rootDir, 'server/routes/cohort-analysis.ts', 'export const route = true;\n');
      writeFixtureFile(
        rootDir,
        'tests/unit/contract/cohort-analysis-boundary.test.ts',
        'export const testMarker = true;\n'
      );

      const fixtureSurface: ActiveSchemaSurface = {
        id: 'cohort',
        label: 'Cohort fixture',
        requiredFiles: [
          {
            path: 'shared/schema.ts',
            layer: 'drizzle',
            description: 'cohort fixture schema',
          },
          {
            path: 'server/routes/cohort-analysis.ts',
            layer: 'contract-or-zod',
            description: 'cohort route fixture',
          },
        ],
        requiredExports: [
          {
            path: 'shared/schema.ts',
            layer: 'drizzle',
            names: ['cohortUnitEnum', 'cohortDefinitions', 'insertCohortDefinitionSchema'],
          },
        ],
        migrationEvidence: [
          {
            pattern: 'server/migrations/*cohort*.sql',
            required: false,
            description: 'documented cohort migration gap',
          },
        ],
        tests: ['tests/unit/contract/cohort-analysis-boundary.test.ts'],
      };

      const result = validateActiveSchemaSurfaces({
        rootDir,
        surfaces: [fixtureSurface],
        expectedSurfaceIds: ['cohort'],
      });

      expect(result.ok).toBe(false);
      expect(result.findings).toContainEqual(
        expect.objectContaining({
          surfaceId: 'cohort',
          layer: 'drizzle',
          status: 'fail',
          expected: 'insertCohortDefinitionSchema',
          path: 'shared/schema.ts',
        })
      );
      expect(formatSchemaDriftReport(result)).toContain('next=Restore the export');
    } finally {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });
});

function writeFixtureFile(rootDir: string, relativePath: string, content: string): void {
  const targetPath = path.join(rootDir, ...relativePath.split('/'));
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, content, 'utf8');
}
