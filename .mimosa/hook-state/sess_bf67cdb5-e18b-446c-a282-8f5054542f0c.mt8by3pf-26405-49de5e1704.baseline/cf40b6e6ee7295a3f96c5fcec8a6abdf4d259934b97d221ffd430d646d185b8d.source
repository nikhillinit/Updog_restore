import { describe, expect, it } from 'vitest';

import {
  CAPITAL_ENVELOPE_CONTRACT_VERSION,
  CAPITAL_ENVELOPE_SEED_REFUSAL_CODES_V1,
  CapitalEnvelopeCreateRequestV1Schema,
  CapitalEnvelopeHashPreimageV1Schema,
  CapitalEnvelopeSeedRefusalCodeV1Schema,
  buildCapitalEnvelopeHashPreimageV1,
  type CapitalEnvelopeCreateRequestV1,
} from '../../../../shared/contracts/internal-economics/capital-envelope-v1.contract';

const validRequest = {
  mainFundVehicleId: 7,
  lpCommitmentUsd: '95000000.000000',
  gpCommitmentUsd: '5000000.000000',
  totalCommitmentUsd: '100000000.000000',
  currency: 'USD',
  effectiveAt: '2026-01-01T00:00:00.000Z',
  sourceArtifactId: 41,
  sourceConfigId: 3,
  sourceConfigVersion: 5,
  sourceConfigHash: 'ab'.repeat(32),
  attestedBy: 9,
  attestedAt: '2026-01-02T12:00:00.000Z',
} satisfies CapitalEnvelopeCreateRequestV1;

function issueMessages(candidate: unknown): string[] {
  const parsed = CapitalEnvelopeCreateRequestV1Schema.safeParse(candidate);
  if (parsed.success) return [];
  return parsed.error.issues.map((issue) => issue.message);
}

describe('capital-envelope/1.0.0 contract', () => {
  it('pins the contract version literal', () => {
    expect(CAPITAL_ENVELOPE_CONTRACT_VERSION).toBe('capital-envelope/1.0.0');
  });

  it('round-trips a valid Brief 3 creation request', () => {
    const parsed = CapitalEnvelopeCreateRequestV1Schema.parse(validRequest);
    expect(parsed).toEqual(validRequest);
  });

  it('rejects unknown keys (strict request shape)', () => {
    expect(
      CapitalEnvelopeCreateRequestV1Schema.safeParse({ ...validRequest, extra: 'x' }).success
    ).toBe(false);
  });

  it('rejects non-canonical commitment strings (money is 6dp canonical)', () => {
    expect(
      CapitalEnvelopeCreateRequestV1Schema.safeParse({
        ...validRequest,
        lpCommitmentUsd: '95000000.00',
      }).success
    ).toBe(false);
    expect(
      CapitalEnvelopeCreateRequestV1Schema.safeParse({
        ...validRequest,
        lpCommitmentUsd: 95000000,
      }).success
    ).toBe(false);
  });

  it('rejects a non-USD currency', () => {
    expect(
      CapitalEnvelopeCreateRequestV1Schema.safeParse({ ...validRequest, currency: 'EUR' }).success
    ).toBe(false);
  });

  it('flags a negative LP commitment with its refusal code', () => {
    expect(
      issueMessages({
        ...validRequest,
        lpCommitmentUsd: '-1.000000',
        totalCommitmentUsd: '4999999.000000',
      })
    ).toContain('ENVELOPE_LP_COMMITMENT_NEGATIVE');
  });

  it('flags a negative GP commitment with its refusal code', () => {
    expect(
      issueMessages({
        ...validRequest,
        gpCommitmentUsd: '-0.000001',
        totalCommitmentUsd: '94999999.999999',
      })
    ).toContain('ENVELOPE_GP_COMMITMENT_NEGATIVE');
  });

  it('flags a non-positive total commitment with its refusal code', () => {
    expect(
      issueMessages({
        ...validRequest,
        lpCommitmentUsd: '0.000000',
        gpCommitmentUsd: '0.000000',
        totalCommitmentUsd: '0.000000',
      })
    ).toContain('ENVELOPE_TOTAL_COMMITMENT_NOT_POSITIVE');
  });

  it('flags an exact-sum violation with its refusal code', () => {
    expect(
      issueMessages({
        ...validRequest,
        totalCommitmentUsd: '100000000.000001',
      })
    ).toContain('ENVELOPE_COMMITMENT_SUM_MISMATCH');
  });

  it('accepts an exact lp + gp = total at full 6dp precision', () => {
    expect(
      CapitalEnvelopeCreateRequestV1Schema.safeParse({
        ...validRequest,
        lpCommitmentUsd: '0.000001',
        gpCommitmentUsd: '0.000002',
        totalCommitmentUsd: '0.000003',
      }).success
    ).toBe(true);
  });

  it('carries the complete Brief 3 seed-refusal registry', () => {
    expect(CAPITAL_ENVELOPE_SEED_REFUSAL_CODES_V1).toEqual([
      'ENVELOPE_LP_COMMITMENT_NEGATIVE',
      'ENVELOPE_GP_COMMITMENT_NEGATIVE',
      'ENVELOPE_TOTAL_COMMITMENT_NOT_POSITIVE',
      'ENVELOPE_COMMITMENT_SUM_MISMATCH',
      'ENVELOPE_CURRENCY_UNSUPPORTED',
      'ENVELOPE_VEHICLE_NOT_IN_FUND',
      'ENVELOPE_VEHICLE_NOT_MAIN_FUND',
    ]);
    expect(CapitalEnvelopeSeedRefusalCodeV1Schema.options).toEqual(
      CAPITAL_ENVELOPE_SEED_REFUSAL_CODES_V1
    );
  });

  it('builds the envelope hash preimage from fundId + contract version + content fields only', () => {
    const preimage = buildCapitalEnvelopeHashPreimageV1({ fundId: 12, request: validRequest });

    expect(preimage).toEqual({
      contractVersion: 'capital-envelope/1.0.0',
      fundId: 12,
      ...validRequest,
    });
    expect(CapitalEnvelopeHashPreimageV1Schema.parse(preimage)).toEqual(preimage);
  });

  it('keeps lineage fields out of the hash preimage shape', () => {
    expect(
      CapitalEnvelopeHashPreimageV1Schema.safeParse({
        contractVersion: 'capital-envelope/1.0.0',
        fundId: 12,
        ...validRequest,
        idempotencyKey: 'k',
      }).success
    ).toBe(false);
    expect(
      CapitalEnvelopeHashPreimageV1Schema.safeParse({
        contractVersion: 'capital-envelope/1.0.0',
        fundId: 12,
        ...validRequest,
        parentEnvelopeVersionId: 4,
      }).success
    ).toBe(false);
  });
});
