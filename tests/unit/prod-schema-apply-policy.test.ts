import { describe, expect, it } from 'vitest';

import { ReconcileError, loadManifests } from '../../scripts/reconcile-prod-schema.mjs';
import {
  assertApplyPolicyForManifests,
  validateSqlApplyPolicy,
} from '../../scripts/prod-schema-apply-policy.mjs';

const policyManifest = {
  name: 'policy-fixture',
  sqlFiles: [],
  applyPolicy: {
    allowDropNotNull: [{ table: 'ledger_rows', column: 'result_hash' }],
    allowConstraintReplacements: [{ table: 'ledger_rows', name: 'ledger_rows_state_check' }],
  },
};

describe('prod schema apply policy', () => {
  it('allows declared nullable widening and same-name check replacement', () => {
    const violations = validateSqlApplyPolicy({
      manifest: policyManifest,
      sqlFile: 'fixture.sql',
      sql: `
        -- @drift-patch
        DO $$
        BEGIN
          ALTER TABLE "ledger_rows" DROP CONSTRAINT "ledger_rows_state_check";
          ALTER TABLE "ledger_rows" ADD CONSTRAINT "ledger_rows_state_check" CHECK (true);
          ALTER TABLE "ledger_rows" ALTER COLUMN "result_hash" DROP NOT NULL;
        END $$;
      `,
    });

    expect(violations).toEqual([]);
  });

  it('preserves migration statement boundaries before stripping comments', () => {
    const violations = validateSqlApplyPolicy({
      manifest: policyManifest,
      sqlFile: 'fixture.sql',
      sql: `
        -- @drift-patch
        ALTER TABLE "other_rows" ADD COLUMN IF NOT EXISTS "result_hash" text;
        --> statement-breakpoint
        DO $$
        BEGIN
          ALTER TABLE "ledger_rows" DROP CONSTRAINT "ledger_rows_state_check";
          ALTER TABLE "ledger_rows" ADD CONSTRAINT "ledger_rows_state_check" CHECK (true);
          ALTER TABLE "ledger_rows" ALTER COLUMN "result_hash" DROP NOT NULL;
        END $$;
      `,
    });

    expect(violations).toEqual([]);
  });

  it('blocks destructive SQL even when comments mention safe words', () => {
    const violations = validateSqlApplyPolicy({
      manifest: policyManifest,
      sqlFile: 'fixture.sql',
      sql: `
        -- DROP TABLE comments should not matter.
        -- @drift-patch
        TRUNCATE ledger_rows;
        DELETE FROM ledger_rows;
        DROP TABLE ledger_rows;
        ALTER TABLE ledger_rows DROP COLUMN result_hash;
        ALTER TABLE ledger_rows ALTER COLUMN result_hash SET NOT NULL;
      `,
    });

    expect(violations.map((violation) => violation.kind)).toEqual([
      'drop-table',
      'drop-column',
      'truncate',
      'delete-from',
      'set-not-null',
      'unknown-drop',
      'unknown-drop',
    ]);
  });

  it('blocks undeclared or unpaired constraint drops', () => {
    expect(
      validateSqlApplyPolicy({
        manifest: policyManifest,
        sqlFile: 'fixture.sql',
        sql: '-- @drift-patch\nALTER TABLE "ledger_rows" DROP CONSTRAINT "other_check";',
      }).map((violation) => violation.kind)
    ).toEqual(['drop-constraint', 'unpaired-drop-constraint']);

    expect(
      validateSqlApplyPolicy({
        manifest: policyManifest,
        sqlFile: 'fixture.sql',
        sql: '-- @drift-patch\nALTER TABLE "ledger_rows" DROP CONSTRAINT "ledger_rows_state_check";',
      }).map((violation) => violation.kind)
    ).toEqual(['unpaired-drop-constraint']);
  });

  it('requires a declared constraint replacement on the same table', () => {
    expect(
      validateSqlApplyPolicy({
        manifest: policyManifest,
        sqlFile: 'fixture.sql',
        sql: `
          -- @drift-patch
          DO $$
          BEGIN
            ALTER TABLE "ledger_rows" DROP CONSTRAINT "ledger_rows_state_check";
            ALTER TABLE "other_rows" ADD CONSTRAINT "ledger_rows_state_check" CHECK (true);
          END $$;
        `,
      }).map((violation) => violation.kind)
    ).toEqual(['unpaired-drop-constraint']);
  });

  it('blocks unknown DROP statements not covered by explicit policy', () => {
    expect(
      validateSqlApplyPolicy({
        manifest: policyManifest,
        sqlFile: 'fixture.sql',
        sql: `
          -- @drift-patch
          DROP DATABASE prod;
          DROP FUNCTION legacy_fn();
          DROP SEQUENCE legacy_seq;
          DROP POLICY legacy_policy ON ledger_rows;
          DROP TRIGGER legacy_trigger ON ledger_rows;
        `,
      }).map((violation) => violation.kind)
    ).toEqual(['unknown-drop', 'unknown-drop', 'unknown-drop', 'unknown-drop', 'unknown-drop']);
  });

  it('allows INSERT compatibility DML while still blocking DELETE FROM', () => {
    expect(
      validateSqlApplyPolicy({
        manifest: policyManifest,
        sqlFile: 'fixture.sql',
        sql: '-- @drift-patch\nINSERT INTO ledger_rows (result_hash) VALUES (null);',
      })
    ).toEqual([]);

    expect(
      validateSqlApplyPolicy({
        manifest: policyManifest,
        sqlFile: 'fixture.sql',
        sql: '-- @drift-patch\nDELETE FROM ledger_rows;',
      }).map((violation) => violation.kind)
    ).toEqual(['delete-from']);
  });

  it('blocks undeclared DROP NOT NULL', () => {
    expect(
      validateSqlApplyPolicy({
        manifest: policyManifest,
        sqlFile: 'fixture.sql',
        sql: '-- @drift-patch\nALTER TABLE "ledger_rows" ALTER COLUMN "other_hash" DROP NOT NULL;',
      }).map((violation) => violation.kind)
    ).toEqual(['drop-not-null']);
  });

  it('rejects dropObjects during additive-safe apply', () => {
    expect(() =>
      assertApplyPolicyForManifests({
        manifests: [
          {
            name: 'drop-fixture',
            sqlFiles: [],
            dropObjects: [
              {
                kind: 'index',
                name: 'legacy_idx',
              },
            ],
          },
        ],
        applyingManifestNames: new Set(['drop-fixture']),
      })
    ).toThrow(ReconcileError);
  });

  it('accepts additive-safe production manifests from M9 onward', async () => {
    const manifests = await loadManifests();
    const applyingManifestNames = new Set(
      manifests
        .filter(
          (manifest) => manifest.order >= 9 && manifest.name !== 'business-time-comparison-lineage'
        )
        .map((manifest) => manifest.name)
    );

    expect(() =>
      assertApplyPolicyForManifests({
        manifests,
        applyingManifestNames,
      })
    ).not.toThrow();
  });

  it('refuses automated apply for business-time comparison lineage', async () => {
    const manifests = await loadManifests();

    expect(() =>
      assertApplyPolicyForManifests({
        manifests,
        applyingManifestNames: new Set(['business-time-comparison-lineage']),
      })
    ).toThrow(ReconcileError);
  });
});
