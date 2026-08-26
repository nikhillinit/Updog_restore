import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import type { db } from '../../../../server/db';
import {
  ARTIFACT_MAX_BYTES,
  ARTIFACT_RETENTION_DAYS,
  createSourceArtifact,
} from '../../../../server/services/financial-observations/source-artifact-service';
import {
  sourceArtifacts,
  type SourceArtifact,
} from '../../../../shared/schema/financial-observations';

type SourceArtifactDatabase = typeof db;

function queryRows<T>(rows: readonly T[]) {
  const values = [...rows];
  return {
    limit: (count: number) => Promise.resolve(values.slice(0, count)),
  };
}

class FakeSourceArtifactDb {
  readonly rows: SourceArtifact[] = [];
  successfulInserts = 0;

  constructor(private readonly createdAt = new Date('2026-07-23T22:46:12.807Z')) {}

  asDatabase(): SourceArtifactDatabase {
    return this as unknown as SourceArtifactDatabase;
  }

  select() {
    return {
      from: (table: unknown) => ({
        where: (_condition: unknown) =>
          queryRows(table === sourceArtifacts ? this.rows : ([] as SourceArtifact[])),
      }),
    };
  }

  insert(table: unknown) {
    return {
      values: (values: Omit<SourceArtifact, 'id' | 'createdAt'> & { createdAt?: Date }) => ({
        onConflictDoNothing: (_options: unknown) => ({
          returning: async () => {
            if (table !== sourceArtifacts) return [];
            const conflict = this.rows.some(
              (row) => row.fundId === values.fundId && row.idempotencyKey === values.idempotencyKey
            );
            if (conflict) return [];

            const inserted = {
              id: this.rows.length + 1,
              createdAt: values.createdAt ?? this.createdAt,
              ...values,
            } as SourceArtifact;
            this.rows.push(inserted);
            this.successfulInserts += 1;
            return [inserted];
          },
        }),
      }),
    };
  }
}

const now = new Date('2026-07-23T22:46:12.807Z');

function artifactInput(
  database: SourceArtifactDatabase,
  payload = Buffer.from('company,value\nAcme,100\n')
) {
  return {
    fundId: 1,
    sourceType: 'csv' as const,
    fileName: 'fund.csv',
    mediaType: 'text/csv',
    payload,
    actorId: 7,
    idempotencyKey: 'artifact-key',
    database,
    now,
  };
}

describe('createSourceArtifact', () => {
  it('replays the same artifact without creating a second row', async () => {
    const fakeDb = new FakeSourceArtifactDb(now);
    const input = artifactInput(fakeDb.asDatabase());

    const created = await createSourceArtifact(input);
    const replayed = await createSourceArtifact(input);

    expect(created.replayed).toBe(false);
    expect(replayed).toEqual({ ...created, replayed: true });
    expect(fakeDb.rows).toHaveLength(1);
    expect(fakeDb.successfulInserts).toBe(1);
  });

  it('rejects reuse of an idempotency key with different payload bytes', async () => {
    const fakeDb = new FakeSourceArtifactDb(now);
    await createSourceArtifact(artifactInput(fakeDb.asDatabase(), Buffer.from('first')));

    await expect(
      createSourceArtifact(artifactInput(fakeDb.asDatabase(), Buffer.from('second')))
    ).rejects.toMatchObject({
      status: 409,
      code: 'IDEMPOTENCY_KEY_REUSE',
    });
    expect(fakeDb.rows).toHaveLength(1);
  });

  it('rejects empty and oversized payloads with HTTP-shaped errors', async () => {
    const fakeDb = new FakeSourceArtifactDb(now);

    await expect(
      createSourceArtifact(artifactInput(fakeDb.asDatabase(), Buffer.alloc(0)))
    ).rejects.toMatchObject({
      status: 400,
      statusCode: 400,
      code: 'EMPTY_ARTIFACT',
    });
    await expect(
      createSourceArtifact(artifactInput(fakeDb.asDatabase(), Buffer.alloc(ARTIFACT_MAX_BYTES + 1)))
    ).rejects.toMatchObject({
      status: 413,
      statusCode: 413,
      code: 'ARTIFACT_TOO_LARGE',
    });
    expect(fakeDb.rows).toHaveLength(0);
  });

  it('hashes raw bytes, records byte count and retention, and omits payload from response', async () => {
    const fakeDb = new FakeSourceArtifactDb(now);
    const payload = Buffer.from([0x00, 0xff, 0x10, 0x80]);

    const result = await createSourceArtifact(artifactInput(fakeDb.asDatabase(), payload));

    expect(result).toMatchObject({
      byteCount: 4,
      payloadSha256: createHash('sha256').update(payload).digest('hex'),
      purgeAfter: new Date(now.getTime() + ARTIFACT_RETENTION_DAYS * 86_400_000).toISOString(),
      createdAt: now.toISOString(),
      replayed: false,
    });
    expect(result).not.toHaveProperty('payload');
    expect(fakeDb.rows[0]?.payload).toEqual(payload);
  });
});
