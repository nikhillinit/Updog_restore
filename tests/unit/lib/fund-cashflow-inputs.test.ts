import { describe, expect, it } from 'vitest';
import { LiquidityEngine } from '@/core/LiquidityEngine';
import { buildFundCashFlowInputs } from '@/lib/cashflow/fund-cashflow-inputs';
import {
  CashPositionSchema,
  CashTransactionSchema,
  RecurringExpenseSchema,
} from '@shared/schemas/cashflow-schema';

const SIZE = 15_320_000;
const fund = {
  id: 2,
  size: '15320000.00',
  managementFee: '0.0200',
  vintageYear: 2024,
  establishmentDate: '2024-03-01',
};
const investments = [
  {
    id: 1,
    companyId: 10,
    investmentDate: '2024-04-15T00:00:00.000Z',
    amount: '500000.00',
    round: 'Seed',
  },
  {
    id: 2,
    companyId: 11,
    investmentDate: '2025-02-01T00:00:00.000Z',
    amount: '750000.00',
    round: 'Series A',
  },
  {
    id: 3,
    companyId: 10,
    investmentDate: '2026-06-30T00:00:00.000Z',
    amount: '250000.00',
    round: 'Seed Follow-on',
  },
];
// Wizard months are one-based: startMonth 1 = first fund month.
const expenses = [{ id: 'legal', category: 'legal', monthlyAmount: 5_000, startMonth: 1 }];
const asOf = new Date('2026-09-15T12:00:00.000Z');
const BUFFER = 500_000;

// 10-year life, 5-year period from 2024-03: 29 deployment months remain after 2026-09.
const REMAINING_INVESTABLE = SIZE - SIZE * 0.02 * 10 - 5_000 * 120 - 1_500_000;
const DEPLOY_MONTHS = 29;

function build(horizonMonths = 36) {
  return buildFundCashFlowInputs({
    fund,
    investments,
    asOf,
    horizonMonths,
    config: { expenses, cashBuffer: BUFFER },
  });
}

describe('buildFundCashFlowInputs', () => {
  it('matches the engine input schemas', () => {
    const inputs = build();
    expect(() => CashTransactionSchema.array().parse(inputs.transactions)).not.toThrow();
    expect(() => RecurringExpenseSchema.array().parse(inputs.recurringExpenses)).not.toThrow();
    expect(() => CashPositionSchema.parse(inputs.currentPosition)).not.toThrow();
  });

  it('funds every outflow with a normalized quarterly capital call plus the buffer', () => {
    const { transactions } = build();
    const calls = transactions.filter((tx) => tx.type === 'capital_call');
    const outflows = transactions.filter((tx) => tx.amount < 0);
    const total = (list: typeof transactions) => list.reduce((sum, tx) => sum + tx.amount, 0);

    expect(total(calls) + total(outflows)).toBeCloseTo(BUFFER, 4);
    expect(calls.every((tx) => tx.plannedDate.getUTCDate() === 1)).toBe(true);
    for (const tx of transactions) {
      if (tx.status === 'executed')
        expect(tx.plannedDate.getTime()).toBeLessThanOrEqual(asOf.getTime());
      else expect(tx.plannedDate.getTime()).toBeGreaterThan(asOf.getTime());
    }
  });

  it('deploys remaining investable capital evenly over the rest of the investment period', () => {
    const { transactions, currentPosition } = build();
    const planned = transactions.filter(
      (tx) => tx.type === 'investment' && tx.status === 'planned'
    );

    expect(planned).toHaveLength(DEPLOY_MONTHS);
    expect(planned.reduce((sum, tx) => sum - tx.amount, 0)).toBeCloseTo(REMAINING_INVESTABLE, 4);
    expect(currentPosition.dryPowder).toBe(REMAINING_INVESTABLE);
    expect(
      build(12).transactions.filter((tx) => tx.status === 'planned' && tx.type === 'investment')
    ).toHaveLength(12);
  });

  it('reports undrawn commitments, deployed cost and buffer-only cash', () => {
    const { transactions, currentPosition } = build();
    const called = transactions
      .filter((tx) => tx.type === 'capital_call' && tx.status === 'executed')
      .reduce((sum, tx) => sum + tx.amount, 0);

    expect(currentPosition.totalCommitted).toBeCloseTo(SIZE - called, 4);
    expect(currentPosition.totalDeployed).toBe(1_500_000);
    expect(currentPosition.totalCash).toBe(BUFFER);
    expect(transactions.find((tx) => tx.description === 'Seed Follow-on investment')?.type).toBe(
      'follow_on'
    );
    expect(transactions.find((tx) => tx.description === 'Series A investment')?.type).toBe(
      'investment'
    );
  });

  it('dates the call with the investment when an investment predates the fund start', () => {
    const early = {
      id: 9,
      companyId: 12,
      investmentDate: '2023-06-29T00:00:00.000Z',
      amount: '565000.00',
      round: 'Initial',
    };
    const { transactions } = buildFundCashFlowInputs({
      fund,
      investments: [...investments, early],
      asOf,
      config: { expenses, cashBuffer: BUFFER },
    });
    const calls = transactions.filter((tx) => tx.type === 'capital_call');
    const month = (tx: (typeof calls)[number]) => tx.plannedDate.toISOString().slice(0, 7);

    expect(month(calls[0]!)).toBe('2023-06');
    expect(calls[0]!.amount).toBeCloseTo(565_000, 4);
    // The buffer still rides with the first call after fund start (2024-03: fee + legal).
    expect(calls.find((tx) => month(tx) === '2024-03')?.amount).toBeCloseTo(
      76_600 + 5_000 + BUFFER,
      4
    );
  });

  it('keeps vehicle-funded rows out of the main fund cash model', () => {
    const spvRow = {
      id: 20,
      companyId: 30,
      investmentDate: '2025-07-14T00:00:00.000Z',
      amount: '500000.00',
      round: 'Initial Check',
      vehicleParticipationId: 3,
    };
    const { transactions, currentPosition } = buildFundCashFlowInputs({
      fund,
      investments: [...investments, spvRow],
      asOf,
      horizonMonths: 36,
      config: { expenses, cashBuffer: BUFFER },
    });

    expect(currentPosition.totalDeployed).toBe(1_500_000);
    expect(currentPosition.dryPowder).toBe(REMAINING_INVESTABLE);
    expect(transactions.some((tx) => tx.portfolioCompanyId === '30')).toBe(false);
  });

  it('schedules fixed-term expenses on one-based wizard months', () => {
    const fixedTerm = {
      id: 'audit',
      category: 'audit',
      monthlyAmount: 2_000,
      startMonth: 13,
      endMonth: 24,
    };
    const { transactions, currentPosition, recurringExpenses } = buildFundCashFlowInputs({
      fund,
      investments,
      asOf,
      horizonMonths: 36,
      config: { expenses: [fixedTerm], cashBuffer: BUFFER },
    });
    const audits = transactions.filter((tx) => tx.type === 'expense' && tx.category === 'audit');

    // Fund starts 2024-03, so month 13 is 2025-03 and month 24 is 2026-02.
    expect(audits.map((tx) => tx.plannedDate.toISOString().slice(0, 7))).toEqual([
      '2025-03',
      '2025-04',
      '2025-05',
      '2025-06',
      '2025-07',
      '2025-08',
      '2025-09',
      '2025-10',
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
    ]);
    expect(currentPosition.dryPowder).toBe(SIZE - SIZE * 0.02 * 10 - 2_000 * 12 - 1_500_000);
    expect(recurringExpenses[0]?.startDate.toISOString().slice(0, 7)).toBe('2025-03');
    expect(recurringExpenses[0]?.endDate?.toISOString().slice(0, 7)).toBe('2026-02');
    expect(recurringExpenses[0]?.isActive).toBe(false);
  });

  it('treats future-dated persisted investments as planned, not deployed', () => {
    const future = {
      id: 21,
      companyId: 31,
      investmentDate: '2026-12-01T00:00:00.000Z',
      amount: '400000.00',
      round: 'Series B',
    };
    const { transactions, currentPosition } = buildFundCashFlowInputs({
      fund,
      investments: [...investments, future],
      asOf,
      horizonMonths: 36,
      config: { expenses, cashBuffer: BUFFER },
    });
    const futureRow = transactions.find((tx) => tx.portfolioCompanyId === '31');
    const planned = transactions.filter(
      (tx) => tx.type === 'investment' && tx.status === 'planned'
    );

    expect(futureRow?.status).toBe('planned');
    expect(futureRow?.executedDate).toBeUndefined();
    expect(currentPosition.totalDeployed).toBe(1_500_000);
    expect(currentPosition.dryPowder).toBe(REMAINING_INVESTABLE - 400_000);
    // Known deal plus even pacing of the rest still deploys exactly what is left.
    expect(planned.reduce((sum, tx) => sum - tx.amount, 0)).toBeCloseTo(REMAINING_INVESTABLE, 4);
  });

  it('defaults the buffer to the engine minimum and runs through the engine', () => {
    const inputs = buildFundCashFlowInputs({ fund, investments, asOf, config: { expenses } });
    const engine = new LiquidityEngine('2', SIZE);

    expect(inputs.currentPosition.totalCash).toBe(engine.getMinimumCashBuffer());

    const upcoming = inputs.transactions.filter((tx) => tx.status === 'planned');
    const forecast = engine.generateLiquidityForecast(
      inputs.currentPosition,
      upcoming,
      inputs.recurringExpenses,
      12
    );
    const analysis = engine.analyzeCashFlows(inputs.transactions);

    expect(forecast.plannedCapitalCalls).toBeGreaterThan(0);
    expect(Number.isFinite(forecast.projectedCash)).toBe(true);
    expect(forecast.openingCash).toBeGreaterThanOrEqual(forecast.minimumCashBuffer);
    expect(analysis.byMonth.length).toBeGreaterThan(12);
    expect(Number.isFinite(analysis.summary.netCashFlow)).toBe(true);
  });
});
