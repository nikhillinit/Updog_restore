import { describe, expect, it } from 'vitest';

import { FinancialFactsCashFlowSeriesSchema } from '../../../shared/contracts/financial-facts-snapshot-v1.contract';
import { FundDraftWriteV1Schema } from '../../../shared/contracts/fund-draft-write-v1.contract';

const MINIMAL_FUND_DRAFT = { fundName: 'Minimal Fund' } as const;
const RESERVED_FACILITY_FIELDS = ['creditFacility', 'lineOfCredit', 'subscriptionLine'] as const;

describe('Task 16.3 credit-facility source reachability', () => {
  it('accepts a minimal fund draft and rejects every reserved facility field', () => {
    expect(FundDraftWriteV1Schema.parse(MINIMAL_FUND_DRAFT)).toEqual(MINIMAL_FUND_DRAFT);

    for (const field of RESERVED_FACILITY_FIELDS) {
      const result = FundDraftWriteV1Schema.safeParse({
        ...MINIMAL_FUND_DRAFT,
        [field]: { enabled: true },
      });

      expect(result.success).toBe(false);
      if (result.success) continue;

      expect(result.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'unrecognized_keys',
            keys: [field],
          }),
        ])
      );
    }
  });

  it('excludes facility draw and repayment events from accepted financial facts', () => {
    const acceptedEventTypes =
      FinancialFactsCashFlowSeriesSchema.shape.series.element.shape.eventType.options;
    const facilityEvents = acceptedEventTypes.filter((eventType) =>
      /facility.*(?:draw|repayment)|(?:draw|repayment).*facility/i.test(eventType)
    );

    expect(facilityEvents).toEqual([]);
  });
});
