import { describe, expect, it } from 'vitest';

import { waterfallTypeEnum as ModelingWizardWaterfallTypeSchema } from '@/schemas/modeling-wizard.schemas';
import { FundDraftWriteV1Schema } from '@shared/contracts/fund-draft-write-v1.contract';
import { WaterfallTypeSchema as PublicWaterfallTypeSchema } from '@shared/types/forbidden-features';

describe('public waterfall vocabulary boundary', () => {
  it('restores European as a distinct standalone public vocabulary value', () => {
    expect(PublicWaterfallTypeSchema.parse('american')).toBe('american');
    expect(PublicWaterfallTypeSchema.parse('european')).toBe('european');
  });

  it('keeps European out of live wizard and draft contracts', () => {
    const draftWaterfallType = FundDraftWriteV1Schema.shape.waterfallType.unwrap();

    expect(ModelingWizardWaterfallTypeSchema.parse('american')).toBe('american');
    expect(draftWaterfallType.parse('american')).toBe('american');
    expect(() => ModelingWizardWaterfallTypeSchema.parse('european')).toThrow();
    expect(() => draftWaterfallType.parse('european')).toThrow();
  });
});
