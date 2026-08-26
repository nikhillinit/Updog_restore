import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import type { db } from '../../../../server/db';
import {
  assertOwnedByFund,
  FundScopeError,
  type FundScopedOwnershipDatabase,
} from '../../../../server/lib/fund-scoped-ownership';
import { IdempotentCommandError } from '../../../../server/lib/idempotent-command';
import {
  CapitalEnvelopeServiceError,
  createCapitalEnvelopeVersion,
} from '../../../../server/services/internal-economics/capital-envelope-service';
import {
  CapitalEnvelopeCreateRequestV1Schema,
  type CapitalEnvelopeCreateRequestV1,
} from '../../../../shared/contracts/internal-economics/capital-envelope-v1.contract';
import { internalCapitalEnvelopeVersions } from '../../../../shared/schema/internal-economics';
import { vehicles } from '../../../../shared/schema/vehicles';

type EnvelopeDatabase = typeof db;

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

function validEnvelopeRequestFields(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    mainFundVehicleId: 10,
    lpCommitmentUsd: '900000.000000',
    gpCommitmentUsd: '100000.000000',
    totalCommitmentUsd: '1000000.000000',
    currency: 'USD',
    effectiveAt: '2026-01-01T00:00:00.000Z',
    sourceArtifactId: 501,
    sourceConfigId: 7,
    sourceConfigVersion: 3,
    sourceConfigHash: 'a'.repeat(64),
    attestedBy: 42,
    attestedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/** Schema-valid fixture (routed through `.parse` so tests catch fixture drift). */
function envelopeRequest(overrides: Record<string, unknown> = {}): CapitalEnvelopeCreateRequestV1 {
  return CapitalEnvelopeCreateRequestV1Schema.parse(validEnvelopeRequestFields(overrides));
}

/** Deliberately invalid fixture (bypasses `.parse` so the service's own
 * validation, not the fixture builder, is what rejects it). */
function invalidEnvelopeRequest(
  overrides: Record<string, unknown>
): CapitalEnvelopeCreateRequestV1 {
  return validEnvelopeRequestFields(overrides) as unknown as CapitalEnvelopeCreateRequestV1;
}

/**
 * In-memory Drizzle double for `internal_capital_envelope_versions` +
 * `vehicles`, mirroring the `FakeSnapshotDb` idiom in
 * financial-facts-snapshot-service.test.ts. `pg_advisory_xact_lock` is
 * modeled as a real per-key async mutex (queued FIFO, released when the
 * owning `transaction()` callback settles) so concurrent-creation races
 * (T-B5 / P-D11) serialize exactly like a real advisory lock would.
 */
class FakeCapitalEnvelopeDb {
  readonly envelopeRows: Array<Record<string, unknown>> = [];
  readonly vehicleRows: Array<Record<string, unknown>> = [];
  readonly executedStatements: SQL[] = [];
  readonly transactionConfigs: Array<Record<string, unknown> | undefined> = [];
  private readonly lockTails = new Map<string, Promise<void>>();

  asDatabase(): EnvelopeDatabase {
    return this.buildHandle([]);
  }

  private buildHandle(releases: Array<() => void>): EnvelopeDatabase {
    return {
      select: (projection?: Record<string, unknown>) => this.select(projection),
      insert: (table: unknown) => this.insert(table),
      execute: (query: SQL) => this.execute(query, releases),
      transaction: <T>(
        callback: (tx: EnvelopeDatabase) => Promise<T>,
        config?: Record<string, unknown>
      ) => this.transaction(callback, config),
    } as unknown as EnvelopeDatabase;
  }

  private async transaction<T>(
    callback: (tx: EnvelopeDatabase) => Promise<T>,
    config?: Record<string, unknown>
  ): Promise<T> {
    this.transactionConfigs.push(config);
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
    if (table === vehicles) {
      const [idParam, fundIdParam] = rendered.params;
      return queryRows(
        this.vehicleRows.filter((row) => row['id'] === idParam && row['fundId'] === fundIdParam)
      );
    }
    if (table === internalCapitalEnvelopeVersions) {
      const keys = projection ? Object.keys(projection) : [];
      if (keys.includes('version')) {
        const [fundIdParam] = rendered.params;
        const filtered = this.envelopeRows
          .filter((row) => row['fundId'] === fundIdParam)
          .sort((left, right) => (right['version'] as number) - (left['version'] as number));
        return queryRows(filtered);
      }
      if (keys.length === 1 && keys[0] === 'id') {
        const [idParam, fundIdParam] = rendered.params;
        return queryRows(
          this.envelopeRows.filter((row) => row['id'] === idParam && row['fundId'] === fundIdParam)
        );
      }
      const [fundIdParam, keyParam] = rendered.params;
      return queryRows(
        this.envelopeRows.filter(
          (row) => row['fundId'] === fundIdParam && row['idempotencyKey'] === keyParam
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
            if (table !== internalCapitalEnvelopeVersions) return Promise.resolve([]);
            const conflict = this.envelopeRows.some(
              (row) =>
                row['fundId'] === values['fundId'] &&
                row['idempotencyKey'] === values['idempotencyKey']
            );
            if (conflict) return Promise.resolve([]);
            const inserted = { id: this.envelopeRows.length + 1, createdAt: new Date(), ...values };
            this.envelopeRows.push(inserted);
            return Promise.resolve([inserted]);
          },
        }),
      }),
    };
  }
}

function seedMainFundVehicle(
  fakeDb: FakeCapitalEnvelopeDb,
  overrides: Record<string, unknown> = {}
): void {
  fakeDb.vehicleRows.push({ id: 10, fundId: 1, vehicleType: 'main_fund', ...overrides });
}

describe('createCapitalEnvelopeVersion', () => {
  it('creates version 1 with no parent on the happy path', async () => {
    const fakeDb = new FakeCapitalEnvelopeDb();
    seedMainFundVehicle(fakeDb);

    const row = await createCapitalEnvelopeVersion({
      fundId: 1,
      actorId: 7,
      idempotencyKey: 'envelope-create-1',
      request: envelopeRequest(),
      database: fakeDb.asDatabase(),
    });

    expect(row['version']).toBe(1);
    expect(row['parentEnvelopeVersionId']).toBeNull();
    expect(row['fundId']).toBe(1);
    expect(row['envelopeHash']).toMatch(/^[0-9a-f]{64}$/);
    expect(row['requestHash']).toMatch(/^[0-9a-f]{64}$/);
    expect(fakeDb.envelopeRows).toHaveLength(1);
  });

  it('replays the same row for a repeated idempotency key without a second insert', async () => {
    const fakeDb = new FakeCapitalEnvelopeDb();
    seedMainFundVehicle(fakeDb);
    const request = envelopeRequest();

    const first = await createCapitalEnvelopeVersion({
      fundId: 1,
      actorId: 7,
      idempotencyKey: 'envelope-replay',
      request,
      database: fakeDb.asDatabase(),
    });
    const second = await createCapitalEnvelopeVersion({
      fundId: 1,
      actorId: 7,
      idempotencyKey: 'envelope-replay',
      request,
      database: fakeDb.asDatabase(),
    });

    expect(second).toEqual(first);
    expect(fakeDb.envelopeRows).toHaveLength(1);
  });

  it('rejects a changed preimage reusing the same idempotency key with 409', async () => {
    const fakeDb = new FakeCapitalEnvelopeDb();
    seedMainFundVehicle(fakeDb);

    await createCapitalEnvelopeVersion({
      fundId: 1,
      actorId: 7,
      idempotencyKey: 'envelope-reuse',
      request: envelopeRequest(),
      database: fakeDb.asDatabase(),
    });

    await expect(
      createCapitalEnvelopeVersion({
        fundId: 1,
        actorId: 7,
        idempotencyKey: 'envelope-reuse',
        request: envelopeRequest({
          lpCommitmentUsd: '800000.000000',
          totalCommitmentUsd: '900000.000000',
        }),
        database: fakeDb.asDatabase(),
      })
    ).rejects.toMatchObject({
      status: 409,
      code: 'IDEMPOTENCY_KEY_REUSE',
    });
    await expect(
      createCapitalEnvelopeVersion({
        fundId: 1,
        actorId: 7,
        idempotencyKey: 'envelope-reuse',
        request: envelopeRequest({
          lpCommitmentUsd: '800000.000000',
          totalCommitmentUsd: '900000.000000',
        }),
        database: fakeDb.asDatabase(),
      })
    ).rejects.toBeInstanceOf(IdempotentCommandError);
    expect(fakeDb.envelopeRows).toHaveLength(1);
  });
});

describe('createCapitalEnvelopeVersion Brief 3 invariant refusals', () => {
  const cases: ReadonlyArray<{
    readonly name: string;
    readonly overrides: Record<string, unknown>;
    readonly code: string;
  }> = [
    {
      name: 'negative LP commitment',
      overrides: { lpCommitmentUsd: '-1.000000', totalCommitmentUsd: '99999.000000' },
      code: 'ENVELOPE_LP_COMMITMENT_NEGATIVE',
    },
    {
      name: 'negative GP commitment',
      overrides: { gpCommitmentUsd: '-1.000000', totalCommitmentUsd: '899999.000000' },
      code: 'ENVELOPE_GP_COMMITMENT_NEGATIVE',
    },
    {
      name: 'non-positive total commitment',
      overrides: {
        lpCommitmentUsd: '0.000000',
        gpCommitmentUsd: '0.000000',
        totalCommitmentUsd: '0.000000',
      },
      code: 'ENVELOPE_TOTAL_COMMITMENT_NOT_POSITIVE',
    },
    {
      name: 'lp + gp != total',
      overrides: { totalCommitmentUsd: '1000001.000000' },
      code: 'ENVELOPE_COMMITMENT_SUM_MISMATCH',
    },
  ];

  it.each(cases)('refuses 422 $code for $name, nothing persisted', async ({ overrides, code }) => {
    const fakeDb = new FakeCapitalEnvelopeDb();
    seedMainFundVehicle(fakeDb);

    await expect(
      createCapitalEnvelopeVersion({
        fundId: 1,
        actorId: 7,
        idempotencyKey: `envelope-invariant-${code}`,
        request: invalidEnvelopeRequest(overrides),
        database: fakeDb.asDatabase(),
      })
    ).rejects.toMatchObject({ status: 422, code });
    expect(fakeDb.envelopeRows).toHaveLength(0);
  });
});

describe('createCapitalEnvelopeVersion vehicle refusals', () => {
  it('refuses 422 ENVELOPE_VEHICLE_NOT_MAIN_FUND for a non-main-fund vehicle, nothing persisted', async () => {
    const fakeDb = new FakeCapitalEnvelopeDb();
    fakeDb.vehicleRows.push({ id: 10, fundId: 1, vehicleType: 'spv' });

    await expect(
      createCapitalEnvelopeVersion({
        fundId: 1,
        actorId: 7,
        idempotencyKey: 'envelope-non-main-fund',
        request: envelopeRequest(),
        database: fakeDb.asDatabase(),
      })
    ).rejects.toBeInstanceOf(CapitalEnvelopeServiceError);
    await expect(
      createCapitalEnvelopeVersion({
        fundId: 1,
        actorId: 7,
        idempotencyKey: 'envelope-non-main-fund-2',
        request: envelopeRequest(),
        database: fakeDb.asDatabase(),
      })
    ).rejects.toMatchObject({ status: 422, code: 'ENVELOPE_VEHICLE_NOT_MAIN_FUND' });
    expect(fakeDb.envelopeRows).toHaveLength(0);
  });

  it('refuses 422 ENVELOPE_VEHICLE_NOT_IN_FUND for a vehicle owned by a different fund, nothing persisted', async () => {
    const fakeDb = new FakeCapitalEnvelopeDb();
    fakeDb.vehicleRows.push({ id: 10, fundId: 2, vehicleType: 'main_fund' });

    await expect(
      createCapitalEnvelopeVersion({
        fundId: 1,
        actorId: 7,
        idempotencyKey: 'envelope-cross-fund-vehicle',
        request: envelopeRequest(),
        database: fakeDb.asDatabase(),
      })
    ).rejects.toMatchObject({ status: 422, code: 'ENVELOPE_VEHICLE_NOT_IN_FUND' });
    expect(fakeDb.envelopeRows).toHaveLength(0);
  });
});

describe('createCapitalEnvelopeVersion child-version correction chain', () => {
  it('chains version 2 to version 1 as parent', async () => {
    const fakeDb = new FakeCapitalEnvelopeDb();
    seedMainFundVehicle(fakeDb);

    const v1 = await createCapitalEnvelopeVersion({
      fundId: 1,
      actorId: 7,
      idempotencyKey: 'envelope-chain-1',
      request: envelopeRequest(),
      database: fakeDb.asDatabase(),
    });
    const v2 = await createCapitalEnvelopeVersion({
      fundId: 1,
      actorId: 7,
      idempotencyKey: 'envelope-chain-2',
      request: envelopeRequest({
        lpCommitmentUsd: '850000.000000',
        totalCommitmentUsd: '950000.000000',
      }),
      database: fakeDb.asDatabase(),
    });

    expect(v1['version']).toBe(1);
    expect(v1['parentEnvelopeVersionId']).toBeNull();
    expect(v2['version']).toBe(2);
    expect(v2['parentEnvelopeVersionId']).toBe(v1['id']);
    expect(fakeDb.envelopeRows).toHaveLength(2);
  });
});

describe('createCapitalEnvelopeVersion P-D11 concurrent version allocation', () => {
  it('serializes concurrent creates for the same fund into distinct, non-colliding versions', async () => {
    const fakeDb = new FakeCapitalEnvelopeDb();
    seedMainFundVehicle(fakeDb);

    const [left, right] = await Promise.all([
      createCapitalEnvelopeVersion({
        fundId: 1,
        actorId: 7,
        idempotencyKey: 'envelope-concurrent-left',
        request: envelopeRequest(),
        database: fakeDb.asDatabase(),
      }),
      createCapitalEnvelopeVersion({
        fundId: 1,
        actorId: 7,
        idempotencyKey: 'envelope-concurrent-right',
        request: envelopeRequest({
          lpCommitmentUsd: '850000.000000',
          totalCommitmentUsd: '950000.000000',
        }),
        database: fakeDb.asDatabase(),
      }),
    ]);

    expect(fakeDb.envelopeRows).toHaveLength(2);
    const versions = [left['version'], right['version']].sort();
    expect(versions).toEqual([1, 2]);
    // Whichever row landed second must chain to whichever landed first.
    const byVersion = new Map([
      [left['version'] as number, left],
      [right['version'] as number, right],
    ]);
    expect(byVersion.get(2)?.['parentEnvelopeVersionId']).toBe(byVersion.get(1)?.['id']);
  });
});

describe("fund-scoped-ownership 'capital_envelope_version' kind", () => {
  it('resolves for an envelope version owned by the given fund and rejects across funds', async () => {
    const fakeDb = new FakeCapitalEnvelopeDb();
    seedMainFundVehicle(fakeDb);
    const envelope = await createCapitalEnvelopeVersion({
      fundId: 1,
      actorId: 7,
      idempotencyKey: 'envelope-ownership-kind',
      request: envelopeRequest(),
      database: fakeDb.asDatabase(),
    });

    await expect(
      assertOwnedByFund({
        db: fakeDb.asDatabase() as unknown as FundScopedOwnershipDatabase,
        fundId: 1,
        ref: { kind: 'capital_envelope_version', id: envelope['id'] as number },
      })
    ).resolves.toBeUndefined();

    await expect(
      assertOwnedByFund({
        db: fakeDb.asDatabase() as unknown as FundScopedOwnershipDatabase,
        fundId: 2,
        ref: { kind: 'capital_envelope_version', id: envelope['id'] as number },
      })
    ).rejects.toBeInstanceOf(FundScopeError);
  });
});
