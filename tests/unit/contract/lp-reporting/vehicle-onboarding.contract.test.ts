import { describe, expect, it } from 'vitest';
import {
  serializeVehicleOnboardingReceipt,
  VehicleOnboardingRequestSchema,
} from '@shared/contracts/lp-reporting/vehicle-onboarding.contract';

const request = {
  contractVersion: 'vehicle-onboarding/1.0.0',
  vehicleSlug: 'main-fund',
  name: 'Main Fund',
  committedCapital: '1000000.000000',
  source: { sourceType: 'manual', content: 'Approved commitment: USD 1,000,000.' },
  sourceLocator: 'Signed schedule, total commitment',
  attestation: 'source-supports-commitment/1.0.0',
};

describe('vehicle onboarding contract', () => {
  it('normalizes equivalent cent-exact declarations without floating point', () => {
    expect(VehicleOnboardingRequestSchema.parse(request).committedCapital).toBe('1000000.00');
  });

  it.each([
    { committedCapital: '100.001' },
    { committedCapital: '-1' },
    { currency: 'EUR' },
    { status: 'closed' },
    { vehicleType: 'spv' },
    { sourceArtifactId: 1 },
    { attestation: '' },
    { vehicleSlug: 'Main Fund' },
    { source: { sourceType: 'manual', content: '' } },
    { source: { sourceType: 'csv', fileName: '../source.csv', payloadBase64: 'YQ==' } },
    { source: { sourceType: 'csv', fileName: 'source.csv', payloadBase64: 'not base64' } },
  ])('rejects unsupported declaration %j', (override) => {
    expect(VehicleOnboardingRequestSchema.safeParse({ ...request, ...override }).success).toBe(
      false
    );
  });

  it('reconstructs the same response bytes after JSONB-style key reordering', () => {
    const receipt = {
      contractVersion: 'vehicle-onboarding/1.0.0',
      commandId: 1,
      fundId: 7,
      vehicleId: 3,
      vehicleSlug: 'main-fund',
      name: 'Main Fund',
      vehicleType: 'main_fund',
      currency: 'USD',
      status: 'active',
      committedCapital: '1000000.00',
      sourceArtifactId: 4,
      sourceArtifactSha256: 'a'.repeat(64),
      sourceLocator: 'Signed schedule',
      sourcePurgeAfter: '2027-12-09T00:00:00.000Z',
      attestation: 'source-supports-commitment/1.0.0',
      outcome: 'created',
      actorId: 9,
      declaredAt: '2026-11-04T00:00:00.000Z',
    };
    const reordered = Object.fromEntries(Object.entries(receipt).reverse());
    expect(serializeVehicleOnboardingReceipt(reordered)).toBe(
      serializeVehicleOnboardingReceipt(receipt)
    );
  });
});
