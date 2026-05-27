import { ReserveEngine } from '@shared/core/reserves/ReserveEngine';
import type { ReserveCompanyInput, ReserveOutput } from '@shared/types';
import {
  ScenarioReserveSummaryV1Schema,
  type FundScenarioReserveAllocationOverrideV1,
  type ReserveScenarioAllocationOverrideItemV1,
  type ScenarioReserveSummaryV1,
  type ScenarioReserveWarningV1,
} from '@shared/contracts/fund-scenario-sets-v1.contract';

type ScenarioReserveAllocationResult = ScenarioReserveSummaryV1['allocations'][number];

interface BaseAllocationRow {
  company: ReserveCompanyInput;
  base: ReserveOutput | null;
  inputIndex: number;
}

interface EffectiveAllocationInput {
  plannedReservesCents: number;
  maxAllocationCents: number | null;
}

interface EffectiveAllocationResult {
  scenarioAllocationCents: number;
  capApplied: boolean;
}

function toCents(value: number): number {
  return Math.round(value * 100);
}

function buildBaseAllocationRows(
  portfolio: ReserveCompanyInput[],
  baseOutputs: ReserveOutput[]
): BaseAllocationRow[] {
  return portfolio.map((company, index) => ({
    company,
    base: baseOutputs[index] ?? null,
    inputIndex: index,
  }));
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

function duplicateOverrideWarnings(duplicateCompanyIds: Set<number>): ScenarioReserveWarningV1[] {
  const warnings: ScenarioReserveWarningV1[] = [];

  for (const companyId of duplicateCompanyIds) {
    warnings.push({
      code: 'DUPLICATE_COMPANY_OVERRIDE',
      companyId,
      message: `Duplicate reserve override for company ${companyId}; last value was used.`,
    });
  }

  return warnings;
}

function missingCompanyWarnings(
  overrides: Map<number, ReserveScenarioAllocationOverrideItemV1>,
  portfolioCompanyIds: Set<number>
): ScenarioReserveWarningV1[] {
  const warnings: ScenarioReserveWarningV1[] = [];

  for (const override of overrides.values()) {
    if (!portfolioCompanyIds.has(override.companyId)) {
      warnings.push({
        code: 'OVERRIDE_COMPANY_NOT_FOUND',
        companyId: override.companyId,
        message: `Reserve override references company ${override.companyId}, which was not found in the scenario portfolio.`,
      });
    }
  }

  return warnings;
}

function fundSizeWarning(input: {
  fundSizeCents: number | null;
  totalScenarioAllocationCents: number;
}): ScenarioReserveWarningV1[] {
  if (input.fundSizeCents == null || input.totalScenarioAllocationCents <= input.fundSizeCents) {
    return [];
  }

  return [
    {
      code: 'TOTAL_SCENARIO_ALLOCATION_EXCEEDS_FUND_SIZE',
      message: 'Total scenario reserve allocation exceeds fund size.',
    },
  ];
}

function buildAllocationResult(
  row: BaseAllocationRow,
  overrides: Map<number, ReserveScenarioAllocationOverrideItemV1>
): ScenarioReserveAllocationResult {
  const override = overrides.get(row.company.id);
  const baseAllocationCents = toCents(row.base?.allocation ?? 0);
  const plannedReservesCents = override?.plannedReservesCents ?? baseAllocationCents;
  const maxAllocationCents = override?.maxAllocationCents ?? null;
  const { scenarioAllocationCents, capApplied } = effectiveAllocationCents({
    plannedReservesCents,
    maxAllocationCents,
  });

  return {
    companyId: row.company.id,
    baseAllocationCents,
    plannedReservesCents,
    maxAllocationCents,
    scenarioAllocationCents,
    allocationDeltaCents: scenarioAllocationCents - baseAllocationCents,
    capApplied,
    confidence: row.base?.confidence ?? 0,
    rationale: override?.allocationReason ?? row.base?.rationale ?? 'Scenario reserve allocation',
  };
}

function buildAllocations(
  rows: BaseAllocationRow[],
  overrides: Map<number, ReserveScenarioAllocationOverrideItemV1>
): ScenarioReserveAllocationResult[] {
  return rows
    .map((row) => ({
      allocation: buildAllocationResult(row, overrides),
      inputIndex: row.inputIndex,
    }))
    .sort((a, b) => a.allocation.companyId - b.allocation.companyId || a.inputIndex - b.inputIndex)
    .map((item) => item.allocation);
}

function allocationTotal(
  allocations: ScenarioReserveAllocationResult[],
  key: 'baseAllocationCents' | 'scenarioAllocationCents'
): number {
  return allocations.reduce((sum, item) => sum + item[key], 0);
}

function averageConfidence(allocations: ScenarioReserveAllocationResult[]): number {
  if (allocations.length === 0) {
    return 0;
  }

  const average = allocations.reduce((sum, item) => sum + item.confidence, 0) / allocations.length;
  return Math.round(average * 100) / 100;
}

export function buildScenarioReserveSummary(input: {
  fundId: number;
  fundSizeCents: number | null;
  portfolio: ReserveCompanyInput[];
  override: FundScenarioReserveAllocationOverrideV1;
}): ScenarioReserveSummaryV1 {
  const baseRows = buildBaseAllocationRows(input.portfolio, ReserveEngine(input.portfolio));
  const { byCompanyId: overrides, duplicateCompanyIds } = buildOverrideMap(
    input.override.payload.items
  );
  const allocations = buildAllocations(baseRows, overrides);

  const totalBaseAllocationCents = allocationTotal(allocations, 'baseAllocationCents');
  const totalScenarioAllocationCents = allocationTotal(allocations, 'scenarioAllocationCents');
  const portfolioCompanyIds = new Set(input.portfolio.map((company) => company.id));
  const warnings = [
    ...duplicateOverrideWarnings(duplicateCompanyIds),
    ...missingCompanyWarnings(overrides, portfolioCompanyIds),
    ...fundSizeWarning({ fundSizeCents: input.fundSizeCents, totalScenarioAllocationCents }),
  ];

  return ScenarioReserveSummaryV1Schema.parse({
    fundId: input.fundId,
    totalBaseAllocationCents,
    totalScenarioAllocationCents,
    totalAllocationDeltaCents: totalScenarioAllocationCents - totalBaseAllocationCents,
    avgConfidence: averageConfidence(allocations),
    highConfidenceCount: allocations.filter((item) => item.confidence >= 0.6).length,
    allocations,
    warnings,
    generatedAt: new Date().toISOString(),
  });
}

function effectiveAllocationCents(input: EffectiveAllocationInput): EffectiveAllocationResult {
  const max = input.maxAllocationCents;
  const scenarioAllocationCents =
    max == null ? input.plannedReservesCents : Math.min(input.plannedReservesCents, max);

  return {
    scenarioAllocationCents,
    capApplied: max != null && max < input.plannedReservesCents,
  };
}
