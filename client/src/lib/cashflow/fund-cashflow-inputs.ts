/**
 * Builds LiquidityEngine inputs from persisted fund truth (fund row plus
 * investments) and planning assumptions (investment period, fund life, wizard
 * expenses).
 *
 * Model:
 * - Investments and quarterly management fees are actuals up to the as-of month.
 * - Remaining investable capital (size - lifetime fees - lifetime expenses -
 *   deployed) is deployed evenly over the months left in the investment period.
 * - Every outflow is funded by a normalized capital call dated at the start of
 *   its quarter, plus one working-cash buffer called up front.
 */
import { LiquidityEngine } from '@/core/LiquidityEngine';
import { ExpenseCategorySchema } from '@shared/schemas/cashflow-schema';
import type {
  CashPosition,
  CashTransaction,
  ExpenseCategory,
  RecurringExpense,
} from '@shared/types';

export interface FundCashFlowFund {
  id: number | string;
  size: number | string;
  managementFee: number | string;
  vintageYear: number;
  establishmentDate?: string | null;
}

export interface FundCashFlowInvestment {
  id: number | string;
  companyId?: number | null;
  investmentDate: string | Date;
  amount: number | string;
  round: string;
  /** Set on rows funded through an SPV or co-invest vehicle. */
  vehicleParticipationId?: number | null;
}

export interface FundCashFlowExpense {
  id: string;
  category: string;
  monthlyAmount: number;
  /** One-based month of fund life, as the wizard stores it (1 = first month). */
  startMonth: number;
  endMonth?: number;
}

export interface FundCashFlowConfig {
  investmentPeriodYears?: number;
  fundLifeYears?: number;
  expenses?: FundCashFlowExpense[];
  /** Working cash called once up front. Defaults to the engine's minimum buffer. */
  cashBuffer?: number;
}

export interface FundCashFlowInputs {
  transactions: CashTransaction[];
  recurringExpenses: RecurringExpense[];
  currentPosition: CashPosition;
}

type TransactionDraft = Pick<
  CashTransaction,
  'type' | 'amount' | 'plannedDate' | 'status' | 'description'
> &
  Partial<Pick<CashTransaction, 'category' | 'portfolioCompanyId'>>;

const CREATED_BY = 'fund-cashflow-inputs';

function monthIndex(date: Date): number {
  return date.getUTCFullYear() * 12 + date.getUTCMonth();
}

// Noon UTC keeps the calendar day stable when the browser groups by local month.
function monthDate(index: number): Date {
  return new Date(Date.UTC(Math.floor(index / 12), index % 12, 1, 12));
}

function noonUtc(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 12));
}

function toExpenseCategory(category: string): ExpenseCategory {
  const parsed = ExpenseCategorySchema.safeParse(category.toLowerCase());
  return parsed.success ? parsed.data : 'other';
}

export function buildFundCashFlowInputs(args: {
  fund: FundCashFlowFund;
  investments: FundCashFlowInvestment[];
  config?: FundCashFlowConfig;
  asOf?: Date;
  horizonMonths?: number;
}): FundCashFlowInputs {
  const { fund, investments, config = {}, horizonMonths = 12 } = args;
  const asOf = args.asOf ?? new Date();
  const fundId = String(fund.id);
  const size = Number(fund.size);
  const feeRate = Number(fund.managementFee);
  const investmentPeriodYears = config.investmentPeriodYears ?? 5;
  const fundLifeYears = config.fundLifeYears ?? 10;
  const expenses = (config.expenses ?? []).filter((expense) => expense.monthlyAmount > 0);
  const cashBuffer = config.cashBuffer ?? new LiquidityEngine(fundId, size).getMinimumCashBuffer();

  const fundStart = fund.establishmentDate
    ? new Date(fund.establishmentDate)
    : new Date(Date.UTC(fund.vintageYear, 0, 1));
  const startIdx = monthIndex(fundStart);
  const asOfIdx = monthIndex(asOf);
  const firstPlannedIdx = asOfIdx + 1;
  const lastPlannedIdx = asOfIdx + horizonMonths;
  const lifeEndIdx = startIdx + fundLifeYears * 12; // exclusive
  const periodEndIdx = startIdx + investmentPeriodYears * 12; // exclusive

  let nextId = 0;
  const uuid = () => `00000000-0000-4000-8000-${(nextId++).toString(16).padStart(12, '0')}`;
  const statusFor = (idx: number) => (idx <= asOfIdx ? 'executed' : 'planned');

  const transactions: CashTransaction[] = [];
  const push = (draft: TransactionDraft) => {
    transactions.push({
      id: uuid(),
      fundId,
      currency: 'USD',
      quarterEnd: false,
      createdAt: asOf,
      updatedAt: asOf,
      createdBy: CREATED_BY,
      ...(draft.status === 'executed' ? { executedDate: draft.plannedDate } : {}),
      ...draft,
    });
  };

  // Actual investments. Rows funded through a vehicle (SPV, co-invest) draw on
  // that vehicle's commitments, not on this fund's size, so they stay out.
  // ponytail: participation rows are SPV/co-invest today; if main-fund deals ever
  // get participations, filter by vehicle type through the vehicles API instead.
  let deployed = 0;
  for (const investment of investments) {
    if (investment.vehicleParticipationId != null) continue;
    const amount = Number(investment.amount);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    deployed += amount;
    push({
      type: /follow/i.test(investment.round) ? 'follow_on' : 'investment',
      amount: -amount,
      plannedDate: noonUtc(new Date(investment.investmentDate)),
      status: 'executed',
      description: `${investment.round} investment`,
      ...(investment.companyId != null ? { portfolioCompanyId: String(investment.companyId) } : {}),
    });
  }

  // Quarterly management fees on the fund's own cadence.
  const quarterlyFee = (size * feeRate) / 4;
  for (
    let idx = startIdx;
    quarterlyFee > 0 && idx < lifeEndIdx && idx <= lastPlannedIdx;
    idx += 3
  ) {
    push({
      type: 'management_fee',
      amount: -quarterlyFee,
      plannedDate: monthDate(idx),
      status: statusFor(idx),
      description: 'Management fee (quarterly)',
    });
  }

  // Planned operating expenses from fund setup, monthly. Wizard months are
  // one-based; offsets here are zero-based.
  let lifetimeExpenses = 0;
  for (const expense of expenses) {
    const first = Math.max(0, expense.startMonth - 1);
    const last = Math.min(fundLifeYears * 12 - 1, (expense.endMonth ?? Infinity) - 1);
    lifetimeExpenses += expense.monthlyAmount * Math.max(0, last - first + 1);
    for (let idx = startIdx + first; idx <= startIdx + last && idx <= lastPlannedIdx; idx += 1) {
      push({
        type: 'expense',
        amount: -expense.monthlyAmount,
        plannedDate: monthDate(idx),
        status: statusFor(idx),
        description: expense.category,
        category: expense.category,
      });
    }
  }

  // Even deployment of what is left to invest across the remaining investment period.
  const lifetimeFees = size * feeRate * fundLifeYears;
  const remainingInvestable = Math.max(0, size - lifetimeFees - lifetimeExpenses - deployed);
  const deployMonths = periodEndIdx - firstPlannedIdx;
  if (deployMonths > 0 && remainingInvestable > 0) {
    const monthly = remainingInvestable / deployMonths;
    for (let idx = firstPlannedIdx; idx < periodEndIdx && idx <= lastPlannedIdx; idx += 1) {
      push({
        type: 'investment',
        amount: -monthly,
        plannedDate: monthDate(idx),
        status: 'planned',
        description: 'Planned deployment (even pacing)',
      });
    }
  }

  // Normalized capital calls: one per quarter and status, sized to that quarter's
  // outflows. The buffer is called ahead once with the first quarter. Calls never
  // date before the fund start, unless an outflow predates it (missing
  // establishmentDate) - then the call tracks that outflow's month.
  const calls = new Map<string, { idx: number; status: 'executed' | 'planned'; amount: number }>();
  const call = (idx: number, status: 'executed' | 'planned', amount: number) => {
    const quarterStart = Math.floor(idx / 3) * 3;
    const floorIdx = status === 'executed' ? Math.min(startIdx, idx) : firstPlannedIdx;
    const callIdx = Math.max(quarterStart, floorIdx);
    const key = `${callIdx}:${status}`;
    const bucket = calls.get(key) ?? { idx: callIdx, status, amount: 0 };
    bucket.amount += amount;
    calls.set(key, bucket);
  };
  for (const tx of transactions) {
    if (tx.amount < 0) {
      call(
        monthIndex(tx.plannedDate),
        tx.status === 'executed' ? 'executed' : 'planned',
        -tx.amount
      );
    }
  }
  if (cashBuffer > 0) call(startIdx, statusFor(startIdx), cashBuffer);
  for (const bucket of calls.values()) {
    push({
      type: 'capital_call',
      amount: bucket.amount,
      plannedDate: monthDate(bucket.idx),
      status: bucket.status,
      description: 'Capital call (normalized, quarterly)',
    });
  }
  transactions.sort(
    (a, b) => a.plannedDate.getTime() - b.plannedDate.getTime() || a.type.localeCompare(b.type)
  );

  const sum = (pick: (tx: CashTransaction) => boolean) =>
    transactions.filter(pick).reduce((total, tx) => total + tx.amount, 0);
  const isNextMonth = (tx: CashTransaction) => monthIndex(tx.plannedDate) === firstPlannedIdx;
  const calledToDate = sum((tx) => tx.type === 'capital_call' && tx.status === 'executed');
  const pendingInflows = sum((tx) => tx.amount > 0 && isNextMonth(tx));
  const pendingOutflows = 0 - sum((tx) => tx.amount < 0 && isNextMonth(tx));
  // Executed calls cover executed outflows exactly, so cash on hand is the buffer
  // once it has been called. Exact by construction: alerts compare with strict <.
  const totalCash = statusFor(startIdx) === 'executed' ? cashBuffer : 0;

  const currentPosition: CashPosition = {
    fundId,
    asOfDate: asOf,
    bankAccounts: [
      {
        accountId: 'modeled-operating',
        bankName: 'Modeled (no bank feed)',
        accountType: 'operating',
        balance: totalCash,
        currency: 'USD',
        lastUpdated: asOf,
      },
    ],
    totalCash,
    totalCommitted: size - calledToDate,
    totalDeployed: deployed,
    availableLiquidity: totalCash,
    pendingInflows,
    pendingOutflows,
    netPending: pendingInflows - pendingOutflows,
    dryPowder: remainingInvestable,
    reserveRequirement: 0,
    availableInvestment: remainingInvestable,
    createdAt: asOf,
    updatedAt: asOf,
  };

  const recurringExpenses: RecurringExpense[] = expenses.map((expense) => {
    const first = startIdx + Math.max(0, expense.startMonth - 1);
    const last = expense.endMonth == null ? null : startIdx + expense.endMonth - 1;
    return {
      id: uuid(),
      fundId,
      name: expense.category,
      category: toExpenseCategory(expense.category),
      amount: expense.monthlyAmount,
      frequency: 'monthly',
      startDate: monthDate(first),
      ...(last == null ? {} : { endDate: monthDate(last) }),
      nextDueDate: monthDate(Math.max(first, firstPlannedIdx)),
      vendor: 'Modeled',
      description: `${expense.category} (fund setup expense)`,
      autoGenerate: true,
      approvalRequired: false,
      isActive: last == null || last >= firstPlannedIdx,
      createdAt: asOf,
      createdBy: CREATED_BY,
    };
  });

  return { transactions, recurringExpenses, currentPosition };
}
