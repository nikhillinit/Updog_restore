import { ApiError } from '@/lib/queryClient';
import {
  CAPITAL_PLANNING_VERSION,
  AGGREGATE_PREFERENCE_FORECAST_VERSION,
  CapitalIssuesV1Schema,
  CapitalPlanningDraftV1Schema,
  CAPITAL_PLANNING_PROVISIONAL_LIMITS,
  type CapitalPlanningInputV1,
  type CapitalBenchmarkSelectionV1,
  type CapitalIssueV1,
} from '@shared/contracts/capital-planning-v1.contract';
import {
  CreateFundScenarioSetV3Schema,
  type CreateFundScenarioSetV3,
  type FundScenarioCapitalSourceResponseV1,
  type FundScenarioCapitalDetailResponseV1,
} from '@shared/contracts/fund-scenario-sets-v1.contract';
import Decimal from '@shared/lib/decimal-config';

export type RawCapital<T> = T extends readonly (infer V)[]
  ? RawCapital<V>[]
  : T extends object
    ? { [K in keyof T]: RawCapital<T[K]> }
    : T extends string | number
      ? string
      : T;
export type RawCapitalInput = RawCapital<CapitalPlanningInputV1>;
export type RawCapitalAllocation = RawCapitalInput['allocations'][number];
export type RawCapitalRound = RawCapitalAllocation['followOnRounds'][number];
export type RawCapitalVariant = {
  variantId: string;
  name: string;
  input: RawCapitalInput;
  benchmarkSelections: RawCapital<CapitalBenchmarkSelectionV1>[];
};
export type CapitalPlanDraft = {
  name: string;
  description: string;
  variants: RawCapitalVariant[];
  declarations: Record<string, string>;
  source: FundScenarioCapitalSourceResponseV1 | null;
};

// Drafts survive modal and route return in this tab. Only explicit New draft replaces them.
const drafts = new Map<string, CapitalPlanDraft>();
type SaveIntent = { request: CreateFundScenarioSetV3; key: string };
const saveIntents = new Map<string, SaveIntent>();

export function getCapitalSaveIntent(fundId: string): SaveIntent | null {
  return saveIntents.get(fundId) ?? null;
}
export function retainCapitalSaveIntent(fundId: string, intent: SaveIntent | null): void {
  if (intent) saveIntents.set(fundId, intent);
  else saveIntents.delete(fundId);
}

export function emptyCapitalAllocation(): RawCapitalAllocation {
  return {
    allocationId: '',
    name: '',
    entryRound: '',
    pipelineProfileId: '',
    entryStageId: '',
    budgetShareRatio: '',
    initialCheckUsd: '',
    deploymentPeriodYears: '',
    followOnRounds: [],
  };
}
export function emptyCapitalRound(): RawCapitalRound {
  return {
    roundId: crypto.randomUUID(),
    stageId: '',
    roundLabel: '',
    graduationRatio: '',
    participationRatio: '',
    checkPolicy: { type: '', checkUsd: '' },
    monthsAfterPreviousRound: '',
    timeOrigin: 'previous_round',
  };
}
export function emptyCapitalCompanion(): NonNullable<RawCapitalInput['performanceCase']> {
  return {
    methodVersion: AGGREGATE_PREFERENCE_FORECAST_VERSION,
    issuerLabel: '',
    issuerKind: '',
    exitEquityValueUsd: '',
    exitDate: '',
    asConvertedOwnershipRatio: '',
    fundLiquidationPreferenceUsd: '',
    preferenceType: '',
    participationCap: { type: 'none' },
    totalPreferencesSeniorUsd: '',
    totalPreferencesPariPassuUsd: '',
    totalPreferencesJuniorUsd: '',
    investedCostUsd: '',
  };
}
export function newCapitalDraft(): CapitalPlanDraft {
  return {
    name: '',
    description: '',
    variants: [
      {
        variantId: crypto.randomUUID(),
        name: 'Baseline',
        input: {
          contractVersion: CAPITAL_PLANNING_VERSION,
          allocations: [emptyCapitalAllocation()],
        },
        benchmarkSelections: [],
      },
    ],
    declarations: {},
    source: null,
  };
}
export function getCapitalDraft(fundId: string): CapitalPlanDraft {
  let draft = drafts.get(fundId);
  if (!draft) {
    draft = newCapitalDraft();
    drafts.set(fundId, draft);
  }
  return draft;
}
export function retainCapitalDraft(fundId: string, draft: CapitalPlanDraft): void {
  drafts.set(fundId, draft);
}

function rawCopy<T>(value: T): RawCapital<T> {
  if (typeof value === 'number') return String(value) as RawCapital<T>;
  if (Array.isArray(value)) return value.map(rawCopy) as RawCapital<T>;
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, rawCopy(item)])
    ) as RawCapital<T>;
  }
  return value as RawCapital<T>;
}

export function duplicateCapitalDraft(
  detail: FundScenarioCapitalDetailResponseV1
): CapitalPlanDraft {
  return {
    name: detail.name,
    description: detail.description ?? '',
    source: null,
    declarations: { ...detail.variants[0]!.override.payload.sourceBundle.unitDeclarations },
    variants: detail.variants.map((variant) => ({
      variantId: crypto.randomUUID(),
      name: variant.name,
      input: rawCopy(variant.override.payload.input),
      benchmarkSelections: [],
    })),
  };
}

export function capitalIssuePath(path: readonly (string | number)[]): string {
  return (
    path.reduce<string>(
      (result, part) =>
        typeof part === 'number' ? `${result}[${part}]` : result ? `${result}.${part}` : part,
      ''
    ) || 'input'
  );
}
function invalid(path: string, message: string): CapitalIssueV1 {
  return { code: 'INVALID_INPUT', path, message, support: 'invalid' };
}
const integers = new Set([
  'deploymentPeriodYears',
  'plannedCompanyCount',
  'monthsAfterPreviousRound',
]);
const optionalBlanks = new Set([
  'netInvestableCapitalUsd',
  'plannedCompanyCount',
  'asConvertedOwnershipRatio',
  'ownershipOverrideExplanation',
  'incrementalPreMoneyPoolDilutionRatio',
  'explanation',
]);

function normalizeRaw(value: unknown, path: string, issues: CapitalIssueV1[], key = ''): unknown {
  if (Array.isArray(value))
    return value.map((item, index) => normalizeRaw(item, `${path}[${index}]`, issues));
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [field, item] of Object.entries(value)) {
      if (item === '' && optionalBlanks.has(field)) continue;
      result[field] = normalizeRaw(item, `${path}.${field}`, issues, field);
    }
    return result;
  }
  if (integers.has(key)) {
    if (
      typeof value !== 'string' ||
      !/^(0|[1-9]\d*)$/.test(value) ||
      !Number.isSafeInteger(Number(value))
    ) {
      issues.push(invalid(path, 'Enter a complete whole number.'));
      return value;
    }
    return Number(value);
  }
  const precision = key.endsWith('Usd') ? 6 : key.endsWith('Ratio') ? 12 : null;
  if (precision !== null) {
    if (
      typeof value !== 'string' ||
      value.length > CAPITAL_PLANNING_PROVISIONAL_LIMITS.maxDecimalCharacters ||
      !new RegExp(`^(0|[1-9]\\d*)(\\.\\d{1,${precision}})?$`).test(value)
    ) {
      issues.push(
        invalid(
          path,
          `Enter a complete nonnegative decimal with at most ${precision} decimal places.`
        )
      );
      return value;
    }
    return new Decimal(value).toFixed(precision);
  }
  return value;
}

export function capitalDraftRequest(
  draft: CapitalPlanDraft
): { ok: true; request: CreateFundScenarioSetV3 } | { ok: false; issues: CapitalIssueV1[] } {
  if (!draft.source)
    return { ok: false, issues: [invalid('source', 'Load and review the published source.')] };
  const issues: CapitalIssueV1[] = [];
  const request = {
    contractVersion: 'fund-scenario-set-create/3.0.0',
    name: draft.name,
    ...(draft.description === '' ? {} : { description: draft.description }),
    baselineVariantId: draft.variants[0]?.variantId,
    expectedSourceConfigId: draft.source.projection.sourceConfigId,
    expectedSourceConfigVersion: draft.source.projection.sourceConfigVersion,
    expectedSourceBundleHash: draft.source.sourceBundleHash,
    expectedInterpretationVersion: draft.source.interpretationVersion,
    unitDeclarations: draft.declarations,
    variants: draft.variants.map((variant, index) => ({
      variantId: variant.variantId,
      name: variant.name,
      override: {
        overrideType: 'capital_plan',
        payload: {
          input: normalizeRaw(variant.input, `variants[${index}].override.payload.input`, issues),
          ...(variant.benchmarkSelections.length
            ? {
                benchmarkSelections: normalizeRaw(
                  variant.benchmarkSelections,
                  `variants[${index}].override.payload.benchmarkSelections`,
                  issues
                ),
              }
            : {}),
        },
      },
    })),
  };
  if (issues.length) return { ok: false, issues };
  for (const [index, variant] of request.variants.entries()) {
    const payload = CapitalPlanningDraftV1Schema.safeParse(variant.override.payload);
    if (!payload.success) {
      issues.push(
        ...payload.error.issues.map((issue) =>
          invalid(
            capitalIssuePath(['variants', index, 'override', 'payload', ...issue.path]),
            issue.message
          )
        )
      );
    }
  }
  if (issues.length) return { ok: false, issues };
  const parsed = CreateFundScenarioSetV3Schema.safeParse(request);
  return parsed.success
    ? { ok: true, request: parsed.data }
    : {
        ok: false,
        issues: parsed.error.issues.map((issue) =>
          invalid(capitalIssuePath(issue.path), issue.message)
        ),
      };
}

export function capitalErrorIssues(error: unknown): CapitalIssueV1[] {
  if (error instanceof ApiError && error.details && typeof error.details === 'object') {
    const parsed = CapitalIssuesV1Schema.safeParse((error.details as { issues?: unknown }).issues);
    if (parsed.success) return parsed.data;
    const issues: CapitalIssueV1[] = [];
    function visit(value: unknown, path: (string | number)[]): void {
      if (!value || typeof value !== 'object') return;
      for (const [key, item] of Object.entries(value)) {
        if (key === '_errors' && Array.isArray(item)) {
          for (const message of item)
            if (typeof message === 'string') issues.push(invalid(capitalIssuePath(path), message));
        } else visit(item, [...path, /^\d+$/.test(key) ? Number(key) : key]);
      }
    }
    visit(error.details, []);
    if (issues.length) return issues;
  }
  return [
    invalid(
      'request',
      error instanceof Error ? error.message : 'The capital request failed. Your draft is retained.'
    ),
  ];
}

export function capitalSourceIdentity(source: FundScenarioCapitalSourceResponseV1): string {
  return [
    source.projection.fundId,
    source.projection.sourceConfigId,
    source.projection.sourceConfigVersion,
    source.sourceBundleHash,
    source.interpretationVersion,
  ].join(':');
}
