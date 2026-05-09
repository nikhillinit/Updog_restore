/**
 * Contract tests for CashFlowEventCreateSchema (LP Reporting Phase 0.3).
 *
 * Asserts:
 *   - Round-trip parse for each of the 7 event types.
 *   - .strict() rejection of unknown top-level keys.
 *   - DecimalStringSchema accept/reject.
 *   - Discriminator enforcement: portfolio_investment / realized_proceeds
 *     require companyId; lp_capital_call / lp_distribution do not.
 *   - Enum coverage: all 7 eventType values, all 4 perspective values.
 *   - Money-field grep gate: the contract source contains no `z.number()`
 *     in money positions.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  CashFlowEventCreateSchema,
  CashFlowEventTypeSchema,
  CashFlowPerspectiveSchema,
  DecimalStringSchema,
  FundExpenseSchema,
  LpCapitalCallSchema,
  LpDistributionSchema,
  PortfolioInvestmentSchema,
  RealizedProceedsSchema,
  RecallableDistributionSchema,
  ReversalSchema,
} from '@shared/contracts/lp-reporting/cash-flow-event.contract';

const baseFields = {
  fundId: 1,
  amount: '1000000.000000',
  eventDate: '2026-05-08T12:00:00.000Z',
  perspective: 'fund_gross' as const,
};

describe('CashFlowEventCreateSchema -- round-trip parses for each event type', () => {
  it('lp_capital_call', () => {
    const parsed = CashFlowEventCreateSchema.parse({
      ...baseFields,
      eventType: 'lp_capital_call',
      perspective: 'lp_net',
      payload: { callNumber: 1 },
    });
    expect(parsed.eventType).toBe('lp_capital_call');
  });

  it('lp_distribution', () => {
    const parsed = CashFlowEventCreateSchema.parse({
      ...baseFields,
      eventType: 'lp_distribution',
      perspective: 'lp_net',
    });
    expect(parsed.eventType).toBe('lp_distribution');
  });

  it('portfolio_investment (companyId required)', () => {
    const parsed = CashFlowEventCreateSchema.parse({
      ...baseFields,
      eventType: 'portfolio_investment',
      perspective: 'company',
      companyId: 42,
      amount: '-500000.000000',
    });
    expect(parsed.eventType).toBe('portfolio_investment');
  });

  it('realized_proceeds (companyId required)', () => {
    const parsed = CashFlowEventCreateSchema.parse({
      ...baseFields,
      eventType: 'realized_proceeds',
      perspective: 'company',
      companyId: 42,
    });
    expect(parsed.eventType).toBe('realized_proceeds');
  });

  it('fund_expense (category required)', () => {
    const parsed = CashFlowEventCreateSchema.parse({
      ...baseFields,
      eventType: 'fund_expense',
      payload: { category: 'management_fee' },
    });
    expect(parsed.eventType).toBe('fund_expense');
  });

  it('recallable_distribution', () => {
    const parsed = CashFlowEventCreateSchema.parse({
      ...baseFields,
      eventType: 'recallable_distribution',
      perspective: 'lp_net',
    });
    expect(parsed.eventType).toBe('recallable_distribution');
  });

  it('reversal (reversalOfEventId required)', () => {
    const parsed = CashFlowEventCreateSchema.parse({
      ...baseFields,
      eventType: 'reversal',
      reversalOfEventId: 99,
    });
    expect(parsed.eventType).toBe('reversal');
  });
});

describe('Discriminator -- companyId requirement on portfolio_investment / realized_proceeds', () => {
  it('rejects portfolio_investment without companyId', () => {
    expect(() =>
      CashFlowEventCreateSchema.parse({
        ...baseFields,
        eventType: 'portfolio_investment',
        perspective: 'company',
      })
    ).toThrow();
  });

  it('rejects realized_proceeds without companyId', () => {
    expect(() =>
      CashFlowEventCreateSchema.parse({
        ...baseFields,
        eventType: 'realized_proceeds',
        perspective: 'company',
      })
    ).toThrow();
  });

  it('accepts lp_capital_call without companyId', () => {
    expect(() =>
      CashFlowEventCreateSchema.parse({
        ...baseFields,
        eventType: 'lp_capital_call',
        perspective: 'lp_net',
      })
    ).not.toThrow();
  });
});

describe('.strict() rejects unknown top-level keys', () => {
  it('LpCapitalCallSchema rejects unknown key', () => {
    expect(() =>
      LpCapitalCallSchema.parse({
        ...baseFields,
        eventType: 'lp_capital_call',
        perspective: 'lp_net',
        bogus: 'extra',
      })
    ).toThrow();
  });

  it('FundExpenseSchema rejects unknown key', () => {
    expect(() =>
      FundExpenseSchema.parse({
        ...baseFields,
        eventType: 'fund_expense',
        payload: { category: 'legal' },
        bogus: 'extra',
      })
    ).toThrow();
  });
});

describe('DecimalStringSchema accept/reject', () => {
  it.each(['1250000', '1250000.000000', '-50.5', '0', '0.000001'])('accepts %s', (s) => {
    expect(() => DecimalStringSchema.parse(s)).not.toThrow();
  });

  it.each(['1.2.3', 'abc', '', '1.0000001', '1,000', ' 1.0'])('rejects %s', (s) => {
    expect(() => DecimalStringSchema.parse(s)).toThrow();
  });
});

describe('Enum coverage', () => {
  it.each([
    'lp_capital_call',
    'lp_distribution',
    'fund_expense',
    'portfolio_investment',
    'realized_proceeds',
    'recallable_distribution',
    'reversal',
  ])('accepts CashFlowEventTypeSchema value %s', (v) => {
    expect(() => CashFlowEventTypeSchema.parse(v)).not.toThrow();
  });

  it('rejects an unknown event type', () => {
    expect(() => CashFlowEventTypeSchema.parse('unknown_event')).toThrow();
  });

  it.each(['lp_net', 'fund_gross', 'vehicle', 'company'])(
    'accepts CashFlowPerspectiveSchema value %s',
    (v) => {
      expect(() => CashFlowPerspectiveSchema.parse(v)).not.toThrow();
    }
  );
});

describe('Schema integrity for the other variants', () => {
  it('LpDistributionSchema accepts a known distributionType', () => {
    expect(() =>
      LpDistributionSchema.parse({
        ...baseFields,
        eventType: 'lp_distribution',
        perspective: 'lp_net',
        payload: { distributionType: 'gain', recallable: false },
      })
    ).not.toThrow();
  });

  it('PortfolioInvestmentSchema requires companyId at the schema level', () => {
    expect(() =>
      PortfolioInvestmentSchema.parse({
        ...baseFields,
        eventType: 'portfolio_investment',
        perspective: 'company',
      })
    ).toThrow();
  });

  it('RealizedProceedsSchema requires companyId at the schema level', () => {
    expect(() =>
      RealizedProceedsSchema.parse({
        ...baseFields,
        eventType: 'realized_proceeds',
        perspective: 'company',
      })
    ).toThrow();
  });

  it('RecallableDistributionSchema accepts default empty payload', () => {
    expect(() =>
      RecallableDistributionSchema.parse({
        ...baseFields,
        eventType: 'recallable_distribution',
        perspective: 'lp_net',
      })
    ).not.toThrow();
  });

  it('ReversalSchema requires reversalOfEventId', () => {
    expect(() =>
      ReversalSchema.parse({
        ...baseFields,
        eventType: 'reversal',
      })
    ).toThrow();
  });
});

describe('Money-field grep gate -- no z.number() in cash-flow-event.contract.ts money positions', () => {
  it('contract source contains no z.number() pattern on money-named fields', () => {
    const source = fs.readFileSync(
      path.join(
        process.cwd(),
        'shared',
        'contracts',
        'lp-reporting',
        'cash-flow-event.contract.ts'
      ),
      'utf8'
    );
    const moneyKeywords = ['amount', 'fairValue', 'costBasis', 'commitment'];
    for (const keyword of moneyKeywords) {
      const moneyNumberPattern = new RegExp(`${keyword}\\s*:\\s*z\\.number\\(\\)`, 'i');
      expect(source).not.toMatch(moneyNumberPattern);
    }
  });
});
