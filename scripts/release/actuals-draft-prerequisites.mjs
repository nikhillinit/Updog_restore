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
    status: 'collector-implemented-live-evidence-and-producer-required',
    verifier: 'scripts/release/actuals-recovery-evidence.ts',
    reasonCode: 'BACKUP_PITR_PRODUCER_PROOF_CONTRACT_MISSING',
  }),
  Object.freeze({
    predicate: 'isolated-restore-with-owner-defined-window',
    status: 'collector-implemented-authority-and-producer-required',
    verifier: 'scripts/release/actuals-recovery-evidence.ts',
    reasonCode: 'RESTORE_RETENTION_AND_PRODUCER_PROOF_CONTRACT_MISSING',
  }),
  Object.freeze({
    predicate: 'exact-live-digest-and-evidence-custody',
    status: 'collector-implemented-custody-and-producer-required',
    verifier: 'scripts/release/actuals-recovery-evidence.ts',
    reasonCode: 'RESTORE_ARTIFACT_PAYLOAD_AND_RETENTION_CONTRACT_MISSING',
  }),
  Object.freeze({
    predicate: 'migration-isolation-containment-and-residue',
    status: 'collector-implemented-action-proof-required',
    verifier: 'scripts/release/actuals-recovery-evidence.ts',
    reasonCode: 'MIGRATION_ISOLATION_PRODUCER_PROOF_CONTRACT_MISSING',
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
