import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import Decimal from 'decimal.js';
import '../../../shared/lib/decimal-config';
import corpus from '../../../docs/internal-economics-v2.truth-cases.json';

const MoneyString = z.string().regex(/^-?\d+\.\d{6}$/);
const _RatioString = z.string().regex(/^-?\d+\.\d{12}$/);

const CarryAllocation = z.object({
  total: MoneyString,
  gpShare: MoneyString,
  lpShare: MoneyString,
});

const TierAllocations = z.record(z.string(), z.union([MoneyString, CarryAllocation]));

const PartnerDistributions = z.record(z.string(), z.record(z.string(), MoneyString));

const CashEquation = z.object({
  openingCash: MoneyString,
  contributions: MoneyString,
  deployments: MoneyString,
  realizations: MoneyString,
  distributions: MoneyString,
  endingCash: MoneyString,
});

const LaneExpected = z.object({
  tierAllocations: TierAllocations,
  distributions: PartnerDistributions,
  cashEquation: CashEquation,
});

const SuccessExpected = z.object({
  ok: z.literal(true),
  dealByDeal: LaneExpected,
  wholeFund: LaneExpected,
});

const RefusalExpected = z.object({
  ok: z.literal(false),
  refusalCode: z.string(),
});

const TruthCase = z.object({
  id: z.string(),
  description: z.string(),
  tierComposition: z.array(z.string()),
  calculationNotes: z.string(),
  input: z.object({
    contractVersion: z.literal('internal-economics-composite/2.0.0').or(z.string()),
    currency: z.string(),
    fundEstablishmentDate: z.string(),
    investmentPeriodEndDate: z.string(),
    fundTermDate: z.string(),
    calculationDate: z.string(),
    cutoverInstant: z.string(),
    roundingMode: z.string(),
    selectedLane: z.enum(['deal_by_deal', 'whole_fund']),
    gpCashPreferredReturnTreatment: z.enum(['pari_passu', 'excluded']),
    partners: z.array(z.record(z.string(), z.unknown())),
    waterfallPolicy: z.array(z.record(z.string(), z.unknown())),
    events: z.array(z.record(z.string(), z.unknown())),
  }),
  expected: z.discriminatedUnion('ok', [SuccessExpected, RefusalExpected]),
});

const CorpusSchema = z.object({
  header: z.string(),
  classification: z.string(),
  productTruth: z.literal(true),
  oracle: z.string(),
  methodologyVersion: z.string(),
  decimal: z.object({
    precision: z.number(),
    boundaryPrecision: z.number(),
    rounding: z.literal('ROUND_HALF_UP'),
    moneyScale: z.literal(6),
    ratioScale: z.literal(12),
  }),
  cases: z.array(TruthCase),
});

describe('V2 truth corpus adapter', () => {
  it('validates corpus format against standalone Zod schema', () => {
    const result = CorpusSchema.safeParse(corpus);
    if (!result.success) {
      throw new Error(
        `Corpus schema validation failed:\n${result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n')}`
      );
    }
    expect(result.success).toBe(true);
  });

  it('has unique case IDs', () => {
    const ids = corpus.cases.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has at least 8 cases covering the coverage floor', () => {
    expect(corpus.cases.length).toBeGreaterThanOrEqual(8);
  });

  it('includes both rateMode variants', () => {
    const policies = corpus.cases.flatMap((c) => c.input.waterfallPolicy);
    const modes = policies
      .filter(
        (p): p is Record<string, unknown> & { rateMode: string } =>
          typeof (p as Record<string, unknown>).rateMode === 'string'
      )
      .map((p) => p.rateMode);
    expect(modes).toContain('simple');
    expect(modes).toContain('effective_annual_compounded');
  });

  it('includes refusal cases', () => {
    const refusals = corpus.cases.filter((c) => !c.expected.ok);
    expect(refusals.length).toBeGreaterThanOrEqual(2);
  });

  describe('arithmetic conservation (success cases)', () => {
    const successCases = corpus.cases.filter(
      (c): c is (typeof corpus.cases)[number] & { expected: { ok: true } } => c.expected.ok === true
    );

    for (const tc of successCases) {
      for (const lane of ['dealByDeal', 'wholeFund'] as const) {
        it(`${tc.id} ${lane}: cash equation balances`, () => {
          const eq = (tc.expected as Record<string, Record<string, Record<string, string>>>)[lane]
            .cashEquation;
          const opening = new Decimal(eq.openingCash);
          const contribs = new Decimal(eq.contributions);
          const deploys = new Decimal(eq.deployments);
          const reals = new Decimal(eq.realizations);
          const dists = new Decimal(eq.distributions);
          const ending = new Decimal(eq.endingCash);

          const computed = opening.plus(contribs).minus(deploys).plus(reals).minus(dists);
          expect(computed.toFixed(6)).toBe(ending.toFixed(6));
        });

        it(`${tc.id} ${lane}: distribution totals sum to distributions in cash equation`, () => {
          const laneData = (tc.expected as Record<string, Record<string, unknown>>)[lane] as {
            distributions: Record<string, Record<string, string>>;
            cashEquation: Record<string, string>;
          };
          const partnerDists = laneData.distributions;
          const totalFromPartners = Object.values(partnerDists).reduce(
            (sum, partner) => sum.plus(new Decimal(partner.total)),
            new Decimal(0)
          );
          expect(totalFromPartners.toFixed(6)).toBe(laneData.cashEquation.distributions);
        });

        it(`${tc.id} ${lane}: per-partner component sums equal partner totals`, () => {
          const laneData = (tc.expected as Record<string, Record<string, unknown>>)[lane] as {
            distributions: Record<string, Record<string, string>>;
          };
          for (const [partnerId, dist] of Object.entries(laneData.distributions)) {
            const components = Object.entries(dist)
              .filter(([key]) => key !== 'total')
              .reduce((sum, [, val]) => sum.plus(new Decimal(val)), new Decimal(0));
            expect(components.toFixed(6), `${partnerId} component sum`).toBe(dist.total);
          }
        });
      }
    }
  });
});
