import {
  FINANCIAL_FACTS_POLICY_VERSION_1_0_0,
  FINANCIAL_FACTS_POLICY_VERSION_1_0_1,
  FINANCIAL_FACTS_POLICY_VERSION_1_1_0,
  FINANCIAL_FACTS_POLICY_VERSION_1_2_0,
  FINANCIAL_FACTS_POLICY_VERSION_1_3_0,
  FINANCIAL_FACTS_POLICY_VERSION_1_4_0,
  PersistedFinancialFactsSnapshotV1Schema,
  type PersistedFinancialFactsSnapshotV1,
} from '../../../shared/contracts/financial-facts-snapshot-v1.contract';
import type { FinancialFactsSnapshot } from '../../../shared/schema/financial-facts-snapshots';

type ParsedFinancialFactsSnapshot = PersistedFinancialFactsSnapshotV1 & {
  readonly id: number;
};

export type PersistedFactsRowParseResult =
  | { readonly kind: 'facts'; readonly snapshot: ParsedFinancialFactsSnapshot }
  | { readonly kind: 'unsupported'; readonly policyVersion: string };

const SUPPORTED_POLICY_VERSIONS = new Set<string>([
  FINANCIAL_FACTS_POLICY_VERSION_1_0_0,
  FINANCIAL_FACTS_POLICY_VERSION_1_0_1,
  FINANCIAL_FACTS_POLICY_VERSION_1_1_0,
  FINANCIAL_FACTS_POLICY_VERSION_1_2_0,
  FINANCIAL_FACTS_POLICY_VERSION_1_3_0,
  FINANCIAL_FACTS_POLICY_VERSION_1_4_0,
]);

export function parsePersistedFactsRow(
  row: FinancialFactsSnapshot
): PersistedFactsRowParseResult {
  if (!SUPPORTED_POLICY_VERSIONS.has(row.policyVersion)) {
    return { kind: 'unsupported', policyVersion: row.policyVersion };
  }

  const parsed = PersistedFinancialFactsSnapshotV1Schema.parse({
    policyVersion: row.policyVersion,
    payloadSchemaId: row.payloadSchemaId,
    fundId: row.fundId,
    asOfDate: row.asOfDate,
    knowledgeCutoff: row.knowledgeCutoff.toISOString(),
    vehicleScope: row.vehicleScope,
    vehicleIds: row.vehicleIds,
    selectionSetHash: row.selectionSetHash,
    sourceFactsInputHash: row.sourceFactsInputHash,
    snapshotInputHash: row.snapshotInputHash,
    consumerEvaluations: row.consumerEvaluations,
    payload: row.payload,
    actorId: row.actorId,
    createdAt: row.createdAt.toISOString(),
  });

  if (
    row.policyVersion === FINANCIAL_FACTS_POLICY_VERSION_1_0_0 ||
    row.policyVersion === FINANCIAL_FACTS_POLICY_VERSION_1_0_1
  ) {
    const legacySnapshot = PersistedFinancialFactsSnapshotV1Schema.parse({
      ...parsed,
      payloadSchemaId: undefined,
    });
    return { kind: 'facts', snapshot: { ...legacySnapshot, id: row.id } };
  }

  return { kind: 'facts', snapshot: { ...parsed, id: row.id } };
}
