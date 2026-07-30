import { describe, expect, it } from 'vitest';

import { Decimal } from '@shared/lib/decimal-config';
import {
  allocateIntegerCentsByExactEntitlements,
  processWaterfallRunForPresentation,
  roundUsdToIntegerCents,
  roundWaterfallEventForPresentation,
  Task163PresentationRoundingError,
} from './helpers/task163-presentation-rounding-oracle';

describe('Task 16.3 hierarchical presentation-rounding readiness contract', () => {
  it('converts USD to integer cents with Decimal HALF_UP semantics', () => {
    expect(roundUsdToIntegerCents(new Decimal('1.004999'))).toBe('100');
    expect(roundUsdToIntegerCents(new Decimal('1.005000'))).toBe('101');
  });

  it('canonicalizes signed zero without treating it as negative money', () => {
    expect(roundUsdToIntegerCents(new Decimal('-0'))).toBe('0');
    expect(allocateIntegerCentsByExactEntitlements(new Decimal('-0'), [new Decimal('-0')])).toEqual(
      ['0']
    );
  });

  it('allocates integer cents from exact entitlement units without recomputing weights', () => {
    expect(
      allocateIntegerCentsByExactEntitlements(
        new Decimal(4),
        ['1.4', '1.4', '1.2'].map((value) => new Decimal(value))
      )
    ).toEqual(['2', '1', '1']);
    expect(
      allocateIntegerCentsByExactEntitlements(
        new Decimal(2),
        ['0.2505', '1.2495'].map((value) => new Decimal(value))
      )
    ).toEqual(['1', '1']);
  });

  it('orders exact remainders descending with stable index ties', () => {
    expect(
      allocateIntegerCentsByExactEntitlements(
        new Decimal(1),
        ['0.5', '0.5'].map((value) => new Decimal(value))
      )
    ).toEqual(['1', '0']);
    expect(
      allocateIntegerCentsByExactEntitlements(
        new Decimal(1),
        ['0.4', '0.6'].map((value) => new Decimal(value))
      )
    ).toEqual(['0', '1']);
    expect(
      allocateIntegerCentsByExactEntitlements(
        new Decimal(1),
        ['0.49999999', '0.50000001'].map((value) => new Decimal(value))
      )
    ).toEqual(['0', '1']);
  });

  it('rounds priority stages before splitting residual cents', () => {
    expect(
      roundWaterfallEventForPresentation({
        totalUsd: new Decimal('1.045'),
        rocUsd: new Decimal('1.014'),
        preferredReturnUsd: new Decimal('0.014'),
        lpResidualUsd: new Decimal('0.0102'),
        gpCarryUsd: new Decimal('0.0068'),
      })
    ).toEqual({
      totalCents: '105',
      rocCents: '102',
      preferredReturnCents: '1',
      lpResidualCents: '1',
      gpCarryCents: '1',
    });

    expect(
      roundWaterfallEventForPresentation({
        totalUsd: new Decimal('0.0149'),
        rocUsd: new Decimal(0),
        preferredReturnUsd: new Decimal(0),
        lpResidualUsd: new Decimal('0.00894'),
        gpCarryUsd: new Decimal('0.00596'),
      })
    ).toEqual({
      totalCents: '1',
      rocCents: '0',
      preferredReturnCents: '0',
      lpResidualCents: '1',
      gpCarryCents: '0',
    });
  });

  it('distinguishes hierarchical rounding from forbidden flat allocation', () => {
    const event = {
      totalUsd: new Decimal('0.016'),
      rocUsd: new Decimal('0.004'),
      preferredReturnUsd: new Decimal('0.004'),
      lpResidualUsd: new Decimal('0.004'),
      gpCarryUsd: new Decimal('0.004'),
    };

    expect(roundWaterfallEventForPresentation(event)).toEqual({
      totalCents: '2',
      rocCents: '1',
      preferredReturnCents: '0',
      lpResidualCents: '1',
      gpCarryCents: '0',
    });
    expect(
      allocateIntegerCentsByExactEntitlements(
        new Decimal(2),
        [event.rocUsd, event.preferredReturnUsd, event.lpResidualUsd, event.gpCarryUsd].map(
          (amount) => amount.times(100)
        )
      )
    ).toEqual(['1', '1', '0', '0']);
  });

  it('validates raw and rounded whole-run conservation from hand-derived totals', () => {
    const result = processWaterfallRunForPresentation([
      {
        totalUsd: new Decimal('0.016'),
        rocUsd: new Decimal('0.004'),
        preferredReturnUsd: new Decimal('0.004'),
        lpResidualUsd: new Decimal('0.004'),
        gpCarryUsd: new Decimal('0.004'),
      },
      {
        totalUsd: new Decimal('1.045'),
        rocUsd: new Decimal('1.014'),
        preferredReturnUsd: new Decimal('0.014'),
        lpResidualUsd: new Decimal('0.0102'),
        gpCarryUsd: new Decimal('0.0068'),
      },
    ]);

    expect(result.fullPrecisionTotalsUsd).toEqual({
      totalUsd: '1.061',
      rocUsd: '1.018',
      preferredReturnUsd: '0.018',
      lpResidualUsd: '0.0142',
      gpCarryUsd: '0.0108',
    });
    expect(result.roundedTotalsCents).toEqual({
      totalCents: '107',
      rocCents: '103',
      preferredReturnCents: '1',
      lpResidualCents: '2',
      gpCarryCents: '1',
    });
  });

  it('publishes no local result when a later event fails validation', () => {
    let publishedResult: ReturnType<typeof processWaterfallRunForPresentation> | undefined;

    expect(() => {
      publishedResult = processWaterfallRunForPresentation([
        {
          totalUsd: new Decimal('0.016'),
          rocUsd: new Decimal('0.004'),
          preferredReturnUsd: new Decimal('0.004'),
          lpResidualUsd: new Decimal('0.004'),
          gpCarryUsd: new Decimal('0.004'),
        },
        {
          totalUsd: new Decimal('0.01'),
          rocUsd: new Decimal('-0.000000001'),
          preferredReturnUsd: new Decimal(0),
          lpResidualUsd: new Decimal('0.010000001'),
          gpCarryUsd: new Decimal(0),
        },
      ]);
    }).toThrowError(
      expect.objectContaining({
        code: 'INVALID_ENTITLEMENT',
      })
    );
    expect(publishedResult).toBeUndefined();
  });

  it('conserves integer cents across emitted run totals', () => {
    const events = [
      roundWaterfallEventForPresentation({
        totalUsd: new Decimal('1.045'),
        rocUsd: new Decimal('1.014'),
        preferredReturnUsd: new Decimal('0.014'),
        lpResidualUsd: new Decimal('0.0102'),
        gpCarryUsd: new Decimal('0.0068'),
      }),
      roundWaterfallEventForPresentation({
        totalUsd: new Decimal('0.0149'),
        rocUsd: new Decimal(0),
        preferredReturnUsd: new Decimal(0),
        lpResidualUsd: new Decimal('0.00894'),
        gpCarryUsd: new Decimal('0.00596'),
      }),
    ];

    expect(
      events
        .map((event) => new Decimal(event.totalCents))
        .reduce((total, cents) => total.plus(cents), new Decimal(0))
        .toFixed(0)
    ).toBe('106');
    expect(
      events
        .flatMap((event) => [
          event.rocCents,
          event.preferredReturnCents,
          event.lpResidualCents,
          event.gpCarryCents,
        ])
        .map((cents) => new Decimal(cents))
        .reduce((total, cents) => total.plus(cents), new Decimal(0))
        .toFixed(0)
    ).toBe('106');
  });

  it.each([
    {
      name: 'non-finite target',
      run: () => allocateIntegerCentsByExactEntitlements(new Decimal(Number.NaN), [new Decimal(0)]),
      code: 'INVALID_TARGET_CENTS',
    },
    {
      name: 'fractional target',
      run: () => allocateIntegerCentsByExactEntitlements(new Decimal('1.5'), [new Decimal('1.5')]),
      code: 'INVALID_TARGET_CENTS',
    },
    {
      name: 'negative target',
      run: () => allocateIntegerCentsByExactEntitlements(new Decimal(-1), [new Decimal(-1)]),
      code: 'INVALID_TARGET_CENTS',
    },
    {
      name: 'non-finite entitlement',
      run: () =>
        allocateIntegerCentsByExactEntitlements(new Decimal(1), [
          new Decimal(Number.POSITIVE_INFINITY),
        ]),
      code: 'INVALID_ENTITLEMENT',
    },
    {
      name: 'negative entitlement',
      run: () =>
        allocateIntegerCentsByExactEntitlements(new Decimal(1), [
          new Decimal('1.01'),
          new Decimal('-0.01'),
        ]),
      code: 'INVALID_ENTITLEMENT',
    },
    {
      name: 'tiny negative entitlement',
      run: () =>
        allocateIntegerCentsByExactEntitlements(new Decimal(0), [new Decimal('-0.000000001')]),
      code: 'INVALID_ENTITLEMENT',
    },
    {
      name: 'negative conservation residual',
      run: () =>
        allocateIntegerCentsByExactEntitlements(new Decimal(1), [new Decimal(1), new Decimal(1)]),
      code: 'NEGATIVE_LRM_SHORTFALL',
    },
  ])('fails closed with a typed code for $name', ({ run, code }) => {
    try {
      run();
      throw new Error('expected rounding failure');
    } catch (error) {
      expect(error).toBeInstanceOf(Task163PresentationRoundingError);
      expect((error as Task163PresentationRoundingError).code).toBe(code);
    }
  });

  it('fails closed when full-precision event entitlements do not conserve', () => {
    expect(() =>
      roundWaterfallEventForPresentation({
        totalUsd: new Decimal('1.00'),
        rocUsd: new Decimal('0.99'),
        preferredReturnUsd: new Decimal(0),
        lpResidualUsd: new Decimal(0),
        gpCarryUsd: new Decimal(0),
      })
    ).toThrowError(
      expect.objectContaining({
        code: 'FULL_PRECISION_CONSERVATION_FAILED',
      })
    );
  });

  it('rejects a tiny negative event component without epsilon clamping', () => {
    expect(() =>
      roundWaterfallEventForPresentation({
        totalUsd: new Decimal('0.01'),
        rocUsd: new Decimal('-0.000000001'),
        preferredReturnUsd: new Decimal(0),
        lpResidualUsd: new Decimal('0.010000001'),
        gpCarryUsd: new Decimal(0),
      })
    ).toThrowError(
      expect.objectContaining({
        code: 'INVALID_ENTITLEMENT',
      })
    );
  });
});
