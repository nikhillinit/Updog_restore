import { z } from 'zod';

// =============================================================================
// CASHFLOW & LIQUIDITY MANAGEMENT SCHEMA
// =============================================================================

/**
 * Core cash transaction types for VC fund operations
 */
export const CashTransactionTypeSchema = z.enum([
  'capital_call',        // LP capital call
  'investment',          // Investment in portfolio company
  'distribution',        // Distribution to LPs
  'expense',            // Fund operating expense
  'management_fee',     // Management fee payment
  'carry_distribution', // Carried interest distribution
  'interest_income',    // Interest on cash balances
  'other_income',       // Other fund income
  'recapitalization',   // Portfolio company recaps
  'bridge_loan',        // Bridge loans to portfolio companies
  'follow_on',          // Follow-on investments
]);

/**
 * Transaction status for approval workflows
 */
export const TransactionStatusSchema = z.enum([
  'planned',        // Forecast/planned transaction
  'pending',        // Pending approval
  'approved',       // Approved for execution
  'executed',       // Completed transaction
  'cancelled',      // Cancelled transaction
  'failed',         // Failed transaction
]);

/**
 * Individual cash transaction
 */
export const CashTransactionSchema = z.object({
  id: z.string().uuid(),
  fundId: z.string(),
  type: CashTransactionTypeSchema,
  amount: z.number(), // Positive for inflows, negative for outflows
  currency: z.string().length(3).default('USD'),

  // Timing
  plannedDate: z.date(),
  executedDate: z.date().optional(),

  // Status and approval
  status: TransactionStatusSchema.default('planned'),
  approvedBy: z.string().optional(),
  approvalDate: z.date().optional(),

  // Metadata
  description: z.string(),
  category: z.string().optional(), // e.g., "legal", "audit", "travel"
  portfolioCompanyId: z.string().optional(), // For investment-related transactions
  lpId: z.string().optional(), // For LP-specific transactions
  quarterEnd: z.boolean().default(false), // Flag for quarter-end transactions

  // Additional context
  notes: z.string().optional(),
  documentRef: z.string().optional(), // Reference to supporting documents

  // Audit trail
  createdAt: z.date().default(() => new Date()),
  updatedAt: z.date().default(() => new Date()),
  createdBy: z.string(),
});

/**
 * Capital call specific details
 */
export const CapitalCallSchema = z.object({
  id: z.string().uuid(),
  fundId: z.string(),
  callNumber: z.number().int().positive(),
  totalAmount: z.number().positive(),

  // Timing
  noticeDate: z.date(),
  dueDate: z.date(),
  executedDate: z.date().optional(),

  // Purpose and allocation
  purpose: z.string(), // e.g., "Investment in Company XYZ", "Operating expenses Q3"
  investmentAllocations: z.array(z.object({
    portfolioCompanyId: z.string(),
    amount: z.number().positive(),
    percentage: z.number().min(0).max(100),
  })).optional(),
  expenseAllocations: z.array(z.object({
    category: z.string(),
    amount: z.number().positive(),
    description: z.string(),
  })).optional(),

  // LP responses
  lpCommitments: z.array(z.object({
    lpId: z.string(),
    committedAmount: z.number().positive(),
    paidAmount: z.number().nonnegative(),
    dueAmount: z.number().nonnegative(),
    status: z.enum(['pending', 'paid', 'partial', 'defaulted']),
    paidDate: z.date().optional(),
  })),

  status: z.enum(['draft', 'sent', 'collecting', 'completed', 'cancelled']),

  // Metadata
  createdAt: z.date().default(() => new Date()),
  updatedAt: z.date().default(() => new Date()),
  createdBy: z.string(),
});

/**
 * Fund expense categories for detailed tracking
 */
export const ExpenseCategorySchema = z.enum([
  'legal',
  'audit',
  'tax',
  'administration',
  'custodian',
  'consulting',
  'travel',
  'technology',
  'office',
  'insurance',
  'regulatory',
  'marketing',
  'due_diligence',
  'closing_costs',
  'other',
]);

/**
 * Recurring expense template
 */
export const RecurringExpenseSchema = z.object({
  id: z.string().uuid(),
  fundId: z.string(),
  name: z.string(),
  category: ExpenseCategorySchema,
  amount: z.number().positive(),
  frequency: z.enum(['monthly', 'quarterly', 'annually']),

  // Schedule
  startDate: z.date(),
  endDate: z.date().optional(),
  nextDueDate: z.date(),

  // Vendor details
  vendor: z.string(),
  description: z.string(),

  // Auto-generation settings
  autoGenerate: z.boolean().default(true),
  approvalRequired: z.boolean().default(false),

  // Metadata
  isActive: z.boolean().default(true),
  createdAt: z.date().default(() => new Date()),
  createdBy: z.string(),
});

/**
 * Liquidity forecast for fund planning
 */
export const LiquidityForecastSchema = z.object({
  fundId: z.string(),
  periodStart: z.date(),
  periodEnd: z.date(),

  // Opening position
  openingCash: z.number(),
  openingCommitted: z.number(), // Undrawn commitments

  // Forecast inflows
  plannedCapitalCalls: z.number().nonnegative(),
  expectedDistributions: z.number().nonnegative(), // From portfolio
  otherInflows: z.number().nonnegative(),

  // Forecast outflows
  plannedInvestments: z.number().nonnegative(),
  plannedExpenses: z.number().nonnegative(),
  managementFees: z.number().nonnegative(),
  otherOutflows: z.number().nonnegative(),

  // Closing position
  projectedCash: z.number(),
  projectedCommitted: z.number(),

  // Risk metrics
  minimumCashBuffer: z.number().positive(),
  liquidityRatio: z.number(), // Available liquidity / upcoming obligations
  burnRate: z.number(), // Monthly cash consumption
  runwayMonths: z.number(), // Months until liquidity constraint

  // Scenario analysis
  scenarios: z.array(z.object({
    name: z.string(),
    probability: z.number().min(0).max(1),
    projectedCash: z.number(),
    notes: z.string().optional(),
  })),

  // Metadata
  generatedAt: z.date().default(() => new Date()),
  generatedBy: z.string(),
  lastUpdated: z.date().default(() => new Date()),
});

/**
 * Cash position snapshot for real-time tracking
 */
export const CashPositionSchema = z.object({
  fundId: z.string(),
  asOfDate: z.date(),

  // Bank accounts
  bankAccounts: z.array(z.object({
    accountId: z.string(),
    bankName: z.string(),
    accountType: z.enum(['operating', 'capital_call', 'distribution', 'escrow']),
    balance: z.number(),
    currency: z.string().length(3).default('USD'),
    lastUpdated: z.date(),
  })),

  // Aggregate positions
  totalCash: z.number(),
  totalCommitted: z.number(),
  totalDeployed: z.number(),
  availableLiquidity: z.number(),

  // Pending transactions
  pendingInflows: z.number().nonnegative(),
  pendingOutflows: z.number().nonnegative(),
  netPending: z.number(),

  // Investment capacity
  dryPowder: z.number().nonnegative(), // Available for new investments
  reserveRequirement: z.number().nonnegative(), // Required for follow-ons
  availableInvestment: z.number().nonnegative(), // Dry powder - reserves

  // Metadata
  createdAt: z.date().default(() => new Date()),
  updatedAt: z.date().default(() => new Date()),
});

/**
 * Waterfall calculation result for distributions
 */
export const DistributionWaterfallSchema = z.object({
  fundId: z.string(),
  distributionId: z.string(),
  totalDistribution: z.number().positive(),

  // LP distribution
  lpDistribution: z.object({
    returnOfCapital: z.number().nonnegative(),
    profit: z.number().nonnegative(),
    total: z.number().nonnegative(),
  }),

  // GP distribution
  gpDistribution: z.object({
    managementFeeOffset: z.number().nonnegative(),
    catchUp: z.number().nonnegative(),
    carry: z.number().nonnegative(),
    total: z.number().nonnegative(),
  }),

  // Waterfall mechanics
  cumulative: z.object({
    lpContributions: z.number().nonnegative(),
    lpDistributions: z.number().nonnegative(),
    preferredAccrued: z.number().nonnegative(),
    carryEarned: z.number().nonnegative(),
  }),

  // Calculation metadata
  calculatedAt: z.date().default(() => new Date()),
  waterfallType: z.enum(['AMERICAN']),
  carryRate: z.number().min(0).max(1),
});

// =============================================================================
// INTEGRATION WITH FUND SETUP
// =============================================================================

/**
 * Extended fund setup that includes cashflow management settings
 */
export const FundCashflowConfigSchema = z.object({
  // Basic settings
  enableCashflowTracking: z.boolean().default(true),
  enableAutomaticCapitalCalls: z.boolean().default(false),
  enableExpenseTracking: z.boolean().default(true),

  // Capital call settings
  capitalCallSettings: z.object({
    defaultNoticesDays: z.number().int().min(1).max(90).default(10),
    defaultPaymentDays: z.number().int().min(1).max(60).default(30),
    autoGenerateQuarterly: z.boolean().default(false),
    requireApproval: z.boolean().default(true),
  }),

  // Expense settings
  expenseSettings: z.object({
    defaultCategories: z.array(ExpenseCategorySchema),
    requireApprovalThreshold: z.number().positive().default(10000),
    autoRecurringExpenses: z.boolean().default(true),
  }),

  // Liquidity settings
  liquiditySettings: z.object({
    minimumCashRatio: z.number().min(0).max(1).default(0.05), // 5% of fund size
    forecastHorizonMonths: z.number().int().min(3).max(60).default(12),
    alertThresholds: z.object({
      lowLiquidity: z.number().min(0).max(1).default(0.02), // 2% of fund size
      criticalLiquidity: z.number().min(0).max(1).default(0.01), // 1% of fund size
    }),
  }),

  // Integration settings
  integrations: z.object({
    bankingApi: z.boolean().default(false),
    portfolioCompanyReporting: z.boolean().default(true),
    distributionAutomation: z.boolean().default(false),
  }),
});

// =============================================================================
// TYPESCRIPT TYPE EXPORTS
// =============================================================================

export type CashTransactionType = z.infer<typeof CashTransactionTypeSchema>;
export type TransactionStatus = z.infer<typeof TransactionStatusSchema>;
export type CashTransaction = z.infer<typeof CashTransactionSchema>;
export type CapitalCall = z.infer<typeof CapitalCallSchema>;
export type ExpenseCategory = z.infer<typeof ExpenseCategorySchema>;
export type RecurringExpense = z.infer<typeof RecurringExpenseSchema>;
export type LiquidityForecast = z.infer<typeof LiquidityForecastSchema>;
export type CashPosition = z.infer<typeof CashPositionSchema>;
export type DistributionWaterfall = z.infer<typeof DistributionWaterfallSchema>;
export type FundCashflowConfig = z.infer<typeof FundCashflowConfigSchema>;

// =============================================================================
// VALIDATION HELPERS
// =============================================================================

export const validateCashTransaction = (data: unknown) => CashTransactionSchema.safeParse(data);
export const validateCapitalCall = (data: unknown) => CapitalCallSchema.safeParse(data);
export const validateLiquidityForecast = (data: unknown) => LiquidityForecastSchema.safeParse(data);
export const validateCashPosition = (data: unknown) => CashPositionSchema.safeParse(data);

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Calculate net cash flow for a given period
 */
export function calculateNetCashFlow(transactions: CashTransaction[]): number {
  return transactions.reduce((sum, transaction) => sum + transaction.amount, 0);
}

/**
 * Group transactions by type for analysis
 */
export function groupTransactionsByType(transactions: CashTransaction[]) {
  return transactions.reduce((groups, transaction) => {
    const type = transaction.type;
    if (!groups[type]) {
      groups[type] = [];
    }
    groups[type].push(transaction);
    return groups;
  }, {} as Record<CashTransactionType, CashTransaction[]>);
}

/**
 * Calculate liquidity metrics
 */
export function calculateLiquidityMetrics(position: CashPosition, upcomingOutflows: number) {
  const liquidityRatio = position.availableLiquidity / Math.max(upcomingOutflows, 1);
  const burnRate = upcomingOutflows / 3; // Assume quarterly outflows, so monthly = quarterly/3
  const runwayMonths = burnRate > 0 ? position.availableLiquidity / burnRate : Infinity;

  return {
    liquidityRatio,
    burnRate,
    runwayMonths,
    isHealthy: liquidityRatio >= 1.5 && runwayMonths >= 6,
  };
}