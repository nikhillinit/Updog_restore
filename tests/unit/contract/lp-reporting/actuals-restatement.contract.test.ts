import { describe, expect, it } from 'vitest';
import {
  ActualsRestatementPreviewRequestV1Schema,
  ActualsRestatementPublishRequestV1Schema,
  ActualsRestatementReadRequestV1Schema,
} from '../../../../shared/contracts/lp-reporting/actuals-restatement.contract';

const hash = 'a'.repeat(64);
const basis = {
  schemaId: 'financial-facts-basis-ref/1.0.0',
  fundId: 7,
  snapshotId: 1,
  snapshotInputHash: hash,
  sourceFactsInputHash: 'b'.repeat(64),
  policyVersion: 'financial-facts-policy/1.4.0',
  asOfDate: '2026-09-08',
  knowledgeCutoff: '2026-09-08T12:00:00.000Z',
};
function request(kind: 'ledger' | 'valuation' = 'ledger') {
  const file = {
    templateVersion: kind === 'ledger' ? 'actuals-ledger/1.0.0' : 'actuals-valuation/1.0.0',
    fileName: 'replacement.csv',
    payload: Buffer.from('header\n').toString('base64'),
    expectedPayloadSha256: hash,
    expectedCanonicalRowsHash: hash,
    expectedPreviewHash: hash,
  };
  return {
    contractVersion: 'actuals-restatement/1.0.0',
    expectedBasis: basis,
    expectedETag: `"financial-facts:1:${hash}"`,
    ledger: kind === 'ledger' ? file : null,
    valuation: kind === 'valuation' ? file : null,
    items: [
      {
        target: { kind, recordId: 11, sourceHash: hash, contentHash: hash },
        originalPublication: { snapshotId: 1, snapshotInputHash: hash, operationHash: hash },
        replacementExternalRef: 'replacement-11',
        expectedReplacementContentHash: hash,
      },
    ],
    reason: 'Correct the confirmed amount',
  };
}

describe('explicit published-actual replacement contract', () => {
  it.each(['ledger', 'valuation'] as const)(
    'accepts a complete %s-only replacement command',
    (kind) => {
      const input = request(kind);
      expect(ActualsRestatementPreviewRequestV1Schema.safeParse(input).success).toBe(true);
      expect(
        ActualsRestatementPublishRequestV1Schema.safeParse({ ...input, expectedPreviewHash: hash })
          .success
      ).toBe(true);
    }
  );

  it('requires exact basis ETag and explicit publish-preview binding', () => {
    expect(
      ActualsRestatementPreviewRequestV1Schema.safeParse({
        ...request(),
        expectedETag: '"financial-facts:none"',
      }).success
    ).toBe(false);
    expect(ActualsRestatementPublishRequestV1Schema.safeParse(request()).success).toBe(false);
    expect(
      ActualsRestatementPreviewRequestV1Schema.safeParse({ ...request(), actorId: 9 }).success
    ).toBe(false);
  });

  it('rejects missing files, duplicate targets/references, empty changes and missing reason', () => {
    const input = request();
    for (const invalid of [
      { ...input, ledger: null },
      { ...input, valuation: input.ledger },
      { ...input, items: [] },
      { ...input, items: [...input.items, ...input.items] },
      { ...input, reason: '' },
    ])
      expect(ActualsRestatementPreviewRequestV1Schema.safeParse(invalid).success).toBe(false);
  });

  it('bounds reads and binds their continuation to an explicit expected basis', () => {
    expect(
      ActualsRestatementReadRequestV1Schema.safeParse({ expectedBasis: basis, cursor: null })
        .success
    ).toBe(true);
    for (const invalid of [
      { expectedBasis: basis, cursor: null, limit: 101 },
      { expectedBasis: basis, cursor: 'x'.repeat(2049) },
      { cursor: null },
    ])
      expect(ActualsRestatementReadRequestV1Schema.safeParse(invalid).success).toBe(false);
  });
});
