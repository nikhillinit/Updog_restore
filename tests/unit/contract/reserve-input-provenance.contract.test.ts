import { describe, expect, it } from 'vitest';

import {
  ReserveCompanyInputWithProvenanceSchema,
  ReserveInputTrustSummarySchema,
} from '../../../shared/contracts/reserve-input-provenance.contract';

describe('reserve input provenance contract', () => {
  it('accepts observed reserve inputs with per-field provenance', () => {
    const parsed = ReserveCompanyInputWithProvenanceSchema.parse({
      id: 101,
      invested: 500000,
      ownership: 0.12,
      stage: 'series_a',
      sector: 'SaaS',
      provenance: {
        invested: { status: 'observed', source: 'investment_amount', reason: null },
        ownership: { status: 'observed', source: 'ownership_percentage', reason: null },
        stage: { status: 'observed', source: 'round', reason: null },
        sector: { status: 'observed', source: 'portfolio_company_sector', reason: null },
      },
    });

    expect(parsed.provenance.ownership.status).toBe('observed');
  });

  it('labels defaulted ownership and stage as untrusted for activation', () => {
    const parsed = ReserveInputTrustSummarySchema.parse({
      trustedForActivation: false,
      defaultedInputCount: 2,
      unavailableInputCount: 0,
      defaultedFields: ['ownership', 'stage'],
      unavailableFields: [],
    });

    expect(parsed.trustedForActivation).toBe(false);
  });
});
