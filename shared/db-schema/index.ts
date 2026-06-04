/**
 * Compatibility barrel for database schema surfaces.
 *
 * This is the migration target for future schema directory cleanup. Keep the
 * legacy `@shared/schema`, `@shared/schema-lp-reporting`, and
 * `@shared/schema-lp-sprint3` imports working until every consumer is moved.
 */

export const DB_SCHEMA_COMPATIBILITY_MAP = {
  core: {
    legacyImport: '@shared/schema',
    compatibilityImport: '@shared/db-schema',
    source: 'shared/schema.ts',
  },
  lpReporting: {
    legacyImport: '@shared/schema-lp-reporting',
    compatibilityImport: '@shared/db-schema',
    source: 'shared/schema-lp-reporting.ts',
  },
  lpSprint3: {
    legacyImport: '@shared/schema-lp-sprint3',
    compatibilityImport: '@shared/db-schema',
    source: 'shared/schema-lp-sprint3.ts',
  },
  reserveApprovals: {
    legacyImport: '@shared/schemas/reserve-approvals',
    compatibilityImport: '@shared/db-schema',
    source: 'shared/schemas/reserve-approvals.ts',
  },
} as const;

export * from '../schema';
export * from '../schema-lp-reporting';
export * from '../schema-lp-sprint3';
export * from '../schemas/reserve-approvals';
