import type { z } from 'zod';
import {
  CAPITAL_FEE_METHOD_VERSION,
  CAPITAL_GP_METHOD_VERSION,
  CAPITAL_PLANNING_PROVISIONAL_LIMITS as limits,
  CAPITAL_SOURCE_INTERPRETATION_VERSION,
  CapitalPlanningInputV1Schema,
  CapitalPlanningDraftV1Schema,
  CapitalRawSourceFactV1Schema,
  CapitalSourceBundleV1Schema,
  CapitalSourceProjectionV1Schema,
  CapitalUnitDeclarationsV1Schema,
  type CapitalAssumptionProvenanceV1,
  type CapitalBenchmarkSnapshotV1,
  type CapitalPlanningDraftV1,
  type CapitalConstructionSourceFactsV1,
  type CapitalFeeExpenseSourceFactsV1,
  type CapitalGpSourceFactsV1,
  type CapitalIssueV1,
  type CapitalMoneySourceFactV1,
  type CapitalPlanningInputV1,
  type CapitalRateSourceFactV1,
  type CapitalRefusalCodeV1,
  type CapitalSourceBundleV1,
  type CapitalSourcePeriodV1,
  type CapitalSourceProjectionV1,
  type CapitalUnitDeclarationsV1,
} from '../../contracts/capital-planning-v1.contract';
import { FundDraftWriteV1Schema } from '../../contracts/fund-draft-write-v1.contract';
import type { FundScenarioCapitalSourceResponseV1 } from '../../contracts/fund-scenario-sets-v1.contract';
import { canonicalJson } from '../canonical-json-serialization';
import { Decimal } from '../decimal-config';
import { toFixedDecimalString } from '../decimal-string';
import { computeCapitalLifetimeFees } from './fee-tiers-to-fee-profile';
import { CapitalPlanningCalculationError } from './calculation-support';
import {
  applyCapitalBenchmarkProvenanceV1,
  resolveCapitalPlanningDraftV1,
} from './benchmark-presets';

const SOURCE_DECLARATION_REQUIRED_MESSAGE = 'An exact-path source-unit declaration is required';
const SOURCE_SELECTION_REQUIRED_MESSAGE =
  'Scenario selections are required to determine construction sources and declarations';

type RawConfig = z.input<typeof FundDraftWriteV1Schema>;
type RawFact = CapitalSourceProjectionV1['facts'][number];
type PersistedTag = CapitalSourceProjectionV1['configSchemaTag'];
type BundleFacts = Pick<
  CapitalSourceBundleV1,
  | 'fundSize'
  | 'configFundSize'
  | 'baseCurrency'
  | 'isEvergreen'
  | 'modelInputsAsOfDate'
  | 'vintageYear'
  | 'fundLife'
  | 'investmentPeriod'
  | 'gp'
  | 'feeExpense'
  | 'construction'
>;

/** Supply persisted values, never a hydrated draft or a normalized economics config. */
export interface CapitalRawSource {
  fund: {
    id: number;
    size: string | number;
    baseCurrency: string | null;
    sizeUnitTag?: PersistedTag;
    schemaTag?: PersistedTag;
  };
  config: {
    id: number;
    version: number;
    raw: unknown;
    publishedAt: string;
    unitTag?: PersistedTag;
    schemaTag?: PersistedTag;
  };
}

type Readiness = {
  context: 'current_preview' | 'saved_input';
  state: 'READY' | 'INPUT_REQUIRED' | 'UNSUPPORTED';
  issues: CapitalIssueV1[];
};

export type CapitalMaterializationResult =
  | {
      ok: true;
      sourceBundle: CapitalSourceBundleV1;
      availableConstructionCapitalUsd: string;
      assumptionProvenanceByInput: CapitalAssumptionProvenanceV1[][];
      resolvedInputs?: CapitalPlanningInputV1[];
      benchmarkSnapshotsByInput?: CapitalBenchmarkSnapshotV1[][];
      readiness: Readiness;
    }
  | {
      ok: false;
      status: 409 | 422;
      code: 'scenario_source_config_invalid' | 'capital_source_admission_refused';
      issues: CapitalIssueV1[];
      sourceIssues: z.ZodIssue[];
      readiness: Readiness;
    };

class AdmissionRefusal extends Error {
  constructor(readonly issues: CapitalIssueV1[]) {
    super(issues[0]?.message ?? 'Capital source admission refused');
  }
}

function refuse(
  code: CapitalRefusalCodeV1,
  path: string,
  message: string,
  support: CapitalIssueV1['support'] = 'invalid',
  details: Pick<CapitalIssueV1, 'feeBasis' | 'reason' | 'limit' | 'observed'> = {}
): never {
  throw new AdmissionRefusal([{ code, path, message, support, ...details }]);
}

function issuePath(parts: (string | number)[]): string {
  return parts.reduce<string>(
    (path, part) =>
      typeof part === 'number' ? `${path}[${part}]` : path ? `${path}.${part}` : part,
    ''
  );
}

function isTimeOriginIssue(message: string): boolean {
  return (
    message === 'TIME_ORIGIN_UNRESOLVED' ||
    message === 'TIME_ORIGIN_UNRESOLVED: window boundaries must share a month origin'
  );
}

function parse<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, value: unknown, path: string): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  throw new AdmissionRefusal(
    result.error.issues.map((issue) => ({
      code: isTimeOriginIssue(issue.message) ? 'TIME_ORIGIN_UNRESOLVED' : 'INVALID_INPUT',
      path: issuePath(issue.path) || path,
      message: issue.message,
      support: isTimeOriginIssue(issue.message) ? 'incomplete' : 'invalid',
    }))
  );
}

function bounded(length: number, limit: number, path: string): void {
  if (length > limit)
    refuse('INPUT_TOO_LARGE', path, 'Source exceeds the admitted bound', 'unsupported', {
      limit,
      observed: length,
    });
}

function decimal(raw: unknown, path: string, code: CapitalRefusalCodeV1): Decimal {
  if (
    (typeof raw !== 'number' && typeof raw !== 'string') ||
    (typeof raw === 'number' && !Number.isFinite(raw)) ||
    (typeof raw === 'string' && !/^-?\d+(?:\.\d+)?$/.test(raw))
  )
    refuse(code, path, 'Expected finite decimal source value');
  const value = new Decimal(raw);
  if (!value.isFinite() || value.lt(0))
    refuse(code, path, 'Expected finite nonnegative source value');
  return value;
}

function fixed(value: Decimal, places: 6 | 12, path: string): string {
  const result = toFixedDecimalString(value.isZero() ? new Decimal(0) : value, places);
  if (result.length > limits.maxDecimalCharacters)
    refuse('INVALID_INPUT', path, 'Normalized value exceeds supported decimal precision');
  return /^-0\.0+$/.test(result) ? result.slice(1) : result;
}

function sourceFact(path: string, raw: number | undefined): RawFact | null {
  return raw === undefined ? null : { path, state: 'present', rawValue: raw };
}

/** Frozen projection: selected scenarios, declarations and interpreter versions never enter it. */
export function fingerprintCapitalSource(
  source: CapitalRawSource,
  hashCanonicalJson: (value: unknown) => string
): {
  projection: CapitalSourceProjectionV1;
  sourceBundleHash: string;
} {
  const facts: RawFact[] = [];
  function visit(value: unknown, path: string): void {
    if (Array.isArray(value)) {
      if (!CapitalRawSourceFactV1Schema.safeParse({ path, state: 'absent' }).success) return;
      bounded(value.length, limits.maxSourceFacts, path);
      facts.push({ path, state: 'array', length: value.length });
      value.forEach((child, index) => visit(child, `${path}[${index}]`));
    } else if (value !== null && typeof value === 'object') {
      for (const key of Object.keys(value).sort())
        visit((value as Record<string, unknown>)[key], path ? `${path}.${key}` : key);
    } else {
      const fact = CapitalRawSourceFactV1Schema.safeParse(
        value === undefined
          ? { path, state: 'absent' }
          : { path, state: 'present', rawValue: value }
      );
      if (fact.success) facts.push(fact.data);
    }
    bounded(facts.length, limits.maxSourceFacts, 'source.facts');
  }
  // Canonicalize untouched JSON before projection. Non-JSON values cannot be fingerprinted.
  const rawConfigHash = hashCanonicalJson(source.config.raw);
  visit(source.config.raw, '');
  const projection = parse(
    CapitalSourceProjectionV1Schema,
    {
      contractVersion: 'fund-scenario-capital-source-projection/1.0.0',
      fundId: source.fund.id,
      sourceConfigId: source.config.id,
      sourceConfigVersion: source.config.version,
      rawConfigHash,
      fund: {
        size: source.fund.size,
        baseCurrency: source.fund.baseCurrency,
        sizeUnitTag: source.fund.sizeUnitTag ?? { state: 'absent' },
        schemaTag: source.fund.schemaTag ?? { state: 'absent' },
      },
      configUnitTag: source.config.unitTag ?? { state: 'absent' },
      configSchemaTag: source.config.schemaTag ?? { state: 'absent' },
      facts,
    },
    'source'
  );
  return { projection, sourceBundleHash: hashCanonicalJson(projection) };
}

function usesExplicitFeeTiers(raw: RawConfig): boolean {
  return (raw.economicsAssumptions?.feeModel?.tiers?.length ?? 0) > 0;
}

function usesExplicitExpenses(raw: RawConfig): boolean {
  return raw.economicsAssumptions?.expenseModel?.annualExpenses !== undefined;
}

function selectedGpSource(raw: RawConfig): CapitalGpSourceFactsV1['resolved']['source'] {
  const model = raw.economicsAssumptions?.gpCommitmentModel;
  if (model?.commitmentAmount !== undefined) return 'nested_amount';
  if (model?.commitmentPct !== undefined) return 'nested_percent';
  if (raw.gpCommitment !== undefined) return 'top_level_amount';
  return 'zero_fallback';
}

function requireFeeSchedule(raw: RawConfig): void {
  const feeModel = raw.economicsAssumptions?.feeModel;
  const explicit = usesExplicitFeeTiers(raw);
  if (!explicit && !raw.feeProfiles?.length) {
    const path =
      feeModel?.defaultRate !== undefined
        ? 'economicsAssumptions.feeModel.defaultRate'
        : raw.managementFeeRate !== undefined
          ? 'managementFeeRate'
          : 'economicsAssumptions.feeModel.tiers';
    refuse(
      'FEE_TIER_SCHEDULE_REQUIRED',
      path,
      'Explicit fee tiers are required, including for zero fees',
      'incomplete'
    );
  }
}

function year(value: number | undefined, path: string, code: CapitalRefusalCodeV1): number {
  if (value === undefined || !Number.isInteger(value) || value < 1)
    refuse(
      code,
      path,
      'A positive integer year is required',
      value === undefined ? 'incomplete' : 'invalid'
    );
  bounded(value, limits.maxFundYears, path);
  return value;
}

function assertFiniteSource(raw: RawConfig, fund: CapitalRawSource['fund']): void {
  if (fund.baseCurrency === null || fund.baseCurrency === '')
    refuse('FUND_CURRENCY_UNRESOLVED', 'baseCurrency', 'Fund currency is required', 'incomplete');
  if (fund.baseCurrency !== 'USD')
    refuse(
      'FUND_CURRENCY_UNSUPPORTED',
      'baseCurrency',
      'Only USD capital sources are supported',
      'unsupported'
    );
  if (raw.isEvergreen === undefined)
    refuse(
      'FUND_VEHICLE_MODE_UNRESOLVED',
      'isEvergreen',
      'Explicit vehicle mode is required',
      'incomplete'
    );
  if (raw.isEvergreen !== false)
    refuse(
      'FUND_VEHICLE_MODE_UNSUPPORTED',
      'isEvergreen',
      'Evergreen vehicles are unsupported',
      'unsupported'
    );
}

function feeBasis(basis: string, path: string): 'committed_capital' {
  if (basis === 'committed_capital') return basis;
  const reasons: Record<string, NonNullable<CapitalIssueV1['reason']>> = {
    called_capital_period: 'CALL_SCHEDULE_NOT_MODELED',
    called_capital_cumulative: 'CALL_SCHEDULE_NOT_MODELED',
    called_capital_net_of_returns: 'CALL_SCHEDULE_NOT_MODELED',
    gross_cumulative_called: 'CALL_SCHEDULE_NOT_MODELED',
    net_cumulative_called: 'CALL_SCHEDULE_NOT_MODELED',
    invested_capital: 'INVESTED_BASIS_ADAPTER_NOT_IMPLEMENTED',
    cumulative_invested: 'INVESTED_BASIS_ADAPTER_NOT_IMPLEMENTED',
    fair_market_value: 'VALUATION_PATH_NOT_MODELED',
    unrealized_cost: 'UNREALIZED_COST_SCHEDULE_NOT_MODELED',
    unrealized_investments: 'UNREALIZED_COST_SCHEDULE_NOT_MODELED',
  };
  const reason = reasons[basis];
  if (!reason) refuse('INVALID_INPUT', path, 'Unknown fee basis');
  refuse(
    'FEE_BASIS_UNSUPPORTED',
    path,
    'Selected fee basis is unsupported for capital planning',
    'unsupported',
    { feeBasis: basis as CapitalIssueV1['feeBasis'], reason }
  );
}

export type CapitalSourcePreviewInspection = Pick<
  FundScenarioCapitalSourceResponseV1,
  'projection' | 'sourceBundleHash' | 'remainingDeclarations' | 'calculationReadiness'
> & { materialized: null };

/** Inspect source-global branches without inventing scenario selections or units. */
export function inspectCapitalSourcePreview(
  source: CapitalRawSource,
  hashCanonicalJson: (value: unknown) => string
): CapitalSourcePreviewInspection {
  const fingerprint = fingerprintCapitalSource(source, hashCanonicalJson);
  const remainingDeclarations: CapitalSourcePreviewInspection['remainingDeclarations'] = [];
  const issues: CapitalIssueV1[] = [];
  const validation = FundDraftWriteV1Schema.safeParse(source.config.raw);
  if (!validation.success) {
    issues.push(
      ...validation.error.issues.map((issue): CapitalIssueV1 => ({
        code: isTimeOriginIssue(issue.message) ? 'TIME_ORIGIN_UNRESOLVED' : 'INVALID_INPUT',
        path: issuePath(issue.path) || 'config',
        message: issue.message,
        support: isTimeOriginIssue(issue.message) ? 'incomplete' : 'invalid',
      }))
    );
  } else {
    // Parsed defaults cannot enter the raw source projection or branch selection.
    const raw = source.config.raw as RawConfig;
    const add = (
      path: string,
      allowedUnits: CapitalSourcePreviewInspection['remainingDeclarations'][number]['allowedUnits']
    ) => remainingDeclarations.push({ path, allowedUnits });
    const money = (path: string) => add(path, ['usd', 'usd_millions']);
    const months = (
      value: { startMonth?: number | undefined; endMonth?: number | undefined },
      path: string
    ) => {
      for (const boundary of ['startMonth', 'endMonth'] as const) {
        if (value[boundary] !== undefined) {
          add(`${path}.${boundary}`, ['fund_month_zero_based', 'fund_month_one_based']);
        }
      }
    };
    money('funds.size');
    if (raw.fundSize !== undefined) money('fundSize');
    const gpSource = selectedGpSource(raw);
    if (gpSource === 'nested_amount')
      money('economicsAssumptions.gpCommitmentModel.commitmentAmount');
    if (gpSource === 'top_level_amount') money('gpCommitment');
    if (!usesExplicitFeeTiers(raw) && raw.feeProfiles?.length === 1) {
      raw.feeProfiles[0]!.feeTiers.forEach((tier, index) => {
        const path = `feeProfiles[0].feeTiers[${index}]`;
        add(`${path}.percentage`, ['ratio', 'percent_points']);
        months(tier, path);
      });
    }
    const expenses = raw.economicsAssumptions?.expenseModel;
    if (usesExplicitExpenses(raw)) {
      expenses!.annualExpenses!.forEach((_expense, index) =>
        money(`economicsAssumptions.expenseModel.annualExpenses[${index}].amount`)
      );
    } else {
      raw.fundExpenses?.forEach((expense, index) => {
        const path = `fundExpenses[${index}]`;
        money(`${path}.monthlyAmount`);
        months(expense, path);
      });
    }
    bounded(remainingDeclarations.length, limits.maxDeclarations, 'unitDeclarations');
    try {
      requireFeeSchedule(raw);
      assertFiniteSource(raw, source.fund);
      if (decimal(source.fund.size, 'funds.size', 'INVALID_INPUT').lte(0)) {
        refuse('INVALID_INPUT', 'funds.size', 'Commitments must be positive');
      }
      if (gpSource === 'zero_fallback' && (raw.fundedFromFeesPct ?? 0) > 0) {
        refuse(
          'GP_COMMITMENT_UNRESOLVED',
          'gpCommitment',
          'A positive fee-funded fraction requires a GP commitment source',
          'incomplete'
        );
      }
      const timeline = raw.economicsAssumptions?.timeline;
      const life = year(
        timeline?.fundLifeYears ?? raw.fundLife,
        timeline ? 'economicsAssumptions.timeline.fundLifeYears' : 'fundLife',
        'FUND_TERM_UNRESOLVED'
      );
      if (year(raw.investmentPeriod, 'investmentPeriod', 'INVESTMENT_PERIOD_UNRESOLVED') > life) {
        refuse(
          'INVESTMENT_PERIOD_UNRESOLVED',
          'investmentPeriod',
          'Investment period exceeds fund term'
        );
      }
      const vintage = timeline?.vintageYear ?? raw.vintageYear;
      if (vintage === undefined || !Number.isInteger(vintage) || vintage < 1900 || vintage > 2200) {
        refuse(
          'VINTAGE_YEAR_UNRESOLVED',
          timeline ? 'economicsAssumptions.timeline.vintageYear' : 'vintageYear',
          'A valid vintage year is required',
          vintage === undefined ? 'incomplete' : 'invalid'
        );
      }
      if (usesExplicitFeeTiers(raw)) {
        bounded(
          raw.economicsAssumptions!.feeModel!.tiers!.length,
          limits.maxFeeExpensePieces,
          'economicsAssumptions.feeModel.tiers'
        );
        raw.economicsAssumptions!.feeModel!.tiers!.forEach((tier, index) =>
          feeBasis(tier.basis, `economicsAssumptions.feeModel.tiers[${index}].basis`)
        );
      } else {
        if (raw.feeProfiles!.length !== 1) {
          refuse(
            'FEE_PROFILE_APPLICABILITY_UNSUPPORTED',
            'feeProfiles',
            'Exactly one full-fund legacy fee profile is supported',
            'unsupported'
          );
        }
        if (raw.feeProfiles![0]!.feeTiers.length === 0) {
          refuse(
            'FEE_MODEL_UNRESOLVED',
            'feeProfiles[0].feeTiers',
            'Selected fee profile requires explicit tiers',
            'incomplete'
          );
        }
        bounded(
          raw.feeProfiles![0]!.feeTiers.length,
          limits.maxFeeExpensePieces,
          'feeProfiles[0].feeTiers'
        );
        raw.feeProfiles![0]!.feeTiers.forEach((tier, index) =>
          feeBasis(tier.feeBasis, `feeProfiles[0].feeTiers[${index}].feeBasis`)
        );
      }
      for (const key of ['orgExpenseCap', 'orgExpenseCapType'] as const) {
        if (expenses?.[key] !== undefined) {
          refuse(
            'EXPENSE_CAP_UNSUPPORTED',
            `economicsAssumptions.expenseModel.${key}`,
            'Expense-cap policies are unsupported',
            'unsupported'
          );
        }
      }
      if (usesExplicitExpenses(raw)) {
        bounded(
          expenses!.annualExpenses!.length,
          limits.maxFeeExpensePieces,
          'economicsAssumptions.expenseModel.annualExpenses'
        );
        expenses!.annualExpenses!.forEach((expense, index) => {
          if (expense.growthRate !== undefined && expense.growthRate !== 0) {
            refuse(
              'EXPENSE_GROWTH_UNSUPPORTED',
              `economicsAssumptions.expenseModel.annualExpenses[${index}].growthRate`,
              'Nonzero expense growth is unsupported',
              'unsupported'
            );
          }
        });
      } else if (raw.fundExpenses === undefined) {
        refuse(
          'EXPENSE_MODEL_UNRESOLVED',
          'fundExpenses',
          'An explicit expense schedule is required',
          'incomplete'
        );
      } else {
        bounded(raw.fundExpenses.length, limits.maxFeeExpensePieces, 'fundExpenses');
      }
    } catch (error) {
      if (!(error instanceof AdmissionRefusal)) throw error;
      issues.push(...error.issues);
    }
    issues.push(
      ...remainingDeclarations.map(({ path, allowedUnits }): CapitalIssueV1 => ({
        code: allowedUnits[0]?.startsWith('fund_month')
          ? 'TIME_ORIGIN_UNRESOLVED'
          : 'UNIT_PROVENANCE_UNRESOLVED',
        path,
        message: SOURCE_DECLARATION_REQUIRED_MESSAGE,
        support: 'incomplete',
      }))
    );
  }
  issues.push({
    code: 'INVALID_INPUT',
    path: 'inputs',
    message: SOURCE_SELECTION_REQUIRED_MESSAGE,
    support: 'incomplete',
  });
  return {
    ...fingerprint,
    remainingDeclarations,
    materialized: null,
    calculationReadiness: {
      context: 'current_preview',
      state: issues.some((issue) => issue.support !== 'incomplete')
        ? 'UNSUPPORTED'
        : 'INPUT_REQUIRED',
      issues,
    },
  };
}

function normalizeSource(
  raw: RawConfig,
  fund: CapitalRawSource['fund'],
  declarations: CapitalUnitDeclarationsV1,
  inputs: CapitalPlanningInputV1[]
): BundleFacts & { availableConstructionCapitalUsd: string } {
  // Presence determines whether a supported schedule exists before selected money or rates
  // are normalized. The caller validates the entire persisted source before this step.
  const feeModel = raw.economicsAssumptions?.feeModel;
  const explicit = usesExplicitFeeTiers(raw);
  requireFeeSchedule(raw);
  const consumed = new Set<string>();
  function unit(path: string, allowed: readonly string[]): CapitalUnitDeclarationsV1[string] {
    const value = declarations[path];
    if (value === undefined || !allowed.includes(value))
      refuse(
        allowed[0]?.startsWith('fund_month')
          ? 'TIME_ORIGIN_UNRESOLVED'
          : 'UNIT_PROVENANCE_UNRESOLVED',
        path,
        SOURCE_DECLARATION_REQUIRED_MESSAGE,
        'incomplete'
      );
    consumed.add(path);
    return value;
  }
  function money(
    value: unknown,
    path: string,
    code: CapitalRefusalCodeV1 = 'INVALID_INPUT'
  ): CapitalMoneySourceFactV1 {
    const sourceUnit = unit(path, ['usd', 'usd_millions']) as 'usd' | 'usd_millions';
    const amount = decimal(value, path, code).times(sourceUnit === 'usd_millions' ? 1000000 : 1);
    return {
      path,
      rawValue: value as number | string,
      sourceUnit,
      normalizedValue: fixed(amount, 6, path),
      unitClass: 'resolved_dollars',
      provenanceOrigin: 'scenario_declared',
    };
  }
  function rate(
    value: unknown,
    path: string,
    resolved?: 'ratio' | 'percent_points',
    code: CapitalRefusalCodeV1 = 'INVALID_INPUT'
  ): CapitalRateSourceFactV1 {
    const sourceUnit =
      resolved ?? (unit(path, ['ratio', 'percent_points']) as 'ratio' | 'percent_points');
    const ratio = decimal(value, path, code).div(sourceUnit === 'percent_points' ? 100 : 1);
    if (ratio.gt(1)) refuse(code, path, 'Normalized rate must be in [0, 1]');
    return {
      path,
      rawValue: value as number | string,
      sourceUnit,
      normalizedValue: fixed(ratio, 12, path),
      unitClass: 'resolved_ratio',
      provenanceOrigin: resolved ? 'contract_resolved' : 'scenario_declared',
    };
  }

  assertFiniteSource(raw, fund);
  const fundSize = money(fund.size, 'funds.size');
  const exactCommitments = new Decimal(fund.size).times(
    fundSize.sourceUnit === 'usd_millions' ? 1000000 : 1
  );
  if (exactCommitments.lte(0))
    refuse('INVALID_INPUT', 'funds.size', 'Commitments must be positive');
  const configFundSize: BundleFacts['configFundSize'] =
    raw.fundSize === undefined
      ? { state: 'absent' }
      : { state: 'matched', fact: money(raw.fundSize, 'fundSize') };
  if (configFundSize.state === 'matched') {
    const configAmount = decimal(raw.fundSize, 'fundSize', 'INVALID_INPUT').times(
      configFundSize.fact.sourceUnit === 'usd_millions' ? 1000000 : 1
    );
    if (!exactCommitments.eq(configAmount))
      refuse('FUND_SIZE_SOURCE_MISMATCH', 'fundSize', 'Declared fund-size sources disagree');
  }
  const timeline = raw.economicsAssumptions?.timeline;
  const lifePath = timeline ? 'economicsAssumptions.timeline.fundLifeYears' : 'fundLife';
  const life = year(timeline?.fundLifeYears ?? raw.fundLife, lifePath, 'FUND_TERM_UNRESOLVED');
  const investmentPeriod = year(
    raw.investmentPeriod,
    'investmentPeriod',
    'INVESTMENT_PERIOD_UNRESOLVED'
  );
  if (investmentPeriod > life)
    refuse(
      'INVESTMENT_PERIOD_UNRESOLVED',
      'investmentPeriod',
      'Investment period exceeds fund term'
    );
  const vintageYear = timeline?.vintageYear ?? raw.vintageYear;
  const vintagePath =
    timeline?.vintageYear === undefined
      ? 'vintageYear'
      : 'economicsAssumptions.timeline.vintageYear';
  if (
    vintageYear === undefined ||
    !Number.isInteger(vintageYear) ||
    vintageYear < 1900 ||
    vintageYear > 2200
  )
    refuse(
      'VINTAGE_YEAR_UNRESOLVED',
      vintagePath,
      'A supported vintage year is required',
      vintageYear === undefined ? 'incomplete' : 'invalid'
    );

  const gpModel = raw.economicsAssumptions?.gpCommitmentModel;
  const amountPath = 'economicsAssumptions.gpCommitmentModel.commitmentAmount';
  const pctPath = 'economicsAssumptions.gpCommitmentModel.commitmentPct';
  // Whole-source persisted validation has already checked shadowed fields. Apply capital money
  // domains to the selected source, regardless of the fee-funded fraction; never fall through.
  const rawGp = (value: number | undefined): CapitalGpSourceFactsV1['nestedCommitmentAmount'] =>
    value === undefined ? { state: 'absent' } : { state: 'present', rawValue: value };
  let resolved: CapitalGpSourceFactsV1['resolved'];
  const gpSource = selectedGpSource(raw);
  if (gpSource === 'nested_amount') {
    const fact = money(gpModel!.commitmentAmount, amountPath, 'GP_COMMITMENT_INVALID');
    resolved = { source: 'nested_amount', fact, commitmentUsd: fact.normalizedValue };
  } else if (gpSource === 'nested_percent') {
    const fact = rate(gpModel!.commitmentPct, pctPath, 'ratio', 'GP_COMMITMENT_INVALID');
    resolved = {
      source: 'nested_percent',
      fact,
      commitmentUsd: fixed(exactCommitments.times(gpModel!.commitmentPct!), 6, pctPath),
    };
  } else if (gpSource === 'top_level_amount') {
    const fact = money(raw.gpCommitment, 'gpCommitment', 'GP_COMMITMENT_INVALID');
    resolved = { source: 'top_level_amount', fact, commitmentUsd: fact.normalizedValue };
  } else {
    resolved = {
      source: 'zero_fallback',
      commitmentUsd: '0.000000',
      defaultReason: 'GP_COMMITMENT_SOURCES_ABSENT',
    };
  }
  const exactGp =
    resolved.source === 'zero_fallback'
      ? new Decimal(0)
      : resolved.source === 'nested_percent'
        ? exactCommitments.times(gpModel!.commitmentPct!)
        : new Decimal(resolved.fact.rawValue).times(
            resolved.fact.sourceUnit === 'usd_millions' ? 1000000 : 1
          );
  if (exactGp.gt(exactCommitments))
    refuse(
      'GP_COMMITMENT_EXCEEDS_COMMITMENTS',
      resolved.source === 'zero_fallback' ? 'gpCommitment' : resolved.fact.path,
      'Selected GP commitment exceeds total commitments'
    );
  const fractionFact =
    raw.fundedFromFeesPct === undefined
      ? null
      : rate(
          raw.fundedFromFeesPct,
          'fundedFromFeesPct',
          'ratio',
          'FUNDED_FROM_FEES_FRACTION_INVALID'
        );
  const fraction = fractionFact?.normalizedValue ?? '0.000000000000';
  if (resolved.source === 'zero_fallback' && new Decimal(raw.fundedFromFeesPct ?? 0).gt(0))
    refuse(
      'GP_COMMITMENT_UNRESOLVED',
      'gpCommitment',
      'A positive fee-funded fraction requires a GP commitment source',
      'incomplete'
    );
  const deemedContribution = exactGp.times(raw.fundedFromFeesPct ?? 0);
  const gp: CapitalGpSourceFactsV1 = {
    nestedCommitmentAmount: rawGp(gpModel?.commitmentAmount),
    nestedCommitmentPct: rawGp(gpModel?.commitmentPct),
    topLevelCommitmentAmount: rawGp(raw.gpCommitment),
    resolved,
    fundedFromFeesPct: fractionFact
      ? { state: 'present', fact: fractionFact, effectiveValue: fraction, defaultReason: null }
      : {
          state: 'absent',
          effectiveValue: '0.000000000000',
          defaultReason: 'ADR_070_MISSING_FRACTION_ZERO',
        },
    deemedContributionUsd: fixed(deemedContribution, 6, 'fundedFromFeesPct'),
    methodVersion: CAPITAL_GP_METHOD_VERSION,
  };

  function period(
    item:
      | { startYear: number; endYear?: number | undefined }
      | { startMonth: number; endMonth?: number | undefined },
    path: string,
    fee: boolean
  ): CapitalSourcePeriodV1 {
    if ('startYear' in item) {
      const start = year(item.startYear, `${path}.startYear`, 'FEE_PERIOD_NOT_REPRESENTABLE');
      const end =
        item.endYear === undefined
          ? null
          : year(item.endYear, `${path}.endYear`, 'FEE_PERIOD_NOT_REPRESENTABLE');
      if (end !== null && end < start)
        refuse(
          fee ? 'FEE_PERIOD_NOT_REPRESENTABLE' : 'INVALID_INPUT',
          `${path}.endYear`,
          'Explicit period end precedes start'
        );
      return {
        kind: 'annual',
        start: {
          path: `${path}.startYear`,
          rawValue: start,
          effectiveValue: start,
          provenanceOrigin: 'contract_resolved',
        },
        end:
          end === null
            ? null
            : {
                path: `${path}.endYear`,
                rawValue: end,
                effectiveValue: end,
                provenanceOrigin: 'contract_resolved',
              },
        normalizedStartMonth: (start - 1) * 12,
        normalizedEndMonth: (end ?? life) * 12 - 1,
        endDefaultReason: end === null ? 'FINITE_FUND_HORIZON_END' : null,
      };
    }
    const boundary = (value: number, field: 'startMonth' | 'endMonth') => {
      const sourceUnit = unit(`${path}.${field}`, [
        'fund_month_zero_based',
        'fund_month_one_based',
      ]) as 'fund_month_zero_based' | 'fund_month_one_based';
      const normalizedValue = value - (sourceUnit === 'fund_month_one_based' ? 1 : 0);
      if (!Number.isInteger(value) || normalizedValue < 0)
        refuse(
          fee ? 'FEE_PERIOD_NOT_REPRESENTABLE' : 'INVALID_INPUT',
          `${path}.${field}`,
          'Month must be a nonnegative integer under its declared origin'
        );
      bounded(normalizedValue, limits.maxScheduleMonth, `${path}.${field}`);
      return {
        path: `${path}.${field}`,
        rawValue: value,
        sourceUnit,
        normalizedValue,
        provenanceOrigin: 'scenario_declared' as const,
      };
    };
    const start = boundary(item.startMonth, 'startMonth');
    const end = item.endMonth === undefined ? null : boundary(item.endMonth, 'endMonth');
    if (end && end.sourceUnit !== start.sourceUnit)
      refuse(
        'TIME_ORIGIN_UNRESOLVED',
        `${path}.endMonth`,
        'Month origins must agree',
        'incomplete'
      );
    if (end && end.normalizedValue < start.normalizedValue)
      refuse(
        fee ? 'FEE_PERIOD_NOT_REPRESENTABLE' : 'INVALID_INPUT',
        `${path}.endMonth`,
        'Explicit period end precedes start'
      );
    const normalizedEndMonth = end?.normalizedValue ?? life * 12 - 1;
    if (fee && (start.normalizedValue % 12 !== 0 || (normalizedEndMonth + 1) % 12 !== 0))
      refuse(
        'FEE_PERIOD_NOT_REPRESENTABLE',
        start.normalizedValue % 12 ? `${path}.startMonth` : `${path}.endMonth`,
        'Fee window must cover whole fund years',
        'unsupported'
      );
    return {
      kind: 'legacy_monthly',
      start,
      end: end ?? {
        state: 'absent',
        path: `${path}.endMonth`,
        effectiveValue: normalizedEndMonth,
        defaultReason: 'FINITE_FUND_HORIZON_END',
      },
      normalizedStartMonth: start.normalizedValue,
      normalizedEndMonth,
    };
  }

  const expenseModel = raw.economicsAssumptions?.expenseModel;
  const explicitExpenses = usesExplicitExpenses(raw);
  const shadowedPaths: string[] = [];
  const annotations: CapitalFeeExpenseSourceFactsV1['annotations'] = [];
  const presence = (value: unknown[] | undefined) =>
    value === undefined
      ? ('absent' as const)
      : value.length
        ? ('nonempty' as const)
        : ('empty' as const);
  let feeTiers: CapitalFeeExpenseSourceFactsV1['feeTiers'];
  let selectedFeeProfileId: string | null = null;
  if (explicit) {
    bounded(
      feeModel!.tiers!.length,
      limits.maxFeeExpensePieces,
      'economicsAssumptions.feeModel.tiers'
    );
    feeTiers = feeModel!.tiers!.map((tier, index) => {
      const path = `economicsAssumptions.feeModel.tiers[${index}]`;
      return {
        id: tier.id,
        name: tier.name,
        path,
        rate: rate(tier.rate, `${path}.rate`, 'ratio', 'FEE_RATE_INVALID'),
        basis: feeBasis(tier.basis, `${path}.basis`),
        population: 'full_fund_committed_capital',
        period: period(tier, path, true),
        recyclingAnnotation: sourceFact(`${path}.recyclingEligiblePct`, tier.recyclingEligiblePct),
      };
    });
    if (raw.feeProfiles !== undefined) shadowedPaths.push('feeProfiles');
  } else {
    if (raw.feeProfiles!.length !== 1)
      refuse(
        'FEE_PROFILE_APPLICABILITY_UNSUPPORTED',
        'feeProfiles',
        'Exactly one full-fund legacy fee profile is supported',
        'unsupported'
      );
    const profile = raw.feeProfiles![0]!;
    selectedFeeProfileId = profile.id;
    if (profile.feeTiers.length === 0)
      refuse(
        'FEE_MODEL_UNRESOLVED',
        'feeProfiles[0].feeTiers',
        'Selected fee profile requires explicit tiers',
        'incomplete'
      );
    bounded(profile.feeTiers.length, limits.maxFeeExpensePieces, 'feeProfiles[0].feeTiers');
    feeTiers = profile.feeTiers.map((tier, index) => {
      const path = `feeProfiles[0].feeTiers[${index}]`;
      return {
        id: tier.id,
        name: tier.name,
        path,
        rate: rate(tier.percentage, `${path}.percentage`, undefined, 'FEE_RATE_INVALID'),
        basis: feeBasis(tier.feeBasis, `${path}.feeBasis`),
        population: 'full_fund_committed_capital',
        period: period(tier, path, true),
        recyclingAnnotation: sourceFact(`${path}.recyclingPercentage`, tier.recyclingPercentage),
      };
    });
  }
  if (feeModel?.defaultRate !== undefined)
    shadowedPaths.push('economicsAssumptions.feeModel.defaultRate');
  if (feeModel?.defaultBasis !== undefined)
    shadowedPaths.push('economicsAssumptions.feeModel.defaultBasis');
  if (raw.managementFeeRate !== undefined) shadowedPaths.push('managementFeeRate');
  if (feeModel && feeModel.source !== (explicit ? 'economics_override' : 'legacy_fee_profiles'))
    annotations.push({
      code: 'SOURCE_LABEL_SELECTION_MISMATCH',
      path: 'economicsAssumptions.feeModel.source',
      selectedPath: explicit ? 'economicsAssumptions.feeModel.tiers' : 'feeProfiles',
    });
  const capIssues: CapitalIssueV1[] = (['orgExpenseCap', 'orgExpenseCapType'] as const)
    .filter((key) => expenseModel?.[key] !== undefined)
    .map((key) => ({
      code: 'EXPENSE_CAP_UNSUPPORTED',
      path: `economicsAssumptions.expenseModel.${key}`,
      message: 'Expense-cap policies are unsupported',
      support: 'unsupported',
    }));
  if (capIssues.length) throw new AdmissionRefusal(capIssues);
  let expenses: CapitalFeeExpenseSourceFactsV1['expenses'];
  if (explicitExpenses) {
    bounded(
      expenseModel!.annualExpenses!.length,
      limits.maxFeeExpensePieces,
      'economicsAssumptions.expenseModel.annualExpenses'
    );
    expenses = expenseModel!.annualExpenses!.map((expense, index) => {
      const path = `economicsAssumptions.expenseModel.annualExpenses[${index}]`;
      if (expense.growthRate !== undefined && expense.growthRate !== 0)
        refuse(
          'EXPENSE_GROWTH_UNSUPPORTED',
          `${path}.growthRate`,
          'Nonzero expense growth is unsupported',
          'unsupported'
        );
      return {
        id: expense.id,
        category: expense.category,
        path,
        amount: money(expense.amount, `${path}.amount`, 'EXPENSE_AMOUNT_INVALID'),
        period: period(expense, path, false),
        frequency: 'annual',
        growthRate:
          expense.growthRate === undefined
            ? { state: 'absent', effectiveValue: '0.000000000000' }
            : { state: 'present', rawValue: 0, effectiveValue: '0.000000000000' },
      };
    });
    if (raw.fundExpenses !== undefined) shadowedPaths.push('fundExpenses');
  } else if (raw.fundExpenses !== undefined) {
    bounded(raw.fundExpenses.length, limits.maxFeeExpensePieces, 'fundExpenses');
    expenses = raw.fundExpenses.map((expense, index) => {
      const path = `fundExpenses[${index}]`;
      return {
        id: expense.id,
        category: expense.category,
        path,
        amount: money(expense.monthlyAmount, `${path}.monthlyAmount`, 'EXPENSE_AMOUNT_INVALID'),
        period: period(expense, path, false),
        frequency: 'monthly',
        growthRate: { state: 'absent', effectiveValue: '0.000000000000' },
      };
    });
  } else {
    refuse(
      'EXPENSE_MODEL_UNRESOLVED',
      'fundExpenses',
      'An explicit expense schedule is required',
      'incomplete'
    );
  }
  if (
    expenseModel &&
    expenseModel.source !== (explicitExpenses ? 'economics_override' : 'legacy_fund_expenses')
  )
    annotations.push({
      code: 'SOURCE_LABEL_SELECTION_MISMATCH',
      path: 'economicsAssumptions.expenseModel.source',
      selectedPath: explicitExpenses
        ? 'economicsAssumptions.expenseModel.annualExpenses'
        : 'fundExpenses',
    });
  const lifetimeExpenses = expenses.reduce((total, expense) => {
    const months = Math.max(
      0,
      Math.min(expense.period.normalizedEndMonth, life * 12 - 1) -
        expense.period.normalizedStartMonth +
        1
    );
    return total.plus(
      new Decimal(expense.amount.rawValue)
        .times(expense.amount.sourceUnit === 'usd_millions' ? 1000000 : 1)
        .times(months)
        .div(expense.frequency === 'annual' ? 12 : 1)
    );
  }, new Decimal(0));
  const lifetimeFees = computeCapitalLifetimeFees(exactCommitments, life, feeTiers);
  const feeExpense: CapitalFeeExpenseSourceFactsV1 = {
    methodVersion: CAPITAL_FEE_METHOD_VERSION,
    feeSelection: explicit ? 'explicit_tiers' : 'legacy_profile',
    expenseSelection: explicitExpenses ? 'explicit_annual' : 'legacy_monthly',
    rawPresence: {
      explicitFeeTiers: presence(feeModel?.tiers),
      legacyFeeProfiles: presence(raw.feeProfiles),
      explicitAnnualExpenses: presence(expenseModel?.annualExpenses),
      legacyFundExpenses: presence(raw.fundExpenses),
      nestedDefaultRate: feeModel?.defaultRate !== undefined,
      managementFeeRate: raw.managementFeeRate !== undefined,
    },
    feeSourceLabel: feeModel?.source ?? null,
    expenseSourceLabel: expenseModel?.source ?? null,
    selectedFeeProfileId,
    feeTiers,
    expenses,
    shadowedPaths,
    annotations,
    feeBasisUsd: fundSize.normalizedValue,
    lifetimeFeesUsd: fixed(lifetimeFees, 6, 'economicsAssumptions.feeModel'),
    lifetimeExpensesUsd: fixed(lifetimeExpenses, 6, 'fundExpenses'),
  };

  const construction = selectConstruction(raw, inputs, money, rate);
  for (const path of Object.keys(declarations))
    if (!consumed.has(path))
      refuse(
        'INVALID_INPUT',
        path,
        'Declaration is shadowed, unconsumed, or already resolved by the persisted contract'
      );
  return {
    availableConstructionCapitalUsd: fixed(
      exactCommitments.minus(deemedContribution).minus(lifetimeFees).minus(lifetimeExpenses),
      6,
      'availableConstructionCapitalUsd'
    ),
    fundSize,
    configFundSize,
    baseCurrency: 'USD',
    isEvergreen: false,
    modelInputsAsOfDate: raw.modelInputsAsOfDate ?? null,
    vintageYear,
    fundLife: {
      path: lifePath,
      rawValue: life,
      effectiveValue: life,
      provenanceOrigin: 'contract_resolved',
      shadowed: timeline ? sourceFact('fundLife', raw.fundLife) : null,
    },
    investmentPeriod: {
      path: 'investmentPeriod',
      rawValue: investmentPeriod,
      effectiveValue: investmentPeriod,
      provenanceOrigin: 'contract_resolved',
      shadowed: null,
    },
    gp,
    feeExpense,
    construction,
  };
}

type MoneyReader = (
  value: unknown,
  path: string,
  code?: CapitalRefusalCodeV1
) => CapitalMoneySourceFactV1;
type RateReader = (
  value: unknown,
  path: string,
  resolved?: 'ratio' | 'percent_points',
  code?: CapitalRefusalCodeV1
) => CapitalRateSourceFactV1;

function selectConstruction(
  raw: RawConfig,
  inputs: CapitalPlanningInputV1[],
  money: MoneyReader,
  rate: RateReader
): CapitalConstructionSourceFactsV1 {
  const selectedAllocations = new Set<number>();
  const selectedSectors = new Set<number>();
  const selectedStages = new Map<number, Set<number>>();
  const links = new Map<string, CapitalConstructionSourceFactsV1['links'][number]>();
  function index<T extends { id: string }>(
    rows: T[] | undefined,
    id: string,
    path: string,
    code: CapitalRefusalCodeV1
  ): number {
    const matches = (rows ?? []).flatMap((row, i) => (row.id === id ? [i] : []));
    if (matches.length !== 1)
      refuse(code, path, 'Selection requires one exact, unique source ID', 'incomplete');
    return matches[0]!;
  }
  for (const input of inputs) {
    for (const allocation of input.allocations) {
      const ai = index(
        raw.capitalPlanAllocations,
        allocation.allocationId,
        'capitalPlanAllocations',
        'ALLOCATION_LINK_UNRESOLVED'
      );
      const sourceAllocation = raw.capitalPlanAllocations![ai]!;
      const pi = index(
        raw.pipelineProfiles,
        allocation.pipelineProfileId,
        'pipelineProfiles',
        'PROFILE_LINK_UNRESOLVED'
      );
      const profile = raw.pipelineProfiles![pi]!;
      const path = `pipelineProfiles[${pi}].stages`;
      const entry = index(profile.stages, allocation.entryStageId, path, 'STAGE_LINK_UNRESOLVED');
      const link = {
        allocationId: sourceAllocation.id,
        pipelineProfileId: profile.id,
        entryStageId: profile.stages[entry]!.id,
        provenanceOrigin: 'scenario_declared' as const,
      };
      const previous = links.get(sourceAllocation.id);
      if (
        previous &&
        (previous.pipelineProfileId !== link.pipelineProfileId ||
          previous.entryStageId !== link.entryStageId)
      )
        refuse(
          'ALLOCATION_LINK_UNRESOLVED',
          `capitalPlanAllocations[${ai}].id`,
          'Variants must share the same pinned source link',
          'incomplete'
        );
      links.set(sourceAllocation.id, link);
      selectedAllocations.add(ai);
      if (sourceAllocation.sectorProfileId !== undefined)
        selectedSectors.add(
          index(
            raw.sectorProfiles,
            sourceAllocation.sectorProfileId,
            `capitalPlanAllocations[${ai}].sectorProfileId`,
            'PROFILE_LINK_UNRESOLVED'
          )
        );
      const stages = selectedStages.get(pi) ?? new Set<number>();
      stages.add(entry);
      let previousIndex = entry;
      for (const round of allocation.followOnRounds) {
        const si = index(profile.stages, round.stageId, path, 'STAGE_LINK_UNRESOLVED');
        if (si !== previousIndex + 1)
          refuse(
            'STAGE_LINK_UNRESOLVED',
            `${path}[${si}].id`,
            'Include every intervening stage in source order, using zero participation for skipped investments',
            'incomplete'
          );
        stages.add(si);
        previousIndex = si;
      }
      selectedStages.set(pi, stages);
    }
  }
  // Construction caps govern the selected normalized facts. Unselected raw
  // profiles/stages remain governed by projection-fact and saved-input bounds.
  bounded(selectedAllocations.size, limits.maxAllocations, 'capitalPlanAllocations');
  bounded(selectedSectors.size, limits.maxProfiles, 'sectorProfiles');
  bounded(selectedStages.size, limits.maxProfiles, 'pipelineProfiles');
  for (const [profileIndex, stages] of selectedStages)
    bounded(stages.size, limits.maxStages, `pipelineProfiles[${profileIndex}].stages`);
  const optionalMoney = (value: number | undefined, path: string) =>
    value === undefined ? null : money(value, path);
  const optionalRate = (value: number | undefined, path: string) =>
    value === undefined ? null : rate(value, path);
  return {
    // Category allocations describe the whole fund and use a separate ID namespace from
    // the scenario-selected named allocations below.
    allocations: (raw.allocations ?? []).map((item, i) => ({
      id: item.id,
      category: item.category,
      percentage: rate(item.percentage, `allocations[${i}].percentage`, 'percent_points'),
    })),
    capitalPlanAllocations: (raw.capitalPlanAllocations ?? []).flatMap((item, i) => {
      if (!selectedAllocations.has(i)) return [];
      const path = `capitalPlanAllocations[${i}]`;
      if (!Number.isInteger(item.investmentHorizonMonths) || item.investmentHorizonMonths < 1)
        refuse(
          'INVALID_INPUT',
          `${path}.investmentHorizonMonths`,
          'Deployment horizon must be a positive integer month count'
        );
      bounded(
        item.investmentHorizonMonths,
        limits.maxDeploymentYears * 12,
        `${path}.investmentHorizonMonths`
      );
      return [
        {
          id: item.id,
          name: item.name,
          sectorProfileId: item.sectorProfileId ?? null,
          entryRound: item.entryRound,
          capitalAllocationPct: rate(item.capitalAllocationPct, `${path}.capitalAllocationPct`),
          initialCheckStrategy: item.initialCheckStrategy,
          initialCheckAmount: optionalMoney(item.initialCheckAmount, `${path}.initialCheckAmount`),
          initialOwnershipPct: optionalRate(
            item.initialOwnershipPct,
            `${path}.initialOwnershipPct`
          ),
          followOnStrategy: item.followOnStrategy,
          followOnAmount: optionalMoney(item.followOnAmount, `${path}.followOnAmount`),
          followOnParticipationPct: rate(
            item.followOnParticipationPct,
            `${path}.followOnParticipationPct`
          ),
          investmentHorizonMonths: item.investmentHorizonMonths,
        },
      ];
    }),
    sectorProfiles: (raw.sectorProfiles ?? []).flatMap((item, i) =>
      selectedSectors.has(i)
        ? [
            {
              id: item.id,
              name: item.name,
              targetPercentage: rate(
                item.targetPercentage,
                `sectorProfiles[${i}].targetPercentage`,
                'percent_points'
              ),
            },
          ]
        : []
    ),
    pipelineProfiles: (raw.pipelineProfiles ?? []).flatMap((profile, pi) => {
      const selected = selectedStages.get(pi);
      if (!selected) return [];
      return [
        {
          id: profile.id,
          name: profile.name,
          stages: profile.stages.flatMap((stage, si) => {
            if (!selected.has(si)) return [];
            const path = `pipelineProfiles[${pi}].stages[${si}]`;
            if (!Number.isInteger(stage.monthsToGraduate) || stage.monthsToGraduate < 0)
              refuse(
                'TIME_ORIGIN_UNRESOLVED',
                `${path}.monthsToGraduate`,
                'Round lag must be a nonnegative integer month count'
              );
            bounded(stage.monthsToGraduate, limits.maxRoundLagMonths, `${path}.monthsToGraduate`);
            return [
              {
                id: stage.id,
                name: stage.name,
                roundSize: optionalMoney(stage.roundSize, `${path}.roundSize`),
                valuation: optionalMoney(stage.valuation, `${path}.valuation`),
                valuationType: stage.valuationType,
                esopPct: optionalRate(stage.esopPct, `${path}.esopPct`),
                graduationRate: rate(stage.graduationRate, `${path}.graduationRate`),
                exitValuation: optionalMoney(stage.exitValuation, `${path}.exitValuation`),
                monthsToGraduate: stage.monthsToGraduate,
                // Raw V1 has no time-origin or incremental-pool contract. Scenario input owns both.
                timeOrigin: 'unresolved' as const,
                poolSemantics: 'unresolved' as const,
              },
            ];
          }),
        },
      ];
    }),
    links: [...selectedAllocations]
      .sort((a, b) => a - b)
      .map((i) => links.get(raw.capitalPlanAllocations![i]!.id)!),
  };
}

function failure(
  issues: CapitalIssueV1[],
  context: Readiness['context'],
  sourceIssues: z.ZodIssue[] = []
): Extract<CapitalMaterializationResult, { ok: false }> {
  return {
    ok: false,
    status: sourceIssues.length ? 409 : 422,
    code: sourceIssues.length
      ? 'scenario_source_config_invalid'
      : 'capital_source_admission_refused',
    issues,
    sourceIssues,
    readiness: {
      context,
      state: issues.some((issue) => issue.support === 'unsupported')
        ? 'UNSUPPORTED'
        : 'INPUT_REQUIRED',
      issues,
    },
  };
}

function admittedInputs(
  inputs: readonly unknown[],
  raw: RawConfig,
  allowDraft = false
): CapitalPlanningDraftV1[] {
  if (inputs.length === 0)
    refuse('INVALID_INPUT', 'inputs', 'At least one scenario input is required', 'incomplete');
  bounded(inputs.length, limits.maxVariants, 'inputs');
  return inputs.map((input) => {
    const isDraft =
      allowDraft &&
      typeof input === 'object' &&
      input !== null &&
      Object.prototype.hasOwnProperty.call(input, 'input');
    const parsed = isDraft
      ? CapitalPlanningDraftV1Schema.safeParse(input)
      : CapitalPlanningInputV1Schema.safeParse(input);
    if (parsed.success)
      return isDraft
        ? (parsed.data as CapitalPlanningDraftV1)
        : { input: parsed.data as CapitalPlanningInputV1 };
    throw new AdmissionRefusal(
      parsed.error.issues.map((originalIssue): CapitalIssueV1 => {
        const issue =
          isDraft && originalIssue.path[0] === 'input'
            ? { ...originalIssue, path: originalIssue.path.slice(1) }
            : originalIssue;
        let path = issuePath(issue.path) || 'input';
        let code: CapitalRefusalCodeV1 = 'INVALID_INPUT';
        if (issue.path.includes('timeOrigin') || issue.path.includes('monthsAfterPreviousRound')) {
          code = 'TIME_ORIGIN_UNRESOLVED';
          // A source transition belongs to the previous stage even when its investment is skipped.
          const candidate = (
            isDraft ? (input as { input: unknown }).input : input
          ) as Partial<CapitalPlanningInputV1> | null;
          const ai = issue.path[1];
          const ri = issue.path[3];
          const allocation =
            Array.isArray(candidate?.allocations) && typeof ai === 'number'
              ? candidate.allocations[ai]
              : undefined;
          const pi =
            raw.pipelineProfiles?.findIndex(
              (profile) => profile.id === allocation?.pipelineProfileId
            ) ?? -1;
          const previousId =
            typeof ri === 'number' && ri > 0 && Array.isArray(allocation?.followOnRounds)
              ? allocation.followOnRounds[ri - 1]?.stageId
              : allocation?.entryStageId;
          const si =
            raw.pipelineProfiles?.[pi]?.stages.findIndex((stage) => stage.id === previousId) ?? -1;
          if (pi >= 0 && si >= 0) path = `pipelineProfiles[${pi}].stages[${si}].monthsToGraduate`;
        } else if (issue.message === 'OWNERSHIP_INPUT_UNRESOLVED') {
          code = 'OWNERSHIP_INPUT_UNRESOLVED';
        } else if (issue.message === 'CHECK_EXCEEDS_ROUND_SIZE') {
          code = 'CHECK_EXCEEDS_ROUND_SIZE';
        }
        return {
          code,
          path,
          message: issue.message,
          support:
            code === 'TIME_ORIGIN_UNRESOLVED' || code === 'OWNERSHIP_INPUT_UNRESOLVED'
              ? 'incomplete'
              : 'invalid',
        };
      })
    );
  });
}

/** Trace editable assumptions to the selected source, without overwriting scenario choices. */
function assumptionProvenance(
  input: CapitalPlanningInputV1,
  bundle: CapitalSourceBundleV1
): CapitalAssumptionProvenanceV1[] {
  const result: CapitalAssumptionProvenanceV1[] = [];
  for (const [ai, allocation] of input.allocations.entries()) {
    const source = bundle.construction.capitalPlanAllocations.find(
      (item) => item.id === allocation.allocationId
    )!;
    const profile = bundle.construction.pipelineProfiles.find(
      (item) => item.id === allocation.pipelineProfileId
    )!;
    const entry = profile.stages.find((stage) => stage.id === allocation.entryStageId)!;
    const allocationPath = source.capitalAllocationPct.path.replace(/\.capitalAllocationPct$/, '');
    const path = `allocations[${ai}]`;
    const add = (
      inputPath: string,
      effectiveValue: CapitalAssumptionProvenanceV1['effectiveValue'],
      sourcePath: string | null = null,
      sourceValue: CapitalAssumptionProvenanceV1['sourceValue'] = null,
      stageId: string | null = null,
      note: string | null = null
    ) =>
      result.push({
        inputPath,
        effectiveValue,
        sourcePath,
        sourceValue,
        origin:
          sourceValue === null
            ? 'user_entered'
            : sourceValue === effectiveValue
              ? 'source_derived'
              : 'user_override',
        profileId: profile.id,
        stageId,
        effectiveDate: bundle.modelInputsAsOfDate,
        sourceVintage: String(bundle.vintageYear),
        note,
        benchmark: null,
      });
    const fact = (
      inputPath: string,
      effective: string,
      value: CapitalMoneySourceFactV1 | CapitalRateSourceFactV1 | null,
      stageId: string | null = null
    ) => add(inputPath, effective, value?.path ?? null, value?.normalizedValue ?? null, stageId);
    add(`${path}.name`, allocation.name, `${allocationPath}.name`, source.name);
    add(
      `${path}.entryRound`,
      allocation.entryRound,
      `${allocationPath}.entryRound`,
      source.entryRound,
      entry.id
    );
    fact(`${path}.budgetShareRatio`, allocation.budgetShareRatio, source.capitalAllocationPct);
    fact(
      `${path}.initialCheckUsd`,
      allocation.initialCheckUsd,
      source.initialCheckStrategy === 'amount' ? source.initialCheckAmount : null,
      entry.id
    );
    add(
      `${path}.deploymentPeriodYears`,
      allocation.deploymentPeriodYears,
      `${allocationPath}.investmentHorizonMonths`,
      source.investmentHorizonMonths % 12 === 0 ? source.investmentHorizonMonths / 12 : null
    );
    if (allocation.plannedCompanyCount !== undefined)
      add(`${path}.plannedCompanyCount`, allocation.plannedCompanyCount);
    const financing = (
      prefix: string,
      value: NonNullable<typeof allocation.entryFinancing>,
      stage: typeof entry
    ) => {
      fact(`${prefix}.valuationUsd`, value.valuationUsd, stage.valuation, stage.id);
      fact(`${prefix}.totalPrimaryRoundUsd`, value.totalPrimaryRoundUsd, stage.roundSize, stage.id);
      add(
        `${prefix}.valuationBasis`,
        value.valuationBasis,
        stage.graduationRate.path.replace(/graduationRate$/, 'valuationType'),
        stage.valuationType === 'pre' ? 'pre_money' : 'post_money',
        stage.id
      );
    };
    if (allocation.entryFinancing)
      financing(`${path}.entryFinancing`, allocation.entryFinancing, entry);
    let previous = entry;
    allocation.followOnRounds.forEach((round, ri) => {
      const stage = profile.stages.find((item) => item.id === round.stageId)!;
      const roundPath = `${path}.followOnRounds[${ri}]`;
      // A transition belongs to the preceding stage, not to the destination financing.
      fact(
        `${roundPath}.graduationRatio`,
        round.graduationRatio,
        previous.graduationRate,
        previous.id
      );
      fact(
        `${roundPath}.participationRatio`,
        round.participationRatio,
        source.followOnParticipationPct,
        stage.id
      );
      add(
        `${roundPath}.monthsAfterPreviousRound`,
        round.monthsAfterPreviousRound,
        previous.graduationRate.path.replace(/graduationRate$/, 'monthsToGraduate'),
        previous.monthsToGraduate,
        previous.id,
        'Previous-round time origin is an explicit scenario assumption.'
      );
      add(`${roundPath}.timeOrigin`, round.timeOrigin, null, null, previous.id);
      if (round.checkPolicy.type === 'fixed_check')
        fact(
          `${roundPath}.checkPolicy.checkUsd`,
          round.checkPolicy.checkUsd,
          source.followOnStrategy === 'amount' ? source.followOnAmount : null,
          stage.id
        );
      else
        add(
          `${roundPath}.checkPolicy.proRataExerciseRatio`,
          round.checkPolicy.proRataExerciseRatio,
          null,
          null,
          stage.id
        );
      if (round.financing) financing(`${roundPath}.financing`, round.financing, stage);
      if (round.incrementalPreMoneyPoolDilutionRatio !== undefined)
        add(
          `${roundPath}.incrementalPreMoneyPoolDilutionRatio`,
          round.incrementalPreMoneyPoolDilutionRatio,
          null,
          null,
          stage.id,
          'Entered incremental dilution; not inferred from the persisted total ESOP pool.'
        );
      previous = stage;
    });
  }
  if (input.netInvestableCapitalUsd !== undefined)
    result.push({
      inputPath: 'netInvestableCapitalUsd',
      effectiveValue: input.netInvestableCapitalUsd,
      origin: 'user_entered',
      sourcePath: null,
      sourceValue: null,
      profileId: null,
      stageId: null,
      effectiveDate: bundle.modelInputsAsOfDate,
      sourceVintage: null,
      note: null,
      benchmark: null,
    });
  return result;
}

function prepareSelectedSourceFacts(
  raw: RawConfig,
  fund: CapitalRawSource['fund'],
  inputValues: readonly unknown[],
  unitDeclarations: unknown,
  expectedInterpretationVersion: string | undefined
) {
  if (
    expectedInterpretationVersion !== undefined &&
    expectedInterpretationVersion !== CAPITAL_SOURCE_INTERPRETATION_VERSION
  )
    refuse(
      'INTERPRETATION_VERSION_UNSUPPORTED',
      'expectedInterpretationVersion',
      'Reviewed interpretation version is unsupported',
      'unsupported'
    );
  const drafts = admittedInputs(inputValues, raw, true);
  const inputs = drafts.map((draft) => draft.input);
  const declarations = parse(CapitalUnitDeclarationsV1Schema, unitDeclarations, 'unitDeclarations');
  const { availableConstructionCapitalUsd, ...facts } = normalizeSource(
    raw,
    fund,
    declarations,
    inputs
  );
  return { drafts, inputs, declarations, availableConstructionCapitalUsd, facts };
}

function finishCapitalSourceMaterialization(
  prepared: ReturnType<typeof prepareSelectedSourceFacts>,
  fingerprint: ReturnType<typeof fingerprintCapitalSource>,
  publishedAt: string
): Extract<CapitalMaterializationResult, { ok: true }> {
  const { drafts, inputs, declarations, availableConstructionCapitalUsd, facts } = prepared;
  const sourceBundle = parse(
    CapitalSourceBundleV1Schema,
    {
      contractVersion: 'fund-scenario-capital-source-bundle/1.0.0',
      ...fingerprint,
      publishedAt,
      interpretationVersion: CAPITAL_SOURCE_INTERPRETATION_VERSION,
      unitDeclarations: declarations,
      ...facts,
    },
    'sourceBundle'
  );
  const resolutions = drafts.some((draft) => (draft.benchmarkSelections?.length ?? 0) > 0)
    ? drafts.map((draft) => resolveCapitalPlanningDraftV1({ draft, sourceBundle }))
    : undefined;
  return {
    ok: true,
    sourceBundle,
    availableConstructionCapitalUsd,
    assumptionProvenanceByInput: resolutions
      ? resolutions.map((resolution) =>
          applyCapitalBenchmarkProvenanceV1(
            assumptionProvenance(resolution.input, sourceBundle),
            resolution.financingProvenance
          )
        )
      : inputs.map((input) => assumptionProvenance(input, sourceBundle)),
    ...(resolutions
      ? {
          resolvedInputs: resolutions.map((resolution) => resolution.input),
          benchmarkSnapshotsByInput: resolutions.map((resolution) => resolution.benchmarkSnapshots),
        }
      : {}),
    readiness: { context: 'current_preview', state: 'READY', issues: [] },
  };
}

export function materializeCapitalSource(
  args: {
    source: CapitalRawSource;
    inputs: readonly unknown[];
    unitDeclarations: unknown;
    expectedInterpretationVersion?: string;
  },
  hashCanonicalJson: (value: unknown) => string
): CapitalMaterializationResult {
  // Validate the entire original source first, including every shadowed branch. Discard parsed
  // output: GP parsing inserts defaults that must never enter raw presence or source hashes.
  const sourceValidation = FundDraftWriteV1Schema.safeParse(args.source.config.raw);
  if (!sourceValidation.success)
    return failure(
      sourceValidation.error.issues.map((issue) => ({
        code: 'INVALID_INPUT',
        path: issuePath(issue.path) || 'config',
        message: issue.message,
        support: 'invalid',
      })),
      'current_preview',
      sourceValidation.error.issues
    );
  try {
    const prepared = prepareSelectedSourceFacts(
      args.source.config.raw as RawConfig,
      args.source.fund,
      args.inputs,
      args.unitDeclarations,
      args.expectedInterpretationVersion
    );
    const fingerprint = fingerprintCapitalSource(args.source, hashCanonicalJson);
    return finishCapitalSourceMaterialization(
      prepared,
      fingerprint,
      args.source.config.publishedAt
    );
  } catch (error) {
    if (error instanceof AdmissionRefusal) return failure(error.issues, 'current_preview');
    if (error instanceof CapitalPlanningCalculationError)
      return failure(error.issues, 'current_preview');
    throw error;
  }
}

/** Review a verified bounded source projection without weakening full-source admission. */
export function materializeCapitalProjectionPreview(args: {
  source: FundScenarioCapitalSourceResponseV1;
  inputs: readonly unknown[];
  unitDeclarations: unknown;
  expectedInterpretationVersion?: string;
}): CapitalMaterializationResult {
  const { source } = args;
  const sourceIssues = source.calculationReadiness.issues.filter((issue) => {
    // Only these exact inspection placeholders may be replaced by draft-specific admission.
    if (Object.keys(issue).length !== 4 || issue.support !== 'incomplete') return true;
    if (
      issue.code === 'INVALID_INPUT' &&
      issue.path === 'inputs' &&
      issue.message === SOURCE_SELECTION_REQUIRED_MESSAGE
    )
      return false;
    const declaration = source.remainingDeclarations.find((entry) => entry.path === issue.path);
    return !(
      declaration &&
      issue.message === SOURCE_DECLARATION_REQUIRED_MESSAGE &&
      issue.code ===
        (declaration.allowedUnits[0]?.startsWith('fund_month')
          ? 'TIME_ORIGIN_UNRESOLVED'
          : 'UNIT_PROVENANCE_UNRESOLVED')
    );
  });
  if (sourceIssues.length) return failure(sourceIssues, 'current_preview');
  try {
    const raw = restoreRawFacts(source.projection.facts);
    const prepared = prepareSelectedSourceFacts(
      raw,
      { id: source.projection.fundId, ...source.projection.fund },
      args.inputs,
      args.unitDeclarations,
      args.expectedInterpretationVersion
    );
    return finishCapitalSourceMaterialization(
      prepared,
      { projection: source.projection, sourceBundleHash: source.sourceBundleHash },
      source.publishedAt
    );
  } catch (error) {
    if (error instanceof AdmissionRefusal || error instanceof CapitalPlanningCalculationError)
      return failure(error.issues, 'current_preview');
    throw error;
  }
}

/** Rebuild only the allowlisted saved facts; rawConfigHash still binds the original whole config. */
function restoreRawFacts(facts: RawFact[]): RawConfig {
  const raw: Record<string, unknown> = {};
  for (const fact of facts) {
    if (fact.state === 'absent') continue;
    const parts = fact.path.replace(/\[(\d+)\]/g, '.$1').split('.');
    let target: Record<string, unknown> = raw;
    const checkIndex = (part: string) => {
      if (/^\d+$/.test(part) && (!Array.isArray(target) || Number(part) >= target.length))
        refuse(
          'HISTORICAL_SOURCE_INTEGRITY_FAILED',
          fact.path,
          'Saved index exceeds its declared source array'
        );
    };
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]!;
      checkIndex(part);
      if (target[part] === undefined) target[part] = /^\d+$/.test(parts[i + 1]!) ? [] : {};
      if (target[part] === null || typeof target[part] !== 'object')
        refuse('HISTORICAL_SOURCE_INTEGRITY_FAILED', fact.path, 'Conflicting saved source facts');
      target = target[part] as Record<string, unknown>;
    }
    checkIndex(parts[parts.length - 1]!);
    target[parts[parts.length - 1]!] =
      fact.state === 'array' ? Array.from({ length: fact.length }) : fact.rawValue;
  }
  // This bounded projection intentionally excludes unrelated persisted fields such as fundName.
  // Original-source schema validation belongs to admission, not replay of this bounded projection.
  return raw as RawConfig;
}

export function verifyPinnedCapitalSourceBundle(
  args: {
    sourceBundle: unknown;
    savedProjection: unknown;
    inputs: readonly unknown[];
  },
  hashCanonicalJson: (value: unknown) => string
):
  | { ok: true; availableConstructionCapitalUsd: string; readiness: Readiness }
  | Extract<CapitalMaterializationResult, { ok: false }> {
  try {
    const bundle = parse(CapitalSourceBundleV1Schema, args.sourceBundle, 'sourceBundle');
    const savedProjection = parse(
      CapitalSourceProjectionV1Schema,
      args.savedProjection,
      'savedProjection'
    );
    if (bundle.interpretationVersion !== CAPITAL_SOURCE_INTERPRETATION_VERSION)
      refuse(
        'INTERPRETATION_VERSION_UNSUPPORTED',
        'interpretationVersion',
        'Saved interpretation version is unsupported',
        'unsupported'
      );
    if (
      hashCanonicalJson(savedProjection) !== bundle.sourceBundleHash ||
      canonicalJson(bundle.projection) !== canonicalJson(savedProjection)
    )
      refuse(
        'HISTORICAL_SOURCE_INTEGRITY_FAILED',
        'sourceBundleHash',
        'Bundle does not match the supplied saved raw source'
      );
    const raw = restoreRawFacts(savedProjection.facts);
    const { availableConstructionCapitalUsd, ...facts } = normalizeSource(
      raw,
      { id: savedProjection.fundId, ...savedProjection.fund },
      bundle.unitDeclarations,
      admittedInputs(args.inputs, raw).map((draft) => draft.input)
    );
    const rebuilt = parse(CapitalSourceBundleV1Schema, { ...bundle, ...facts }, 'sourceBundle');
    if (canonicalJson(rebuilt) !== canonicalJson(bundle))
      refuse(
        'SOURCE_BUNDLE_INCONSISTENT',
        'sourceBundle',
        'Derived bundle facts disagree with the saved raw facts and declarations'
      );
    return {
      ok: true,
      availableConstructionCapitalUsd,
      readiness: { context: 'saved_input', state: 'READY', issues: [] },
    };
  } catch (error) {
    if (error instanceof AdmissionRefusal) return failure(error.issues, 'saved_input');
    throw error;
  }
}
