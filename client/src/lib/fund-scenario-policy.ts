import type {
  FundScenarioCalculationModeV1,
  FundScenarioCalculationStatusV1,
  FundScenarioOverrideTypeV1,
  FundScenarioSetDetailV1,
  FundScenarioSetSummaryV1,
  ScenarioSetResultSummaryV1,
} from '@shared/contracts/fund-scenario-sets-v1.contract';

function calculationModeFor(
  overrideType: FundScenarioOverrideTypeV1 | undefined
): FundScenarioCalculationModeV1 | null {
  switch (overrideType) {
    case 'reserve_allocation':
      return 'async_reserve_allocation';
    case 'fee_profile':
      return 'sync_fee_profile';
    case 'allocation':
      return 'sync_allocation';
    case 'sector_profile':
      return 'sync_sector_profile';
    case 'methodology':
      return 'sync_methodology';
    default:
      return null;
  }
}

function policyForScenario(
  summary: FundScenarioSetSummaryV1,
  detail: FundScenarioSetDetailV1 | undefined,
  result: ScenarioSetResultSummaryV1 | undefined,
  reserveStatus: FundScenarioCalculationStatusV1 | undefined
) {
  const overrideType = detail?.variants[0]?.override.overrideType;
  const calculationMode = calculationModeFor(overrideType);
  const isReserve = calculationMode === 'async_reserve_allocation';
  const calculationPath: 'reserve' | 'sync' = isReserve ? 'reserve' : 'sync';
  const actionText = isReserve ? 'Queue' : 'Calculate';
  let status = reserveStatus ?? null;

  if (!status && calculationMode && !isReserve) {
    status = {
      fundId: summary.fundId,
      scenarioSetId: summary.id,
      calculationMode,
      status: result ? 'succeeded' : 'not_requested',
      jobId: null,
      correlationId: null,
      snapshotId: null,
      failureCode: null,
      lastEventAt: result?.calculatedAt ?? null,
      lastError: null,
    };
  }

  return {
    detail: detail ?? null,
    overrideType: overrideType ?? null,
    status,
    calculationPath,
    actionText,
    actionLabel: `${actionText} ${summary.name}`,
  };
}

export type FundScenarioSetPolicy = ReturnType<typeof policyForScenario>;

/** Derive workspace decisions from the evidence available at this render. */
export function deriveFundScenarioPolicy({
  scenarioSets,
  details,
  results,
  reserveStatuses = [],
}: {
  scenarioSets: readonly FundScenarioSetSummaryV1[];
  details: readonly (FundScenarioSetDetailV1 | undefined)[];
  results: readonly ScenarioSetResultSummaryV1[];
  reserveStatuses?: readonly (FundScenarioCalculationStatusV1 | undefined)[];
}) {
  const detailById = new Map(
    details.flatMap((detail) => (detail ? [[detail.id, detail] as const] : []))
  );
  const resultById = new Map(results.map((result) => [result.scenarioSetId, result]));
  const statusById = new Map(
    reserveStatuses.flatMap((status) => (status ? [[status.scenarioSetId, status] as const] : []))
  );
  const byId = new Map(
    scenarioSets.map(
      (summary) =>
        [
          summary.id,
          policyForScenario(
            summary,
            detailById.get(summary.id),
            resultById.get(summary.id),
            statusById.get(summary.id)
          ),
        ] as const
    )
  );

  return {
    byId,
    reserveScenarioSetIds: scenarioSets
      .filter((summary) => byId.get(summary.id)?.calculationPath === 'reserve')
      .map((summary) => summary.id),
    // Results can arrive before matching details, including reserve comparisons
    // whose existing transport returns an unsupported-override response.
    comparisonScenarioSetIds: results.map((result) => result.scenarioSetId),
  };
}

// Query data retains the last successful status through transient polling errors.
export function reserveStatusPollIntervalMs(
  status: FundScenarioCalculationStatusV1['status'] | undefined
): number | false {
  return status === 'queued' || status === 'calculating' ? 4000 : false;
}
