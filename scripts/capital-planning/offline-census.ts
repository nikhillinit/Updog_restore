import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  CAPITAL_FEE_METHOD_VERSION,
  CAPITAL_GP_METHOD_VERSION,
  CAPITAL_SOURCE_INTERPRETATION_VERSION,
  type CapitalIssueV1,
} from '../../shared/contracts/capital-planning-v1.contract';
import { canonicalJson } from '../../shared/lib/canonical-json';
import { Decimal } from '../../shared/lib/decimal-config';
import { materializeCapitalSource } from '../../shared/lib/capital-planning/materialize-from-fund-draft';

const Identity = z.number().int().positive().safe();
const Run = z
  .object({
    gitHead: z.string().regex(/^[a-f0-9]{40}$/),
    operator: z.string().min(1),
    generatedAt: z.string().datetime({ offset: true }),
  })
  .strict();
const Export = z
  .object({
    identity: z.string().min(1),
    exportedAt: z.string().datetime({ offset: true }),
    sourceEnvironment: z.string().min(1),
    populationKind: z.enum(['synthetic', 'sanitized']),
    redaction: z
      .object({
        statement: z.string().min(1),
        omittedPopulation: z.array(z.string()),
        omittedFields: z.array(z.string()),
      })
      .strict(),
    json: z.string(),
  })
  .strict();
// Validate export structure; source facts, declarations and inputs remain the materializer's job.
const Row = z
  .object({
    source: z
      .object({
        fund: z
          .object({
            id: Identity,
            size: z.union([z.string(), z.number()]),
            baseCurrency: z.string().nullable(),
          })
          .passthrough(),
        config: z
          .object({
            id: Identity,
            version: Identity,
            publishedAt: z.string().datetime({ offset: true }),
            raw: z.unknown(),
          })
          .passthrough(),
      })
      .strict(),
    inputs: z.array(z.unknown()),
    unitDeclarations: z.unknown(),
  })
  .strict();

type Issue = Pick<CapitalIssueV1, 'code' | 'path' | 'support' | 'reason' | 'feeBasis'>;
type Counts = Map<string, number>;
const increment = (counts: Counts, key: string) => counts.set(key, (counts.get(key) ?? 0) + 1);
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const sorted = (counts: Counts) =>
  Object.fromEntries([...counts].sort(([a], [b]) => compare(a, b)));
function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function range(values: string[]) {
  if (!values.length) return null;
  return values.reduce(
    (bounds, value) => ({
      minimum: new Decimal(value).lt(bounds.minimum) ? value : bounds.minimum,
      maximum: new Decimal(value).gt(bounds.maximum) ? value : bounds.maximum,
    }),
    { minimum: values[0]!, maximum: values[0]! }
  );
}
function explicitSelection(issue: Issue, sourceSchemaInvalid: boolean, declarations: unknown) {
  if (sourceSchemaInvalid) return false;
  // Incomplete timing choices remain selectable; malformed raw month counts do not.
  if (issue.code === 'TIME_ORIGIN_UNRESOLVED') return issue.support === 'incomplete';
  // This reference belongs to the stored allocation, not its selected pipeline profile.
  if (
    issue.code === 'PROFILE_LINK_UNRESOLVED' &&
    /^capitalPlanAllocations\[\d+\]\.sectorProfileId$/.test(issue.path)
  )
    return false;
  if (issue.code === 'INVALID_INPUT' && Object.hasOwn(object(declarations), issue.path))
    return true;
  return (
    [
      'UNIT_PROVENANCE_UNRESOLVED',
      'ALLOCATION_LINK_UNRESOLVED',
      'PROFILE_LINK_UNRESOLVED',
      'STAGE_LINK_UNRESOLVED',
    ].includes(issue.code) ||
    /^(?:inputs|allocations|input|unitDeclarations|netInvestableCapitalUsd|performanceCase)(?:\[|\.|$)/.test(
      issue.path
    )
  );
}

/** Pure offline producer. Metadata is supplied by the operator; this function never queries a provider. */
export function produceCapitalCompatibilityCensus(args: {
  run: z.input<typeof Run>;
  export?: z.input<typeof Export> | null;
}) {
  const run = Run.parse(args.run);
  const methods = {
    materializer: CAPITAL_SOURCE_INTERPRETATION_VERSION,
    gp: CAPITAL_GP_METHOD_VERSION,
    fee: CAPITAL_FEE_METHOD_VERSION,
  };
  const base = {
    reportVersion: 'capital-compatibility-census/1.0.0',
    run,
    methods,
    deduplicationRule:
      'Exact fund ID, published config ID and version tuple; identical canonical rows collapse; conflicting rows refuse.',
    coverageRule:
      'Raw coverage counts deduplicated export rows. Resolved coverage counts only admitted rows; earlier refusals do not prove later checks. Profile, stage and link totals count admitted source entries.',
    refusalRule:
      'Passing and refused outcomes are exclusive. Each unique reason and path counts a row once; different reasons and paths may overlap.',
    remediationRule:
      'Explicit selections remain separate from source or unsupported-policy issues. No source repairs, guessed mappings or guessed units are applied; a listed issue does not imply that a source edit alone can make the policy supported.',
  };
  if (args.export === null || args.export === undefined)
    return {
      ...base,
      status: 'NOT_COLLECTED' as const,
      export: null,
      counts: null,
      coverage: null,
      refusalsByCode: null,
      refusalsByPath: null,
      refusalsByCodeAndPath: null,
      outcomes: null,
    };
  const { json, ...metadata } = Export.parse(args.export);
  const rows = z.array(Row).parse(JSON.parse(json));
  const unique = new Map<string, { row: z.infer<typeof Row>; canonical: string }>();
  for (const row of rows) {
    const key = JSON.stringify([
      row.source.fund.id,
      row.source.config.id,
      row.source.config.version,
    ]);
    const canonical = canonicalJson(row);
    const prior = unique.get(key);
    if (prior && prior.canonical !== canonical)
      throw new Error(`Conflicting duplicate census identity ${key}`);
    unique.set(key, { row, canonical });
  }
  const byCode: Counts = new Map();
  const byPath: Counts = new Map();
  const byCodeAndPath = new Map<
    string,
    { code: CapitalIssueV1['code']; path: string; affectedRows: number }
  >();
  const raw = {
    fundedFromFeesPct: new Map() as Counts,
    isEvergreen: new Map() as Counts,
    currency: new Map() as Counts,
    fundLife: new Map() as Counts,
    investmentPeriod: new Map() as Counts,
  };
  const admitted = {
    gpSource: new Map() as Counts,
    fundLifeYears: new Map() as Counts,
    investmentPeriodYears: new Map() as Counts,
    feeSelection: new Map() as Counts,
    feeBasis: new Map() as Counts,
    selectedFeeProfile: new Map() as Counts,
    feePeriods: new Map() as Counts,
    expenseSelection: new Map() as Counts,
    expenseFrequency: new Map() as Counts,
    sourcePoolSemantics: new Map() as Counts,
  };
  const commitments: string[] = [];
  const deemed: string[] = [];
  let currencyAbsent = 0;
  let allocationLinks = 0;
  let profiles = 0;
  let stages = 0;
  const outcomes = [...unique]
    .sort(([a], [b]) => compare(a, b))
    .map(([, { row }]) => {
      const config = object(row.source.config.raw);
      const fraction = config['fundedFromFeesPct'];
      const fractionGroup = !Object.hasOwn(config, 'fundedFromFeesPct')
        ? 'absent'
        : fraction === 0
          ? 'explicit_zero'
          : fraction === 1
            ? 'explicit_one'
            : typeof fraction === 'number' &&
                Number.isFinite(fraction) &&
                fraction > 0 &&
                fraction < 1
              ? 'between_zero_and_one'
              : 'invalid';
      increment(raw.fundedFromFeesPct, fractionGroup);
      increment(
        raw.isEvergreen,
        !Object.hasOwn(config, 'isEvergreen')
          ? 'absent'
          : typeof config['isEvergreen'] === 'boolean'
            ? String(config['isEvergreen'])
            : 'invalid'
      );
      if (row.source.fund.baseCurrency === null) currencyAbsent++;
      else increment(raw.currency, row.source.fund.baseCurrency);
      for (const field of ['fundLife', 'investmentPeriod'] as const)
        increment(
          raw[field],
          !Object.hasOwn(config, field)
            ? 'absent'
            : typeof config[field] === 'number'
              ? String(config[field])
              : 'invalid'
        );
      const result = materializeCapitalSource({
        source: { ...row.source, config: { ...row.source.config, raw: row.source.config.raw } },
        inputs: row.inputs,
        unitDeclarations: row.unitDeclarations,
      });
      const common = {
        identity: {
          fundId: row.source.fund.id,
          configId: row.source.config.id,
          configVersion: row.source.config.version,
        },
        explicitSelections: {
          scenarioInputs: row.inputs.length,
          unitDeclarationPaths: Object.keys(object(row.unitDeclarations)).sort(),
        },
        sourceRepairsApplied: false as const,
      };
      if (result.ok) {
        const source = result.sourceBundle;
        increment(admitted.gpSource, source.gp.resolved.source);
        commitments.push(source.gp.resolved.commitmentUsd);
        deemed.push(source.gp.deemedContributionUsd);
        increment(admitted.fundLifeYears, String(source.fundLife.effectiveValue));
        increment(admitted.investmentPeriodYears, String(source.investmentPeriod.effectiveValue));
        increment(admitted.feeSelection, source.feeExpense.feeSelection);
        increment(
          admitted.selectedFeeProfile,
          source.feeExpense.selectedFeeProfileId ?? 'not_applicable'
        );
        for (const basis of new Set(source.feeExpense.feeTiers.map((tier) => tier.basis)))
          increment(admitted.feeBasis, basis);
        for (const period of new Set(
          source.feeExpense.feeTiers.map(
            (tier) => `${tier.period.normalizedStartMonth}:${tier.period.normalizedEndMonth}`
          )
        ))
          increment(admitted.feePeriods, period);
        increment(admitted.expenseSelection, source.feeExpense.expenseSelection);
        for (const frequency of new Set(
          source.feeExpense.expenses.map((expense) => expense.frequency)
        ))
          increment(admitted.expenseFrequency, frequency);
        allocationLinks += source.construction.links.length;
        profiles += source.construction.pipelineProfiles.length;
        for (const profile of source.construction.pipelineProfiles) {
          stages += profile.stages.length;
          for (const stage of profile.stages)
            increment(admitted.sourcePoolSemantics, stage.poolSemantics);
        }
        return {
          ...common,
          status: 'passed' as const,
          issues: [] as Issue[],
          explicitSelectionIssues: [] as Issue[],
          sourceOrPolicyIssues: [] as Issue[],
        };
      }
      const issues: Issue[] = result.issues.map(({ code, path, support, reason, feeBasis }) => ({
        code,
        path,
        support,
        ...(reason === undefined ? {} : { reason }),
        ...(feeBasis === undefined ? {} : { feeBasis }),
      }));
      for (const code of new Set(issues.map((issue) => issue.code))) increment(byCode, code);
      for (const path of new Set(issues.map((issue) => issue.path))) increment(byPath, path);
      for (const [key, issue] of new Map(
        issues.map((issue) => [JSON.stringify([issue.code, issue.path]), issue])
      )) {
        const prior = byCodeAndPath.get(key);
        byCodeAndPath.set(key, {
          code: issue.code,
          path: issue.path,
          affectedRows: (prior?.affectedRows ?? 0) + 1,
        });
      }
      const sourceSchemaInvalid = result.sourceIssues.length > 0;
      return {
        ...common,
        status: 'refused' as const,
        issues,
        explicitSelectionIssues: issues.filter((issue) =>
          explicitSelection(issue, sourceSchemaInvalid, row.unitDeclarations)
        ),
        sourceOrPolicyIssues: issues.filter(
          (issue) => !explicitSelection(issue, sourceSchemaInvalid, row.unitDeclarations)
        ),
      };
    });
  const passed = outcomes.filter((outcome) => outcome.status === 'passed').length;
  return {
    ...base,
    status: rows.length ? ('COLLECTED' as const) : ('COLLECTED_EMPTY' as const),
    export: {
      ...metadata,
      sha256: createHash('sha256').update(json).digest('hex'),
      byteLength: Buffer.byteLength(json),
    },
    counts: {
      raw: rows.length,
      deduplicated: unique.size,
      duplicate: rows.length - unique.size,
      evaluated: outcomes.length,
      passed,
      refused: outcomes.length - passed,
    },
    coverage: {
      raw: {
        fundedFromFeesPct: sorted(raw.fundedFromFeesPct),
        isEvergreen: sorted(raw.isEvergreen),
        currency: sorted(raw.currency),
        fundLife: sorted(raw.fundLife),
        investmentPeriod: sorted(raw.investmentPeriod),
        currencyAbsent,
      },
      admitted: {
        gpSource: sorted(admitted.gpSource),
        fundLifeYears: sorted(admitted.fundLifeYears),
        investmentPeriodYears: sorted(admitted.investmentPeriodYears),
        feeSelection: sorted(admitted.feeSelection),
        feeBasis: sorted(admitted.feeBasis),
        selectedFeeProfile: sorted(admitted.selectedFeeProfile),
        feePeriods: sorted(admitted.feePeriods),
        expenseSelection: sorted(admitted.expenseSelection),
        expenseFrequency: sorted(admitted.expenseFrequency),
        sourcePoolSemantics: sorted(admitted.sourcePoolSemantics),
        gpCommitmentUsd: range(commitments),
        deemedContributionUsd: range(deemed),
        allocationLinks,
        profiles,
        stages,
      },
      gpExceedsCommitmentsRefused: byCode.get('GP_COMMITMENT_EXCEEDS_COMMITMENTS') ?? 0,
    },
    refusalsByCode: sorted(byCode),
    refusalsByPath: sorted(byPath),
    refusalsByCodeAndPath: [...byCodeAndPath.values()].sort(
      (a, b) => compare(a.code, b.code) || compare(a.path, b.path)
    ),
    outcomes,
  };
}
