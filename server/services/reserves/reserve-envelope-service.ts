import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '../../db';
import { fundConfigs, funds, investments } from '../../../shared/schema';
import { canonicalSha256 } from '../../../shared/lib/canonical-hash';
import Decimal from '../../../shared/lib/decimal-config';
import {
  ReserveEnvelopeV1Schema,
  type ReserveEnvelopeComponent,
  type ReserveEnvelopeComponentStatus,
  type ReserveEnvelopeV1,
} from '../../../shared/contracts/reserve-envelope-v1.contract';

export const DEFAULT_FUND_LIFE_YEARS = 10;

const BuildInputSchema = z
  .object({
    fundId: z.number().int().positive(),
    asOfDate: z.string().date(),
  })
  .strict();

const ConfigEnvelopeShapeSchema = z
  .object({
    fundLife: z.number().positive().optional(),
    expenses: z
      .array(
        z
          .object({
            monthlyAmount: z.number(),
            startMonth: z.number(),
            endMonth: z.number().optional(),
          })
          .passthrough()
      )
      .optional(),
    recyclingEnabled: z.boolean().optional(),
    recyclingCap: z.number().optional(),
  })
  .passthrough();

export interface ReserveEnvelopeFundSource {
  sizeDollars: string | number;
  deployedCapitalDollars: string | number | null;
  managementFeeRate: string | number;
  baseCurrency: string;
}

export interface ReserveEnvelopeInvestmentSource {
  amountDollars: string | number;
}

export interface ReserveEnvelopeExpenseSource {
  monthlyAmountDollars: number;
  startMonth: number;
  endMonth: number | null;
}

export interface ReserveEnvelopeConfigSource {
  fundLifeYears: number | null;
  expenses: readonly ReserveEnvelopeExpenseSource[] | null;
  recyclingEnabled: boolean | null;
  recyclingCapDollars: number | null;
}

export interface ReserveEnvelopeSources {
  fund: ReserveEnvelopeFundSource;
  investments: readonly ReserveEnvelopeInvestmentSource[];
  config: ReserveEnvelopeConfigSource | null;
}

function dollarsToCents(value: Decimal): number {
  return value.times(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
}

function component(
  amountCents: number,
  status: ReserveEnvelopeComponentStatus,
  source: string,
  reason: string | null
): ReserveEnvelopeComponent {
  return { amountCents, status, source, reason };
}

export function buildReserveEnvelopeFromSources(input: {
  fundId: number;
  asOfDate: string;
  sources: ReserveEnvelopeSources;
}): ReserveEnvelopeV1 {
  const { fundId, asOfDate } = BuildInputSchema.parse({
    fundId: input.fundId,
    asOfDate: input.asOfDate,
  });
  const { fund, investments: investmentRows, config } = input.sources;
  const baseCurrency = fund.baseCurrency;

  const committed = new Decimal(fund.sizeDollars);
  const committedCents = dollarsToCents(committed);
  const committedCapital = component(committedCents, 'observed', 'funds.size', null);

  // Deployed capital (outflow).
  let deployedCapital: ReserveEnvelopeComponent;
  if (investmentRows.length > 0) {
    const deployed = investmentRows.reduce(
      (sum, row) => sum.plus(new Decimal(row.amountDollars)),
      new Decimal(0)
    );
    deployedCapital = component(
      -dollarsToCents(deployed),
      'derived',
      'sum(investments.amount)',
      'Deployed capital summed from investment rows'
    );
  } else if (fund.deployedCapitalDollars != null) {
    deployedCapital = component(
      -dollarsToCents(new Decimal(fund.deployedCapitalDollars)),
      'observed',
      'funds.deployed_capital',
      null
    );
  } else {
    deployedCapital = component(
      0,
      'defaulted',
      'system_default_deployed',
      'No investment rows or deployed_capital; assumes 0 deployed'
    );
  }

  // Management fees (outflow): flat committed-capital basis over fund life.
  const feeRate = new Decimal(fund.managementFeeRate);
  const feeYears = config?.fundLifeYears ?? DEFAULT_FUND_LIFE_YEARS;
  const feesDollars = committed.times(feeRate).times(feeYears);
  const feesDefaulted = config?.fundLifeYears == null;
  const managementFees = component(
    -dollarsToCents(feesDollars),
    feesDefaulted ? 'defaulted' : 'derived',
    'funds.management_fee x funds.size x fundConfigs.config.fundLife',
    feesDefaulted
      ? `fundLife absent; assumes ${DEFAULT_FUND_LIFE_YEARS}-year fund life. Flat committed-capital basis; step-downs and called-capital basis are deferred (ADR-056 NET-NEW sophistication)`
      : 'Lifetime management fee = rate x committed x fundLife years. Flat committed-capital basis; step-downs and called-capital basis are deferred (ADR-056 NET-NEW sophistication)'
  );

  // Fund expenses (outflow).
  let fundExpenses: ReserveEnvelopeComponent;
  if (config?.expenses && config.expenses.length > 0) {
    const fundLifeMonths = feeYears * 12;
    const expensesDollars = config.expenses.reduce((sum, expense) => {
      const endMonth = expense.endMonth ?? fundLifeMonths;
      const activeMonths = Math.max(0, endMonth - expense.startMonth);
      return sum.plus(new Decimal(expense.monthlyAmountDollars).times(activeMonths));
    }, new Decimal(0));
    fundExpenses = component(
      -dollarsToCents(expensesDollars),
      'derived',
      'fundConfigs.config.expenses',
      'Sum of configured monthly fund expenses over their active months'
    );
  } else {
    fundExpenses = component(
      0,
      'unavailable',
      'fundConfigs.config.expenses',
      'No fund expense schedule persisted; expense drag not modeled'
    );
  }

  // Exit recycling (inflow): configured cap as an upper bound.
  let exitRecycling: ReserveEnvelopeComponent;
  if (
    config?.recyclingEnabled &&
    config.recyclingCapDollars != null &&
    config.recyclingCapDollars > 0
  ) {
    exitRecycling = component(
      dollarsToCents(new Decimal(config.recyclingCapDollars)),
      'derived',
      'fundConfigs.config.recyclingCap',
      'Recycling headroom capped at configured recyclingCap; realized exit proceeds not yet modeled (upper bound)'
    );
  } else {
    exitRecycling = component(
      0,
      'unavailable',
      'fundConfigs.config.recyclingCap',
      'Recycling not enabled or no cap configured; exit proceeds for recycling not persisted'
    );
  }

  const components = {
    committedCapital,
    deployedCapital,
    managementFees,
    fundExpenses,
    exitRecycling,
  };

  // Hard blocks.
  let blocked = false;
  let blockReason: string | null = null;
  if (baseCurrency !== 'USD') {
    blocked = true;
    blockReason = `Non-USD base currency (${baseCurrency}); multi-currency reserve envelope is not supported`;
  } else if (committedCents <= 0) {
    blocked = true;
    blockReason = 'Committed capital (funds.size) is not positive';
  }

  const signedSum = Object.values(components).reduce(
    (sum, part) => sum + BigInt(part.amountCents),
    0n
  );
  const availableReservesCents = blocked ? 0 : Number(signedSum < 0n ? 0n : signedSum);

  const trustedForActivation =
    !blocked &&
    Object.values(components).every(
      (part) => part.status === 'observed' || part.status === 'derived'
    );

  const inputHash = canonicalSha256({
    contractVersion: 'reserve-envelope-v1',
    fundId,
    asOfDate,
    baseCurrency,
    committedDollars: committed.toString(),
    deployed: {
      hasInvestmentRows: investmentRows.length > 0,
      investmentAmounts: investmentRows.map((row) => new Decimal(row.amountDollars).toString()),
      deployedCapitalDollars:
        fund.deployedCapitalDollars == null
          ? null
          : new Decimal(fund.deployedCapitalDollars).toString(),
    },
    managementFeeRate: feeRate.toString(),
    feeYears,
    feeYearsDefaulted: feesDefaulted,
    expenses:
      config?.expenses?.map((expense) => ({
        monthlyAmountDollars: new Decimal(expense.monthlyAmountDollars).toString(),
        startMonth: expense.startMonth,
        endMonth: expense.endMonth,
      })) ?? null,
    recycling: {
      enabled: config?.recyclingEnabled ?? null,
      capDollars:
        config?.recyclingCapDollars == null
          ? null
          : new Decimal(config.recyclingCapDollars).toString(),
    },
  });

  return ReserveEnvelopeV1Schema.parse({
    contractVersion: 'reserve-envelope-v1',
    fundId,
    asOfDate,
    baseCurrency,
    availableReservesCents,
    components,
    trustedForActivation,
    blocked,
    blockReason,
    inputHash,
  });
}

export async function loadReserveEnvelopeSources(input: {
  fundId: number;
  asOfDate: string;
}): Promise<ReserveEnvelopeSources> {
  const { fundId } = BuildInputSchema.parse(input);
  const [fundRows, investmentRows, configRows] = await Promise.all([
    db
      .select({
        sizeDollars: funds.size,
        deployedCapitalDollars: funds.deployedCapital,
        managementFeeRate: funds.managementFee,
        baseCurrency: funds.baseCurrency,
      })
      .from(funds)
      .where(eq(funds.id, fundId))
      .limit(1),
    db
      .select({ amountDollars: investments.amount })
      .from(investments)
      .where(eq(investments.fundId, fundId)),
    db
      .select({ config: fundConfigs.config })
      .from(fundConfigs)
      .where(and(eq(fundConfigs.fundId, fundId), eq(fundConfigs.isPublished, true)))
      .limit(1),
  ]);

  const fund = fundRows[0];
  if (!fund) {
    throw new Error(`Fund ${fundId} was not found`);
  }

  const parsedConfig = configRows[0]
    ? ConfigEnvelopeShapeSchema.safeParse(configRows[0].config)
    : null;
  const cfg = parsedConfig?.success ? parsedConfig.data : null;
  const config: ReserveEnvelopeConfigSource | null = cfg
    ? {
        fundLifeYears: cfg.fundLife ?? null,
        expenses:
          cfg.expenses?.map((expense) => ({
            monthlyAmountDollars: expense.monthlyAmount,
            startMonth: expense.startMonth,
            endMonth: expense.endMonth ?? null,
          })) ?? null,
        recyclingEnabled: cfg.recyclingEnabled ?? null,
        recyclingCapDollars: cfg.recyclingCap ?? null,
      }
    : null;

  return {
    fund: {
      sizeDollars: fund.sizeDollars,
      deployedCapitalDollars: fund.deployedCapitalDollars,
      managementFeeRate: fund.managementFeeRate,
      baseCurrency: fund.baseCurrency,
    },
    investments: investmentRows,
    config,
  };
}

export async function buildReserveEnvelope(input: {
  fundId: number;
  asOfDate: string;
}): Promise<ReserveEnvelopeV1> {
  const parsed = BuildInputSchema.parse(input);
  const sources = await loadReserveEnvelopeSources(parsed);
  return buildReserveEnvelopeFromSources({ ...parsed, sources });
}
