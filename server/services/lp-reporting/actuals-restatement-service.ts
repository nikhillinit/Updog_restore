import {
  ActualsCorrectionProvenanceV1Schema,
  ActualsEffectiveBasisV1Schema,
  ActualsOriginalPublicationV1Schema,
  ActualsRecordIdentityV1Schema,
  type ActualsCorrectionProvenanceV1,
  type ActualsEffectiveBasisV1,
  type ActualsOriginalPublicationV1,
  type ActualsRecordIdentityV1,
} from '../../../shared/contracts/financial-facts-snapshot-v1.contract';
import { type ActualsRestatementErrorCodeV1 } from '../../../shared/contracts/lp-reporting/actuals-restatement.contract';
import { isGregorianDate } from '../../../shared/contracts/lp-reporting/actuals-pilot.contract';
import { canonicalSha256 } from '../../../shared/lib/canonical-hash';

export class ActualsEffectiveBasisError extends Error {
  constructor(
    readonly code: ActualsRestatementErrorCodeV1,
    message: string
  ) {
    super(message);
    this.name = 'ActualsEffectiveBasisError';
  }
}

interface ProjectionRecord<Row> {
  readonly row: Row;
  readonly identity: ActualsRecordIdentityV1;
  readonly fundId: number;
  readonly effectiveDate: string;
}

export interface ActualsLedgerProjectionRecord<Row> extends ProjectionRecord<Row> {
  readonly supersedesEventId: number | null;
  readonly reversalOfEventId: number | null;
}

export interface ActualsValuationProjectionRecord<Row> extends ProjectionRecord<Row> {
  readonly priorMarkId: number | null;
  readonly companyId: number;
  readonly vehicleId: number;
  readonly markPurpose: string;
}

/** The caller obtains this membership only from verified persisted receipt ancestry. */
export interface ActualsAdmittedProjectionRecord {
  readonly identity: ActualsRecordIdentityV1;
  readonly publication: ActualsOriginalPublicationV1;
  readonly correctionCommandId: string | null;
}

export interface ProjectActualsEffectiveBasisInput<LedgerRow, ValuationRow> {
  readonly fundId: number;
  readonly asOfDate: string;
  readonly ledgerRows: readonly ActualsLedgerProjectionRecord<LedgerRow>[];
  readonly valuationMarks: readonly ActualsValuationProjectionRecord<ValuationRow>[];
  readonly admittedRecords: readonly ActualsAdmittedProjectionRecord[];
  /** Newly inserted rows in the caller's uncommitted publication transaction. They cannot be targets. */
  readonly pendingRecords?: readonly {
    readonly identity: ActualsRecordIdentityV1;
    readonly correctionCommandId: string | null;
  }[];
  readonly corrections: readonly ActualsCorrectionProvenanceV1[];
  readonly predecessorSnapshotInputHash: string;
}

export interface ProjectActualsEffectiveBasisResult<LedgerRow, ValuationRow> {
  readonly ledgerRows: LedgerRow[];
  readonly valuationMarks: ValuationRow[];
  readonly identities: ActualsRecordIdentityV1[];
  readonly effectiveBasis: ActualsEffectiveBasisV1;
}

function fail(code: ActualsRestatementErrorCodeV1, message: string): never {
  throw new ActualsEffectiveBasisError(code, message);
}

function key(identity: Pick<ActualsRecordIdentityV1, 'kind' | 'recordId'>): string {
  return `${identity.kind}:${identity.recordId}`;
}

function sameIdentity(left: ActualsRecordIdentityV1, right: ActualsRecordIdentityV1): boolean {
  return (
    left.kind === right.kind &&
    left.recordId === right.recordId &&
    left.sourceHash === right.sourceHash &&
    left.contentHash === right.contentHash
  );
}

function compareIdentity(left: ActualsRecordIdentityV1, right: ActualsRecordIdentityV1): number {
  return left.kind === right.kind
    ? left.recordId - right.recordId
    : left.kind === 'ledger'
      ? -1
      : 1;
}

/**
 * Validate historical membership before projecting receipt-backed terminal replacements.
 * Returns the original row objects unchanged, including their predecessor columns.
 * The caller must first verify economic content hashes and receipt/snapshot hashes.
 */
export function projectActualsEffectiveBasis<LedgerRow, ValuationRow>(
  input: ProjectActualsEffectiveBasisInput<LedgerRow, ValuationRow>
): ProjectActualsEffectiveBasisResult<LedgerRow, ValuationRow> {
  if (
    !Number.isSafeInteger(input.fundId) ||
    input.fundId <= 0 ||
    !isGregorianDate(input.asOfDate) ||
    !/^[a-f0-9]{64}$/.test(input.predecessorSnapshotInputHash)
  ) {
    fail('EFFECTIVE_BASIS_INVALID', 'Effective basis identity is malformed.');
  }

  const admitted = new Map<
    string,
    {
      readonly identity: ActualsRecordIdentityV1;
      readonly publication: ActualsOriginalPublicationV1 | null;
      readonly correctionCommandId: string | null;
    }
  >();
  for (const record of [
    ...input.admittedRecords.map((record) => ({ ...record, pending: false })),
    ...(input.pendingRecords ?? []).map((record) => ({
      ...record,
      publication: null,
      pending: true,
    })),
  ]) {
    if (
      !ActualsRecordIdentityV1Schema.safeParse(record.identity).success ||
      (!record.pending &&
        !ActualsOriginalPublicationV1Schema.safeParse(record.publication).success) ||
      (record.correctionCommandId !== null &&
        !ActualsCorrectionProvenanceV1Schema.shape.commandId.safeParse(record.correctionCommandId)
          .success)
    ) {
      fail('TARGET_NOT_ADMITTED', 'Receipt membership identity is malformed.');
    }
    const recordKey = key(record.identity);
    if (admitted.has(recordKey)) {
      fail('TARGET_NOT_ADMITTED', 'A historical record was admitted more than once.');
    }
    admitted.set(recordKey, record);
  }

  const records = new Map<string, ProjectionRecord<LedgerRow | ValuationRow>>();
  const predecessorKeys = new Map<string, string>();
  const sourceIdentities = new Set<string>();
  const sourceHashCounts = new Map<string, number>();
  const addRecord = (
    record: ProjectionRecord<LedgerRow | ValuationRow>,
    kind: 'ledger' | 'valuation',
    predecessorId: number | null
  ): void => {
    if (
      !ActualsRecordIdentityV1Schema.safeParse(record.identity).success ||
      record.identity.kind !== kind ||
      record.fundId !== input.fundId ||
      !isGregorianDate(record.effectiveDate) ||
      record.effectiveDate > input.asOfDate
    ) {
      fail('EFFECTIVE_BASIS_INVALID', 'Historical record has invalid identity, fund, or cutoff.');
    }
    const recordKey = key(record.identity);
    const membership = admitted.get(recordKey);
    if (!membership)
      fail('TARGET_NOT_ADMITTED', 'Historical record is not admitted by receipt ancestry.');
    if (!sameIdentity(record.identity, membership.identity)) {
      fail('TARGET_HASH_MISMATCH', 'Historical record differs from its admitted identity.');
    }
    const sourceKey = `${kind}:${record.identity.sourceHash}`;
    if (records.has(recordKey) || sourceIdentities.has(sourceKey)) {
      fail('EFFECTIVE_BASIS_INVALID', 'Historical record or source identity is duplicated.');
    }
    records.set(recordKey, record);
    sourceIdentities.add(sourceKey);
    sourceHashCounts.set(
      record.identity.sourceHash,
      (sourceHashCounts.get(record.identity.sourceHash) ?? 0) + 1
    );
    if (predecessorId !== null) {
      if (!Number.isSafeInteger(predecessorId) || predecessorId <= 0) {
        fail('INVALID_REPLACEMENT_LINEAGE', 'Record predecessor identity is malformed.');
      }
      predecessorKeys.set(recordKey, key({ kind, recordId: predecessorId }));
    }
  };

  for (const record of input.ledgerRows) {
    if (record.reversalOfEventId !== null) {
      fail(
        'INVALID_REPLACEMENT_LINEAGE',
        'Generic reversal edges are not admitted by one-for-one restatement.'
      );
    }
    addRecord(record, 'ledger', record.supersedesEventId);
  }
  for (const record of input.valuationMarks) {
    if (
      !Number.isSafeInteger(record.companyId) ||
      record.companyId <= 0 ||
      !Number.isSafeInteger(record.vehicleId) ||
      record.vehicleId <= 0 ||
      !record.markPurpose
    ) {
      fail('VALUATION_SCOPE_MISMATCH', 'Valuation scope is malformed.');
    }
    addRecord(record, 'valuation', record.priorMarkId);
  }
  if (admitted.size !== records.size) {
    fail('TARGET_NOT_ADMITTED', 'Receipt ancestry references a missing historical record.');
  }

  const marks = new Map(input.valuationMarks.map((record) => [key(record.identity), record]));
  const successors = new Map<string, string>();
  const backedReplacements = new Set<string>();
  const commandIds = new Set<string>();
  const corrections: ActualsCorrectionProvenanceV1[] = [];
  for (const rawCorrection of input.corrections) {
    const parsed = ActualsCorrectionProvenanceV1Schema.safeParse(rawCorrection);
    if (!parsed.success || parsed.data.asOfDate > input.asOfDate) {
      fail(
        'INVALID_REPLACEMENT_LINEAGE',
        'Correction provenance is malformed or beyond the basis cutoff.'
      );
    }
    const correction = parsed.data;
    if (commandIds.has(correction.commandId)) {
      fail('INVALID_REPLACEMENT_LINEAGE', 'Correction command provenance is duplicated.');
    }
    commandIds.add(correction.commandId);
    for (const item of correction.items) {
      const targetKey = key(item.target);
      const replacementKey = key(item.replacement);
      const target = records.get(targetKey);
      const replacement = records.get(replacementKey);
      const targetAdmission = admitted.get(targetKey);
      const replacementAdmission = admitted.get(replacementKey);
      if (!target || !replacement || !targetAdmission || !replacementAdmission) {
        fail(
          'INVALID_REPLACEMENT_LINEAGE',
          'Correction lineage is detached from admitted history.'
        );
      }
      if (
        !sameIdentity(target.identity, item.target) ||
        !sameIdentity(replacement.identity, item.replacement)
      ) {
        fail('TARGET_HASH_MISMATCH', 'Correction item differs from its admitted record identity.');
      }
      if (sourceHashCounts.get(replacement.identity.sourceHash) !== 1) {
        fail(
          'EXTERNAL_REF_REUSE_CONFLICT',
          'Replacement source identity must be fresh across historical records.'
        );
      }
      if (
        targetAdmission.publication === null ||
        canonicalSha256(targetAdmission.publication) !==
          canonicalSha256(item.originalPublication) ||
        replacementAdmission.correctionCommandId !== correction.commandId
      ) {
        fail(
          'TARGET_NOT_ADMITTED',
          'Correction lineage is not backed by its exact source publication.'
        );
      }
      if (successors.has(targetKey) || backedReplacements.has(replacementKey)) {
        fail(
          'TARGET_NOT_EFFECTIVE',
          'A predecessor or replacement already participates in another correction.'
        );
      }
      if (
        predecessorKeys.get(replacementKey) !== targetKey ||
        target.effectiveDate > correction.asOfDate ||
        replacement.effectiveDate > correction.asOfDate
      ) {
        fail(
          'INVALID_REPLACEMENT_LINEAGE',
          'Correction does not match the persisted predecessor or command cutoff.'
        );
      }
      if (item.target.kind === 'valuation') {
        const targetMark = marks.get(targetKey);
        const replacementMark = marks.get(replacementKey);
        if (!targetMark || !replacementMark) {
          fail(
            'INVALID_REPLACEMENT_LINEAGE',
            'Valuation replacement has a non-valuation endpoint.'
          );
        }
        if (targetMark.effectiveDate !== correction.asOfDate) {
          fail(
            'HISTORICAL_MARK_RESTATEMENT_UNSUPPORTED',
            'Only marks at the correction as-of date can be restated.'
          );
        }
        if (
          targetMark.effectiveDate !== replacementMark.effectiveDate ||
          targetMark.companyId !== replacementMark.companyId ||
          targetMark.vehicleId !== replacementMark.vehicleId ||
          targetMark.markPurpose !== replacementMark.markPurpose
        ) {
          fail(
            'VALUATION_SCOPE_MISMATCH',
            'Valuation replacement must preserve company, vehicle, type, and date.'
          );
        }
      }
      successors.set(targetKey, replacementKey);
      backedReplacements.add(replacementKey);
    }
    corrections.push(correction);
  }

  for (const [recordKey, predecessorKey] of predecessorKeys) {
    if (!backedReplacements.has(recordKey) || !records.has(predecessorKey)) {
      fail(
        'INVALID_REPLACEMENT_LINEAGE',
        'Persisted predecessor edge lacks correction receipt provenance.'
      );
    }
  }
  for (const [recordKey, membership] of admitted) {
    if ((membership.correctionCommandId !== null) !== backedReplacements.has(recordKey)) {
      fail('INVALID_REPLACEMENT_LINEAGE', 'Correction admission and predecessor edge disagree.');
    }
  }
  const complete = new Set<string>();
  for (const recordKey of records.keys()) {
    const path = new Set<string>();
    let cursor: string | undefined = recordKey;
    while (cursor !== undefined && !complete.has(cursor)) {
      if (path.has(cursor))
        fail('INVALID_REPLACEMENT_LINEAGE', 'Correction lineage contains a cycle.');
      path.add(cursor);
      cursor = successors.get(cursor);
    }
    for (const visited of path) complete.add(visited);
  }

  const identities = [...records.values()]
    .filter((record) => !successors.has(key(record.identity)))
    .map((record) => record.identity)
    .sort(compareIdentity);
  const effectiveBasis = ActualsEffectiveBasisV1Schema.parse({
    ledgerRecordIds: identities
      .filter((identity) => identity.kind === 'ledger')
      .map((identity) => identity.recordId),
    valuationRecordIds: identities
      .filter((identity) => identity.kind === 'valuation')
      .map((identity) => identity.recordId),
    recordsHash: canonicalSha256(identities),
    predecessorSnapshotInputHash: input.predecessorSnapshotInputHash,
    corrections,
  });
  return {
    ledgerRows: input.ledgerRows
      .filter((record) => !successors.has(key(record.identity)))
      .sort((left, right) => left.identity.recordId - right.identity.recordId)
      .map((record) => record.row),
    valuationMarks: input.valuationMarks
      .filter((record) => !successors.has(key(record.identity)))
      .sort((left, right) => left.identity.recordId - right.identity.recordId)
      .map((record) => record.row),
    identities,
    effectiveBasis,
  };
}
