import {
  FINANCIAL_FACTS_POLICY_VERSION_1_4_0,
  FinancialFactsBasisRefSchema,
  type FinancialFactsBasisRef,
  type PersistedFinancialFactsSnapshotV1,
} from '../../../shared/contracts/financial-facts-snapshot-v1.contract';

export function basisRefFromPersistedSnapshot(
  snapshot: PersistedFinancialFactsSnapshotV1,
  snapshotId: number
): FinancialFactsBasisRef | undefined {
  if (snapshot.policyVersion !== FINANCIAL_FACTS_POLICY_VERSION_1_4_0) return undefined;

  return FinancialFactsBasisRefSchema.parse({
    schemaId: 'financial-facts-basis-ref/1.0.0',
    fundId: snapshot.fundId,
    snapshotId,
    snapshotInputHash: snapshot.snapshotInputHash,
    sourceFactsInputHash: snapshot.sourceFactsInputHash,
    policyVersion: snapshot.policyVersion,
    asOfDate: snapshot.asOfDate,
    knowledgeCutoff: snapshot.knowledgeCutoff,
  });
}
