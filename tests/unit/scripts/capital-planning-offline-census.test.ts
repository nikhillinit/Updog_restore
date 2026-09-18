import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { produceCapitalCompatibilityCensus } from '../../../scripts/capital-planning/offline-census';
import {
  CAPITAL_FEE_METHOD_VERSION,
  CAPITAL_GP_METHOD_VERSION,
  CAPITAL_SOURCE_INTERPRETATION_VERSION,
} from '../../../shared/contracts/capital-planning-v1.contract';
import { materializeCapitalSource } from '../../../shared/lib/capital-planning/materialize-from-fund-draft';
import {
  makeCapitalDeclarations,
  makeCapitalInput,
  makeCapitalRawConfig,
} from '../../fixtures/capital-planning/fixtures';

const run = {
  gitHead: '886694b6af5d32190815288d06dfd5ed52772d39',
  operator: 'synthetic-unit-test',
  generatedAt: '2026-09-11T10:00:00.000Z',
};
function row(id = 1) {
  return {
    source: {
      fund: { id, size: '100', baseCurrency: 'USD' },
      config: {
        id: id + 100,
        version: 1,
        publishedAt: '2026-09-01T00:00:00.000Z',
        raw: makeCapitalRawConfig(),
      },
    },
    inputs: [makeCapitalInput()],
    unitDeclarations: makeCapitalDeclarations(),
  };
}
function exported(rows: unknown[]) {
  return {
    identity: 'synthetic://capital-census-fixture.json',
    exportedAt: '2026-09-11T09:00:00.000Z',
    sourceEnvironment: 'synthetic-unit-tests',
    populationKind: 'synthetic' as const,
    redaction: {
      statement: 'Synthetic fixtures only. No real fund export or production access.',
      omittedPopulation: ['all real funds'],
      omittedFields: [],
    },
    json: JSON.stringify(rows),
  };
}

function rowWithFollowOn() {
  const candidate = row();
  const stages = candidate.source.config.raw.pipelineProfiles![0]!.stages;
  stages.push({ ...stages[0]!, id: 's1', name: 'Series A' });
  for (const [path, unit] of Object.entries(candidate.unitDeclarations)) {
    if (path.startsWith('pipelineProfiles[0].stages[0].')) {
      candidate.unitDeclarations[path.replace('stages[0]', 'stages[1]')] = unit;
    }
  }
  candidate.inputs[0]!.allocations[0]!.followOnRounds = [
    {
      roundId: 'r1',
      stageId: 's1',
      roundLabel: 'Series A',
      graduationRatio: '0.500000000000',
      participationRatio: '1.000000000000',
      checkPolicy: { type: 'fixed_check', checkUsd: '1.000000' },
      monthsAfterPreviousRound: 12,
      timeOrigin: 'previous_round',
    },
  ];
  return candidate;
}

// These fixtures exercise the operational materializer; no injected result/counter adapter.
describe('CP-040 offline published-config compatibility census', () => {
  it('keeps missing export NOT_COLLECTED with null observed counts and coverage', () => {
    const result = produceCapitalCompatibilityCensus({ run, export: null });
    expect(produceCapitalCompatibilityCensus({ run })).toEqual(result);
    expect(result).toMatchObject({
      status: 'NOT_COLLECTED',
      export: null,
      counts: null,
      coverage: null,
      refusalsByCode: null,
      refusalsByPath: null,
      refusalsByCodeAndPath: null,
      outcomes: null,
      run,
    });
  });

  it('distinguishes a supplied empty export from missing population evidence', () => {
    const source = exported([]);
    const result = produceCapitalCompatibilityCensus({ run, export: source });
    expect(result.status).toBe('COLLECTED_EMPTY');
    expect(result.counts).toEqual({
      raw: 0,
      deduplicated: 0,
      duplicate: 0,
      evaluated: 0,
      passed: 0,
      refused: 0,
    });
    expect(result.outcomes).toEqual([]);
    expect(result.export).toMatchObject({
      identity: source.identity,
      populationKind: 'synthetic',
      sha256: createHash('sha256').update(source.json).digest('hex'),
      redaction: source.redaction,
    });
  });

  it('reconciles actual pass/refusal outcomes and deduplicates overlapping reasons per affected row', () => {
    const pass = row();
    const refused = row(2);
    refused.source.config.raw.economicsAssumptions!.gpCommitmentModel!.commitmentAmount = -1;
    refused.source.config.raw.economicsAssumptions!.feeModel!.tiers![0]!.rate = -1;
    const another = structuredClone(refused);
    another.source.config.id = 103;
    const actual = materializeCapitalSource(refused);
    expect(actual.ok).toBe(false);
    if (actual.ok) throw new Error('Expected actual materializer refusal');
    expect(actual.issues).toHaveLength(2);
    expect(actual.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'INVALID_INPUT',
          path: 'economicsAssumptions.gpCommitmentModel.commitmentAmount',
        }),
        expect.objectContaining({
          code: 'INVALID_INPUT',
          path: 'economicsAssumptions.feeModel.tiers[0].rate',
        }),
      ])
    );
    const source = exported([pass, refused, another, structuredClone(pass)]);
    const before = source.json;
    const result = produceCapitalCompatibilityCensus({ run, export: source });
    expect(result.status).toBe('COLLECTED');
    expect(result.counts).toEqual({
      raw: 4,
      deduplicated: 3,
      duplicate: 1,
      evaluated: 3,
      passed: 1,
      refused: 2,
    });
    expect(result.refusalsByCode).toEqual({ INVALID_INPUT: 2 });
    expect(result.refusalsByPath).toEqual({
      'economicsAssumptions.feeModel.tiers[0].rate': 2,
      'economicsAssumptions.gpCommitmentModel.commitmentAmount': 2,
    });
    expect(result.refusalsByCodeAndPath).toEqual([
      {
        code: 'INVALID_INPUT',
        path: 'economicsAssumptions.feeModel.tiers[0].rate',
        affectedRows: 2,
      },
      {
        code: 'INVALID_INPUT',
        path: 'economicsAssumptions.gpCommitmentModel.commitmentAmount',
        affectedRows: 2,
      },
    ]);
    expect(result.outcomes!.filter((r) => r.status === 'refused').map((r) => r.issues)).toEqual([
      actual.issues.map(({ code, path, support }) => ({ code, path, support })),
      actual.issues.map(({ code, path, support }) => ({ code, path, support })),
    ]);
    expect(source.json).toBe(before);
  });

  it('summarizes actual GP precedence, deemed ranges, raw fraction coverage and source support', () => {
    const amount = row(1);
    const percent = row(2);
    delete percent.source.config.raw.economicsAssumptions!.gpCommitmentModel!.commitmentAmount;
    delete percent.unitDeclarations['economicsAssumptions.gpCommitmentModel.commitmentAmount'];
    percent.source.config.raw.economicsAssumptions!.gpCommitmentModel!.commitmentPct = 0.1;
    percent.source.config.raw.fundedFromFeesPct = 0;
    const top = row(3);
    delete top.source.config.raw.economicsAssumptions!.gpCommitmentModel!.commitmentAmount;
    delete top.unitDeclarations['economicsAssumptions.gpCommitmentModel.commitmentAmount'];
    top.source.config.raw.gpCommitment = 10;
    top.unitDeclarations['gpCommitment'] = 'usd';
    top.source.config.raw.fundedFromFeesPct = 1;
    const fallback = row(4);
    delete fallback.source.config.raw.economicsAssumptions!.gpCommitmentModel!.commitmentAmount;
    delete fallback.unitDeclarations['economicsAssumptions.gpCommitmentModel.commitmentAmount'];
    delete fallback.source.config.raw.fundedFromFeesPct;
    const invalid = row(5);
    invalid.source.config.raw.fundedFromFeesPct = 1.5;
    const exceeds = row(6);
    exceeds.source.config.raw.economicsAssumptions!.gpCommitmentModel!.commitmentAmount = 101;
    const result = produceCapitalCompatibilityCensus({
      run,
      export: exported([amount, percent, top, fallback, invalid, exceeds]),
    });
    expect(result.counts).toMatchObject({ passed: 4, refused: 2 });
    expect(result.coverage).toMatchObject({
      raw: {
        fundedFromFeesPct: {
          absent: 1,
          explicit_zero: 1,
          between_zero_and_one: 2,
          explicit_one: 1,
          invalid: 1,
        },
        isEvergreen: { false: 6 },
        currency: { USD: 6 },
      },
      admitted: {
        gpSource: { nested_amount: 1, nested_percent: 1, top_level_amount: 1, zero_fallback: 1 },
        gpCommitmentUsd: { minimum: '0.000000', maximum: '10.000000' },
        deemedContributionUsd: { minimum: '0.000000', maximum: '10.000000' },
        fundLifeYears: { '2': 4 },
        investmentPeriodYears: { '1': 4 },
        feeSelection: { explicit_tiers: 4 },
        feeBasis: { committed_capital: 4 },
        selectedFeeProfile: { not_applicable: 4 },
        feePeriods: { '0:23': 4 },
        expenseFrequency: { annual: 4 },
        expenseSelection: { explicit_annual: 4 },
        allocationLinks: 4,
        profiles: 4,
        stages: 4,
        sourcePoolSemantics: { unresolved: 4 },
      },
      gpExceedsCommitmentsRefused: 1,
    });
    expect(result.methods).toEqual({
      materializer: CAPITAL_SOURCE_INTERPRETATION_VERSION,
      gp: CAPITAL_GP_METHOD_VERSION,
      fee: CAPITAL_FEE_METHOD_VERSION,
    });
  });

  it('keeps absent currency separate from an invalid literal and observes absent evergreen without defaults', () => {
    const absent = row();
    delete absent.source.config.raw.isEvergreen;
    const nullCurrency = {
      ...absent,
      source: { ...absent.source, fund: { ...absent.source.fund, baseCurrency: null } },
    };
    const invalid = row(2);
    invalid.source.fund.baseCurrency = 'absent';
    const result = produceCapitalCompatibilityCensus({
      run,
      export: exported([nullCurrency, invalid]),
    });
    expect(result.coverage!.raw).toMatchObject({
      currency: { absent: 1 },
      currencyAbsent: 1,
      isEvergreen: { absent: 1, false: 1 },
    });
    expect(result.counts).toMatchObject({ passed: 0, refused: 2 });
  });

  it('retains unsupported fee basis and reason as source-policy findings without scenario repair', () => {
    const unsupported = row();
    unsupported.source.config.raw.economicsAssumptions!.feeModel!.tiers![0]!.basis =
      'invested_capital';
    const result = produceCapitalCompatibilityCensus({ run, export: exported([unsupported]) });
    expect(result.counts).toMatchObject({ passed: 0, refused: 1 });
    expect(result.outcomes![0]).toMatchObject({
      explicitSelectionIssues: [],
      sourceOrPolicyIssues: [
        {
          code: 'FEE_BASIS_UNSUPPORTED',
          path: 'economicsAssumptions.feeModel.tiers[0].basis',
          feeBasis: 'invested_capital',
          reason: 'INVESTED_BASIS_ADAPTER_NOT_IMPLEMENTED',
          support: 'unsupported',
        },
      ],
    });
    expect(result.coverage!.admitted.feeBasis).toEqual({});
  });

  it('keeps explicit selections distinct from unresolved source repairs without guessing units', () => {
    const missingUnit = row();
    delete missingUnit.unitDeclarations['capitalPlanAllocations[0].initialCheckAmount'];
    const sourceRepair = row(2);
    sourceRepair.source.config.raw.economicsAssumptions!.gpCommitmentModel!.commitmentAmount = -1;
    const source = exported([missingUnit, sourceRepair]);
    const result = produceCapitalCompatibilityCensus({ run, export: source });
    expect(result.counts).toMatchObject({ passed: 0, refused: 2 });
    expect(result.outcomes![0]).toMatchObject({
      status: 'refused',
      sourceRepairsApplied: false,
      explicitSelectionIssues: [
        {
          code: 'UNIT_PROVENANCE_UNRESOLVED',
          path: 'capitalPlanAllocations[0].initialCheckAmount',
          support: 'incomplete',
        },
      ],
      sourceOrPolicyIssues: [],
    });
    expect(result.outcomes![1]).toMatchObject({
      status: 'refused',
      sourceRepairsApplied: false,
      explicitSelectionIssues: [],
      sourceOrPolicyIssues: [
        {
          code: 'INVALID_INPUT',
          path: 'economicsAssumptions.gpCommitmentModel.commitmentAmount',
          support: 'invalid',
        },
      ],
    });
    expect(result.outcomes![0]!.explicitSelections.unitDeclarationPaths).not.toContain(
      'capitalPlanAllocations[0].initialCheckAmount'
    );
    expect(source.json).toBe(JSON.stringify([missingUnit, sourceRepair]));
  });

  it('classifies an invalid explicit unit declaration as a selection issue rather than a source repair', () => {
    const invalid = row();
    invalid.unitDeclarations['capitalPlanAllocations[0].initialCheckAmount'] =
      'fund_month_zero_based';
    const result = produceCapitalCompatibilityCensus({ run, export: exported([invalid]) });
    expect(result.outcomes![0]).toMatchObject({
      status: 'refused',
      sourceOrPolicyIssues: [],
      explicitSelectionIssues: [
        {
          code: 'INVALID_INPUT',
          path: 'capitalPlanAllocations[0].initialCheckAmount',
          support: 'invalid',
        },
      ],
    });
  });

  it('uses fund, config ID and version together and rejects conflicting duplicates', () => {
    const first = row(1);
    const nextVersion = structuredClone(first);
    nextVersion.source.config.version = 2;
    const anotherFund = structuredClone(first);
    anotherFund.source.fund.id = 2;
    const result = produceCapitalCompatibilityCensus({
      run,
      export: exported([anotherFund, nextVersion, first]),
    });
    expect(result.counts).toMatchObject({ deduplicated: 3, duplicate: 0, passed: 3 });
    expect(result.outcomes!.map((r) => r.identity)).toEqual([
      { fundId: 1, configId: 101, configVersion: 1 },
      { fundId: 1, configId: 101, configVersion: 2 },
      { fundId: 2, configId: 101, configVersion: 1 },
    ]);
    const conflicting = structuredClone(first);
    conflicting.source.config.raw.fundLife = 3;
    expect(() =>
      produceCapitalCompatibilityCensus({ run, export: exported([first, conflicting]) })
    ).toThrow('Conflicting duplicate census identity');
  });

  it('records exact export bytes and metadata while retaining synthetic population labeling', () => {
    const source = exported([row()]);
    source.json = `\n${source.json}\n`;
    const result = produceCapitalCompatibilityCensus({ run, export: source });
    expect(result.export).toEqual({
      identity: source.identity,
      exportedAt: source.exportedAt,
      sourceEnvironment: source.sourceEnvironment,
      populationKind: 'synthetic',
      redaction: source.redaction,
      sha256: createHash('sha256').update(source.json).digest('hex'),
      byteLength: Buffer.byteLength(source.json),
    });
    expect(result.run).toEqual(run);
    expect(JSON.stringify(result)).not.toContain('Synthetic capital source');
    expect(() =>
      produceCapitalCompatibilityCensus({ run: { ...run, gitHead: 'main' }, export: source })
    ).toThrow();
    expect(() =>
      produceCapitalCompatibilityCensus({ run, export: { ...source, exportedAt: '' } })
    ).toThrow();
    expect(() =>
      produceCapitalCompatibilityCensus({ run, export: { ...source, json: '{invalid' } })
    ).toThrow();
  });
});

describe('CP-040 refusal remediation classification', () => {
  it('classifies a dangling raw sector-profile reference as a source or policy issue', () => {
    const candidate = row();
    candidate.source.config.raw.capitalPlanAllocations![0]!.sectorProfileId = 'missing-sector';
    const issue = {
      code: 'PROFILE_LINK_UNRESOLVED',
      path: 'capitalPlanAllocations[0].sectorProfileId',
      support: 'incomplete',
    };
    const actual = materializeCapitalSource(candidate);
    expect(actual.ok).toBe(false);
    if (actual.ok) throw new Error('Dangling raw sector-profile reference unexpectedly admitted');
    expect(actual.issues).toEqual([expect.objectContaining(issue)]);
    const result = produceCapitalCompatibilityCensus({ run, export: exported([candidate]) });
    expect(result.outcomes![0]).toMatchObject({
      status: 'refused',
      explicitSelectionIssues: [],
      sourceOrPolicyIssues: [issue],
    });
  });

  it('classifies fractional raw stage lag as a source or policy issue', () => {
    const candidate = rowWithFollowOn();
    candidate.source.config.raw.pipelineProfiles![0]!.stages[0]!.monthsToGraduate = 0.5;
    const issue = {
      code: 'TIME_ORIGIN_UNRESOLVED',
      path: 'pipelineProfiles[0].stages[0].monthsToGraduate',
      support: 'invalid',
    };
    const actual = materializeCapitalSource(candidate);
    expect(actual.ok).toBe(false);
    if (actual.ok) throw new Error('Fractional raw stage lag unexpectedly admitted');
    expect(actual.issues).toEqual([expect.objectContaining(issue)]);
    const result = produceCapitalCompatibilityCensus({ run, export: exported([candidate]) });
    expect(result.outcomes![0]).toMatchObject({
      status: 'refused',
      explicitSelectionIssues: [],
      sourceOrPolicyIssues: [issue],
    });
  });

  it('keeps missing draft round lag as an explicit selection issue at the same raw-stage path', () => {
    const candidate = rowWithFollowOn();
    Reflect.deleteProperty(
      candidate.inputs[0]!.allocations[0]!.followOnRounds[0]!,
      'monthsAfterPreviousRound'
    );
    const issue = {
      code: 'TIME_ORIGIN_UNRESOLVED',
      path: 'pipelineProfiles[0].stages[0].monthsToGraduate',
      support: 'incomplete',
    };
    const actual = materializeCapitalSource(candidate);
    expect(actual.ok).toBe(false);
    if (actual.ok) throw new Error('Missing draft round lag unexpectedly admitted');
    expect(actual.issues).toEqual([expect.objectContaining(issue)]);
    const result = produceCapitalCompatibilityCensus({ run, export: exported([candidate]) });
    expect(result.outcomes![0]).toMatchObject({
      status: 'refused',
      explicitSelectionIssues: [issue],
      sourceOrPolicyIssues: [],
    });
  });

  it('keeps a missing explicitly selected pipeline profile as an explicit selection issue', () => {
    const candidate = row();
    candidate.inputs[0]!.allocations[0]!.pipelineProfileId = 'missing-pipeline';
    const issue = {
      code: 'PROFILE_LINK_UNRESOLVED',
      path: 'pipelineProfiles',
      support: 'incomplete',
    };
    const actual = materializeCapitalSource(candidate);
    expect(actual.ok).toBe(false);
    if (actual.ok) throw new Error('Missing selected pipeline profile unexpectedly admitted');
    expect(actual.issues).toEqual([expect.objectContaining(issue)]);
    const result = produceCapitalCompatibilityCensus({ run, export: exported([candidate]) });
    expect(result.outcomes![0]).toMatchObject({
      status: 'refused',
      explicitSelectionIssues: [issue],
      sourceOrPolicyIssues: [],
    });
  });
});
