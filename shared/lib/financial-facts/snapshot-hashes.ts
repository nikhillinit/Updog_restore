/**
 * Hash builders for financial-facts snapshot preimages.
 *
 * Kept outside the contract module so the contract graph stays free of
 * node:crypto and remains importable from the browser bundle.
 */
import {
  FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID_1,
  FinancialFactsSelectionSetHashPreimageSchema,
  PersistedFinancialFactsSnapshotInputHashPreimageSchema,
  type FinancialFactsSelectionSetHashPreimage,
  type PersistedFinancialFactsSnapshotInputHashPreimage,
} from '../../contracts/financial-facts-snapshot-v1.contract';
import { canonicalSha256 } from '../canonical-hash';

function sortSelectionIds(ids: FinancialFactsSelectionSetHashPreimage['sourceObservationIds']) {
  return [...ids].sort((left, right) => String(left).localeCompare(String(right)));
}

export function buildSelectionSetHash(input: FinancialFactsSelectionSetHashPreimage): string {
  const parsed = FinancialFactsSelectionSetHashPreimageSchema.parse(input);
  return canonicalSha256({
    sourceObservationIds: sortSelectionIds(parsed.sourceObservationIds),
    workingValueSelectionIds: sortSelectionIds(parsed.workingValueSelectionIds),
  });
}

/**
 * Total for every schema-valid persisted preimage (WP-L3 section 7, R9
 * amendment): the discriminated preimage/payload Zod schemas are the
 * validation boundary for decimal strings, so the redundant decimal-leaf scan
 * (whose unanchored scientific-notation guard also matched ordinary SHA-256
 * substrings such as `EMPTY_SELECTION_SET_HASH`) is not reapplied here.
 * Canonical bytes are unchanged: both canonicalizers recursively sort object
 * keys and preserve array order.
 */
export function buildSnapshotInputHash(
  input: PersistedFinancialFactsSnapshotInputHashPreimage
): string {
  const parsed = PersistedFinancialFactsSnapshotInputHashPreimageSchema.parse(input);

  return canonicalSha256({
    fundId: parsed.fundId,
    vehicleIds: [...parsed.vehicleIds].sort((left, right) => left - right),
    asOfDate: parsed.asOfDate,
    knowledgeCutoff: parsed.knowledgeCutoff,
    policyVersion: parsed.policyVersion,
    selectionSetHash: parsed.selectionSetHash,
    payloadSchemaId:
      'payloadSchemaId' in parsed && parsed.payloadSchemaId !== undefined
        ? parsed.payloadSchemaId
        : FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID_1,
    payload: parsed.payload,
  });
}
