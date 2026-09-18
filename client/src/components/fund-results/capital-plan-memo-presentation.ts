import {
  CAPITAL_PLANNING_DISCLOSURES,
  type CapitalPlanningMemoV1,
} from '@shared/contracts/capital-planning-v1.contract';
import type { CapitalPlanningMemo } from '@shared/contracts/capital-planning-v2.contract';
import { formatDecimalCurrency } from '@/lib/format/lp-reporting/decimal';
import { MoneyDecimalStringSchema } from '@shared/lib/decimal-string';

export interface CapitalMemoSection {
  title: string;
  rows: Array<{ label: string; value: string }>;
}

const LABELS: Record<string, string> = {
  expectedCountRoundingResidual: 'Expected count rounding residual',
  initialAllocationRoundingResidualUsd: 'Initial allocation rounding residual (USD)',
  capitalRoundingResidualUsd: 'Capital rounding residual (USD)',
  initialScheduleRoundingResidualUsd: 'Initial schedule rounding residual (USD)',
  followOnScheduleRoundingResidualUsd: 'Follow on schedule rounding residual (USD)',
  pathDemandRoundingResidualUsd: 'Path demand rounding residual (USD)',
  pathProbabilityRoundingResidual: 'Path probability rounding residual',
  inputSupport: 'Input support',
  lifetimeCapacity: 'Lifetime capacity',
  allocationBudget: 'Allocation budget',
  reserveEarmark: 'Reserve earmark',
  timing: 'Timing',
  staleness: 'Staleness',
  sourceFreshness: 'Source freshness',
  calculationReadiness: 'Calculation readiness',
  interpretationCompatibility: 'Interpretation compatibility',
  gpCommitmentUsd: 'Contractual GP commitment',
  fundedFromFeesRatio: 'Effective funded-from-fees fraction',
  gpDeemedContributionUsd: 'GP deemed contribution deduction',
  availableConstructionCapitalUsd: 'Available construction capital (A)',
  totalPreferencesJuniorUsd: 'Preferences Behind Position',
  adjustedMoic: 'Adjusted MOIC',
  baselineMoic: 'Baseline MOIC',
  effectiveFmv: 'Effective FMV',
  positionFmv: 'Source position FMV',
  manualFmvOverride: 'Manual FMV override',
  effectiveOwnershipRatio: 'Effective ownership ratio',
  noPreferenceBaselineUsd: 'No-preference baseline',
  feePopulation: 'Supported fee population',
  committedCapitalUsd: 'Committed capital',
  planningBudgetUsd: 'Planning budget',
  lifetimeFeesUsd: 'Lifetime fees',
  lifetimeExpensesUsd: 'Lifetime expenses',
  signedLifetimeHeadroomUsd: 'Signed lifetime headroom',
  signedBudgetResidualUsd: 'Signed budget residual',
  beyondTermFollowOnUsd: 'Beyond-term follow-on demand',
  withinTermFollowOnUsd: 'Within-term follow-on demand',
};

function labelFor(key: string): string {
  return (
    LABELS[key] ??
    key
      .replace(/Usd$/, ' (USD)')
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/^./, (character) => character.toUpperCase())
  );
}

function scalar(value: unknown, key: string): string {
  if (value === null || value === undefined) return 'Unavailable: not provided';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (
    typeof value === 'string' &&
    [
      'over_capacity',
      'allocation_gap',
      'earmark_gap',
      'INFEASIBLE_UNDER_MODELED_ASSUMPTIONS',
    ].includes(value)
  ) {
    return `${value} (under modeled assumptions)`;
  }
  if (
    typeof value === 'string' &&
    key.endsWith('Usd') &&
    MoneyDecimalStringSchema.safeParse(value).success
  ) {
    return `${formatDecimalCurrency(value)} (USD ${value})`;
  }
  return String(value);
}

// Presentation only: preserve saved decimal strings and explicit availability.
function rowsOf(value: unknown, prefix = '', key = ''): CapitalMemoSection['rows'] {
  if (value === null || typeof value !== 'object') {
    return [{ label: prefix, value: scalar(value, key) }];
  }
  if ('state' in value && value.state === 'unavailable' && 'reason' in value) {
    return [
      { label: prefix, value: `Unavailable: ${String(value.reason)}` },
      ...Object.entries(value)
        .filter(([field]) => !['state', 'reason', 'value'].includes(field))
        .flatMap(([field, detail]) => rowsOf(detail, `${prefix} / ${labelFor(field)}`, field)),
    ];
  }
  if ('state' in value && value.state === 'available' && 'value' in value) {
    return [{ label: prefix, value: scalar(value.value, key) }];
  }
  const entries = Object.entries(value);
  if (entries.length === 0) return [{ label: prefix, value: 'None' }];
  return entries.flatMap(([childKey, child], index) => {
    const label = Array.isArray(value) ? `${index + 1}` : labelFor(childKey);
    return rowsOf(child, prefix ? `${prefix} / ${label}` : label, childKey);
  });
}

/** Both the view and clipboard use these rows; neither recomputes financial output. */
function legacyCapitalPlanMemoSections(
  memo: CapitalPlanningMemoV1,
  preview = false
): CapitalMemoSection[] {
  const { result, readState } = memo;
  const { construction, performance, sourceBundle } = result;
  const gp = sourceBundle.gp;
  const saved = !preview && readState.calculationReadiness.context === 'saved_input';
  const sections: CapitalMemoSection[] = [
    {
      title: saved ? 'Capital plan memo' : 'Capital plan preview',
      rows: [
        { label: 'Fund', value: String(memo.fundId) },
        { label: 'Scenario set', value: memo.scenarioSetName },
        { label: 'Variant', value: memo.variantName },
        { label: 'Scenario set ID', value: saved ? memo.scenarioSetId : 'Not saved' },
        { label: 'Variant ID', value: saved ? memo.variantId : 'Not saved' },
        { label: 'Count basis', value: memo.countBasis },
        { label: 'Rendering scope', value: 'labeled summary' },
        {
          label: 'Omitted monthly detail',
          value: saved
            ? `${construction.monthlyDetail.length} rows; complete saved memo download retains these rows.`
            : `${construction.monthlyDetail.length} rows omitted from this unsaved preview.`,
        },
        { label: 'Memo contract version', value: memo.contractVersion },
        { label: 'Calculation method version', value: construction.methodVersion },
        { label: 'Result contract version', value: result.contractVersion },
        { label: 'Source interpretation version', value: sourceBundle.interpretationVersion },
        { label: 'Source published at', value: sourceBundle.publishedAt },
        { label: 'Source bundle hash', value: sourceBundle.sourceBundleHash },
        { label: 'Headline', value: construction.headline },
        { label: 'Qualifications', value: construction.qualifications.join('; ') || 'None' },
      ],
    },
    { title: 'Read state', rows: rowsOf(readState) },
    {
      title: 'Verdict axes',
      rows: [
        {
          label: 'Verdict scope',
          value: saved
            ? 'Saved calculation assumptions; current source freshness is shown in Read state.'
            : 'Unsaved preview assumptions; source freshness is shown in Read state.',
        },
        ...rowsOf(construction.verdicts),
      ],
    },
    { title: 'Capital budget', rows: rowsOf(construction.budget) },
    {
      title: 'GP source and deemed contribution',
      rows: [
        { label: 'Resolved GP source', value: gp.resolved.source },
        {
          label: 'Contractual GP commitment',
          value: scalar(gp.resolved.commitmentUsd, 'commitmentUsd'),
        },
        {
          label: 'Raw funded-from-fees fraction',
          value:
            gp.fundedFromFeesPct.state === 'present'
              ? String(gp.fundedFromFeesPct.fact.rawValue)
              : 'Absent',
        },
        {
          label: 'Effective funded-from-fees fraction',
          value: gp.fundedFromFeesPct.effectiveValue,
        },
        {
          label: 'Fraction default reason',
          value: gp.fundedFromFeesPct.defaultReason ?? 'No default applied',
        },
        ...rowsOf(gp, 'Retained GP source facts'),
      ],
    },
    { title: 'Construction', rows: rowsOf(construction.allocations) },
    { title: 'Reconciliation', rows: rowsOf(construction.reconciliation) },
    {
      title: 'Schedule',
      rows: [
        { label: 'Timing disclosure', value: construction.disclosures.timing },
        ...rowsOf(construction.annualSchedule),
      ],
    },
    { title: 'Stress results', rows: rowsOf(construction.stresses) },
    {
      title: 'Aggregate preference forecast',
      rows: performance
        ? [
            {
              label:
                performance.input.issuerKind === 'representative_issuer'
                  ? 'Representative issuer'
                  : 'Named holding',
              value: performance.input.issuerLabel,
            },
            {
              label: 'Preferences Behind Position',
              value: scalar(
                performance.input.totalPreferencesJuniorUsd,
                'totalPreferencesJuniorUsd'
              ),
            },
            {
              label: 'Effective FMV',
              value: performance.effectiveFmv
                ? scalar(performance.effectiveFmv.amountUsd, 'amountUsd')
                : `Unavailable: ${performance.fmvUnavailableReason ?? 'FMV_UNAVAILABLE'}`,
            },
            ...rowsOf(performance),
          ]
        : [
            {
              label: 'Optional companion',
              value: 'Unavailable: COMPANION_UNAVAILABLE (not selected)',
            },
          ],
    },
    { title: saved ? 'Saved inputs' : 'Review inputs', rows: rowsOf(result.input) },
    {
      title: 'Provenance',
      rows: [
        ...rowsOf(sourceBundle.projection, 'Source projection'),
        ...rowsOf(sourceBundle.unitDeclarations, 'Source unit declarations'),
        ...rowsOf(sourceBundle.feeExpense, 'Supported fees and expenses'),
        ...rowsOf(result.provenance, 'Assumptions'),
        ...rowsOf(result.benchmarkSnapshots, 'Retained benchmark snapshots'),
      ],
    },
    {
      title: 'Limitations',
      rows: memo.limitations.map((value) => ({ label: 'Limitation', value })),
    },
    {
      title: 'Disclosures',
      rows: [
        { label: 'Budget', value: construction.disclosures.budget },
        { label: 'Timing', value: construction.disclosures.timing },
        {
          label: 'Aggregate preference',
          value: performance?.disclosure ?? CAPITAL_PLANNING_DISCLOSURES.preference,
        },
        { label: 'GP deemed contribution', value: construction.disclosures.gp },
      ],
    },
  ];
  return sections;
}

export function capitalPlanMemoSections(
  memo: CapitalPlanningMemo,
  preview = false
): CapitalMemoSection[] {
  if (memo.result.contractVersion !== 'capital-planning/2.0.0')
    return legacyCapitalPlanMemoSections(memo as CapitalPlanningMemoV1, preview);
  const result = memo.result;
  const { construction, input, sourceBundle } = result;
  const saved = !preview && memo.readState.calculationReadiness.context === 'saved_input';
  return [
    {
      title: saved ? 'Capital plan memo' : 'Capital plan preview',
      rows: [
        { label: 'Fund', value: String(memo.fundId) },
        { label: 'Scenario set', value: memo.scenarioSetName },
        { label: 'Variant', value: memo.variantName },
        { label: 'Scenario set ID', value: saved ? memo.scenarioSetId : 'Not saved' },
        { label: 'Calculation method version', value: result.contractVersion },
        { label: 'Rounding policy', value: result.roundingPolicy },
        {
          label: 'Solve mode',
          value: construction.solution.mode === 'fixed_fund' ? 'Fixed fund' : 'Fixed portfolio',
        },
        { label: 'Count basis', value: 'Expected fractional company counts' },
        { label: 'Source bundle hash', value: sourceBundle.sourceBundleHash },
        { label: 'Source interpretation version', value: sourceBundle.interpretationVersion },
        { label: 'Source published at', value: sourceBundle.publishedAt },
      ],
    },
    { title: 'Read state', rows: rowsOf(memo.readState) },
    {
      title: 'Source capital and hypothetical commitments',
      rows: [
        ...rowsOf(construction.budgetBridge),
        {
          label: 'Required commitments basis',
          value: 'Hypothetical comparison only; source commitments remain unchanged',
        },
      ],
    },
    {
      title: 'Initial investment pool and reconciliation',
      rows: [
        ...rowsOf(construction.solution),
        {
          label: 'Residual treatment',
          value:
            'Signed rounding residuals are disclosed; never redistributed into allocations, counts, schedules, or paths',
        },
      ],
    },
    {
      title: 'Initial dollar weights and fractional counts',
      rows: construction.allocations.flatMap((allocation) =>
        rowsOf(
          {
            initialPoolShareRatio: allocation.initialPoolShareRatio,
            initialCheckUsd: allocation.initialCheckUsd,
            expectedCompanyCount: allocation.expectedCompanyCount,
            initialDemandUsd: allocation.initialDemandUsd,
            reserveUsd: allocation.reserveUsd,
            initialScheduleRoundingResidualUsd: allocation.initialScheduleRoundingResidualUsd,
            followOnScheduleRoundingResidualUsd: allocation.followOnScheduleRoundingResidualUsd,
          },
          allocation.name
        )
      ),
    },
    {
      title: 'Explicit entered portfolio selections',
      rows: [
        {
          label: 'Entered selection basis',
          value: 'User-supplied integer counts; expected solve unchanged',
        },
        ...construction.allocations.flatMap((allocation) =>
          allocation.entered
            ? rowsOf(allocation.entered, allocation.name)
            : [{ label: allocation.name, value: 'Not entered' }]
        ),
      ],
    },
    {
      title: 'Ownership and participation histories',
      rows: construction.allocations.flatMap((allocation) => {
        const last = allocation.rounds.at(-1);
        const live = last?.paths.filter((path) => path.state === 'live').length ?? 0;
        const stopped = new Set(
          allocation.rounds.flatMap((round) =>
            round.paths
              .filter((path) => path.state === 'stopped')
              .map((path) => `${path.roundIndex}:${path.participationHistory}`)
          )
        ).size;
        return [
          { label: `${allocation.name} / Live graduated histories`, value: String(live) },
          { label: `${allocation.name} / Stopped non-graduated histories`, value: String(stopped) },
          { label: `${allocation.name} / Retained states`, value: String(live + stopped) },
          {
            label: `${allocation.name} / Stopped-state basis`,
            value: 'Non-graduation stops financing; it does not imply failure, exit, or disposal',
          },
          ...rowsOf(allocation.rounds, allocation.name),
        ];
      }),
    },
    {
      title: 'Financing, pool, and timing declarations',
      rows: input.allocations.flatMap((allocation) => [
        ...rowsOf(
          {
            scheduleAnchor: allocation.scheduleAnchor,
            deploymentCadence: allocation.deploymentCadence,
          },
          allocation.name
        ),
        ...[
          { label: allocation.entryRound, financing: allocation.entryFinancing },
          ...allocation.followOnRounds.map((round) => ({
            label: round.roundLabel,
            financing: round.financing,
          })),
        ].flatMap(({ label, financing }) => [
          {
            label: `${allocation.name} / ${label} / Primary capital denominator`,
            value:
              financing.primaryCapital.basis === 'total_primary_including_fund_check'
                ? 'Fixed total primary capital whether fund participates or skips; other investors supply remainder'
                : 'Fixed external primary capital; fund check adds to total',
          },
          ...rowsOf(financing, `${allocation.name} / ${label}`),
        ]),
        ...rowsOf(
          allocation.followOnRounds.map(
            ({
              roundLabel,
              timingBasis,
              poolBasis,
              incrementalPreMoneyPoolDilutionRatio,
              lagMonthsFromPreviousRound,
              eligibility,
              participationPolicy,
            }) => ({
              roundLabel,
              timingBasis,
              poolBasis,
              incrementalPreMoneyPoolDilutionRatio,
              lagMonthsFromPreviousRound,
              eligibility,
              participationPolicy,
            })
          ),
          allocation.name
        ),
      ]),
    },
    { title: 'Schedule', rows: rowsOf(construction.annualSchedule) },
    { title: 'Stress results', rows: rowsOf(construction.stresses) },
    {
      title: 'Assumptions and provenance',
      rows: [
        {
          label: 'Default evidence status',
          value:
            'Manager assumptions; no empirical graduation, participation, pool, timing, or exit policy installed',
        },
        ...rowsOf(input.assumptionEvidence ?? [], 'Explicit evidence'),
        ...rowsOf(result.provenance, 'Source provenance'),
        ...rowsOf(sourceBundle.unitDeclarations, 'Source units'),
      ],
    },
    {
      title: 'Disclosures',
      rows: [
        ...rowsOf(construction.disclosures),
        ...rowsOf(construction.assumptions),
        {
          label: 'Monthly detail',
          value: `${construction.monthlyDetail.length} rows; complete saved memo download retains all rows`,
        },
        ...memo.limitations.map((value) => ({ label: 'Limitation', value })),
      ],
    },
  ];
}

export function formatCapitalPlanMemo(memo: CapitalPlanningMemo): string {
  return capitalPlanMemoSections(memo)
    .map(
      (section) =>
        `${section.title}\n${section.rows.map(({ label, value }) => `${label}: ${value}`).join('\n')}`
    )
    .join('\n\n');
}
