/**
 * Portfolio Intelligence Service
 *
 * Database operations for portfolio construction modeling, scenario planning,
 * reserve optimization, and performance forecasting.
 */

import { db } from '../db';
import { eq, desc } from 'drizzle-orm';
import {
  fundStrategyModels,
  portfolioScenarios,
  reserveAllocationStrategies,
  performanceForecasts,
  scenarioComparisons,
  monteCarloSimulations,
} from '@shared/schema';

// Type definitions for inserts
type InsertFundStrategyModel = typeof fundStrategyModels.$inferInsert;
type InsertPortfolioScenario = typeof portfolioScenarios.$inferInsert;
type InsertReserveAllocationStrategy = typeof reserveAllocationStrategies.$inferInsert;
type InsertPerformanceForecast = typeof performanceForecasts.$inferInsert;
type InsertScenarioComparison = typeof scenarioComparisons.$inferInsert;
type InsertMonteCarloSimulation = typeof monteCarloSimulations.$inferInsert;

// Type definitions for selects
type FundStrategyModel = typeof fundStrategyModels.$inferSelect;
type PortfolioScenario = typeof portfolioScenarios.$inferSelect;
type ReserveAllocationStrategy = typeof reserveAllocationStrategies.$inferSelect;
type PerformanceForecast = typeof performanceForecasts.$inferSelect;
type ScenarioComparison = typeof scenarioComparisons.$inferSelect;
type MonteCarloSimulation = typeof monteCarloSimulations.$inferSelect;

export const portfolioIntelligenceService = {
  // ============================================================================
  // STRATEGY MANAGEMENT
  // ============================================================================

  strategies: {
    async create(data: InsertFundStrategyModel): Promise<FundStrategyModel> {
      const [strategy] = await db.insert(fundStrategyModels).values(data).returning();
      if (!strategy) throw new Error('Failed to create strategy');
      return strategy;
    },

    async getById(id: string): Promise<FundStrategyModel | undefined> {
      const [strategy] = await db
        .select()
        .from(fundStrategyModels)
        .where(eq(fundStrategyModels.id, id));
      return strategy;
    },

    async getByFund(
      fundId: number,
      options?: { isActive?: boolean; modelType?: string; limit?: number }
    ): Promise<FundStrategyModel[]> {
      let query = db
        .select()
        .from(fundStrategyModels)
        .where(eq(fundStrategyModels.fundId, fundId))
        .orderBy(desc(fundStrategyModels.createdAt));

      if (options?.limit) {
        query = query.limit(options.limit) as typeof query;
      }

      const strategies = await query;

      // Filter in application layer for optional conditions
      return strategies.filter((s) => {
        if (options?.isActive !== undefined && s.isActive !== options.isActive) return false;
        if (options?.modelType && s.modelType !== options.modelType) return false;
        return true;
      });
    },

    async update(
      id: string,
      data: Partial<InsertFundStrategyModel>
    ): Promise<FundStrategyModel | undefined> {
      const [updated] = await db
        .update(fundStrategyModels)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(fundStrategyModels.id, id))
        .returning();
      return updated;
    },

    async deactivate(id: string): Promise<boolean> {
      const [result] = await db
        .update(fundStrategyModels)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(fundStrategyModels.id, id))
        .returning();
      return !!result;
    },
  },

  // ============================================================================
  // SCENARIO MANAGEMENT
  // ============================================================================

  scenarios: {
    async create(data: InsertPortfolioScenario): Promise<PortfolioScenario> {
      const [scenario] = await db.insert(portfolioScenarios).values(data).returning();
      if (!scenario) throw new Error('Failed to create scenario');
      return scenario;
    },

    async getById(id: string): Promise<PortfolioScenario | undefined> {
      const [scenario] = await db
        .select()
        .from(portfolioScenarios)
        .where(eq(portfolioScenarios.id, id));
      return scenario;
    },

    async getByFund(
      fundId: number,
      options?: { scenarioType?: string; status?: string; limit?: number }
    ): Promise<PortfolioScenario[]> {
      let query = db
        .select()
        .from(portfolioScenarios)
        .where(eq(portfolioScenarios.fundId, fundId))
        .orderBy(desc(portfolioScenarios.createdAt));

      if (options?.limit) {
        query = query.limit(options.limit) as typeof query;
      }

      const scenarios = await query;

      return scenarios.filter((s) => {
        if (options?.scenarioType && s.scenarioType !== options.scenarioType) return false;
        if (options?.status && s.status !== options.status) return false;
        return true;
      });
    },

    async update(
      id: string,
      data: Partial<InsertPortfolioScenario>
    ): Promise<PortfolioScenario | undefined> {
      const [updated] = await db
        .update(portfolioScenarios)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(portfolioScenarios.id, id))
        .returning();
      return updated;
    },
  },

  // ============================================================================
  // SCENARIO COMPARISONS
  // ============================================================================

  comparisons: {
    async create(data: InsertScenarioComparison): Promise<ScenarioComparison> {
      const [comparison] = await db.insert(scenarioComparisons).values(data).returning();
      if (!comparison) throw new Error('Failed to create comparison');
      return comparison;
    },

    async getById(id: string): Promise<ScenarioComparison | undefined> {
      const [comparison] = await db
        .select()
        .from(scenarioComparisons)
        .where(eq(scenarioComparisons.id, id));
      return comparison;
    },
  },

  // ============================================================================
  // MONTE CARLO SIMULATIONS
  // ============================================================================

  simulations: {
    async create(data: InsertMonteCarloSimulation): Promise<MonteCarloSimulation> {
      const [simulation] = await db.insert(monteCarloSimulations).values(data).returning();
      if (!simulation) throw new Error('Failed to create simulation');
      return simulation;
    },

    async getById(id: string): Promise<MonteCarloSimulation | undefined> {
      const [simulation] = await db
        .select()
        .from(monteCarloSimulations)
        .where(eq(monteCarloSimulations.id, id));
      return simulation;
    },

    async getByScenario(scenarioId: string): Promise<MonteCarloSimulation[]> {
      return await db
        .select()
        .from(monteCarloSimulations)
        .where(eq(monteCarloSimulations.scenarioId, scenarioId))
        .orderBy(desc(monteCarloSimulations.createdAt));
    },
  },

  // ============================================================================
  // RESERVE STRATEGIES
  // ============================================================================

  reserves: {
    async create(data: InsertReserveAllocationStrategy): Promise<ReserveAllocationStrategy> {
      const [strategy] = await db.insert(reserveAllocationStrategies).values(data).returning();
      if (!strategy) throw new Error('Failed to create reserve strategy');
      return strategy;
    },

    async getById(id: string): Promise<ReserveAllocationStrategy | undefined> {
      const [strategy] = await db
        .select()
        .from(reserveAllocationStrategies)
        .where(eq(reserveAllocationStrategies.id, id));
      return strategy;
    },

    async getByFund(
      fundId: number,
      options?: { strategyType?: string; isActive?: boolean }
    ): Promise<ReserveAllocationStrategy[]> {
      const strategies = await db
        .select()
        .from(reserveAllocationStrategies)
        .where(eq(reserveAllocationStrategies.fundId, fundId))
        .orderBy(desc(reserveAllocationStrategies.createdAt));

      return strategies.filter((s) => {
        if (options?.strategyType && s.strategyType !== options.strategyType) return false;
        if (options?.isActive !== undefined && s.isActive !== options.isActive) return false;
        return true;
      });
    },

    async update(
      id: string,
      data: Partial<InsertReserveAllocationStrategy>
    ): Promise<ReserveAllocationStrategy | undefined> {
      const [updated] = await db
        .update(reserveAllocationStrategies)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(reserveAllocationStrategies.id, id))
        .returning();
      return updated;
    },
  },

  // ============================================================================
  // PERFORMANCE FORECASTS
  // ============================================================================

  forecasts: {
    async create(data: InsertPerformanceForecast): Promise<PerformanceForecast> {
      const [forecast] = await db.insert(performanceForecasts).values(data).returning();
      if (!forecast) throw new Error('Failed to create forecast');
      return forecast;
    },

    async getById(id: string): Promise<PerformanceForecast | undefined> {
      const [forecast] = await db
        .select()
        .from(performanceForecasts)
        .where(eq(performanceForecasts.id, id));
      return forecast;
    },

    async getByScenario(
      scenarioId: string,
      options?: { forecastType?: string; status?: string }
    ): Promise<PerformanceForecast[]> {
      const forecasts = await db
        .select()
        .from(performanceForecasts)
        .where(eq(performanceForecasts.scenarioId, scenarioId))
        .orderBy(desc(performanceForecasts.createdAt));

      return forecasts.filter((f) => {
        if (options?.forecastType && f.forecastType !== options.forecastType) return false;
        if (options?.status && f.status !== options.status) return false;
        return true;
      });
    },

    async update(
      id: string,
      data: Partial<InsertPerformanceForecast>
    ): Promise<PerformanceForecast | undefined> {
      const [updated] = await db
        .update(performanceForecasts)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(performanceForecasts.id, id))
        .returning();
      return updated;
    },
  },
};

export type {
  FundStrategyModel,
  PortfolioScenario,
  ReserveAllocationStrategy,
  PerformanceForecast,
  ScenarioComparison,
  MonteCarloSimulation,
};
