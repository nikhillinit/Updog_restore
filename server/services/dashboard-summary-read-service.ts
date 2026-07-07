import { toNumber } from '@shared/number';
import type { IStorage } from '../storage';

export interface DashboardSummaryReadModel {
  fund: Awaited<ReturnType<IStorage['getFund']>>;
  portfolioCompanies: Awaited<ReturnType<IStorage['getPortfolioCompanies']>>;
  recentActivities: Awaited<ReturnType<IStorage['getActivities']>>;
  metrics: Awaited<ReturnType<IStorage['getFundMetrics']>>[number] | null;
  summary: {
    totalCompanies: number;
    deploymentRate: number;
    currentIRR: number;
  };
}

export async function getDashboardSummaryReadModel(
  store: IStorage,
  fundId: number
): Promise<DashboardSummaryReadModel | undefined> {
  const [fund, portfolioCompanies, activities, metrics] = await Promise.all([
    store.getFund(fundId),
    store.getPortfolioCompanies(fundId),
    store.getActivities(fundId),
    store.getFundMetrics(fundId),
  ]);

  if (!fund) {
    return undefined;
  }

  const latestMetrics = metrics.length > 0 ? (metrics[metrics.length - 1] ?? null) : null;
  const recentActivities = activities.slice(0, 5);

  const fundSize = toNumber(fund.size || 0, 'fund size');
  const deployedCapital = toNumber(fund.deployedCapital || 0, 'deployed capital');
  const currentIRR = latestMetrics ? toNumber(latestMetrics.irr || 0, 'IRR') * 100 : 0;

  return {
    fund,
    portfolioCompanies,
    recentActivities,
    metrics: latestMetrics,
    summary: {
      totalCompanies: portfolioCompanies.length,
      deploymentRate: fundSize !== 0 ? (deployedCapital / fundSize) * 100 : 0,
      currentIRR,
    },
  };
}
