import { ReserveEngine } from '@shared/core/reserves/ReserveEngine';
import type { ReserveCompanyInput, ReserveOutput } from '@shared/types';
import {
  ScenarioReserveSummaryV1Schema,
  type FundScenarioReserveAllocationOverrideV1,
  type ReserveScenarioAllocationOverrideItemV1,
  type ScenarioReserveSummaryV1,
  type ScenarioReserveWarningV1,
} from '@shared/contracts/fund-scenario-sets-v1.contract';

function toCents(value: number): number {
  return Math.round(value * 100);
}

function buildBaseOutputByCompanyId(
  portfolio: ReserveCompanyInput[],
  baseOutputs: ReserveOutput[]
): Map<number, ReserveOutput> {
  const byCompanyId = new Map<number, ReserveOutput>();

  portfolio.forEach((company, index) => {
    const base = baseOutputs[index];
    if (base) {
      byCompanyId.set(company.id, base);
    }
  });

  return byCompanyId;
}

function buildOverrideMap(items: ReserveScenarioAllocationOverrideItemV1[]) {
  const byCompanyId = new Map<number, ReserveScenarioAllocationOverrideItemV1>();
  const duplicateCompanyIds = new Set<number>();

  for (const item of items) {
    if (byCompanyId.has(item.companyId)) {
      duplicateCompanyIds.add(item.companyId);
    }
    byCompanyId.set(item.companyId, item);
  }

  return { byCompanyId, duplicateCompanyIds };
}

function effectiveAllocationCents(item: ReserveScenarioAllocationOverrideItemV1) {
  const max = item.maxAllocationCents ?? null;
  const scenarioAllocationCents =
    max == null ? item.plannedReservesCents : Math.min(item.plannedReservesCents, max);

  return {
    scenarioAllocationCents,
    capApplied: max != null && max < item.plannedReservesCents,
  };
}

export function buildScenarioReserveSummary(input: {
  fundId: number;
  fundSizeCents: number | null;
  portfolio: ReserveCompanyInput[];
  override: FundScenarioReserveAllocationOverrideV1;
}): ScenarioReserveSummaryV1 {
  const baseOutputs = ReserveEngine(input.portfolio);
  const baseByCompanyId = buildBaseOutputByCompanyId(input.portfolio, baseOutputs);
  const { byCompanyId: overrides, duplicateCompanyIds } = buildOverrideMap(
    input.override.payload.items
  );
  const warnings: ScenarioReserveWarningV1[] = [];

  for (const companyId of duplicateCompanyIds) {
    warnings.push({
      code: 'DUPLICATE_COMPANY_OVERRIDE',
      companyId,
      message: `Duplicate reserve override for company ${companyId}; last value was used.`,
    });
  }

  for (const override of overrides.values()) {
    if (!baseByCompanyId.has(override.companyId)) {
      warnings.push({
        code: 'OVERRIDE_COMPANY_NOT_FOUND',
        companyId: override.companyId,
        message: `Reserve override references company ${override.companyId}, which was not found in the scenario portfolio.`,
      });
    }
  }

  const allocations = input.portfolio
    .map((company) => {
      const base = baseByCompanyId.get(company.id);
      const override = overrides.get(company.id);
      const baseAllocationCents = toCents(base?.allocation ?? 0);
      const plannedReservesCents = override?.plannedReservesCents ?? baseAllocationCents;
      const maxAllocationCents = override?.maxAllocationCents ?? null;
      const { scenarioAllocationCents, capApplied } = override
        ? effectiveAllocationCents(override)
        : {
            scenarioAllocationCents: baseAllocationCents,
            capApplied: false,
          };

      return {
        companyId: company.id,
        baseAllocationCents,
        plannedReservesCents,
        maxAllocationCents,
        scenarioAllocationCents,
        allocationDeltaCents: scenarioAllocationCents - baseAllocationCents,
        capApplied,
        confidence: base?.confidence ?? 0,
        rationale: override?.allocationReason ?? base?.rationale ?? 'Scenario reserve allocation',
      };
    })
    .sort((a, b) => a.companyId - b.companyId);

  const totalBaseAllocationCents = allocations.reduce(
    (sum, item) => sum + item.baseAllocationCents,
    0
  );
  const totalScenarioAllocationCents = allocations.reduce(
    (sum, item) => sum + item.scenarioAllocationCents,
    0
  );

  if (input.fundSizeCents != null && totalScenarioAllocationCents > input.fundSizeCents) {
    warnings.push({
      code: 'TOTAL_SCENARIO_ALLOCATION_EXCEEDS_FUND_SIZE',
      message: 'Total scenario reserve allocation exceeds fund size.',
    });
  }

  const avgConfidence =
    allocations.length === 0
      ? 0
      : allocations.reduce((sum, item) => sum + item.confidence, 0) / allocations.length;

  return ScenarioReserveSummaryV1Schema.parse({
    fundId: input.fundId,
    totalBaseAllocationCents,
    totalScenarioAllocationCents,
    totalAllocationDeltaCents: totalScenarioAllocationCents - totalBaseAllocationCents,
    avgConfidence: Math.round(avgConfidence * 100) / 100,
    highConfidenceCount: allocations.filter((item) => item.confidence >= 0.6).length,
    allocations,
    warnings,
    generatedAt: new Date().toISOString(),
  });
}
