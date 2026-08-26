/**
 * economics-policy-service.test.ts
 *
 * WP-L3 Phase B acceptance fixtures for the policy half of T-B2/T-B3/T-B4/T-B5.
 * Mirrors the in-memory Drizzle-query-shaped `FakeCapitalEnvelopeDb` idiom in
 * tests/unit/services/internal-economics/capital-envelope-service.test.ts,
 * extended with a `fundConfigs` table and a real per-key async mutex
 * simulation of `pg_advisory_xact_lock` so T-B5's concurrency fixture
 * exercises genuine serialization. No real Postgres connection is used.
 */
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import type { db } from '../../../../server/db';
import {
  assertOwnedByFund,
  FundScopeError,
  type FundScopedOwnershipDatabase,
} from '../../../../server/lib/fund-scoped-ownership';
import {
  createEconomicsPolicyVersion,
  EconomicsPolicySeedRefusalError,
  getPolicyVersion,
} from '../../../../server/services/internal-economics/economics-policy-service';
import {
  EconomicsPolicyCreateRequestV1Schema,
  type EconomicsPolicyCreateRequestV1,
} from '../../../../shared/contracts/internal-economics/economics-policy-v1.contract';
import { TerminalPolicyV1Error } from '../../../../shared/contracts/internal-economics/terminal-policy-v1.contract';
import {
  internalCapitalEnvelopeVersions,
  internalEconomicsPolicyVersions,
} from '../../../../shared/schema/internal-economics';
import { fundConfigs } from '../../../../shared/schema/fund';

type PolicyDatabase = typeof db;

function queryRows<T>(rows: T[]) {
  const query: {
    limit: (count: number) => Promise<T[]>;
    orderBy: (..._order: unknown[]) => typeof query;
    where: (_condition: unknown) => typeof query;
    then: Promise<T[]>['then'];
  } = {
    limit: (count: number) => Promise.resolve(rows.slice(0, count)),
    orderBy: (..._order: unknown[]) => query,
    where: (_condition: unknown) => query,
    then: <TResult1 = T[], TResult2 = never>(
      onfulfilled?: ((value: T[]) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
    ) => Promise.resolve(rows).then(onfulfilled, onrejected),
  };
  return query;
}

// ---------------------------------------------------------------------------
// Fund config fixtures. A PASSING config requires an EXPLICIT
// `economicsAssumptions.waterfallModel` (the only branch where
// `clawbackEnabled` can resolve to `false` -- the defaulted-derivation branch
// always resolves it to `true`, G14), with every dormant toggle off.
// ---------------------------------------------------------------------------

function passingWaterfallModel(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'american',
    carryPct: 0.2,
    hurdleRate: 0,
    prefType: 'none',
    prefCompounding: 'annual',
    prefCatchUp: false,
    catchUpRate: 0,
    catchUpTargetCarryPct: 0.2,
    clawbackEnabled: false,
    clawbackTrigger: 'final_liquidation',
    escrowPct: 0,
    feeOffsetTreatment: 'none',
    ...overrides,
  };
}

/** A fully-dormant, passing fund config: clears all 11 seed-refusal checks. */
function passingFundConfig(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    fundName: 'Test Fund',
    isEvergreen: false,
    fundLife: 10,
    establishmentDate: '2020-01-01',
    economicsAssumptions: {
      version: 'v1',
      waterfallModel: passingWaterfallModel(),
    },
    ...overrides,
  };
}

/** No `economicsAssumptions` at all: the legacy-derivation branch, which
 * always resolves `clawbackEnabled: true` unconditionally (G14). */
function defaultedClawbackFundConfig(): Record<string, unknown> {
  return {
    fundName: 'Test Fund',
    isEvergreen: false,
    fundLife: 10,
    establishmentDate: '2020-01-01',
  };
}

function policyRequest(overrides: Record<string, unknown> = {}): EconomicsPolicyCreateRequestV1 {
  return EconomicsPolicyCreateRequestV1Schema.parse({
    capitalEnvelopeVersionId: 900,
    sourceConfigId: 7,
    sourceConfigVersion: 1,
    body: {
      waterfallTemplate: 'deal_by_deal',
      carryPct: 0.2,
      hurdle: { basis: 'none' },
      managementFeesUsd: '0.000000',
      fundExpenses: [],
      cashBufferQuarters: 4,
      terminalMode: 'liquidate_at_horizon',
      termStartDate: '2020-01-01',
      fundLifeYears: '10',
      ...(overrides['body'] as Record<string, unknown> | undefined),
    },
    ...overrides,
    ...(overrides['body'] !== undefined ? {} : {}),
  });
}

// ---------------------------------------------------------------------------
// In-memory Drizzle double.
// ---------------------------------------------------------------------------

class FakePolicyDb {
  readonly policyRows: Array<Record<string, unknown>> = [];
  readonly fundConfigRows: Array<Record<string, unknown>> = [];
  readonly envelopeRows: Array<Record<string, unknown>> = [];
  readonly executedStatements: SQL[] = [];
  private readonly lockTails = new Map<string, Promise<void>>();

  asDatabase(): PolicyDatabase {
    return this.buildHandle([]);
  }

  private buildHandle(releases: Array<() => void>): PolicyDatabase {
    return {
      select: (projection?: Record<string, unknown>) => this.select(projection),
      insert: (table: unknown) => this.insert(table),
      execute: (query: SQL) => this.execute(query, releases),
      transaction: <T>(
        callback: (tx: PolicyDatabase) => Promise<T>,
        config?: Record<string, unknown>
      ) => this.transaction(callback, config),
    } as unknown as PolicyDatabase;
  }

  private async transaction<T>(
    callback: (tx: PolicyDatabase) => Promise<T>,
    _config?: Record<string, unknown>
  ): Promise<T> {
    const releases: Array<() => void> = [];
    const handle = this.buildHandle(releases);
    try {
      return await callback(handle);
    } finally {
      for (const release of releases) release();
    }
  }

  private async execute(query: SQL, releases: Array<() => void>): Promise<{ rows: unknown[] }> {
    this.executedStatements.push(query);
    const rendered = new PgDialect().sqlToQuery(query);
    if (rendered.sql.includes('pg_advisory_xact_lock')) {
      const key = String(rendered.params[0]);
      const release = await this.acquireLock(key);
      releases.push(release);
    }
    return { rows: [] };
  }

  private async acquireLock(key: string): Promise<() => void> {
    const previousTail = this.lockTails.get(key) ?? Promise.resolve();
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.lockTails.set(
      key,
      previousTail.then(() => held)
    );
    await previousTail;
    return release;
  }

  private select(projection?: Record<string, unknown>) {
    return {
      from: (table: unknown) => ({
        where: (condition: unknown) => this.whereRows(table, projection, condition),
      }),
    };
  }

  private whereRows(
    table: unknown,
    projection: Record<string, unknown> | undefined,
    condition: unknown
  ) {
    const rendered = new PgDialect().sqlToQuery(condition as SQL);

    if (table === fundConfigs) {
      const [idParam, fundIdParam] = rendered.params;
      return queryRows(
        this.fundConfigRows.filter((row) => row['id'] === idParam && row['fundId'] === fundIdParam)
      );
    }

    if (table === internalCapitalEnvelopeVersions) {
      const [idParam, fundIdParam] = rendered.params;
      return queryRows(
        this.envelopeRows.filter((row) => row['id'] === idParam && row['fundId'] === fundIdParam)
      );
    }

    if (table === internalEconomicsPolicyVersions) {
      const keys = projection ? Object.keys(projection) : [];
      if (keys.includes('version')) {
        const [fundIdParam] = rendered.params;
        const filtered = this.policyRows
          .filter((row) => row['fundId'] === fundIdParam)
          .sort((left, right) => (right['version'] as number) - (left['version'] as number));
        return queryRows(filtered);
      }
      // getPolicyVersion: (fundId, id); loadExisting: (fundId, idempotencyKey).
      const [firstParam, secondParam] = rendered.params;
      return queryRows(
        this.policyRows.filter(
          (row) =>
            row['fundId'] === firstParam &&
            (row['id'] === secondParam || row['idempotencyKey'] === secondParam)
        )
      );
    }

    return queryRows([]);
  }

  private insert(table: unknown) {
    return {
      values: (values: Record<string, unknown>) => ({
        onConflictDoNothing: (_options: unknown) => ({
          returning: () => {
            if (table !== internalEconomicsPolicyVersions) return Promise.resolve([]);
            const conflict = this.policyRows.some(
              (row) =>
                row['fundId'] === values['fundId'] &&
                row['idempotencyKey'] === values['idempotencyKey']
            );
            if (conflict) return Promise.resolve([]);
            const inserted = { id: this.policyRows.length + 1, createdAt: new Date(), ...values };
            this.policyRows.push(inserted);
            return Promise.resolve([inserted]);
          },
        }),
      }),
    };
  }
}

function seedEnvelope(fakeDb: FakePolicyDb, overrides: Record<string, unknown> = {}): void {
  fakeDb.envelopeRows.push({ id: 900, fundId: 1, ...overrides });
}

function seedFundConfigRaw(fakeDb: FakePolicyDb, config: Record<string, unknown>): void {
  fakeDb.fundConfigRows.push({ id: 7, fundId: 1, version: 1, config });
}

function readyFakeDb(configOverride?: Record<string, unknown>): FakePolicyDb {
  const fakeDb = new FakePolicyDb();
  seedEnvelope(fakeDb);
  seedFundConfigRaw(fakeDb, configOverride ?? passingFundConfig());
  return fakeDb;
}

function fundConfigOmitting(keys: string[]): Record<string, unknown> {
  const config = passingFundConfig();
  for (const key of keys) delete config[key];
  return config;
}

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe('createEconomicsPolicyVersion happy path', () => {
  it('creates version 1 with no parent and persists normalization warnings', async () => {
    const fakeDb = readyFakeDb();

    const row = await createEconomicsPolicyVersion({
      fundId: 1,
      actorId: 7,
      idempotencyKey: 'policy-create-1',
      request: policyRequest(),
      database: fakeDb.asDatabase(),
    });

    expect(row['version']).toBe(1);
    expect(row['parentPolicyVersionId']).toBeNull();
    expect(row['fundId']).toBe(1);
    expect(row['assumptionsHash']).toMatch(/^[0-9a-f]{64}$/);
    expect(row['terminalPeriodEnd']).toBe('2030-03-31');
    expect(
      (row['normalizationWarnings'] as Array<{ parameter: string }>).map((entry) => entry.parameter)
    ).toEqual(
      expect.arrayContaining([
        'prefCatchUp',
        'clawbackEnabled',
        'escrowPct',
        'recyclingEnabled',
        'hurdleBasis',
        'isEvergreen',
      ])
    );
    expect(fakeDb.policyRows).toHaveLength(1);
  });

  it('replays the same row for a repeated idempotency key without a second insert', async () => {
    const fakeDb = readyFakeDb();
    const request = policyRequest();

    const first = await createEconomicsPolicyVersion({
      fundId: 1,
      actorId: 7,
      idempotencyKey: 'policy-replay',
      request,
      database: fakeDb.asDatabase(),
    });
    const second = await createEconomicsPolicyVersion({
      fundId: 1,
      actorId: 7,
      idempotencyKey: 'policy-replay',
      request,
      database: fakeDb.asDatabase(),
    });

    expect(second).toEqual(first);
    expect(fakeDb.policyRows).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// T-B2: seed-refusal registry, every code from real fundConfigs.config
// fixtures. CREDIT_FACILITY_UNSUPPORTED is excluded: FundDraftWriteV1Schema
// carries no credit-facility/line-of-credit field, and it is `.strict()`, so
// injecting one fails config parsing (SOURCE_CONFIG_MALFORMED) before the
// seed-refusal registry ever runs -- the code is structurally unreachable
// through any real fixture (see economics-policy-service.ts's own comment).
// ---------------------------------------------------------------------------

describe('createEconomicsPolicyVersion T-B2 seed-refusal registry', () => {
  const cases: ReadonlyArray<{
    readonly name: string;
    readonly config: Record<string, unknown>;
    readonly code: string;
  }> = [
    {
      name: 'active GP catch-up (strict ruling: refuses even though hurdle basis is none)',
      config: passingFundConfig({
        economicsAssumptions: {
          version: 'v1',
          waterfallModel: passingWaterfallModel({ prefCatchUp: true }),
        },
      }),
      code: 'CATCH_UP_UNSUPPORTED',
    },
    {
      name: 'active clawback (explicit)',
      config: passingFundConfig({
        economicsAssumptions: {
          version: 'v1',
          waterfallModel: passingWaterfallModel({ clawbackEnabled: true }),
        },
      }),
      code: 'CLAWBACK_UNSUPPORTED',
    },
    {
      name: 'active clawback (defaulted -- no economicsAssumptions at all, G14)',
      config: defaultedClawbackFundConfig(),
      code: 'CLAWBACK_UNSUPPORTED',
    },
    {
      name: 'active escrow',
      config: passingFundConfig({
        economicsAssumptions: {
          version: 'v1',
          waterfallModel: passingWaterfallModel({ escrowPct: 0.05 }),
        },
      }),
      code: 'ESCROW_UNSUPPORTED',
    },
    {
      name: 'active recycling',
      config: passingFundConfig({
        economicsAssumptions: {
          version: 'v1',
          waterfallModel: passingWaterfallModel(),
          recyclingModel: {
            enabled: true,
            sources: ['exit_proceeds'],
            capPctOfCommitments: 0.1,
            timing: 'before_waterfall',
          },
        },
      }),
      code: 'RECYCLING_UNSUPPORTED',
    },
    {
      name: 'pref-bearing hurdle basis',
      config: passingFundConfig({
        economicsAssumptions: {
          version: 'v1',
          waterfallModel: passingWaterfallModel({ prefType: 'compounded', hurdleRate: 0.08 }),
        },
      }),
      code: 'HURDLE_BASIS_UNSUPPORTED',
    },
    {
      name: 'no fund life resolvable',
      config: fundConfigOmitting(['fundLife']),
      code: 'FUND_LIFE_ABSENT',
    },
    {
      name: 'fund life resolves to a non-integer quarter count',
      config: passingFundConfig({ fundLife: 0.1 }),
      code: 'FUND_LIFE_GRID_UNREPRESENTABLE',
    },
    {
      name: 'no term start date resolvable',
      config: fundConfigOmitting(['establishmentDate']),
      code: 'FUND_TERM_START_ABSENT',
    },
    {
      name: 'evergreen flag missing',
      config: fundConfigOmitting(['isEvergreen']),
      code: 'EVERGREEN_STATUS_ABSENT',
    },
    {
      name: 'evergreen fund',
      config: passingFundConfig({ isEvergreen: true }),
      code: 'EVERGREEN_UNSUPPORTED',
    },
  ];

  it.each(cases)('refuses 422 $code for $name, nothing persisted', async ({ config, code }) => {
    const fakeDb = new FakePolicyDb();
    seedEnvelope(fakeDb);
    seedFundConfigRaw(fakeDb, config);

    await expect(
      createEconomicsPolicyVersion({
        fundId: 1,
        actorId: 7,
        idempotencyKey: `policy-refusal-${code}-${Math.random()}`,
        request: policyRequest(),
        database: fakeDb.asDatabase(),
      })
    ).rejects.toMatchObject({ status: 422, code });
    expect(fakeDb.policyRows).toHaveLength(0);
  });

  it('throws EconomicsPolicySeedRefusalError (not a generic error) on refusal', async () => {
    const fakeDb = readyFakeDb(
      passingFundConfig({
        economicsAssumptions: {
          version: 'v1',
          waterfallModel: passingWaterfallModel({ prefCatchUp: true }),
        },
      })
    );

    await expect(
      createEconomicsPolicyVersion({
        fundId: 1,
        actorId: 7,
        idempotencyKey: 'policy-refusal-type-check',
        request: policyRequest(),
        database: fakeDb.asDatabase(),
      })
    ).rejects.toBeInstanceOf(EconomicsPolicySeedRefusalError);
  });
});

// ---------------------------------------------------------------------------
// T-B2: dormant-param normalization warnings persist AND participate in
// assumptions_hash -- two policies differing only in a dormant param's
// provenance hash differently. Every PASSING config requires an explicit
// waterfallModel (only branch where clawback can be dormant), so the one
// dormant parameter that can still vary provenance while passing is
// `recyclingEnabled` (independent top-level fallback field).
// ---------------------------------------------------------------------------

describe('createEconomicsPolicyVersion T-B2 dormant-param normalization warnings', () => {
  it('hashes two otherwise-identical policies differently when a dormant param differs only in provenance', async () => {
    const defaultedDb = readyFakeDb(passingFundConfig()); // no recyclingEnabled / recyclingModel anywhere -> defaulted
    const explicitDb = readyFakeDb(passingFundConfig({ recyclingEnabled: false })); // explicit top-level false

    const defaultedRow = await createEconomicsPolicyVersion({
      fundId: 1,
      actorId: 7,
      idempotencyKey: 'policy-dormant-defaulted',
      request: policyRequest(),
      database: defaultedDb.asDatabase(),
    });
    const explicitRow = await createEconomicsPolicyVersion({
      fundId: 1,
      actorId: 7,
      idempotencyKey: 'policy-dormant-explicit',
      request: policyRequest(),
      database: explicitDb.asDatabase(),
    });

    const defaultedWarning = (
      defaultedRow['normalizationWarnings'] as Array<{ parameter: string; provenance: string }>
    ).find((entry) => entry.parameter === 'recyclingEnabled');
    const explicitWarning = (
      explicitRow['normalizationWarnings'] as Array<{ parameter: string; provenance: string }>
    ).find((entry) => entry.parameter === 'recyclingEnabled');

    expect(defaultedWarning?.provenance).toBe('defaulted');
    expect(explicitWarning?.provenance).toBe('explicit');
    expect(defaultedRow['assumptionsHash']).not.toBe(explicitRow['assumptionsHash']);
  });
});

// ---------------------------------------------------------------------------
// T-B3: terminal pair written via the exported helpers; readback validators
// reject a tampered row (direct fixture mutation, bypassing the service) with
// TERMINAL_RESOLUTION_MISMATCH.
// ---------------------------------------------------------------------------

describe('createEconomicsPolicyVersion / getPolicyVersion T-B3 terminal pair', () => {
  it('writes the terminal pair via the exported helpers and reads it back unchanged', async () => {
    const fakeDb = readyFakeDb();
    const created = await createEconomicsPolicyVersion({
      fundId: 1,
      actorId: 7,
      idempotencyKey: 'policy-terminal-pair',
      request: policyRequest(),
      database: fakeDb.asDatabase(),
    });

    const read = await getPolicyVersion(1, created['id'] as number, fakeDb.asDatabase());

    expect(read?.['terminalPeriodEnd']).toBe('2030-03-31');
    expect(read?.['terminalResolutionMethodologyVersion']).toBe(
      'internal-economics-terminal-resolution/1.0.0'
    );
  });

  it('rejects a tampered terminal_period_end on readback with TERMINAL_RESOLUTION_MISMATCH', async () => {
    const fakeDb = readyFakeDb();
    const created = await createEconomicsPolicyVersion({
      fundId: 1,
      actorId: 7,
      idempotencyKey: 'policy-terminal-tamper',
      request: policyRequest(),
      database: fakeDb.asDatabase(),
    });

    // Direct fixture corruption, bypassing the service entirely (simulates a
    // tampered row / direct SQL write).
    const storedRow = fakeDb.policyRows.find((row) => row['id'] === created['id']);
    expect(storedRow).toBeDefined();
    storedRow!['terminalPeriodEnd'] = '1999-12-31';

    await expect(
      getPolicyVersion(1, created['id'] as number, fakeDb.asDatabase())
    ).rejects.toMatchObject({
      code: 'TERMINAL_RESOLUTION_MISMATCH',
    });
    await expect(
      getPolicyVersion(1, created['id'] as number, fakeDb.asDatabase())
    ).rejects.toBeInstanceOf(TerminalPolicyV1Error);
  });

  it('returns null for an id not owned by the given fund', async () => {
    const fakeDb = readyFakeDb();
    const created = await createEconomicsPolicyVersion({
      fundId: 1,
      actorId: 7,
      idempotencyKey: 'policy-terminal-wrong-fund',
      request: policyRequest(),
      database: fakeDb.asDatabase(),
    });

    await expect(
      getPolicyVersion(2, created['id'] as number, fakeDb.asDatabase())
    ).resolves.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// T-B4: fund-scoped-ownership 'economics_policy_version' kind resolves for
// the owning fund and rejects across funds.
// ---------------------------------------------------------------------------

describe("fund-scoped-ownership 'economics_policy_version' kind T-B4", () => {
  it('resolves for a policy version owned by the given fund and rejects across funds', async () => {
    const fakeDb = readyFakeDb();
    const policy = await createEconomicsPolicyVersion({
      fundId: 1,
      actorId: 7,
      idempotencyKey: 'policy-ownership-kind',
      request: policyRequest(),
      database: fakeDb.asDatabase(),
    });

    await expect(
      assertOwnedByFund({
        db: fakeDb.asDatabase() as unknown as FundScopedOwnershipDatabase,
        fundId: 1,
        ref: { kind: 'economics_policy_version', id: policy['id'] as number },
      })
    ).resolves.toBeUndefined();

    await expect(
      assertOwnedByFund({
        db: fakeDb.asDatabase() as unknown as FundScopedOwnershipDatabase,
        fundId: 2,
        ref: { kind: 'economics_policy_version', id: policy['id'] as number },
      })
    ).rejects.toBeInstanceOf(FundScopeError);
  });
});

// ---------------------------------------------------------------------------
// T-B5 (P-D11 policy half): concurrent policy-creation requests for the same
// fund with different idempotency keys never collide on `version` -- one
// serializes behind the advisory lock and is allocated the next version,
// never an unhandled unique-constraint error.
// ---------------------------------------------------------------------------

describe('createEconomicsPolicyVersion T-B5 concurrent version allocation', () => {
  it('serializes concurrent creates for the same fund into distinct, non-colliding versions', async () => {
    const fakeDb = readyFakeDb();

    const [left, right] = await Promise.all([
      createEconomicsPolicyVersion({
        fundId: 1,
        actorId: 7,
        idempotencyKey: 'policy-concurrent-left',
        request: policyRequest(),
        database: fakeDb.asDatabase(),
      }),
      createEconomicsPolicyVersion({
        fundId: 1,
        actorId: 7,
        idempotencyKey: 'policy-concurrent-right',
        request: policyRequest(),
        database: fakeDb.asDatabase(),
      }),
    ]);

    expect(fakeDb.policyRows).toHaveLength(2);
    const versions = [left['version'], right['version']].sort();
    expect(versions).toEqual([1, 2]);
    const byVersion = new Map([
      [left['version'] as number, left],
      [right['version'] as number, right],
    ]);
    expect(byVersion.get(2)?.['parentPolicyVersionId']).toBe(byVersion.get(1)?.['id']);
  });

  it('does not throw an unhandled unique-constraint error under concurrent creation', async () => {
    const fakeDb = readyFakeDb();

    const results = await Promise.allSettled([
      createEconomicsPolicyVersion({
        fundId: 1,
        actorId: 7,
        idempotencyKey: 'policy-concurrent-safety-a',
        request: policyRequest(),
        database: fakeDb.asDatabase(),
      }),
      createEconomicsPolicyVersion({
        fundId: 1,
        actorId: 7,
        idempotencyKey: 'policy-concurrent-safety-b',
        request: policyRequest(),
        database: fakeDb.asDatabase(),
      }),
      createEconomicsPolicyVersion({
        fundId: 1,
        actorId: 7,
        idempotencyKey: 'policy-concurrent-safety-c',
        request: policyRequest(),
        database: fakeDb.asDatabase(),
      }),
    ]);

    expect(results.every((result) => result.status === 'fulfilled')).toBe(true);
    const versions = fakeDb.policyRows.map((row) => row['version']).sort();
    expect(versions).toEqual([1, 2, 3]);
    expect(new Set(versions).size).toBe(3);
  });
});
