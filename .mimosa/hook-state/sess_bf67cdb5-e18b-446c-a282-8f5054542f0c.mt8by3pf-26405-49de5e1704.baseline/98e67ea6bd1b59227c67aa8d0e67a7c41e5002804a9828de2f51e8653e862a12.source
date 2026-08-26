import type { FundCompanyActualsFactsResponse } from '../../../shared/contracts/fund-actuals/fund-company-actuals-fact.contract';
import type { PersistedFinancialFactsSnapshotV1 } from '../../../shared/contracts/financial-facts-snapshot-v1.contract';
import {
  PinnedMarginalReserveNonFactsSourcesV1Schema,
  PinnedReserveEnvelopeSourcesV1Schema,
  type PinnedMarginalReserveNonFactsSourcesV1,
  type PinnedReserveEnvelopeSourcesV1,
} from '../../../shared/contracts/dynamic-reserve-intelligence-v1.contract';
import { calculateMarginalReserveMoic } from '../../../shared/core/moic/MarginalReserveMoic';
import Decimal from '../../../shared/lib/decimal-config';
import { normalizeStageForCompatibility } from '../../../shared/schemas/stage';
import {
  buildMarginalReserveMoicInputsFromSources,
  type MarginalReserveInputSources,
} from '../moic/marginal-reserve-moic-input-service';
import {
  buildReserveEnvelopeFromSources,
  type ReserveEnvelopeSources,
} from './reserve-envelope-service';
import {
  foldMarginalCandidateStatus,
  type ComposeRankedReserveInput,
  type RankedReserveCandidate,
} from './ranked-reserve-orchestrator';

function hydrateFactsSnapshot(
  factsSnapshot: PersistedFinancialFactsSnapshotV1
): FundCompanyActualsFactsResponse {
  const snapshotFacts = factsSnapshot.payload.companyActuals;
  return {
    ...snapshotFacts,
    generatedAt: factsSnapshot.createdAt,
    facts: snapshotFacts.facts.map((fact) => ({
      ...fact,
      provenance: {
        ...fact.provenance,
        core: {
          ...fact.provenance.core,
          generatedAt: factsSnapshot.createdAt,
        },
      },
    })),
  };
}

function hydrateMarginalSources(
  pinned: PinnedMarginalReserveNonFactsSourcesV1,
  facts: FundCompanyActualsFactsResponse
): MarginalReserveInputSources {
  return {
    sourceSnapshotDate: pinned.sourceSnapshotDate,
    baseCurrency: pinned.baseCurrency,
    facts,
    companies: pinned.companies.map((company) => ({
      ...company,
      plannedReservesCents: company.plannedReservesCents,
    })),
    approvedAllocations: pinned.approvedAllocations.map((allocation) => ({
      ...allocation,
      finalPlannedReservesCents: allocation.finalPlannedReservesCents,
      decidedAt: allocation.decidedAt === null ? null : new Date(allocation.decidedAt),
      updatedAt: new Date(allocation.updatedAt),
    })),
    publishedAssumptions:
      pinned.publishedAssumptions === null
        ? null
        : {
            configId: pinned.publishedAssumptions.configId,
            version: pinned.publishedAssumptions.version,
            publishedAt:
              pinned.publishedAssumptions.publishedAt === null
                ? null
                : new Date(pinned.publishedAssumptions.publishedAt),
            config: pinned.publishedAssumptions.config,
          },
  };
}

function hydrateEnvelopeSources(pinned: PinnedReserveEnvelopeSourcesV1): ReserveEnvelopeSources {
  return {
    fund: { ...pinned.fund },
    investments: pinned.investments.map((investment) => ({ ...investment })),
    config:
      pinned.config === null
        ? null
        : {
            ...pinned.config,
            expenses: pinned.config.expenses?.map((expense) => ({ ...expense })) ?? null,
          },
  };
}

function candidateFromSources(input: {
  sources: MarginalReserveInputSources;
  companyId: number;
  status: RankedReserveCandidate['status'];
  marginalMoic: string | null;
  ownership: string | number | null;
}): RankedReserveCandidate {
  const company = input.sources.companies.find(
    (candidate) => candidate.companyId === input.companyId
  );
  const fact = input.sources.facts.facts.find(
    (candidate) => candidate.companyId === input.companyId
  );
  const sourceComplete = company !== undefined && fact !== undefined;
  const invested =
    fact === undefined
      ? 0
      : new Decimal(fact.initialInvestmentAmount).plus(fact.followOnInvestmentAmount).toNumber();
  let ownership = 0;
  try {
    const parsed = new Decimal(input.ownership ?? 0);
    if (parsed.isFinite() && parsed.gte(0) && parsed.lte(1)) ownership = parsed.toNumber();
  } catch {
    ownership = 0;
  }

  return {
    companyId: input.companyId,
    name: fact?.companyName ?? `Company ${input.companyId}`,
    canonicalStage: normalizeStageForCompatibility(company?.currentStage ?? company?.stage),
    invested,
    ownership,
    status: sourceComplete ? input.status : 'unavailable',
    marginalMoic: sourceComplete ? input.marginalMoic : null,
  };
}

export function buildRankedReserveInputFromSnapshot(input: {
  factsSnapshot: PersistedFinancialFactsSnapshotV1;
  marginalNonFactsSources: PinnedMarginalReserveNonFactsSourcesV1;
  envelopeSources: PinnedReserveEnvelopeSourcesV1;
}): ComposeRankedReserveInput {
  const marginalNonFactsSources = PinnedMarginalReserveNonFactsSourcesV1Schema.parse(
    input.marginalNonFactsSources
  );
  const envelopeSources = PinnedReserveEnvelopeSourcesV1Schema.parse(input.envelopeSources);
  const facts = hydrateFactsSnapshot(input.factsSnapshot);
  const marginalSources = hydrateMarginalSources(marginalNonFactsSources, facts);
  const envelope = buildReserveEnvelopeFromSources({
    fundId: input.factsSnapshot.fundId,
    asOfDate: input.factsSnapshot.asOfDate,
    sources: hydrateEnvelopeSources(envelopeSources),
  });
  const assembly = buildMarginalReserveMoicInputsFromSources({
    fundId: input.factsSnapshot.fundId,
    asOfDate: input.factsSnapshot.asOfDate,
    sources: marginalSources,
  });
  const candidates = [
    ...assembly.ready.map((marginalInput) => {
      const result = calculateMarginalReserveMoic(marginalInput);
      const readiness = marginalInput.readiness ?? {
        status: 'actionable' as const,
        reasons: [],
      };
      return candidateFromSources({
        sources: marginalSources,
        companyId: marginalInput.companyId,
        status: foldMarginalCandidateStatus(result.status, readiness.status),
        marginalMoic: result.marginalMoic,
        ownership: marginalInput.currentOwnership,
      });
    }),
    ...assembly.unavailable.map((failure) =>
      candidateFromSources({
        sources: marginalSources,
        companyId: failure.companyId,
        status: 'unavailable',
        marginalMoic: null,
        ownership:
          marginalSources.companies.find((company) => company.companyId === failure.companyId)
            ?.currentOwnership ?? null,
      })
    ),
  ];

  return {
    envelope,
    candidates,
    factsInputHash: assembly.factsInputHash,
    assumptionsHash: assembly.assumptionsHash,
  };
}
