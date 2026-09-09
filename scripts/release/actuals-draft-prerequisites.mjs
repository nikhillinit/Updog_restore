export const ACTUALS_DRAFT_PRODUCTION_PREREQUISITES = Object.freeze([
  Object.freeze({
    predicate: 'current-protected-source-and-ci',
    status: 'collector-implemented-no-runtime-admission',
    verifier: 'scripts/release/actuals-migration-preflight.ts',
    reasonCode: 'RUNTIME_ADMISSION_NOT_IMPLEMENTED',
  }),
  Object.freeze({
    predicate: 'protected-provider-and-database-identity',
    status: 'collector-implemented-no-runtime-admission',
    verifier: 'scripts/release/actuals-migration-preflight.ts',
    reasonCode: 'RUNTIME_ADMISSION_NOT_IMPLEMENTED',
  }),
  Object.freeze({
    predicate: 'exact-body-migration-authority',
    status: 'dispatch-collector-implemented-no-runtime-admission',
    verifier: 'scripts/release/actuals-migration-preflight.ts',
    reasonCode: 'RUNTIME_ADMISSION_NOT_IMPLEMENTED',
  }),
  Object.freeze({
    predicate: 'backup-and-pitr-recoverability',
    status: 'authoritative-collector-required',
    verifier: null,
    reasonCode: 'BACKUP_PITR_COLLECTOR_UNAVAILABLE',
  }),
  Object.freeze({
    predicate: 'isolated-restore-with-owner-defined-window',
    status: 'authority-definition-and-collector-required',
    verifier: null,
    reasonCode: 'RESTORE_WINDOW_AND_RESTORE_PROOF_UNDEFINED',
  }),
  Object.freeze({
    predicate: 'exact-live-digest-and-evidence-custody',
    status: 'authoritative-collector-required',
    verifier: null,
    reasonCode: 'LIVE_DIGEST_CUSTODY_COLLECTOR_UNAVAILABLE',
  }),
  Object.freeze({
    predicate: 'migration-isolation-containment-and-residue',
    status: 'action-specific-verifier-required',
    verifier: 'scripts/release/assert-canary-residue.mjs (G3 canary scope only)',
    reasonCode: 'MIGRATION_CONTAINMENT_RESIDUE_VERIFIER_UNAVAILABLE',
  }),
]);

export class ActualsDraftPrerequisiteError extends Error {
  constructor() {
    super(
      `0056 production action blocked: ${ACTUALS_DRAFT_PRODUCTION_PREREQUISITES.map((item) => item.reasonCode).join(', ')}`
    );
    this.name = 'ActualsDraftPrerequisiteError';
    this.code = 'PRODUCTION_PREREQUISITES_UNAVAILABLE';
    this.prerequisites = ACTUALS_DRAFT_PRODUCTION_PREREQUISITES;
  }
}

// No caller-supplied assertion can replace an absent authoritative verifier.
// A future admitted implementation must bind live verifier outputs before minting an apply capability.
export function assertActualsDraftProductionPrerequisites() {
  throw new ActualsDraftPrerequisiteError();
}
