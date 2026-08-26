import { describe, expect, it } from 'vitest';

import type { db } from '../../../../server/db';
import {
  createMappingProfileVersion,
  MappingProfileServiceError,
} from '../../../../server/services/financial-observations/mapping-profile-service';
import type { MappingRuleV1 } from '../../../../shared/contracts/financial-observations';
import {
  importMappingProfiles,
  type ImportMappingProfile,
} from '../../../../shared/schema/financial-observations';

type MappingProfileDatabase = typeof db;

function queryRows<T>(rows: readonly T[]) {
  const values = [...rows];
  return {
    limit: (count: number) => Promise.resolve(values.slice(0, count)),
  };
}

class FakeMappingProfileDb {
  readonly rows: ImportMappingProfile[] = [];
  readonly statementOrder: string[] = [];
  readonly selectResults: ImportMappingProfile[][] = [];
  casSucceeds = true;
  promoteSucceeds = true;
  rejectInsertWith: Error | null = null;
  private nextId = 1;
  private lastInsertedId: number | null = null;

  asDatabase(): MappingProfileDatabase {
    return this as unknown as MappingProfileDatabase;
  }

  transaction<T>(operation: (transaction: MappingProfileDatabase) => Promise<T>): Promise<T> {
    const rowsBefore = this.rows.map((row) => ({ ...row, mappings: [...row.mappings] }));
    const orderLength = this.statementOrder.length;
    return operation(this.asDatabase()).catch((error: unknown) => {
      this.rows.splice(0, this.rows.length, ...rowsBefore);
      this.statementOrder.splice(orderLength);
      throw error;
    });
  }

  select() {
    return {
      from: (table: unknown) => ({
        where: (_condition: unknown) => {
          const queued =
            this.selectResults.shift() ?? (table === importMappingProfiles ? this.rows : []);
          return queryRows(queued);
        },
      }),
    };
  }

  insert(table: unknown) {
    return {
      values: (values: Omit<ImportMappingProfile, 'id' | 'createdAt'> & { createdAt?: Date }) => ({
        onConflictDoNothing: (_options: unknown) => ({
          returning: async () => {
            if (table !== importMappingProfiles) return [];
            if (this.rejectInsertWith) throw this.rejectInsertWith;
            const conflict = this.rows.some(
              (row) => row.fundId === values.fundId && row.idempotencyKey === values.idempotencyKey
            );
            if (conflict) return [];

            const inserted = {
              id: this.nextId++,
              createdAt: values.createdAt ?? new Date('2026-07-23T22:46:12.807Z'),
              ...values,
            } as ImportMappingProfile;
            this.rows.push(inserted);
            this.lastInsertedId = inserted.id;
            this.statementOrder.push(
              inserted.supersededByProfileId === null ? 'insert-head' : 'insert-non-head'
            );
            return [inserted];
          },
        }),
      }),
    };
  }

  update(table: unknown) {
    return {
      set: (values: Partial<ImportMappingProfile>) => ({
        where: (_condition: unknown) => ({
          returning: async () => {
            if (table !== importMappingProfiles) return [];
            if (values.supersededByProfileId === null) {
              this.statementOrder.push('promote-successor');
              if (!this.promoteSucceeds) return [];
              const successor = this.rows.find((row) => row.id === this.lastInsertedId);
              if (!successor) return [];
              Object.assign(successor, values);
              return [successor];
            }

            this.statementOrder.push('cas-repoint-prior');
            if (!this.casSucceeds) return [];
            const prior = this.rows.find(
              (row) => row.id !== this.lastInsertedId && row.supersededByProfileId === null
            );
            if (!prior) return [];
            Object.assign(prior, values);
            return [prior];
          },
        }),
      }),
    };
  }

  seed(row: ImportMappingProfile): void {
    this.rows.push(row);
    this.nextId = Math.max(this.nextId, row.id + 1);
  }
}

const identityMappings: MappingRuleV1[] = [
  { sourceColumn: 'Company', targetField: 'company_name', transforms: ['trim'] },
  {
    sourceColumn: 'Company ID',
    targetField: 'company_external_id',
    transforms: ['normalize_whitespace'],
  },
  { sourceColumn: 'Value', targetField: 'fair_value', transforms: ['parse_decimal'] },
];

function profileInput(
  database: MappingProfileDatabase,
  overrides: Partial<Parameters<typeof createMappingProfileVersion>[0]> = {}
) {
  return {
    fundId: 1,
    name: 'Quarterly marks',
    sourceType: 'csv' as const,
    domain: 'valuation' as const,
    mappings: identityMappings,
    supersedesProfileId: null,
    actorId: 7,
    idempotencyKey: 'profile-key',
    database,
    ...overrides,
  };
}

function storedProfile(overrides: Partial<ImportMappingProfile> = {}): ImportMappingProfile {
  return {
    id: 10,
    fundId: 1,
    name: 'Quarterly marks',
    sourceType: 'csv',
    domain: 'valuation',
    version: 1,
    mappings: identityMappings,
    identitySemanticsHash: 'a'.repeat(64),
    supersededByProfileId: null,
    createdBy: 7,
    idempotencyKey: 'prior-key',
    requestHash: 'b'.repeat(64),
    createdAt: new Date('2026-07-22T00:00:00.000Z'),
    ...overrides,
  };
}

describe('createMappingProfileVersion', () => {
  it('surfaces a disallowed transform as a 400 service error', async () => {
    const fakeDb = new FakeMappingProfileDb();

    const error = await createMappingProfileVersion(
      profileInput(fakeDb.asDatabase(), {
        mappings: [
          {
            sourceColumn: 'Company',
            targetField: 'company_name',
            transforms: ['uppercase'],
          },
        ] as never,
      })
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(MappingProfileServiceError);
    expect(error).toMatchObject({ status: 400, statusCode: 400, code: 'INVALID_MAPPINGS' });
    expect(fakeDb.rows).toHaveLength(0);
  });

  it('supersedes the current head by inserting non-head, CAS-repointing, then promoting', async () => {
    const fakeDb = new FakeMappingProfileDb();
    const prior = storedProfile();
    fakeDb.seed(prior);
    fakeDb.selectResults.push([], [prior]);

    const successor = await createMappingProfileVersion(
      profileInput(fakeDb.asDatabase(), {
        supersedesProfileId: prior.id,
        idempotencyKey: 'successor-key',
      })
    );

    expect(fakeDb.statementOrder).toEqual([
      'insert-non-head',
      'cas-repoint-prior',
      'promote-successor',
    ]);
    expect(successor).toMatchObject({
      version: 2,
      supersededByProfileId: null,
      replayed: false,
    });
    expect(fakeDb.rows.find((row) => row.id === prior.id)?.supersededByProfileId).toBe(
      successor.id
    );
    expect(fakeDb.rows.filter((row) => row.supersededByProfileId === null)).toHaveLength(1);
  });

  it('returns 404 when the superseded profile is absent from the fund-scoped lookup', async () => {
    const fakeDb = new FakeMappingProfileDb();
    fakeDb.selectResults.push([], []);

    await expect(
      createMappingProfileVersion(
        profileInput(fakeDb.asDatabase(), {
          supersedesProfileId: 999,
          idempotencyKey: 'cross-fund-key',
        })
      )
    ).rejects.toMatchObject({
      status: 404,
      code: 'PROFILE_NOT_FOUND',
    });
    expect(fakeDb.rows).toHaveLength(0);
  });

  it('rejects a non-head predecessor', async () => {
    const fakeDb = new FakeMappingProfileDb();
    const prior = storedProfile({ supersededByProfileId: 11 });
    fakeDb.seed(prior);
    fakeDb.selectResults.push([], [prior]);

    await expect(
      createMappingProfileVersion(
        profileInput(fakeDb.asDatabase(), {
          supersedesProfileId: prior.id,
          idempotencyKey: 'non-head-key',
        })
      )
    ).rejects.toMatchObject({
      status: 409,
      code: 'PROFILE_SUPERSEDED',
    });
  });

  it('rolls back and returns PROFILE_HEAD_CONFLICT when the CAS loses', async () => {
    const fakeDb = new FakeMappingProfileDb();
    const prior = storedProfile();
    fakeDb.seed(prior);
    fakeDb.selectResults.push([], [prior]);
    fakeDb.casSucceeds = false;

    await expect(
      createMappingProfileVersion(
        profileInput(fakeDb.asDatabase(), {
          supersedesProfileId: prior.id,
          idempotencyKey: 'cas-loser-key',
        })
      )
    ).rejects.toMatchObject({
      status: 409,
      code: 'PROFILE_HEAD_CONFLICT',
    });
    expect(fakeDb.rows).toEqual([prior]);
  });

  it('maps the active-name partial unique violation to PROFILE_NAME_ACTIVE_CONFLICT', async () => {
    const fakeDb = new FakeMappingProfileDb();
    const pgError = Object.assign(new Error('duplicate key value violates unique constraint'), {
      code: '23505',
      constraint: 'import_mapping_profiles_fund_name_head_unique',
    });
    fakeDb.rejectInsertWith = pgError;

    await expect(
      createMappingProfileVersion(profileInput(fakeDb.asDatabase()))
    ).rejects.toMatchObject({
      status: 409,
      code: 'PROFILE_NAME_ACTIVE_CONFLICT',
    });
  });

  it('preserves the identity hash for unchanged identity mappings and changes it for identity drift', async () => {
    const unchangedDb = new FakeMappingProfileDb();
    const initial = await createMappingProfileVersion(
      profileInput(unchangedDb.asDatabase(), { idempotencyKey: 'initial-key' })
    );
    const initialRow = unchangedDb.rows[0];
    expect(initialRow).toBeDefined();
    unchangedDb.selectResults.push([], [initialRow!]);

    const unchanged = await createMappingProfileVersion(
      profileInput(unchangedDb.asDatabase(), {
        supersedesProfileId: initial.id,
        idempotencyKey: 'unchanged-key',
        mappings: [
          ...identityMappings.slice(0, 2),
          { sourceColumn: 'NAV', targetField: 'fair_value', transforms: ['parse_decimal'] },
        ],
      })
    );
    expect(unchanged.identitySemanticsHash).toBe(initial.identitySemanticsHash);

    const changedDb = new FakeMappingProfileDb();
    const changedPrior = storedProfile({
      id: 20,
      identitySemanticsHash: initial.identitySemanticsHash,
    });
    changedDb.seed(changedPrior);
    changedDb.selectResults.push([], [changedPrior]);
    const changed = await createMappingProfileVersion(
      profileInput(changedDb.asDatabase(), {
        supersedesProfileId: changedPrior.id,
        idempotencyKey: 'changed-key',
        mappings: [
          {
            sourceColumn: 'Legal Name',
            targetField: 'company_name',
            transforms: ['trim'],
          },
          identityMappings[1]!,
        ],
      })
    );
    expect(changed.identitySemanticsHash).not.toBe(initial.identitySemanticsHash);
  });

  it('replays the same supersession request after the predecessor is no longer head', async () => {
    const fakeDb = new FakeMappingProfileDb();
    const prior = storedProfile();
    fakeDb.seed(prior);
    fakeDb.selectResults.push([], [prior]);
    const input = profileInput(fakeDb.asDatabase(), {
      supersedesProfileId: prior.id,
      idempotencyKey: 'replay-successor-key',
    });

    const created = await createMappingProfileVersion(input);
    const storedSuccessor = fakeDb.rows.find((row) => row.id === created.id);
    expect(storedSuccessor).toBeDefined();
    fakeDb.selectResults.push([storedSuccessor!], [storedSuccessor!]);

    const replayed = await createMappingProfileVersion(input);

    expect(replayed).toEqual({ ...created, replayed: true });
    expect(fakeDb.rows).toHaveLength(2);
  });
});
