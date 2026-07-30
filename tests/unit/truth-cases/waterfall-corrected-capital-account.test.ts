import { Decimal } from '@shared/lib/decimal-config';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import correctedFixture from '../../../docs/waterfall-corrected-capital-account.truth-cases.json';
import legacyFixture from '../../../docs/waterfall-american-ledger.legacy-characterization.json';

const moneySchema = z.string().regex(/^(0|[1-9]\d*)\.\d{6}$/);
const carryRatioSchema = z.string().regex(/^(0|1)\.\d{12}$/);

const sourceInputSchema = z
  .object({
    config: z.object({ carryPct: z.number().min(0).max(1) }).strict(),
    contributions: z
      .array(
        z.object({ quarter: z.number().int().positive(), amount: z.number().positive() }).strict()
      )
      .min(1),
    exits: z
      .array(
        z
          .object({
            quarter: z.number().int().positive(),
            grossProceeds: z.number().nonnegative(),
          })
          .strict()
      )
      .min(1),
  })
  .strict();

const rowSchema = z
  .object({
    quarter: z.number().int().positive(),
    openingUnreturnedCapital: moneySchema,
    capitalCalls: moneySchema,
    grossProceeds: moneySchema,
    returnOfCapital: moneySchema,
    lpResidual: moneySchema,
    gpCarry: moneySchema,
    endingUnreturnedCapital: moneySchema,
  })
  .strict();

const totalsSchema = z
  .object({
    openingUnreturnedCapital: moneySchema,
    paidIn: moneySchema,
    grossProceeds: moneySchema,
    returnOfCapital: moneySchema,
    lpResidual: moneySchema,
    gpCarry: moneySchema,
    endingUnreturnedCapital: moneySchema,
    lpDistributions: moneySchema,
  })
  .strict();

const correctedCaseSchema = z
  .object({
    id: z.enum(['CORRECTED-LEGACY-04', 'CORRECTED-LEGACY-05']),
    sourceLegacyCaseId: z.enum(['LEGACY-04', 'LEGACY-05']),
    description: z.string().min(1),
    canonicalCarryRatio: carryRatioSchema,
    input: sourceInputSchema,
    expected: z.object({ rows: z.array(rowSchema).min(1), totals: totalsSchema }).strict(),
  })
  .strict();

const fixtureSchema = z
  .object({
    header: z.literal('CORRECTED CAPITAL-ACCOUNT PRODUCT TRUTH — FUTURE ENGINE ORACLE'),
    classification: z.literal('corrected_product_truth'),
    productTruth: z.literal(true),
    oracle: z.literal('future_decimal_no_hurdle_engine'),
    decimal: z
      .object({
        precision: z.literal(28),
        rounding: z.literal('ROUND_HALF_UP'),
        moneyScale: z.literal(6),
        carryRatioScale: z.literal(12),
      })
      .strict(),
    cases: z.array(correctedCaseSchema).length(2),
  })
  .strict();

type CorrectedCase = z.infer<typeof correctedCaseSchema>;
type CorrectedRow = z.infer<typeof rowSchema>;

function sum(values: Decimal[]): Decimal {
  return values.reduce((total, value) => total.plus(value), new Decimal(0));
}

function replayCorrectedNoHurdle(testCase: CorrectedCase): {
  rows: CorrectedRow[];
  totals: z.infer<typeof totalsSchema>;
} {
  const carryRatio = new Decimal(testCase.canonicalCarryRatio);
  const finalQuarter = Math.max(
    ...testCase.input.contributions.map(({ quarter }) => quarter),
    ...testCase.input.exits.map(({ quarter }) => quarter)
  );
  let unreturnedCapital = new Decimal(0);
  const rows: CorrectedRow[] = [];

  for (let quarter = 1; quarter <= finalQuarter; quarter += 1) {
    const openingUnreturnedCapital = unreturnedCapital;
    const capitalCalls = sum(
      testCase.input.contributions
        .filter((contribution) => contribution.quarter === quarter)
        .map((contribution) => new Decimal(contribution.amount))
    );
    const grossProceeds = sum(
      testCase.input.exits
        .filter((exit) => exit.quarter === quarter)
        .map((exit) => new Decimal(exit.grossProceeds))
    );

    unreturnedCapital = unreturnedCapital.plus(capitalCalls);
    const returnOfCapital = Decimal.min(unreturnedCapital, grossProceeds);
    const residual = grossProceeds.minus(returnOfCapital);
    const gpCarry = residual.mul(carryRatio);
    const lpResidual = residual.minus(gpCarry);
    unreturnedCapital = unreturnedCapital.minus(returnOfCapital);

    rows.push({
      quarter,
      openingUnreturnedCapital: openingUnreturnedCapital.toFixed(6),
      capitalCalls: capitalCalls.toFixed(6),
      grossProceeds: grossProceeds.toFixed(6),
      returnOfCapital: returnOfCapital.toFixed(6),
      lpResidual: lpResidual.toFixed(6),
      gpCarry: gpCarry.toFixed(6),
      endingUnreturnedCapital: unreturnedCapital.toFixed(6),
    });
  }

  const paidIn = sum(rows.map((row) => new Decimal(row.capitalCalls)));
  const grossProceeds = sum(rows.map((row) => new Decimal(row.grossProceeds)));
  const returnOfCapital = sum(rows.map((row) => new Decimal(row.returnOfCapital)));
  const lpResidual = sum(rows.map((row) => new Decimal(row.lpResidual)));
  const gpCarry = sum(rows.map((row) => new Decimal(row.gpCarry)));

  return {
    rows,
    totals: {
      openingUnreturnedCapital: '0.000000',
      paidIn: paidIn.toFixed(6),
      grossProceeds: grossProceeds.toFixed(6),
      returnOfCapital: returnOfCapital.toFixed(6),
      lpResidual: lpResidual.toFixed(6),
      gpCarry: gpCarry.toFixed(6),
      endingUnreturnedCapital: unreturnedCapital.toFixed(6),
      lpDistributions: returnOfCapital.plus(lpResidual).toFixed(6),
    },
  };
}

describe('corrected capital-account product truth', () => {
  const fixture = fixtureSchema.parse(correctedFixture);
  const legacyCases = legacyFixture.cases.filter(
    ({ id }) => id === 'LEGACY-04' || id === 'LEGACY-05'
  );

  it('labels corrected semantics as product truth and a future engine oracle', () => {
    expect(fixture.header).toBe('CORRECTED CAPITAL-ACCOUNT PRODUCT TRUTH — FUTURE ENGINE ORACLE');
    expect(fixture.classification).toBe('corrected_product_truth');
    expect(fixture.productTruth).toBe(true);
    expect(fixture.oracle).toBe('future_decimal_no_hurdle_engine');
    expect(fixture.decimal).toEqual({
      precision: 28,
      rounding: 'ROUND_HALF_UP',
      moneyScale: 6,
      carryRatioScale: 12,
    });
  });

  it('rejects unknown keys at top-level and nested account-row boundaries', () => {
    expect(fixtureSchema.safeParse({ ...fixture, unexpected: true }).success).toBe(false);
    const firstCase = fixture.cases[0]!;
    const firstRow = firstCase.expected.rows[0]!;
    const malformed = {
      ...fixture,
      cases: [
        {
          ...firstCase,
          expected: {
            ...firstCase.expected,
            rows: [{ ...firstRow, unexpected: 'not allowed' }, ...firstCase.expected.rows.slice(1)],
          },
        },
        fixture.cases[1],
      ],
    };
    expect(fixtureSchema.safeParse(malformed).success).toBe(false);
  });

  it('replays the exact LEGACY-04 and LEGACY-05 source inputs', () => {
    expect(fixture.cases.map(({ sourceLegacyCaseId }) => sourceLegacyCaseId)).toEqual([
      'LEGACY-04',
      'LEGACY-05',
    ]);
    fixture.cases.forEach((testCase) => {
      const legacyCase = legacyCases.find(({ id }) => id === testCase.sourceLegacyCaseId);
      expect(legacyCase).toBeDefined();
      expect(testCase.input).toEqual(legacyCase?.input);
      expect(testCase.canonicalCarryRatio).toBe(
        new Decimal(testCase.input.config.carryPct).toFixed(12)
      );
    });
  });

  fixture.cases.forEach((testCase) => {
    it(`${testCase.id}: pins exact corrected rows, totals, and conservation`, () => {
      const replay = replayCorrectedNoHurdle(testCase);

      expect(replay.rows).toEqual(testCase.expected.rows);
      expect(replay.totals).toEqual(testCase.expected.totals);

      replay.rows.forEach((row) => {
        expect(
          new Decimal(row.openingUnreturnedCapital)
            .plus(row.capitalCalls)
            .minus(row.returnOfCapital)
            .toFixed(6)
        ).toBe(row.endingUnreturnedCapital);
        expect(
          new Decimal(row.returnOfCapital).plus(row.lpResidual).plus(row.gpCarry).toFixed(6)
        ).toBe(row.grossProceeds);
      });

      expect(
        new Decimal(replay.totals.openingUnreturnedCapital)
          .plus(replay.totals.paidIn)
          .minus(replay.totals.returnOfCapital)
          .toFixed(6)
      ).toBe(replay.totals.endingUnreturnedCapital);
      expect(
        new Decimal(replay.totals.returnOfCapital)
          .plus(replay.totals.lpResidual)
          .plus(replay.totals.gpCarry)
          .toFixed(6)
      ).toBe(replay.totals.grossProceeds);
      expect(replay.totals).not.toHaveProperty('tvpi');
    });
  });

  it('pins LEGACY-04 Q4 to full return of capital with zero carry', () => {
    const correctedLegacy04 = fixture.cases[0]!;
    expect(correctedLegacy04.expected.rows[3]).toMatchObject({
      quarter: 4,
      returnOfCapital: '100.000000',
      gpCarry: '0.000000',
      endingUnreturnedCapital: '0.000000',
    });
  });
});
