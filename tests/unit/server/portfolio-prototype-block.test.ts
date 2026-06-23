import { describe, expect, it } from 'vitest';

import { FinancialProvenanceSchema } from '../../../shared/contracts/financial-provenance.contract';
import {
  buildPrototypeFinancialBlockedError,
  makePrototypeBlockedProvenance,
  makeStaticTemplateProvenance,
} from '../../../server/lib/portfolio-prototype-block.js';

describe('portfolio prototype financial block helpers', () => {
  it('builds a blocked route error with schema-valid prototype provenance', () => {
    const error = buildPrototypeFinancialBlockedError({
      routeId: 'portfolio.scenario.simulate',
      sourceRoute: 'POST /api/portfolio/scenarios/:id/simulate',
      replacement: 'POST /api/funds/:id/calculate',
    });

    expect(error).toMatchObject({
      error: 'not_implemented',
      code: 'PROTOTYPE_FINANCIAL_OUTPUT_BLOCKED',
      routeId: 'portfolio.scenario.simulate',
      message:
        'This route is disabled because it previously returned non-computed financial outputs.',
      replacement: 'POST /api/funds/:id/calculate',
    });

    expect(FinancialProvenanceSchema.parse(error.provenance)).toMatchObject({
      sourceKind: 'prototype_blocked',
      actionability: 'non_actionable',
      sourceRoute: 'POST /api/portfolio/scenarios/:id/simulate',
      isFinanciallyActionable: false,
      quarantineReason: 'prototype_financial_output_blocked',
      warnings: ['Prototype financial output route is disabled.'],
    });
  });

  it('keeps static template provenance non-actionable without quarantine metadata', () => {
    const provenance = makeStaticTemplateProvenance('GET /api/portfolio/metrics');

    expect(FinancialProvenanceSchema.parse(provenance)).toMatchObject({
      sourceKind: 'static_template',
      actionability: 'non_actionable',
      sourceRoute: 'GET /api/portfolio/metrics',
      isFinanciallyActionable: false,
      warnings: ['Static template values are not computed from fund data.'],
    });
    expect(provenance).not.toHaveProperty('quarantineReason');
  });

  it('marks prototype provenance with the required quarantine reason', () => {
    const provenance = makePrototypeBlockedProvenance(
      'POST /api/portfolio/reserves/optimize'
    );

    expect(FinancialProvenanceSchema.parse(provenance)).toMatchObject({
      sourceKind: 'prototype_blocked',
      actionability: 'non_actionable',
      sourceRoute: 'POST /api/portfolio/reserves/optimize',
      isFinanciallyActionable: false,
      quarantineReason: 'prototype_financial_output_blocked',
    });
  });
});
