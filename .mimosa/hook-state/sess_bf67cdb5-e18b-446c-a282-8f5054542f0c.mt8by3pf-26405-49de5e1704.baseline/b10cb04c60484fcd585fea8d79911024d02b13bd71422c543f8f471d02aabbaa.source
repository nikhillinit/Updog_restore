import { describe, expect, it } from 'vitest';
import { dealPipelineValidationSchemas } from '../../../server/routes/deal-pipeline';

describe('deal pipeline taxonomy validation', () => {
  it('rejects create requests with non-canonical company sectors', () => {
    const result = dealPipelineValidationSchemas.createDeal.safeParse({
      companyName: 'Taxonomy Drift Co',
      sector: 'AI',
      stage: 'Seed',
      sourceType: 'Referral',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: ['sector'] })])
      );
    }
  });

  it('rejects update requests with non-display company stages', () => {
    const result = dealPipelineValidationSchemas.updateDeal.safeParse({ stage: 'series_a' });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: ['stage'] })])
      );
    }
  });

  it('rejects confirmed imports with rows outside the shared taxonomy', () => {
    const result = dealPipelineValidationSchemas.importConfirm.safeParse({
      rows: [
        {
          companyName: 'Imported Drift Co',
          sector: 'Unmapped Sector',
          stage: 'Seed',
          sourceType: 'Referral',
        },
      ],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: ['rows', 0, 'sector'] })])
      );
    }
  });
});
