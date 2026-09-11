import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CAPITAL_SOURCE_INTERPRETATION_VERSION,
  type CapitalPlanningDraftV1,
} from '@shared/contracts/capital-planning-v1.contract';
import {
  CreateFundScenarioSetV3Schema,
  FundScenarioCapitalSourceResponseV1Schema,
} from '@shared/contracts/fund-scenario-sets-v1.contract';
import { canonicalJson } from '@shared/lib/canonical-json-serialization';
import { CAPITAL_BENCHMARK_CATALOG_VERSION } from '@shared/lib/capital-planning/benchmark-presets';
import { inspectCapitalSourcePreview } from '@shared/lib/capital-planning/source-materialization-core';
import { reviewCapitalPlanDraft } from '@/lib/capital-plan-review';
import * as hash from '@/lib/hash';
import {
  makeCapitalDeclarations,
  makeCapitalInput,
  makeCapitalRawConfig,
} from '../../fixtures/capital-planning/fixtures';

const digest = (value: unknown) => hash.sha256Bytes(new TextEncoder().encode(canonicalJson(value)));

async function fixture(mutate?: (raw: ReturnType<typeof makeCapitalRawConfig>) => void) {
  const raw = makeCapitalRawConfig();
  mutate?.(raw);
  const rawHash = await digest(raw);
  const persisted = {
    fund: { id: 101, size: '100.00', baseCurrency: 'USD' },
    config: { id: 11, version: 1, raw, publishedAt: '2026-09-01T00:00:00.000Z' },
  };
  // Construct the GET fixture with the pure inspector; both hashes use actual Web Crypto.
  const inspection = inspectCapitalSourcePreview(persisted, (value) =>
    value === raw ? rawHash : '0'.repeat(64)
  );
  inspection.sourceBundleHash = await digest(inspection.projection);
  const source = FundScenarioCapitalSourceResponseV1Schema.parse({
    contractVersion: 'fund-scenario-capital-source/1.0.0',
    representation: 'capital-plan-v1',
    ...inspection,
    publishedAt: persisted.config.publishedAt,
    interpretationVersion: CAPITAL_SOURCE_INTERPRETATION_VERSION,
    interpretationCompatibility: {
      state: 'CURRENT',
      savedVersion: CAPITAL_SOURCE_INTERPRETATION_VERSION,
      currentVersion: CAPITAL_SOURCE_INTERPRETATION_VERSION,
    },
  });
  const variantId = '00000000-0000-4000-8000-000000000001';
  const request = CreateFundScenarioSetV3Schema.parse({
    contractVersion: 'fund-scenario-set-create/3.0.0',
    name: 'Reviewed plan',
    variants: [
      {
        variantId,
        name: 'Baseline',
        override: { overrideType: 'capital_plan', payload: makeCapitalInput() },
      },
    ],
    baselineVariantId: variantId,
    expectedSourceConfigId: source.projection.sourceConfigId,
    expectedSourceConfigVersion: source.projection.sourceConfigVersion,
    expectedSourceBundleHash: source.sourceBundleHash,
    expectedInterpretationVersion: source.interpretationVersion,
    unitDeclarations: makeCapitalDeclarations(),
  });
  return { fundId: persisted.fund.id, source, request };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('strict canonical browser serialization', () => {
  it.each([
    ['empty object', {}, '{}', '44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a'],
    [
      'array',
      [1, 2, 3],
      '[1,2,3]',
      'a615eeaee21de5179de080de8c3052c8da901138406ba71c38c032845f7d54f4',
    ],
    [
      'ASCII',
      'release-canary',
      '"release-canary"',
      '580801f264e5ad253764b872bcaa4cddd7f87e1ecc70288ba3c2110598a198a5',
    ],
    [
      'Unicode',
      'caf\u00e9 \u20ac \ud83d\ude00',
      '"caf\u00e9 \u20ac \ud83d\ude00"',
      'ad4683725e1f8ca41273f0ef2e95971e3cef5bf779e565161d42be2832ad9ca4',
    ],
    [
      'BOM',
      '\uFEFFevent_type',
      '"\uFEFFevent_type"',
      '8f669c5a739b278068d0c76393848424de463c593c385664b82998c8f7f5d263',
    ],
  ])(
    'preserves canonical bytes and pinned SHA for %s',
    async (_name, value, serialized, expected) => {
      expect(canonicalJson(value)).toBe(serialized);
      expect(await digest(value)).toBe(expected);
    }
  );

  it('keeps nested order, repeated references, negative zero, and absent/null distinctions', async () => {
    const shared = { z: 1, a: 2 };
    expect(canonicalJson({ z: [shared, shared], a: -0 })).toBe(
      '{"a":0,"z":[{"a":2,"z":1},{"a":2,"z":1}]}'
    );
    expect(canonicalJson({})).not.toBe(canonicalJson({ field: null }));
    expect(await digest({ a: { z: 1, b: 2 } })).toBe(await digest({ a: { b: 2, z: 1 } }));
  });

  it.each([
    ['undefined value', undefined],
    ['undefined field', { absent: undefined }],
    ['undefined element', [undefined]],
    ['NaN', NaN],
    ['infinity', Infinity],
    ['date', new Date(0)],
    ['map', new Map()],
    ['bigint', 10n],
  ])('rejects %s with the strict serializer', (_name, value) =>
    expect(() => canonicalJson(value)).toThrow(TypeError)
  );
});

describe('browser capital review', () => {
  it('returns ordered local results and a separate strict Save request without changing cached source', async () => {
    const f = await fixture();
    const second = structuredClone(f.request.variants[0]!);
    second.variantId = '00000000-0000-4000-8000-000000000002';
    second.name = 'Second';
    f.request.variants.push(second);
    const before = structuredClone(f);
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const result = await reviewCapitalPlanDraft(f);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(result.request).toStrictEqual(f.request);
    expect(result.request).not.toBe(f.request);
    expect(result.results).toHaveLength(2);
    expect(result.results[0]).toStrictEqual(result.results[1]);
    expect(result.materialization.availableConstructionCapitalUsd).toBe('90.000000');
    expect(Object.hasOwn(result.materialization, 'benchmarkSnapshotsByInput')).toBe(false);
    expect(f).toStrictEqual(before);
    expect(fetch).not.toHaveBeenCalled();
    expect(JSON.stringify(result.request)).not.toContain('sourceBundle"');
    expect(JSON.stringify(result.request)).not.toContain('benchmarkSnapshots');
  });

  it('retains original benchmark override intent while keeping resolved copies outside Save', async () => {
    const f = await fixture();
    const draft: CapitalPlanningDraftV1 = {
      input: makeCapitalInput(),
      benchmarkSelections: [
        {
          target: { kind: 'entry', allocationId: 'a1' },
          selector: { version: CAPITAL_BENCHMARK_CATALOG_VERSION, stage: 'seed' },
          overrides: {
            valuation: { valuationUsd: '24300000.000000', valuationBasis: 'post_money' },
          },
        },
      ],
    };
    f.request.variants[0]!.override.payload = draft;
    const result = await reviewCapitalPlanDraft(f);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(result.request.variants[0]!.override.payload).toStrictEqual(draft);
    expect(result.materialization.benchmarkSnapshotsByInput?.[0]).toHaveLength(1);
    expect(
      result.materialization.resolvedInputs?.[0]?.allocations[0]?.entryFinancing?.valuationUsd
    ).toBe('24300000.000000');
    expect(JSON.stringify(result.request)).not.toContain('benchmarkSnapshots');
  });

  it.each([
    'fundId',
    'expectedSourceConfigId',
    'expectedSourceConfigVersion',
    'expectedSourceBundleHash',
  ] as const)('refuses mismatched %s before hashing', async (field) => {
    const f = await fixture();
    if (field === 'fundId') f.fundId += 1;
    else if (field === 'expectedSourceBundleHash') f.request[field] = '0'.repeat(64);
    else f.request[field] += 1;
    const spy = vi.spyOn(hash, 'sha256Bytes');
    const result = await reviewCapitalPlanDraft(f);
    expect(result).toMatchObject({
      ok: false,
      issues: [{ code: 'SOURCE_BUNDLE_INCONSISTENT', path: field }],
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it('refuses a changed original-config hash inside the bounded projection', async () => {
    const f = await fixture();
    f.source.projection.rawConfigHash = '0'.repeat(64);
    expect(await reviewCapitalPlanDraft(f)).toMatchObject({
      ok: false,
      issues: [{ code: 'SOURCE_BUNDLE_INCONSISTENT', path: 'sourceBundleHash' }],
    });
  });

  it('hashes the original strict projection rather than a normalized non-plain object', async () => {
    const f = await fixture();
    Object.setPrototypeOf(f.source.projection, { nonJsonPrototype: true });
    expect(await reviewCapitalPlanDraft(f)).toMatchObject({
      ok: false,
      issues: [{ code: 'INVALID_INPUT', path: 'source.projection' }],
    });
  });

  it('requires current interpretation for fresh review', async () => {
    const f = await fixture();
    f.request.expectedInterpretationVersion = 'capital-source-interpretation/1.0.0';
    expect(await reviewCapitalPlanDraft(f)).toMatchObject({
      ok: false,
      issues: [{ code: 'INTERPRETATION_VERSION_UNSUPPORTED' }],
    });
  });

  it('preserves hidden full-source validation issues even though projection omits that field', async () => {
    const f = await fixture((raw) => Object.assign(raw, { fundName: 7 }));
    expect(f.source.projection.facts.some((fact) => fact.path === 'fundName')).toBe(false);
    const result = await reviewCapitalPlanDraft(f);
    expect(result).toMatchObject({
      ok: false,
      issues: [{ code: 'INVALID_INPUT', path: 'fundName', support: 'invalid' }],
    });
  });

  it('uses private source/request snapshots while Web Crypto is pending', async () => {
    const f = await fixture();
    const before = structuredClone(f);
    let complete!: (hash: string) => void;
    vi.spyOn(hash, 'sha256Bytes').mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        })
    );
    const pending = reviewCapitalPlanDraft(f);
    f.request.name = 'Newer draft';
    f.request.variants[0]!.name = 'Newer variant';
    f.source.projection.fund.size = '999';
    complete(before.source.sourceBundleHash);
    const result = await pending;
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(result.request).toStrictEqual(before.request);
    expect(result.materialization.sourceBundle.projection).toStrictEqual(before.source.projection);
  });

  it('rejects malformed source or request with local typed issues', async () => {
    const f = await fixture();
    expect(
      await reviewCapitalPlanDraft({ ...f, source: { ...f.source, extra: true } })
    ).toMatchObject({ ok: false, issues: [{ code: 'INVALID_INPUT' }] });
    expect(
      await reviewCapitalPlanDraft({ ...f, request: { ...f.request, name: 'x'.repeat(121) } })
    ).toMatchObject({ ok: false, issues: [{ code: 'INVALID_INPUT', path: 'request.name' }] });
    f.request.name = 'x'.repeat(120);
    expect((await reviewCapitalPlanDraft(f)).ok).toBe(true);
  });
});
