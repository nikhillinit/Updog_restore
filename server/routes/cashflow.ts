import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  CashTransactionSchema,
  CapitalCallSchema,
  RecurringExpenseSchema,
  type CashTransaction,
  type CapitalCall,
  type RecurringExpense,
  type LiquidityForecast,
  type CashPosition,
  calculateNetCashFlow,
  groupTransactionsByType,
  calculateLiquidityMetrics
} from '@shared/types';

const router = Router();

// =============================================================================
// REQUEST/RESPONSE SCHEMAS
// =============================================================================

const FundIdParams = z.object({
  fundId: z.string().min(1),
});

const TransactionQueryParams = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  type: z.string().optional(),
  status: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

const CreateTransactionRequest = CashTransactionSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

const UpdateTransactionRequest = CashTransactionSchema.partial().omit({
  id: true,
  fundId: true,
  createdAt: true
});

const CreateCapitalCallRequest = CapitalCallSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

const CreateRecurringExpenseRequest = RecurringExpenseSchema.omit({
  id: true,
  createdAt: true,
});

// =============================================================================
// IN-MEMORY DATA STORES (Replace with database in production)
// =============================================================================

// Mock data stores - replace with actual database operations
const transactions = new Map<string, CashTransaction>();
const capitalCalls = new Map<string, CapitalCall>();
const recurringExpenses = new Map<string, RecurringExpense>();
const cashPositions = new Map<string, CashPosition>();

// Helper to generate UUIDs
const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// =============================================================================
// CASH TRANSACTIONS ENDPOINTS
// =============================================================================

/**
 * GET /api/cashflow/:fundId/transactions
 * Retrieve cash transactions for a fund with filtering and pagination
 */
router.get('/:fundId/transactions', async (req: Request, res: Response) => {
  try {
    const { fundId } = FundIdParams.parse(req.params);
    const queryParams = TransactionQueryParams.parse(req.query);

    // Filter transactions by fund
    let fundTransactions = Array.from(transactions.values())
      .filter(t => t.fundId === fundId);

    // Apply filters
    if (queryParams.startDate) {
      const startDate = new Date(queryParams.startDate);
      fundTransactions = fundTransactions.filter(t =>
        t.plannedDate >= startDate || (t.executedDate && t.executedDate >= startDate)
      );
    }

    if (queryParams.endDate) {
      const endDate = new Date(queryParams.endDate);
      fundTransactions = fundTransactions.filter(t =>
        t.plannedDate <= endDate || (t.executedDate && t.executedDate <= endDate)
      );
    }

    if (queryParams.type) {
      fundTransactions = fundTransactions.filter(t => t.type === queryParams.type);
    }

    if (queryParams.status) {
      fundTransactions = fundTransactions.filter(t => t.status === queryParams.status);
    }

    // Sort by planned date (most recent first)
    fundTransactions.sort((a, b) =>
      new Date(b.plannedDate).getTime() - new Date(a.plannedDate).getTime()
    );

    // Apply pagination
    const total = fundTransactions.length;
    const paginatedTransactions = fundTransactions.slice(
      queryParams.offset,
      queryParams.offset + queryParams.limit
    );

    res.json({
      success: true,
      data: {
        transactions: paginatedTransactions,
        pagination: {
          total,
          limit: queryParams.limit,
          offset: queryParams.offset,
          hasMore: queryParams.offset + queryParams.limit < total,
        },
        summary: {
          totalInflows: calculateNetCashFlow(fundTransactions.filter(t => t.amount > 0)),
          totalOutflows: Math.abs(calculateNetCashFlow(fundTransactions.filter(t => t.amount < 0))),
          netCashFlow: calculateNetCashFlow(fundTransactions),
          byType: groupTransactionsByType(fundTransactions),
        },
      },
      timestamp: new Date(),
    });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(400).json({
      error: 'Invalid request parameters',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/cashflow/:fundId/transactions
 * Create a new cash transaction
 */
router.post('/:fundId/transactions', async (req: Request, res: Response) => {
  try {
    const { fundId } = FundIdParams.parse(req.params);
    const transactionData = CreateTransactionRequest.parse(req.body);

    const transaction: CashTransaction = {
      ...transactionData,
      id: generateId(),
      fundId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    transactions.set(transaction.id, transaction);

    res.status(201).json({
      success: true,
      data: transaction,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error('Error creating transaction:', error);
    res.status(400).json({
      error: 'Invalid transaction data',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * PUT /api/cashflow/:fundId/transactions/:transactionId
 * Update an existing transaction
 */
router.put('/:fundId/transactions/:transactionId', async (req: Request, res: Response) => {
  try {
    const { fundId } = FundIdParams.parse(req.params);
    const { transactionId } = z.object({ transactionId: z.string() }).parse(req.params);
    const updates = UpdateTransactionRequest.parse(req.body);

    const existingTransaction = transactions.get(transactionId);
    if (!existingTransaction || existingTransaction.fundId !== fundId) {
      return res.status(404).json({
        error: 'Transaction not found',
        message: 'Transaction does not exist or does not belong to this fund',
      });
    }

    const updatedTransaction: CashTransaction = {
      ...existingTransaction,
      ...updates,
      updatedAt: new Date(),
    };

    transactions.set(transactionId, updatedTransaction);

    res.json({
      success: true,
      data: updatedTransaction,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error('Error updating transaction:', error);
    res.status(400).json({
      error: 'Invalid update data',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * DELETE /api/cashflow/:fundId/transactions/:transactionId
 * Delete a transaction
 */
router.delete('/:fundId/transactions/:transactionId', async (req: Request, res: Response) => {
  try {
    const { fundId } = FundIdParams.parse(req.params);
    const { transactionId } = z.object({ transactionId: z.string() }).parse(req.params);

    const existingTransaction = transactions.get(transactionId);
    if (!existingTransaction || existingTransaction.fundId !== fundId) {
      return res.status(404).json({
        error: 'Transaction not found',
        message: 'Transaction does not exist or does not belong to this fund',
      });
    }

    transactions.delete(transactionId);

    res.json({
      success: true,
      message: 'Transaction deleted successfully',
      timestamp: new Date(),
    });
  } catch (error) {
    console.error('Error deleting transaction:', error);
    res.status(400).json({
      error: 'Invalid request',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// =============================================================================
// CAPITAL CALLS ENDPOINTS
// =============================================================================

/**
 * GET /api/cashflow/:fundId/capital-calls
 * Retrieve capital calls for a fund
 */
router.get('/:fundId/capital-calls', async (req: Request, res: Response) => {
  try {
    const { fundId } = FundIdParams.parse(req.params);

    const fundCapitalCalls = Array.from(capitalCalls.values())
      .filter(cc => cc.fundId === fundId)
      .sort((a, b) => new Date(b.noticeDate).getTime() - new Date(a.noticeDate).getTime());

    res.json({
      success: true,
      data: {
        capitalCalls: fundCapitalCalls,
        summary: {
          totalCalls: fundCapitalCalls.length,
          totalAmount: fundCapitalCalls.reduce((sum, cc) => sum + cc.totalAmount, 0),
          pendingAmount: fundCapitalCalls
            .filter(cc => cc.status === 'collecting')
            .reduce((sum, cc) => sum + cc.totalAmount, 0),
        },
      },
      timestamp: new Date(),
    });
  } catch (error) {
    console.error('Error fetching capital calls:', error);
    res.status(400).json({
      error: 'Invalid request parameters',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/cashflow/:fundId/capital-calls
 * Create a new capital call
 */
router.post('/:fundId/capital-calls', async (req: Request, res: Response) => {
  try {
    const { fundId } = FundIdParams.parse(req.params);
    const capitalCallData = CreateCapitalCallRequest.parse(req.body);

    const capitalCall: CapitalCall = {
      ...capitalCallData,
      id: generateId(),
      fundId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    capitalCalls.set(capitalCall.id, capitalCall);

    res.status(201).json({
      success: true,
      data: capitalCall,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error('Error creating capital call:', error);
    res.status(400).json({
      error: 'Invalid capital call data',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// =============================================================================
// LIQUIDITY FORECAST ENDPOINTS
// =============================================================================

/**
 * GET /api/cashflow/:fundId/liquidity-forecast
 * Generate liquidity forecast for a fund
 */
router.get('/:fundId/liquidity-forecast', async (req: Request, res: Response) => {
  try {
    const { fundId } = FundIdParams.parse(req.params);
    const { months = 12 } = z.object({
      months: z.coerce.number().int().min(1).max(60).optional(),
    }).parse(req.query);

    // Get current cash position (mock data)
    const currentPosition = cashPositions.get(fundId) || {
      fundId,
      asOfDate: new Date(),
      bankAccounts: [
        {
          accountId: 'main-operating',
          bankName: 'First Republic Bank',
          accountType: 'operating' as const,
          balance: 5000000, // $5M
          currency: 'USD',
          lastUpdated: new Date(),
        },
      ],
      totalCash: 5000000,
      totalCommitted: 95000000, // $95M remaining commitment
      totalDeployed: 50000000, // $50M deployed
      availableLiquidity: 5000000,
      pendingInflows: 2000000, // Expected distributions
      pendingOutflows: 3000000, // Planned investments
      netPending: -1000000,
      dryPowder: 4000000,
      reserveRequirement: 15000000, // For follow-ons
      availableInvestment: 4000000,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Generate forecast scenarios
    const baseCase = {
      name: 'Base Case',
      probability: 0.6,
      projectedCash: currentPosition.totalCash - 1000000, // Net outflow expected
      notes: 'Expected investment pace with normal distributions',
    };

    const bullCase = {
      name: 'Bull Market',
      probability: 0.2,
      projectedCash: currentPosition.totalCash + 2000000, // Higher distributions
      notes: 'Accelerated exits and higher distribution returns',
    };

    const bearCase = {
      name: 'Bear Market',
      probability: 0.2,
      projectedCash: currentPosition.totalCash - 3000000, // Lower distributions
      notes: 'Delayed exits, continued investment commitments',
    };

    const forecast: LiquidityForecast = {
      fundId,
      periodStart: new Date(),
      periodEnd: new Date(Date.now() + (months * 30 * 24 * 60 * 60 * 1000)), // Approximate months
      openingCash: currentPosition.totalCash,
      openingCommitted: currentPosition.totalCommitted,
      plannedCapitalCalls: 10000000, // $10M planned
      expectedDistributions: 8000000, // $8M expected from portfolio
      otherInflows: 500000, // Interest income
      plannedInvestments: 12000000, // $12M new investments
      plannedExpenses: 2000000, // $2M operating expenses
      managementFees: 3000000, // $3M management fees
      otherOutflows: 500000, // Other costs
      projectedCash: baseCase.projectedCash,
      projectedCommitted: currentPosition.totalCommitted - 10000000,
      minimumCashBuffer: 2500000, // 2.5% of $100M fund
      liquidityRatio: 1.25, // Available liquidity / upcoming obligations
      burnRate: 1500000, // $1.5M monthly burn
      runwayMonths: baseCase.projectedCash / 1500000,
      scenarios: [baseCase, bullCase, bearCase],
      generatedAt: new Date(),
      generatedBy: 'system',
      lastUpdated: new Date(),
    };

    res.json({
      success: true,
      data: forecast,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error('Error generating liquidity forecast:', error);
    res.status(400).json({
      error: 'Invalid request parameters',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/cashflow/:fundId/cash-position
 * Get current cash position for a fund
 */
router.get('/:fundId/cash-position', async (req: Request, res: Response) => {
  try {
    const { fundId } = FundIdParams.parse(req.params);

    const position = cashPositions.get(fundId) || {
      fundId,
      asOfDate: new Date(),
      bankAccounts: [
        {
          accountId: 'main-operating',
          bankName: 'First Republic Bank',
          accountType: 'operating' as const,
          balance: 5000000,
          currency: 'USD',
          lastUpdated: new Date(),
        },
      ],
      totalCash: 5000000,
      totalCommitted: 95000000,
      totalDeployed: 50000000,
      availableLiquidity: 5000000,
      pendingInflows: 2000000,
      pendingOutflows: 3000000,
      netPending: -1000000,
      dryPowder: 4000000,
      reserveRequirement: 15000000,
      availableInvestment: 4000000,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Calculate liquidity metrics
    const upcomingOutflows = 5000000; // Next 3 months
    const metrics = calculateLiquidityMetrics(position, upcomingOutflows);

    res.json({
      success: true,
      data: {
        position,
        metrics,
        alerts: [
          ...(metrics.liquidityRatio < 1.5 ? [{
            level: 'warning' as const,
            message: 'Liquidity ratio below recommended threshold',
            threshold: 1.5,
            current: metrics.liquidityRatio,
          }] : []),
          ...(metrics.runwayMonths < 6 ? [{
            level: 'critical' as const,
            message: 'Cash runway below 6 months',
            threshold: 6,
            current: metrics.runwayMonths,
          }] : []),
        ],
      },
      timestamp: new Date(),
    });
  } catch (error) {
    console.error('Error fetching cash position:', error);
    res.status(400).json({
      error: 'Invalid request parameters',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// =============================================================================
// RECURRING EXPENSES ENDPOINTS
// =============================================================================

/**
 * GET /api/cashflow/:fundId/recurring-expenses
 * Get recurring expenses for a fund
 */
router.get('/:fundId/recurring-expenses', async (req: Request, res: Response) => {
  try {
    const { fundId } = FundIdParams.parse(req.params);

    const fundExpenses = Array.from(recurringExpenses.values())
      .filter(e => e.fundId === fundId)
      .filter(e => e.isActive);

    const totalAnnualExpenses = fundExpenses.reduce((sum, expense) => {
      const multiplier = expense.frequency === 'monthly' ? 12 :
                        expense.frequency === 'quarterly' ? 4 : 1;
      return sum + (expense.amount * multiplier);
    }, 0);

    res.json({
      success: true,
      data: {
        expenses: fundExpenses,
        summary: {
          totalExpenses: fundExpenses.length,
          totalAnnualAmount: totalAnnualExpenses,
          byCategory: fundExpenses.reduce((acc, expense) => {
            acc[expense.category] = (acc[expense.category] || 0) + expense.amount;
            return acc;
          }, {} as Record<string, number>),
        },
      },
      timestamp: new Date(),
    });
  } catch (error) {
    console.error('Error fetching recurring expenses:', error);
    res.status(400).json({
      error: 'Invalid request parameters',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/cashflow/:fundId/recurring-expenses
 * Create a new recurring expense
 */
router.post('/:fundId/recurring-expenses', async (req: Request, res: Response) => {
  try {
    const { fundId } = FundIdParams.parse(req.params);
    const expenseData = CreateRecurringExpenseRequest.parse(req.body);

    const expense: RecurringExpense = {
      ...expenseData,
      id: generateId(),
      fundId,
      createdAt: new Date(),
    };

    recurringExpenses.set(expense.id, expense);

    res.status(201).json({
      success: true,
      data: expense,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error('Error creating recurring expense:', error);
    res.status(400).json({
      error: 'Invalid expense data',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;