import { desc, eq } from 'drizzle-orm';

import { db } from '../../db';
import type { LpCapitalCall } from '@shared/contracts/lp-reporting/cash-flow-event.contract';
import { cashFlowEvents, type CashFlowEvent } from '@shared/schema/lp-reporting-evidence';

type CashFlowEventDatabase = typeof db;

interface CashFlowEventServiceOptions {
  database?: CashFlowEventDatabase;
}

export async function createLpCapitalCallEvent(
  input: LpCapitalCall,
  options: CashFlowEventServiceOptions = {}
): Promise<CashFlowEvent | undefined> {
  const database = options.database ?? db;
  const [row] = await database
    .insert(cashFlowEvents)
    .values({
      fundId: input.fundId,
      eventType: 'lp_capital_call',
      amount: input.amount,
      currency: 'USD',
      eventDate: new Date(input.eventDate),
      perspective: input.perspective,
      description: input.description ?? null,
      payload: input.payload,
      status: 'draft',
    })
    .returning();

  return row;
}

export async function listCashFlowEventsForFund(
  fundId: number,
  options: CashFlowEventServiceOptions = {}
): Promise<CashFlowEvent[]> {
  const database = options.database ?? db;

  // Newest-first; hits idx_cash_flow_fund_date (fund_id, event_date DESC).
  return database
    .select()
    .from(cashFlowEvents)
    .where(eq(cashFlowEvents.fundId, fundId))
    .orderBy(desc(cashFlowEvents.eventDate));
}
