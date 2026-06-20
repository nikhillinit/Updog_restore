import { db } from '../db';
import { MOICCalculator } from '../../shared/core/moic/MOICCalculator.js';
import type { Investment as MOICInvestment } from '../../shared/core/moic/MOICCalculator.js';
import { dbToMOICInvestment } from '../routes/moic.js';
import type { FundMoicRankingsResponseV1 } from '../../shared/contracts/fund-moic-v1.contract.js';

export function buildMoicRankingsFromInvestments(
  fundId: number,
  investments: MOICInvestment[]
): FundMoicRankingsResponseV1 {
  const ranked = MOICCalculator.rankByReservesMOIC(investments);

  return {
    fundId,
    provenance: {
      source: 'portfolio_companies',
      calculation: 'reserves_moic_rankings',
      metricBasis: 'planned_reserves',
      sourceRecordCount: investments.length,
    },
    generatedAt: new Date().toISOString(),
    rankings: ranked.map((item) => ({
      rank: item.rank,
      investmentId: item.investment.id,
      investmentName: item.investment.name,
      reservesMoic: {
        value: item.reservesMOIC.value,
        description: item.reservesMOIC.description,
        formula: item.reservesMOIC.formula,
      },
    })),
  };
}

export async function getFundMoicRankings(fundId: number): Promise<FundMoicRankingsResponseV1> {
  const companies = await db.query.portfolioCompanies.findMany({
    where: (pc, { eq }) => eq(pc.fundId, fundId),
    orderBy: (pc, { asc }) => [asc(pc.id)],
  });

  const investments: MOICInvestment[] = companies.map((pc) =>
    dbToMOICInvestment({
      id: pc.id,
      name: pc.name,
      investmentAmount: pc.investmentAmount,
      currentValuation: pc.currentValuation,
      projectedExitValue: null,
      exitProbability: null,
      plannedReservesCents: pc.plannedReservesCents,
      exitMoicBps: pc.exitMoicBps,
      investmentDate: pc.investmentDate,
      followOnAmount: null,
    })
  );

  return buildMoicRankingsFromInvestments(fundId, investments);
}
